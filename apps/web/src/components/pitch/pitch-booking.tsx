'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { IPitchDayAvailability, IPitchSlot, IPublicPitch } from '@pitchaside/shared';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { BallLoader } from '@/components/skeleton';
import { prettyTime } from '@/components/player-ui';
import { field, label } from '@/components/group/group-edit-sheet';
import { naira, PITCH_ICONS } from '@/components/pitch/pitch-facts';
import { createBooking, getPublicAvailability, localYmd } from '@/lib/pitch';

/** The API gives at most 14 days at a time. */
const WINDOW = 14;
const PARTS = [
  { name: 'Morning', until: 12 * 60 },
  { name: 'Afternoon', until: 17 * 60 },
  { name: 'Evening', until: 24 * 60 },
];

interface Picked { date: string; slot: IPitchSlot }
const keyOf = (date: string, s: IPitchSlot) => `${date}|${s.startTime}`;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const dayOf = (ymd: string) => new Date(`${ymd}T12:00:00`);
const shortDay = (ymd: string) => dayOf(ymd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const longDay = (ymd: string) => dayOf(ymd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
/** "Saturday 31 Oct": the weekday in full, short enough to sit beside the price. */
const headDay = (ymd: string) => dayOf(ymd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
const span = (s: IPitchSlot) => `${prettyTime(s.startTime)} – ${prettyTime(s.endTime)}`;

/** Times that haven't started yet, on this phone's clock. */
function upcoming(day: IPitchDayAvailability, today: string, nowMins: number) {
  return day.slots.filter((s) => day.date > today || (day.date === today && mins(s.startTime) > nowMins));
}

/** The price most of a day's free times cost, so it's said once instead of on every time. */
function usualPrice(slots: IPitchSlot[]) {
  const count = new Map<number, number>();
  for (const s of slots) count.set(s.price, (count.get(s.price) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Book a pitch like booking a meeting: pick a day from the strip, tap the times you want (one or
 * several), then send the request from a sheet. The owner confirms; payment comes after that.
 */
export function PitchBooking({ code, pitch, inApp = false }: { code: string; pitch: IPublicPitch; inApp?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const sheetTitle = useId();
  const dayLabel = useId();
  const [page, setPage] = useState(0);
  // Bumped after a request goes in, so the times just asked for stop showing as free.
  const [reload, setReload] = useState(0);
  const [days, setDays] = useState<IPitchDayAvailability[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [date, setDate] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Picked[] | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const now = new Date();
  const today = localYmd(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || `${user.firstName} ${user.lastName}`, phone: f.phone || user.phone || '' }));
  }, [user]);

  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() + page * WINDOW);
    const end = new Date(start);
    end.setDate(end.getDate() + WINDOW - 1);
    setDays(null);
    setFailed(false);
    getPublicAvailability(code, localYmd(start), localYmd(end))
      .then((res) => {
        setDays(res.days);
        // Open on the first day that still has a free time.
        const first = res.days.find((d) => upcoming(d, localYmd(new Date()), nowMinutes()).some((s) => s.available));
        setDate(first?.date ?? res.days[0]?.date ?? '');
        strip.current?.scrollTo({ left: 0 });
      })
      .catch(() => setFailed(true));
  }, [code, page, reload]);

  const day = days?.find((d) => d.date === date);
  const times = day ? upcoming(day, today, nowMins) : [];
  const free = times.filter((s) => s.available);
  const taken = times.length - free.length;
  const price = usualPrice(free);
  const total = picked.reduce((sum, p) => sum + p.slot.price, 0);
  const pickedDays = new Set(picked.map((p) => p.date)).size;
  const sorted = useMemo(() => [...picked].sort((a, b) => keyOf(a.date, a.slot).localeCompare(keyOf(b.date, b.slot))), [picked]);

  function toggle(s: IPitchSlot) {
    const k = keyOf(date, s);
    setPicked((list) => (list.some((p) => keyOf(p.date, p.slot) === k) ? list.filter((p) => keyOf(p.date, p.slot) !== k) : [...list, { date, slot: s }]));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error('Add your name so the owner knows who’s booking.');
    setSending(true);
    const done: Picked[] = [];
    const errors: string[] = [];
    for (const p of sorted) {
      try {
        await createBooking({ pitchId: pitch.id, date: p.date, startTime: p.slot.startTime, endTime: p.slot.endTime, bookerName: form.name.trim(), bookerPhone: form.phone.trim() || undefined, notes: form.notes.trim() || undefined });
        done.push(p);
      } catch (err) {
        errors.push(`${shortDay(p.date)} ${prettyTime(p.slot.startTime)}: ${err instanceof Error ? err.message : 'didn’t go through'}`);
      }
    }
    setSending(false);
    if (errors.length) toast.error(errors.join('\n'));
    if (done.length) {
      setOpen(false);
      setPicked([]);
      setSent(done);
      setReload((n) => n + 1);
    }
  }

  // Sent: what was asked for, and what happens next.
  if (sent) {
    const due = sent.reduce((sum, p) => sum + p.slot.price, 0);
    return (
      <section className="mt-4 rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6">
        <div className="w-14 h-14 rounded-full bg-volt-300 text-ink flex items-center justify-center animate-pop-in" aria-hidden>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        </div>
        <h2 className="mt-4 font-display text-[24px] font-extrabold text-ink leading-tight">{sent.length === 1 ? 'Request sent' : `${sent.length} requests sent`}</h2>
        <p className="text-sm text-gray-600 mt-1">The owner confirms each time. Nothing is paid yet.</p>
        <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
          {sent.map((p) => (
            <li key={keyOf(p.date, p.slot)} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 text-[14px] text-ink truncate"><b>{shortDay(p.date)}</b> · {span(p.slot)}</span>
              <span className="font-display text-[15px] font-extrabold text-ink">{naira(p.slot.price)}</span>
            </li>
          ))}
        </ul>
        {pitch.accountNumber && (
          <div className="mt-4 rounded-2xl bg-chalk px-4 py-3">
            {/* A transfer is matched to one booking by its amount (billing matchPitchBooking), so one per game. */}
            <p className="text-[12px] text-gray-600">{sent.length === 1 ? `Once it’s confirmed, pay ${naira(due)} to` : 'Once confirmed, pay each game to'}</p>
            <p className="font-display text-[20px] font-extrabold text-ink tracking-wide mt-0.5">{pitch.accountNumber}</p>
            <p className="text-[12px] text-gray-600 truncate">{pitch.accountName} · {pitch.virtualBankName}</p>
          </div>
        )}
        <div className="mt-5 grid gap-2">
          {user && <Link href="/book-pitch/mine" className={`w-full ${btnPrimary}`}>See your bookings</Link>}
          <button type="button" onClick={() => setSent(null)} className={`w-full ${btnSecondary}`}>Book more times</button>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* 1. Pick a day */}
      <div className="mt-6 flex items-center justify-between gap-3 px-1">
        <h2 id={dayLabel} className="font-display text-[18px] font-extrabold text-ink">Pick a day</h2>
        <div className="flex items-center">
          {page > 0 && (
            <button type="button" onClick={() => setPage((p) => p - 1)} className="press min-h-11 px-2 text-[13px] font-bold text-pitch-700">‹ Sooner</button>
          )}
          <button type="button" onClick={() => setPage((p) => p + 1)} className="press min-h-11 px-2 text-[13px] font-bold text-pitch-700">Later ›</button>
        </div>
      </div>
      {!days && !failed && <div className="flex justify-center py-10"><BallLoader /></div>}
      {failed && <Note icon={PITCH_ICONS.calendar} title="Couldn’t load the times" line="Check your connection and try again." />}
      {days && (
        <div ref={strip} role="group" aria-labelledby={dayLabel} className="-mx-4 px-4 mt-2 flex gap-2 overflow-x-auto snap-x scroll-px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d) => {
            const on = d.date === date;
            const left = upcoming(d, today, nowMins).filter((s) => s.available).length;
            const n = picked.filter((p) => p.date === d.date).length;
            const word = d.slots.length === 0 ? 'Closed' : left ? `${left} free` : 'Full';
            return (
              <button
                key={d.date}
                type="button"
                aria-pressed={on}
                aria-label={`${longDay(d.date)}${d.date === today ? ', today' : ''}: ${word}${n ? `, ${n} picked` : ''}`}
                onClick={() => setDate(d.date)}
                className={`press relative snap-start shrink-0 w-[60px] h-[88px] rounded-2xl border flex flex-col items-center justify-center transition-colors ${
                  on ? 'bg-ink border-ink text-white' : left ? 'bg-white border-gray-200 text-ink hover:border-ink' : 'bg-chalk border-transparent text-gray-500'
                }`}
              >
                <span className={`text-[11px] font-bold uppercase tracking-wide ${on ? 'text-volt-300' : 'text-gray-500'}`}>{d.date === today ? 'Today' : dayOf(d.date).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                <span className="font-display text-[22px] font-extrabold leading-none mt-1 tabular-nums">{dayOf(d.date).getDate()}</span>
                <span className={`text-[11px] mt-1 whitespace-nowrap ${on ? 'text-white/70' : left ? 'text-pitch-700 font-bold' : 'text-gray-500'}`}>{word}</span>
                {n > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-volt-300 text-ink text-[11px] font-extrabold flex items-center justify-center ring-2 ring-chalk" aria-hidden>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. Pick a time */}
      {day && (
        <section className="mt-5 rounded-3xl bg-white border border-gray-100 shadow-card px-5 pt-4 pb-5" aria-label={`Times on ${longDay(day.date)}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 font-display text-[18px] font-extrabold text-ink truncate">{headDay(day.date)}</h3>
            {price != null && <p className="shrink-0 text-[13px] text-gray-600 whitespace-nowrap"><b className="text-ink">{naira(price)}</b> a game</p>}
          </div>
          {free.length > 0 ? (
            <>
              <p className="text-[12px] text-gray-500 mt-0.5">Tap one or more times{taken ? ` · ${taken} already booked` : ''}</p>
              {PARTS.map((part, i) => {
                const from = i ? PARTS[i - 1].until : 0;
                const these = free.filter((s) => mins(s.startTime) >= from && mins(s.startTime) < part.until);
                if (!these.length) return null;
                return (
                  <div key={part.name} className="mt-4">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-2">{part.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {these.map((s) => {
                        const on = picked.some((p) => keyOf(p.date, p.slot) === keyOf(date, s));
                        return (
                          <button
                            key={s.startTime}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(s)}
                            className={`press min-h-12 px-2 rounded-2xl border-2 flex flex-col items-center justify-center transition-colors ${
                              on ? 'bg-ink border-ink text-volt-300' : 'bg-white border-pitch-600/30 text-pitch-800 hover:border-pitch-600'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-[15px] font-bold whitespace-nowrap tabular-nums">
                              {on && (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                              )}
                              {span(s)}
                            </span>
                            {s.price !== price && <span className={`text-[11px] font-bold ${on ? 'text-volt-300/80' : 'text-gray-500'}`}>{naira(s.price)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <Note
              icon={PITCH_ICONS.clock}
              title={day.slots.length === 0 ? 'Closed this day' : times.length === 0 ? 'No more times today' : 'All booked'}
              line={day.slots.length === 0 ? 'Pick another day above.' : times.length === 0 ? 'Pick another day above.' : 'Every time is taken. Try another day.'}
            />
          )}
        </section>
      )}

      {/* 3. What's picked, and the way on */}
      {picked.length > 0 && <div className="h-28" aria-hidden />}
      {picked.length > 0 && (
        <div className={`fixed inset-x-3 z-40 max-w-xl mx-auto ${inApp ? 'bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+5rem)] md:bottom-4 md:pl-60' : 'bottom-[max(env(safe-area-inset-bottom),0.75rem)]'}`}>
          <div className="rounded-3xl bg-ink text-white shadow-card px-4 py-3 flex items-center gap-3 animate-pop-in" aria-live="polite">
            <div className="min-w-0 flex-1">
              <p className="font-display text-[20px] font-extrabold leading-tight tabular-nums">{naira(total)}</p>
              <p className="text-[12px] text-white/70 truncate">
                {picked.length === 1 ? `${shortDay(picked[0].date)} · ${span(picked[0].slot)}` : `${picked.length} games${pickedDays > 1 ? ` on ${pickedDays} days` : ` · ${shortDay(picked[0].date)}`}`}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(true)} className="press shrink-0 min-h-12 px-5 rounded-2xl bg-volt-300 text-ink text-[15px] font-bold">Continue</button>
          </div>
        </div>
      )}

      {open && (
        <Sheet
          titleId={sheetTitle}
          onClose={() => setOpen(false)}
          align="left"
          footer={
            user ? (
              <button type="submit" form="booking-form" disabled={sending} className={`w-full ${btnPrimary}`}>
                {sending ? 'Sending…' : `Send request · ${naira(total)}`}
              </button>
            ) : undefined
          }
        >
          <SheetTitle id={sheetTitle} title={picked.length === 1 ? 'Request this time' : `Request ${picked.length} times`} sub="The owner confirms, then you pay." onClose={() => setOpen(false)} />
          <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
            {sorted.map((p) => (
              <li key={keyOf(p.date, p.slot)} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-[14px] text-ink truncate"><b>{shortDay(p.date)}</b> · {span(p.slot)}</span>
                <span className="font-display text-[15px] font-extrabold text-ink">{naira(p.slot.price)}</span>
                <button
                  type="button"
                  onClick={() => setPicked((l) => { const next = l.filter((x) => keyOf(x.date, x.slot) !== keyOf(p.date, p.slot)); if (!next.length) setOpen(false); return next; })}
                  className="press -mr-2 w-11 h-11 flex items-center justify-center text-gray-500 hover:text-ink"
                  aria-label={`Remove ${shortDay(p.date)} ${span(p.slot)}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </li>
            ))}
            {picked.length > 1 && (
              <li className="flex items-center justify-between py-2.5 pr-9">
                <span className="text-[14px] font-bold text-ink">Total</span>
                <span className="font-display text-[17px] font-extrabold text-ink">{naira(total)}</span>
              </li>
            )}
          </ul>
          {authLoading ? null : user ? (
            <form id="booking-form" onSubmit={send} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor="bk-name" className={label}>Your name</label>
                <input id="bk-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor="bk-phone" className={label}>Phone <span className="font-medium text-gray-500">(so the owner can call)</span></label>
                <input id="bk-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0803 123 4567" className={field} />
              </div>
              <div>
                <label htmlFor="bk-notes" className={label}>Note for the owner <span className="font-medium text-gray-500">(optional)</span></label>
                <input id="bk-notes" maxLength={200} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Saturday Ballers, 12 players" className={field} />
              </div>
            </form>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-[14px] text-gray-600">Sign in so the owner knows who’s booking.</p>
              <Link href={`/signin?redirect=${encodeURIComponent(`/p/${code}`)}`} className={`w-full ${btnPrimary}`}>Sign in</Link>
              <Link href={`/signup?redirect=${encodeURIComponent(`/p/${code}`)}`} className={`w-full ${btnSecondary}`}>New here? Sign up</Link>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** A none-yet block: icon, short title, one line. */
function Note({ icon, title, line }: { icon: string; title: string; line: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-chalk px-4 py-3.5">
      <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-pitch-700" aria-hidden>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-ink">{title}</span>
        <span className="block text-[12px] text-gray-600">{line}</span>
      </span>
    </div>
  );
}
