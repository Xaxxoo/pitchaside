'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { BackButton } from '@/components/back-button';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getPitch, updatePitch, setSchedule, getSchedule, addOverride, listOverrides, removeOverride,
  saveBankDetails, pitchNameEnquiry, deactivatePitch, createPitchAccount, canDeletePitch, deletePitchForGood,
  getPitchBalance, listPitchTransfers, listPitchPayouts, withdrawFromPitch, localYmd,
} from '@/lib/pitch';
import { useAuth } from '@/lib/auth';
import { Callout } from '@/components/callout';
import { getNigerianBanks, type NigerianBank } from '@/lib/api';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/brand';
import { btnDanger, btnPrimary } from '@/components/buttons';
import { BallLoader } from '@/components/skeleton';
import { ConfirmSheet } from '@/components/match-day/confirm-sheet';
import { BankPicker } from '@/components/group-payee';
import { NigerianLocationPicker } from '@/components/nigerian-location-picker';
import { SettingsSection, SettingsSections } from '@/components/group/settings-sections';
import { chip, field, label, Stepper } from '@/components/group/group-edit-sheet';
import { prettyTime } from '@/components/player-ui';
import { pitchFacts, hoursSummary, naira, PITCH_ICONS } from '@/components/pitch/pitch-facts';
import { PitchPhotosEditor } from '@/components/pitch/pitch-photos-editor';
import { HiddenPitchBanner } from '@/components/pitch/hidden-pitch-banner';
import { GameLengthPicker, gameLength, gameLengthOk } from '@/components/pitch/game-length-picker';
import {
  PITCH_A_SIDE, PITCH_FACILITIES, PITCH_FACILITY_LABEL, PITCH_SURFACES, PITCH_SURFACE_LABEL,
  type IPitch, type IPitchSchedule, type IPitchSlotOverride, type PitchFacility, type PitchSurface,
} from '@pitchaside/shared';

const card = 'bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden px-5 sm:px-7 [&>div]:border-y-0';
/** Monday first, as people say the week; dayOfWeek is 0 = Sunday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Opening and closing times on the half hour, through the day. */
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const OVERRIDE_KINDS = [
  { value: 'blocked', label: 'Closed' },
  { value: 'added', label: 'Extra hours' },
  { value: 'price_override', label: 'Different price' },
];

/** A new day off: closed all day is what owners add most. */
const NEW_CHANGE = { date: '', type: 'blocked', allDay: true, startTime: '17:00', endTime: '22:00', price: '', reason: '' };
/** How far ahead a change can be added from the strip: about two months. */
const CHANGE_DAYS = 60;

type Section = 'photos' | 'where' | 'pitch' | 'hours' | 'changes' | 'bank' | 'account';
interface DayHours { open: boolean; from: string; to: string; price: string }

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">{children}</h2>;
}

/** The week as one row per day, from what's saved (a day with several opening times keeps the first). */
function toWeek(rows: IPitchSchedule[]): Record<number, DayHours> {
  const week: Record<number, DayHours> = {};
  for (const d of WEEK) {
    const r = rows.find((x) => x.dayOfWeek === d);
    week[d] = r
      ? { open: true, from: r.openTime, to: r.closeTime, price: r.price != null ? String(Number(r.price)) : '' }
      : { open: false, from: '17:00', to: '22:00', price: '' };
  }
  return week;
}

