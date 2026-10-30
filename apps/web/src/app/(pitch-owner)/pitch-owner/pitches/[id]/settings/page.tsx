'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getPitch, updatePitch, setSchedule, getSchedule, addOverride, listOverrides, removeOverride,
  saveBankDetails, pitchNameEnquiry, deactivatePitch,
  getPitchBalance, listPitchTransfers, listPitchPayouts, withdrawFromPitch, localYmd,
} from '@/lib/pitch';
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
const GAME_LENGTHS = [60, 90, 120];
const OVERRIDE_KINDS = [
  { value: 'blocked', label: 'Closed' },
  { value: 'added', label: 'Extra hours' },
  { value: 'price_override', label: 'Different price' },
];

type Section = 'where' | 'pitch' | 'hours' | 'changes' | 'bank' | 'account';
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
  const [splitDays, setSplitDays] = useState<string[]>([]);
  // Days off and changes
  const [overrides, setOverrides] = useState<IPitchSlotOverride[]>([]);
  const [ovr, setOvr] = useState({ date: '', type: 'blocked', startTime: '00:00', endTime: '23:30', price: '', reason: '' });
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
      setWeek(toWeek(s));
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
    const days = WEEK.filter((d) => week[d].open);
    const short = days.find((d) => week[d].from >= week[d].to);
    if (short != null) return toast.error(`${DAY_NAME[short]} closes before it opens.`);
    const tooShort = days.find((d) => minutes(week[d].to) - minutes(week[d].from) < gameMinutes);
    if (tooShort != null) return toast.error(`${DAY_NAME[tooShort]} is open for less than one ${gameMinutes}-minute game.`);
    run('hours', async () => {
      await updatePitch(id, { defaultPrice: price, slotDurationMinutes: gameMinutes });
      await setSchedule(id, days.map((d) => ({
        dayOfWeek: d,
        openTime: week[d].from,
        closeTime: week[d].to,
        price: dayPrices && week[d].price ? Number(week[d].price) : undefined,
      })));
    }, 'Saved prices and hours');
  }

  function addChange(e: React.FormEvent) {
    e.preventDefault();
    if (!ovr.date) return toast.error('Pick the day.');
    if (ovr.startTime >= ovr.endTime) return toast.error('The end time is before the start.');
    if (ovr.type === 'price_override' && !ovr.price) return toast.error('Set the price for those hours.');
    run('changes', () => addOverride(id, {
      date: ovr.date,
      type: ovr.type,
      startTime: ovr.startTime,
      endTime: ovr.endTime,
      price: ovr.type !== 'blocked' && ovr.price ? Number(ovr.price) : undefined,
      reason: ovr.reason.trim() || undefined,
    }).then(() => setOvr({ date: '', type: 'blocked', startTime: '00:00', endTime: '23:30', price: '', reason: '' })), 'Added');
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

  async function hide() {
    try {
      await deactivatePitch(id);
      toast.success('Pitch hidden');
      router.push('/pitch-owner/pitches');
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

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/pitch-owner/pitches/${id}`} className="press inline-flex items-center gap-1 min-h-11 -ml-1 px-1 text-sm font-bold text-pitch-700">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Bookings
      </Link>
      <PageHeader eyebrow="Pitch details" title={pitch.name} subtitle="What groups see when you share your link." />

      <GroupLabel>The pitch</GroupLabel>
      <div className={card}>
        <SettingsSections inset="card">
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
              <fieldset>
                <legend className={label}>Each game lasts</legend>
                <div className="flex flex-wrap gap-2">
                  {(GAME_LENGTHS.includes(gameMinutes) ? GAME_LENGTHS : [...GAME_LENGTHS, gameMinutes].sort((a, b) => a - b)).map((m) => (
                    <button key={m} type="button" aria-pressed={gameMinutes === m} onClick={() => setGameMinutes(m)} className={chip(gameMinutes === m)}>
                      {gameLength(m)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className={label}>Open</legend>
                <ul className="divide-y divide-gray-200 border-y border-gray-200">
                  {WEEK.map((d) => {
                    const h = week[d];
                    const set = (patch: Partial<DayHours>) => setWeek((w) => ({ ...w, [d]: { ...w[d], ...patch } }));
                    return (
                      <li key={d} className="py-2.5">
                        <div className="flex items-center gap-2">
                          <button type="button" aria-pressed={h.open} onClick={() => set({ open: !h.open })} className={`${chip(h.open)} w-[4.25rem] shrink-0 px-0`}>
                            {DAY_NAME[d].slice(0, 3)}
                          </button>
                          {h.open ? (
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <TimeSelect id={`from-${d}`} label={`${DAY_NAME[d]} opens`} value={h.from} onChange={(from) => set({ from })} />
                              <span className="text-[12px] text-gray-500" aria-hidden>to</span>
                              <TimeSelect id={`to-${d}`} label={`${DAY_NAME[d]} closes`} value={h.to} onChange={(to) => set({ to })} />
                            </div>
                          ) : (
                            <span className="text-[13px] text-gray-500">Closed</span>
                          )}
                        </div>
                        {h.open && dayPrices && (
                          <div className="mt-2 ml-[4.75rem] flex items-center gap-2">
                            <label htmlFor={`price-${d}`} className="text-[12px] text-gray-500 whitespace-nowrap">Price</label>
                            <input id={`price-${d}`} inputMode="numeric" value={h.price} onChange={(e) => set({ price: e.target.value.replace(/\D/g, '').slice(0, 7) })} placeholder={String(price)} className={`${field} min-h-10 text-[14px]`} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {splitDays.length > 0 && (
                  <p className="text-[12px] text-kit-600 mt-2">{splitDays.join(', ')} had more than one opening time. Saving keeps the times shown.</p>
                )}
                <label className="mt-3 flex items-center gap-2.5 min-h-11 text-[14px] text-ink cursor-pointer">
                  <input type="checkbox" checked={dayPrices} onChange={(e) => setDayPrices(e.target.checked)} className="w-5 h-5 accent-pitch-700" />
                  Some days cost more (or less)
                </label>
              </fieldset>
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
                      <span className="block text-[12px] text-gray-500 truncate">{[prettyDate(o.date), `${prettyTime(o.startTime)}–${prettyTime(o.endTime)}`, o.reason].filter(Boolean).join(' · ')}</span>
                    </span>
                    <button type="button" onClick={() => removeChange(o)} className="press min-h-11 px-2 text-[13px] font-bold text-gray-600 hover:text-ink" aria-label={`Remove ${changeTitle(o)} on ${prettyDate(o.date)}`}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addChange} noValidate className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {OVERRIDE_KINDS.map((k) => (
                  <button key={k.value} type="button" aria-pressed={ovr.type === k.value} onClick={() => setOvr({ ...ovr, type: k.value })} className={chip(ovr.type === k.value)}>
                    {k.label}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="ovr-date" className={label}>Day</label>
                <input id="ovr-date" type="date" min={localYmd(new Date())} value={ovr.date} onChange={(e) => setOvr({ ...ovr, date: e.target.value })} className={field} />
              </div>
              <div className="flex items-center gap-1.5">
                <TimeSelect id="ovr-from" label="From" value={ovr.startTime} onChange={(startTime) => setOvr({ ...ovr, startTime })} />
                <span className="text-[12px] text-gray-500" aria-hidden>to</span>
                <TimeSelect id="ovr-to" label="To" value={ovr.endTime} onChange={(endTime) => setOvr({ ...ovr, endTime })} />
              </div>
              {ovr.type !== 'blocked' && (
                <div>
                  <label htmlFor="ovr-price" className={label}>Price a game{ovr.type === 'added' && <span className="font-medium text-gray-500"> (optional)</span>}</label>
                  <input id="ovr-price" inputMode="numeric" value={ovr.price} onChange={(e) => setOvr({ ...ovr, price: e.target.value.replace(/\D/g, '').slice(0, 7) })} placeholder={String(pitch.defaultPrice)} className={field} />
                </div>
              )}
              <div>
                <label htmlFor="ovr-reason" className={label}>Why <span className="font-medium text-gray-500">(optional)</span></label>
                <input id="ovr-reason" maxLength={80} value={ovr.reason} onChange={(e) => setOvr({ ...ovr, reason: e.target.value })} placeholder="e.g. Tournament" className={field} />
              </div>
              <button type="submit" disabled={saving === 'changes'} className={`w-full ${btnPrimary}`}>{saving === 'changes' ? 'Adding…' : 'Add'}</button>
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

          {pitch.accountNumber && (
            <SettingsSection id="s-account" icon={PITCH_ICONS.wallet} title="Pitch account" summary={`${pitch.virtualBankName} · ${pitch.accountNumber}`} open={open === 'account'} onToggle={() => toggle('account')}>
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

      <div className="mt-8 mb-4">
        <button type="button" onClick={() => setConfirmHide(true)} className={`w-full ${btnDanger}`}>Hide this pitch</button>
        <p className="text-[12px] text-gray-500 mt-1.5 text-center">Its link stops working and no one can book it.</p>
      </div>
      <ConfirmSheet
        open={confirmHide}
        title="Hide this pitch?"
        message="Its link stops working and groups can’t book it. Bookings already made stay as they are."
        confirmLabel="Hide pitch"
        cancelLabel="Keep it"
        danger
        onConfirm={() => { setConfirmHide(false); hide(); }}
        onCancel={() => setConfirmHide(false)}
      />
    </div>
  );
}

/** "1 hour", "1½ hours", "2 hours", "45 minutes". */
function gameLength(m: number) {
  if (m === 60) return '1 hour';
  if (m % 60 === 0) return `${m / 60} hours`;
  if (m % 60 === 30 && m > 60) return `${Math.floor(m / 60)}½ hours`;
  return `${m} minutes`;
}

function minutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function prettyDate(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function changeTitle(o: IPitchSlotOverride) {
  if (o.type === 'blocked') return 'Closed';
  if (o.type === 'added') return o.price != null ? `Extra hours · ${naira(o.price)}` : 'Extra hours';
  return `Price ${naira(o.price ?? 0)}`;
}

function TimeSelect({ id, label: name, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select
      id={id}
      aria-label={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 min-h-11 px-2 bg-white border border-gray-200 rounded-xl text-[14px] text-ink text-center focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
    >
      {(TIMES.includes(value) ? TIMES : [...TIMES, value].sort()).map((t) => (
        <option key={t} value={t}>{prettyTime(t)}</option>
      ))}
    </select>
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