export default function PitchDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [pitch, setPitch] = useState<IPitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (s: Section) => setOpen((o) => (o === s ? null : s));
  const [saving, setSaving] = useState<Section | null>(null);

  // Where
  const [where, setWhere] = useState({ address: '', city: '', state: '', mapUrl: '', directions: '' });
  // The pitch
  const [about, setAbout] = useState({ name: '', description: '', aSide: null as number | null, surface: null as PitchSurface | null, lengthM: '', widthM: '', facilities: [] as PitchFacility[] });
  // Prices and hours
  const [price, setPrice] = useState(0);
  const [gameMinutes, setGameMinutes] = useState(60);
  const [week, setWeek] = useState<Record<number, DayHours>>(toWeek([]));
  const [dayPrices, setDayPrices] = useState(false);
  // Most pitches keep the same hours every day they open: one pair of times, unless they say otherwise.
  const [hours, setHours] = useState({ from: '17:00', to: '22:00' });
  const [sameHours, setSameHours] = useState(true);
  // Open all day and night: midnight to midnight
  const allDay = hours.from === '00:00' && hours.to === '24:00';
  // Can it go for good (never booked, no account of its own), or only be hidden?
  const [deletable, setDeletable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    canDeletePitch(id).then(setDeletable).catch(() => setDeletable(false));
  }, [id]);
  const [splitDays, setSplitDays] = useState<string[]>([]);
  // Days off and changes
  const [overrides, setOverrides] = useState<IPitchSlotOverride[]>([]);
  const [ovr, setOvr] = useState(NEW_CHANGE);
  // Getting paid
  const [banks, setBanks] = useState<NigerianBank[]>([]);
  const [bank, setBank] = useState({ bankAccountNumber: '', bankCode: '', bankName: '', accountHolderName: '' });
  // Pitch account (only pitches that already have one)
  const [balance, setBalance] = useState<{ totalIn: number; totalOut: number; available: number } | null>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', pin: '', narration: '' });
  const [confirmHide, setConfirmHide] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s, o] = await Promise.all([getPitch(id), getSchedule(id), listOverrides(id, localYmd(new Date()))]);
      setPitch(p);
      setWhere({ address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', mapUrl: p.mapUrl ?? '', directions: p.directions ?? '' });
      setAbout({
        name: p.name,
        description: p.description ?? '',
        aSide: p.aSide ?? null,
        surface: (p.surface as PitchSurface) ?? null,
        lengthM: p.lengthM ? String(p.lengthM) : '',
        widthM: p.widthM ? String(p.widthM) : '',
        facilities: (p.facilities ?? []) as PitchFacility[],
      });
      setPrice(Number(p.defaultPrice));
      setGameMinutes(p.slotDurationMinutes);
      const w = toWeek(s);
      const openNow = WEEK.filter((d) => w[d].open);
      setWeek(w);
      if (openNow.length) setHours({ from: w[openNow[0]].from, to: w[openNow[0]].to });
      setSameHours(openNow.every((d) => w[d].from === w[openNow[0]].from && w[d].to === w[openNow[0]].to));
      setDayPrices(s.some((r) => r.price != null));
      setSplitDays(WEEK.filter((d) => s.filter((r) => r.dayOfWeek === d).length > 1).map((d) => DAY_NAME[d]));
      setOverrides(o);
      setBank({ bankAccountNumber: p.bankAccountNumber ?? '', bankCode: p.bankCode ?? '', bankName: p.bankName ?? '', accountHolderName: p.accountHolderName ?? '' });
    } catch {
      /* the page says it couldn't find the pitch */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const s = searchParams.get('open') as Section | null;
    if (s) setOpen(s);
  }, [searchParams]);
  useEffect(() => {
    if (open === 'bank' && !banks.length) getNigerianBanks().then(setBanks).catch(() => {});
    if (open === 'account' && pitch?.accountNumber) {
      getPitchBalance(id).then(setBalance).catch(() => {});
      listPitchTransfers(id).then(setTransfers).catch(() => {});
      listPitchPayouts(id).then(setPayouts).catch(() => {});
    }
  }, [open, id, pitch?.accountNumber, banks.length]);

  async function run(section: Section, work: () => Promise<unknown>, done: string) {
    setSaving(section);
    try {
      await work();
      toast.success(done);
      await load();
      setOpen(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setSaving(null);
    }
  }

  function saveWhere(e: React.FormEvent) {
    e.preventDefault();
    run('where', () => updatePitch(id, {
      address: where.address.trim() || null,
      city: where.city || null,
      state: where.state || null,
      mapUrl: where.mapUrl.trim() || null,
      directions: where.directions.trim() || null,
    }), 'Saved where it is');
  }

  function saveAbout(e: React.FormEvent) {
    e.preventDefault();
    if (about.name.trim().length < 2) return toast.error('Give the pitch a name.');
    run('pitch', () => updatePitch(id, {
      name: about.name.trim(),
      description: about.description.trim() || null,
      aSide: about.aSide,
      surface: about.surface,
      lengthM: about.lengthM ? Number(about.lengthM) : null,
      widthM: about.widthM ? Number(about.widthM) : null,
      facilities: about.facilities,
    }), 'Saved the pitch');
  }

  function saveHours(e: React.FormEvent) {
    e.preventDefault();
    if (price < 1) return toast.error('Set a price for a game.');
    if (!gameLengthOk(gameMinutes)) return toast.error('A game lasts between 15 minutes and 4 hours.');
    const days = WEEK.filter((d) => week[d].open);
    const at = (d: number) => (sameHours ? hours : week[d]);
    if (sameHours && days.length && hours.from >= hours.to) return toast.error('Closing time is before opening time.');
    if (sameHours && days.length && minutes(hours.to) - minutes(hours.from) < gameMinutes) return toast.error(`You’re open for less than one game (${gameLength(gameMinutes)}).`);
    const short = days.find((d) => at(d).from >= at(d).to);
    if (short != null) return toast.error(`${DAY_NAME[short]} closes before it opens.`);
    const tooShort = days.find((d) => minutes(at(d).to) - minutes(at(d).from) < gameMinutes);
    if (tooShort != null) return toast.error(`${DAY_NAME[tooShort]} is open for less than one game (${gameLength(gameMinutes)}).`);
    run('hours', async () => {
      await updatePitch(id, { defaultPrice: price, slotDurationMinutes: gameMinutes });
      await setSchedule(id, days.map((d) => ({
        dayOfWeek: d,
        openTime: at(d).from,
        closeTime: at(d).to,
        price: dayPrices && week[d].price ? Number(week[d].price) : undefined,
      })));
    }, 'Saved prices and hours');
  }

  function addChange(e: React.FormEvent) {
    e.preventDefault();
    if (!ovr.date) return toast.error('Pick the day.');
    const allDay = ovr.type === 'blocked' && ovr.allDay;
    if (!allDay && ovr.startTime >= ovr.endTime) return toast.error('The end time is before the start.');
    if (ovr.type === 'price_override' && !ovr.price) return toast.error('Set the price for those hours.');
    run('changes', () => addOverride(id, {
      date: ovr.date,
      type: ovr.type,
      startTime: allDay ? '00:00' : ovr.startTime,
      endTime: allDay ? '23:59' : ovr.endTime,
      price: ovr.type !== 'blocked' && ovr.price ? Number(ovr.price) : undefined,
      reason: ovr.reason.trim() || undefined,
    }).then(() => setOvr(NEW_CHANGE)), 'Added');
  }

  async function removeChange(o: IPitchSlotOverride) {
    try {
      await removeOverride(id, o.id);
      toast.success('Removed');
      setOverrides((list) => list.filter((x) => x.id !== o.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    }
  }

  async function checkName() {
    if (!bank.bankCode || bank.bankAccountNumber.length !== 10) return;
    try {
      const res = await pitchNameEnquiry(id, bank.bankCode, bank.bankAccountNumber);
      setBank((b) => ({ ...b, accountHolderName: res.accountName }));
    } catch (err) {
      setBank((b) => ({ ...b, accountHolderName: '' }));
      toast.error(err instanceof Error ? err.message : 'We couldn’t find that account.');
    }
  }

  function saveBank(e: React.FormEvent) {
    e.preventDefault();
    if (!bank.accountHolderName) return toast.error('Check the account first so we know whose it is.');
    const bankName = banks.find((b) => b.code === bank.bankCode)?.name ?? bank.bankName;
    run('bank', () => saveBankDetails(id, { ...bank, bankName }), 'Saved your bank');
  }

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setSaving('account');
    try {
      await withdrawFromPitch(id, { amount: Number(withdrawForm.amount), pin: withdrawForm.pin, narration: withdrawForm.narration || undefined });
      toast.success('Withdrawal sent');
      setWithdrawForm({ amount: '', pin: '', narration: '' });
      getPitchBalance(id).then(setBalance).catch(() => {});
      listPitchPayouts(id).then(setPayouts).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setSaving(null);
    }
  }

  async function removeForGood() {
    try {
      await deletePitchForGood(id);
      toast.success('Pitch deleted');
      router.push('/my-pitches');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    }
  }

  async function hide() {
    try {
      await deactivatePitch(id);
      toast.success('Pitch hidden');
      router.push('/my-pitches');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    }
  }

  if (loading) return <div className="flex justify-center py-20"><BallLoader /></div>;
  if (!pitch) return <p className="py-20 text-center text-sm text-gray-500">We couldn’t find that pitch.</p>;

  const place = [pitch.address, pitch.city].filter(Boolean).join(', ');
  // The row shows the size and surface; the facilities are inside it.
  const facts = pitchFacts(pitch, false);
  const openDays = WEEK.filter((d) => week[d].open).length;
  const photoCount = pitch.photoKeys?.length ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Bookings" href={`/my-pitches/${id}`} />
      <PageHeader eyebrow="Pitch details" title={pitch.name} subtitle="What groups see when you share your link." />
      {pitch.status === 'inactive' && <HiddenPitchBanner pitchId={id} onShown={() => setPitch({ ...pitch, status: 'active' })} />}

      <GroupLabel>The pitch</GroupLabel>
      <div className={card}>
        <SettingsSections inset="card">
          <SettingsSection
            id="s-photos"
            icon={PITCH_ICONS.camera}
            title="Photos"
            summary={photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'} · the first is the cover` : 'Show groups what it looks like'}
            open={open === 'photos'}
            onToggle={() => toggle('photos')}
          >
            {/* Each change saves straight away: no Save button here. */}
            <PitchPhotosEditor pitchId={id} keys={pitch.photoKeys ?? []} onChange={(photoKeys) => setPitch((p) => (p ? { ...p, photoKeys } : p))} />
          </SettingsSection>
          <SettingsSection id="s-where" icon={PITCH_ICONS.pin} title="Where it is" summary={place || 'Add the address and a map link'} open={open === 'where'} onToggle={() => toggle('where')}>
            <form onSubmit={saveWhere} noValidate className="space-y-4">
              <div>
                <label htmlFor="address" className={label}>Address</label>
                <input id="address" value={where.address} onChange={(e) => setWhere({ ...where, address: e.target.value })} placeholder="e.g. 14 Bode Thomas Street" className={field} />
              </div>
              <NigerianLocationPicker
                state={where.state}
                city={where.city}
                onStateChange={(state) => setWhere((w) => ({ ...w, state, city: '' }))}
                onCityChange={(city) => setWhere((w) => ({ ...w, city }))}
              />
              <div>
                <label htmlFor="mapUrl" className={label}>Map link</label>
                <input id="mapUrl" type="url" inputMode="url" value={where.mapUrl} onChange={(e) => setWhere({ ...where, mapUrl: e.target.value })} placeholder="Paste from Google Maps" className={field} />
                <p className="text-[12px] text-gray-500 mt-1.5">In Google Maps: find the pitch, tap Share, then Copy link.</p>
              </div>
              <div>
                <label htmlFor="directions" className={label}>How to find it</label>
                <input id="directions" maxLength={160} value={where.directions} onChange={(e) => setWhere({ ...where, directions: e.target.value })} placeholder="e.g. Behind the church, green gate" className={field} />
                <p className="text-[12px] text-gray-500 mt-1.5">Players see this on the day.</p>
              </div>
              <button type="submit" disabled={saving === 'where'} className={`w-full ${btnPrimary}`}>{saving === 'where' ? 'Saving…' : 'Save'}</button>
            </form>
          </SettingsSection>

          <SettingsSection id="s-pitch" icon={PITCH_ICONS.pitch} title="Size and surface" summary={facts.join(' · ') || 'Size, surface, what’s there'} open={open === 'pitch'} onToggle={() => toggle('pitch')}>
            <form onSubmit={saveAbout} noValidate className="space-y-4">
              <div>
                <label htmlFor="name" className={label}>Name</label>
                <input id="name" value={about.name} onChange={(e) => setAbout({ ...about, name: e.target.value })} className={field} />
              </div>
              <fieldset>
                <legend className={label}>Made for</legend>
                <div className="flex flex-wrap gap-2">
                  {PITCH_A_SIDE.map((n) => (
                    <button key={n} type="button" aria-pressed={about.aSide === n} onClick={() => setAbout({ ...about, aSide: about.aSide === n ? null : n })} className={chip(about.aSide === n)}>
                      {n}-a-side
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className={label}>Surface</legend>
                <div className="flex flex-wrap gap-2">
                  {PITCH_SURFACES.map((s) => (
                    <button key={s} type="button" aria-pressed={about.surface === s} onClick={() => setAbout({ ...about, surface: about.surface === s ? null : s })} className={chip(about.surface === s)}>
                      {PITCH_SURFACE_LABEL[s]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className={label}>Size in metres <span className="font-medium text-gray-500">(optional)</span></legend>
                <div className="flex items-center gap-2">
                  <input aria-label="Length in metres" inputMode="numeric" value={about.lengthM} onChange={(e) => setAbout({ ...about, lengthM: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="Length" className={field} />
                  <span className="text-gray-500 font-bold" aria-hidden>×</span>
                  <input aria-label="Width in metres" inputMode="numeric" value={about.widthM} onChange={(e) => setAbout({ ...about, widthM: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="Width" className={field} />
                </div>
              </fieldset>
              <fieldset>
                <legend className={label}>What’s there</legend>
                <div className="flex flex-wrap gap-2">
                  {PITCH_FACILITIES.map((f) => {
                    const on = about.facilities.includes(f);
                    return (
                      <button key={f} type="button" aria-pressed={on} onClick={() => setAbout({ ...about, facilities: on ? about.facilities.filter((x) => x !== f) : [...about.facilities, f] })} className={chip(on)}>
                        {PITCH_FACILITY_LABEL[f]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div>
                <label htmlFor="description" className={label}>Anything else <span className="font-medium text-gray-500">(optional)</span></label>
                <textarea id="description" rows={2} maxLength={300} value={about.description} onChange={(e) => setAbout({ ...about, description: e.target.value })} placeholder="e.g. Bibs and balls available" className={`${field} py-3`} />
              </div>
              <button type="submit" disabled={saving === 'pitch'} className={`w-full ${btnPrimary}`}>{saving === 'pitch' ? 'Saving…' : 'Save'}</button>
            </form>
          </SettingsSection>
        </SettingsSections>
      </div>

      <GroupLabel>Bookings</GroupLabel>
      <div className={card}>
        <SettingsSections inset="card">
          <SettingsSection id="s-hours" icon={PITCH_ICONS.clock} title="Prices and hours" summary={`${naira(pitch.defaultPrice)} a game · ${hoursSummary(openDays)}`} open={open === 'hours'} onToggle={() => toggle('hours')}>
            <form onSubmit={saveHours} noValidate className="space-y-4">
              <div>
                <p id="price-label" className={label}>Price a game</p>
                <Stepper id="price" value={price} onChange={setPrice} step={1000} min={0} prefix="₦" labelledBy="price-label" less="₦1,000 less" more="₦1,000 more" />
              </div>
              <GameLengthPicker value={gameMinutes} onChange={setGameMinutes} />

              <fieldset>
                <legend className={label}>Which days are you open?</legend>
                <div className="grid grid-cols-7 gap-1">
                  {WEEK.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={week[d].open}
                      aria-label={DAY_NAME[d]}
                      onClick={() => setWeek((w) => ({ ...w, [d]: { ...w[d], open: !w[d].open } }))}
                      className={`press min-h-11 rounded-xl border-[1.5px] text-[13px] font-bold transition-colors ${
                        week[d].open ? 'bg-pitch-700 border-pitch-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-pitch-600'
                      }`}
                    >
                      {DAY_NAME[d].slice(0, 2)}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-gray-500 mt-2">{openDays ? `Open ${hoursSummary(openDays)}` : 'Closed every day. Tap the days groups can book.'}</p>
              </fieldset>

              {openDays > 0 && !sameHours ? (
                <fieldset>
                  <legend className={label}>Hours each day</legend>
                  <ul className="divide-y divide-gray-200 border-y border-gray-200">
                    {WEEK.filter((d) => week[d].open).map((d) => {
                      const h = week[d];
                      const set = (patch: Partial<DayHours>) => setWeek((w) => ({ ...w, [d]: { ...w[d], ...patch } }));
                      return (
                        <li key={d} className="flex items-center gap-2 py-2.5">
                          <span className="w-9 shrink-0 text-[14px] font-bold text-ink">{DAY_NAME[d].slice(0, 3)}</span>
                          <TimeSelect id={`from-${d}`} label={`${DAY_NAME[d]} opens`} value={h.from} onChange={(from) => set({ from })} />
                          <span className="text-[13px] text-gray-500" aria-hidden>to</span>
                          <TimeSelect id={`to-${d}`} label={`${DAY_NAME[d]} closes`} value={h.to} onChange={(to) => set({ to })} closing />
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ) : openDays > 0 && (
                <div>
                  <p className={label}>Open from</p>
                  {allDay ? (
                    <p className="rounded-2xl bg-chalk px-4 py-3 text-[14px] font-bold text-ink">All day and night · 12am to 12am</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TimeSelect id="hours-from" label="Opens" value={hours.from} onChange={(from) => setHours({ ...hours, from })} />
                      <span className="text-[13px] text-gray-500" aria-hidden>to</span>
                      <TimeSelect id="hours-to" label="Closes" value={hours.to} onChange={(to) => setHours({ ...hours, to })} closing />
                    </div>
                  )}
                  <div className="mt-1 -mb-1">
                    <Tick checked={allDay} onChange={(on) => setHours(on ? { from: '00:00', to: '24:00' } : { from: '07:00', to: '22:00' })}>
                      Open 24 hours
                    </Tick>
                  </div>
                </div>
              )}

              {openDays > 0 && dayPrices && (
                <fieldset>
                  <legend className={label}>Price each day</legend>
                  <ul className="divide-y divide-gray-200 border-y border-gray-200">
                    {WEEK.filter((d) => week[d].open).map((d) => (
                      <li key={d} className="flex items-center gap-2 py-2">
                        <label htmlFor={`price-${d}`} className="w-9 shrink-0 text-[14px] font-bold text-ink">{DAY_NAME[d].slice(0, 3)}</label>
                        <div className="relative flex-1 min-w-0">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-gray-500" aria-hidden>₦</span>
                          <input
                            id={`price-${d}`}
                            inputMode="numeric"
                            aria-label={`${DAY_NAME[d]} price a game`}
                            value={week[d].price}
                            onChange={(e) => setWeek((w) => ({ ...w, [d]: { ...w[d], price: e.target.value.replace(/\D/g, '').slice(0, 7) } }))}
                            placeholder={price.toLocaleString('en-NG')}
                            className={`${field} min-h-11 pl-8`}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[12px] text-gray-500 mt-2">Leave a day blank to charge {naira(price)}.</p>
                </fieldset>
              )}

              {splitDays.length > 0 && (
                <p className="text-[12px] text-kit-600">{splitDays.join(', ')} had more than one opening time. Saving keeps the times shown.</p>
              )}
              {openDays > 0 && (
                <div className="-my-1">
                  <Tick
                    checked={!sameHours}
                    onChange={(on) => {
                      // Start every day from the shared times, so nothing jumps.
                      if (on) setWeek((w) => Object.fromEntries(WEEK.map((d) => [d, { ...w[d], ...hours }])) as Record<number, DayHours>);
                      setSameHours(!on);
                    }}
                  >
                    Different hours on some days
                  </Tick>
                  <Tick checked={dayPrices} onChange={setDayPrices}>Some days cost more (or less)</Tick>
                </div>
              )}
              <button type="submit" disabled={saving === 'hours'} className={`w-full ${btnPrimary}`}>{saving === 'hours' ? 'Saving…' : 'Save'}</button>
            </form>
          </SettingsSection>

          <SettingsSection id="s-changes" icon={PITCH_ICONS.calendar} title="Days off and changes" summary={overrides.length ? `${overrides.length} coming up` : 'Close a day or change its hours'} open={open === 'changes'} onToggle={() => toggle('changes')}>
            {overrides.length > 0 && (
              <ul className="divide-y divide-gray-200 border-y border-gray-200 -mt-1">
                {overrides.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-ink truncate">{changeTitle(o)}</span>
                      <span className="block text-[12px] text-gray-500 truncate">{[prettyDate(o.date), allDayChange(o) ? 'All day' : `${prettyTime(o.startTime)}–${prettyTime(o.endTime)}`, o.reason].filter(Boolean).join(' · ')}</span>
                    </span>
                    <button type="button" onClick={() => removeChange(o)} className="press min-h-11 px-2 text-[13px] font-bold text-gray-600 hover:text-ink" aria-label={`Remove ${changeTitle(o)} on ${prettyDate(o.date)}`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addChange} noValidate className={`space-y-5 ${overrides.length ? 'mt-5' : ''}`}>
              <fieldset>
                <legend className={label}>What’s changing?</legend>
                <div className="flex flex-wrap gap-2">
                  {OVERRIDE_KINDS.map((k) => (
                    <button key={k.value} type="button" aria-pressed={ovr.type === k.value} onClick={() => setOvr({ ...ovr, type: k.value })} className={chip(ovr.type === k.value)}>
                      {k.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <DayStrip value={ovr.date} onChange={(date) => setOvr({ ...ovr, date })} marked={new Set(overrides.map((o) => o.date))} />
              {ovr.type === 'blocked' && (
                <fieldset>
                  <legend className={label}>For how long?</legend>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={ovr.allDay} onClick={() => setOvr({ ...ovr, allDay: true })} className={chip(ovr.allDay)}>All day</button>
                    <button type="button" aria-pressed={!ovr.allDay} onClick={() => setOvr({ ...ovr, allDay: false })} className={chip(!ovr.allDay)}>Some hours</button>
                  </div>
                </fieldset>
              )}
              {(ovr.type !== 'blocked' || !ovr.allDay) && (
                <div>
                  <p className={label}>{ovr.type === 'blocked' ? 'Closed from' : ovr.type === 'added' ? 'Open from' : 'These hours'}</p>
                  <div className="flex items-center gap-2">
                    <TimeSelect id="ovr-from" label="From" value={ovr.startTime} onChange={(startTime) => setOvr({ ...ovr, startTime })} />
                    <span className="text-[13px] text-gray-500" aria-hidden>to</span>
                    <TimeSelect id="ovr-to" label="To" value={ovr.endTime} onChange={(endTime) => setOvr({ ...ovr, endTime })} />
                  </div>
                </div>
              )}
              {ovr.type !== 'blocked' && (
                <div>
                  <label htmlFor="ovr-price" className={label}>Price a game{ovr.type === 'added' && <span className="font-medium text-gray-500"> (optional)</span>}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-gray-500" aria-hidden>₦</span>
                    <input id="ovr-price" inputMode="numeric" value={ovr.price} onChange={(e) => setOvr({ ...ovr, price: e.target.value.replace(/\D/g, '').slice(0, 7) })} placeholder={Number(pitch.defaultPrice).toLocaleString('en-NG')} className={`${field} pl-8`} />
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="ovr-reason" className={label}>Why <span className="font-medium text-gray-500">(optional)</span></label>
                <input id="ovr-reason" maxLength={80} value={ovr.reason} onChange={(e) => setOvr({ ...ovr, reason: e.target.value })} placeholder="e.g. Tournament" className={field} />
              </div>
              <button type="submit" disabled={saving === 'changes'} className={`w-full ${btnPrimary}`}>
                {saving === 'changes' ? 'Adding…' : ovr.date ? `Add for ${prettyDate(ovr.date)}` : 'Add'}
              </button>
            </form>
          </SettingsSection>
        </SettingsSections>
      </div>

      <GroupLabel>Money</GroupLabel>
      <div className={card}>
        <SettingsSections inset="card">
          <SettingsSection id="s-bank" icon={PITCH_ICONS.bank} title="Your bank" summary={pitch.bankAccountNumber ? `${pitch.bankName} · ${pitch.bankAccountNumber}` : 'Where groups pay you for the pitch'} open={open === 'bank'} onToggle={() => toggle('bank')}>
            <form onSubmit={saveBank} noValidate className="space-y-4">
              <div>
                <p className={label}>Bank</p>
                {banks.length ? (
                  <BankPicker banks={banks} value={bank.bankCode} onChange={(bankCode) => setBank((b) => ({ ...b, bankCode, accountHolderName: '' }))} />
                ) : (
                  <p className="text-[13px] text-gray-500">Loading banks…</p>
                )}
              </div>
              <div>
                <label htmlFor="acct" className={label}>Account number</label>
                <input
                  id="acct"
                  inputMode="numeric"
                  value={bank.bankAccountNumber}
                  onChange={(e) => setBank({ ...bank, bankAccountNumber: e.target.value.replace(/\D/g, '').slice(0, 10), accountHolderName: '' })}
                  onBlur={checkName}
                  placeholder="10 digits"
                  className={field}
                />
                {bank.accountHolderName && <p className="text-[13px] font-bold text-pitch-700 mt-1.5">✓ {bank.accountHolderName}</p>}
              </div>
              <button type="submit" disabled={saving === 'bank'} className={`w-full ${btnPrimary}`}>{saving === 'bank' ? 'Saving…' : 'Save'}</button>
            </form>
          </SettingsSection>

          {/* Its own account, so groups pay the pitch and payments match bookings (Payrep opens it) */}
          {!pitch.accountNumber && (
            <SettingsSection id="s-account" icon={PITCH_ICONS.wallet} title="Pitch account" summary="Not opened yet" open={open === 'account'} onToggle={() => toggle('account')}>
              <p className="text-[13px] text-gray-600">Its own account number: groups pay into it, and each payment is matched to its booking.</p>
              {user?.bvn || user?.nin ? (
                <button type="button" disabled={saving === 'account'} onClick={() => run('account', async () => setPitch(await createPitchAccount(id)), 'Pitch account opened')} className={`w-full ${btnPrimary}`}>
                  {saving === 'account' ? 'Opening…' : 'Open the pitch account'}
                </button>
              ) : (
                <Callout tone="note" title="Add your BVN or NIN first" action={<Link href="/settings#identity" className="text-[14px] font-bold text-pitch-700">Add it in Settings ›</Link>}>
                  The bank checks who owns it.
                </Callout>
              )}
            </SettingsSection>
          )}
          {pitch.accountNumber && (
            <SettingsSection id="s-account" icon={PITCH_ICONS.wallet} title="Pitch account" summary={`${pitch.accountNumber} · ${pitch.virtualBankName}`} open={open === 'account'} onToggle={() => toggle('account')}>
              <div className="rounded-2xl bg-ink text-white px-4 py-3.5">
                <p className="text-[12px] text-white/60">Available</p>
                <p className="font-display text-[28px] font-extrabold leading-tight">{balance ? naira(balance.available) : '…'}</p>
                <p className="text-[12px] text-white/60 truncate">{pitch.accountName} · {pitch.accountNumber}</p>
              </div>
              {!pitch.bankAccountNumber ? (
                <p className="text-[13px] text-gray-600">Add your bank above to withdraw.</p>
              ) : (
                <form onSubmit={withdraw} className="space-y-3">
                  <p className="text-[12px] text-gray-500 truncate">To {pitch.accountHolderName} · {pitch.bankName} · {pitch.bankAccountNumber}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input aria-label="Amount" inputMode="numeric" required value={withdrawForm.amount} onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value.replace(/\D/g, '') })} placeholder="Amount" className={field} />
                    <input aria-label="Transfer PIN" type="password" inputMode="numeric" required maxLength={6} value={withdrawForm.pin} onChange={(e) => setWithdrawForm({ ...withdrawForm, pin: e.target.value })} placeholder="PIN" className={field} />
                  </div>
                  <button type="submit" disabled={saving === 'account'} className={`w-full ${btnPrimary}`}>{saving === 'account' ? 'Sending…' : 'Withdraw'}</button>
                  <p className="text-[12px] text-gray-500">The ₦350 service fee is taken from the balance too.</p>
                </form>
              )}
              {transfers.length > 0 && (
                <MoneyList title="Paid in" rows={transfers.slice(0, 10).map((t) => ({ id: t.id, amount: t.amount, who: t.senderName, status: t.status }))} />
              )}
              {payouts.length > 0 && (
                <MoneyList title="Withdrawn" rows={payouts.slice(0, 10).map((p) => ({ id: p.id, amount: p.amount, who: p.beneficiaryBankName, status: p.status }))} />
              )}
            </SettingsSection>
          )}
        </SettingsSections>
      </div>

      {/* A hidden pitch is shown again from the note at the top */}
      {pitch.status !== 'inactive' && (
        <div className="mt-8 mb-4">
          <button type="button" onClick={() => setConfirmHide(true)} className={`w-full ${btnDanger}`}>Hide this pitch</button>
          <p className="text-[12px] text-gray-500 mt-1.5 text-center">Its link stops taking bookings. You can show it again.</p>
        </div>
      )}
      {/* Gone for good only while nothing depends on it; otherwise hiding is the way */}
      {deletable && (
        <div className={pitch.status === 'inactive' ? 'mt-8 mb-4' : 'mb-4'}>
          <button type="button" onClick={() => setConfirmDelete(true)} className="press w-full min-h-12 rounded-xl text-[15px] font-semibold text-kit-600 hover:bg-kit-500/10">
            Delete pitch
          </button>
          <p className="text-[12px] text-gray-500 text-center">Never booked, so it can go for good.</p>
        </div>
      )}
      <ConfirmSheet
        open={confirmDelete}
        title={`Delete ${pitch.name}?`}
        message="It goes for good: its photos, hours and link too. This can’t be undone."
        confirmLabel="Delete pitch"
        cancelLabel="Keep it"
        danger
        onConfirm={() => { setConfirmDelete(false); removeForGood(); }}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmSheet
        open={confirmHide}
        title="Hide this pitch?"
        message="Its link says it isn’t taking bookings, and groups can’t book it. Bookings already made stay as they are. You can show it again any time."
        confirmLabel="Hide pitch"
        cancelLabel="Keep it"
        danger
        onConfirm={() => { setConfirmHide(false); hide(); }}
        onCancel={() => setConfirmHide(false)}
      />
    </div>
  );
}

function minutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function prettyDate(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Closed from midnight to the end of the day, however it was saved. */
function allDayChange(o: IPitchSlotOverride) {
  return o.startTime.slice(0, 5) === '00:00' && o.endTime.slice(0, 5) >= '23:30';
}

function changeTitle(o: IPitchSlotOverride) {
  if (o.type === 'blocked') return 'Closed';
  if (o.type === 'added') return o.price != null ? `Extra hours · ${naira(o.price)}` : 'Extra hours';
  return `Price ${naira(o.price ?? 0)}`;
}

/** A time on the half hour, styled like the other boxes, with a chevron instead of the phone's own arrows. */
function TimeSelect({ id, label: name, value, onChange, closing = false }: { id: string; label: string; value: string; onChange: (v: string) => void; closing?: boolean }) {
  // A closing time can be the end of the day (24:00): open until midnight
  const times = closing ? [...TIMES.slice(1), '24:00'] : TIMES;
  return (
    <div className="relative min-w-0 flex-1">
      <select id={id} aria-label={name} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} appearance-none pl-3.5 pr-9 font-bold tabular-nums`}>
        {(times.includes(value) ? times : [...times, value].sort()).map((t) => (
          <option key={t} value={t}>{t === '24:00' ? '12am (midnight)' : prettyTime(t)}</option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    </div>
  );
}

/** A tick box with a 44px row to tap. */
function Tick({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2.5 min-h-11 text-[14px] text-ink cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 shrink-0 accent-pitch-700" />
      {children}
    </label>
  );
}

/**
 * The next two months as day tiles to tap, in place of the phone's date box. The month sits on
 * the first of each month (and the first tile); a dot marks a day that already has a change.
 */
function DayStrip({ value, onChange, marked }: { value: string; onChange: (ymd: string) => void; marked: Set<string> }) {
  const [today] = useState(() => new Date());
  const days = Array.from({ length: CHANGE_DAYS }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
    return { ymd: localYmd(d), d, i };
  });
  return (
    <fieldset>
      <legend className={label}>Which day?</legend>
      <div className="-mx-5 px-5 flex gap-2 overflow-x-auto snap-x scroll-px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map(({ ymd, d, i }) => {
          const on = ymd === value;
          const month = i === 0 || d.getDate() === 1;
          return (
            <button
              key={ymd}
              type="button"
              aria-pressed={on}
              aria-label={`${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${i === 0 ? ', today' : ''}${marked.has(ymd) ? ', already has a change' : ''}`}
              onClick={() => onChange(ymd)}
              className={`press relative snap-start shrink-0 w-[56px] h-[76px] rounded-2xl border-[1.5px] flex flex-col items-center justify-center transition-colors ${
                on ? 'bg-ink border-ink text-white' : 'bg-white border-gray-200 text-ink hover:border-ink'
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wide ${on ? 'text-volt-300' : 'text-gray-500'}`}>
                {i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
              <span className="font-display text-[22px] font-extrabold leading-none mt-1 tabular-nums">{d.getDate()}</span>
              <span className={`text-[11px] mt-0.5 h-3.5 ${on ? 'text-white/70' : 'text-gray-500'}`}>{month ? d.toLocaleDateString('en-GB', { month: 'short' }) : ''}</span>
              {marked.has(ymd) && <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${on ? 'bg-volt-300' : 'bg-kit-500'}`} aria-hidden />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

const STATUS_WORD: Record<string, string> = { matched: 'Matched', assigned: 'Matched', unmatched: 'Not matched', completed: 'Sent', pending: 'Sending', failed: 'Failed' };

function MoneyList({ title, rows }: { title: string; rows: { id: string; amount: number; who?: string | null; status: string }[] }) {
  return (
    <div>
      <p className={label}>{title}</p>
      <ul className="divide-y divide-gray-200 border-y border-gray-200">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span className="font-display text-[15px] font-extrabold text-ink">{naira(r.amount)}</span>
            <span className="min-w-0 flex-1 text-[12px] text-gray-500 truncate">{r.who}</span>
            <span className={`text-[11px] font-bold ${r.status === 'failed' ? 'text-kit-600' : 'text-gray-600'}`}>{STATUS_WORD[r.status] ?? r.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
