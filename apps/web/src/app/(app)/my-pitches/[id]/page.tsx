'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { IPitch, IPitchBooking, IPitchSchedule, IPitchSlotOverride } from '@pitchaside/shared';
import { BackButton } from '@/components/back-button';
import { BallLoader } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { ConfirmSheet } from '@/components/match-day/confirm-sheet';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { prettyTime } from '@/components/player-ui';
import { naira, PITCH_ICONS } from '@/components/pitch/pitch-facts';
import { HiddenPitchBanner } from '@/components/pitch/hidden-pitch-banner';
import {
  assignPitchTransfer,
  cancelBookingOwner,
  confirmBooking,
  getPitch,
  getSchedule,
  listBookings,
  listOverrides,
  listPitchTransfers,
  localYmd,
  markBookingPaid,
  rejectBooking,
} from '@/lib/pitch';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const span = (b: { startTime: string; endTime: string }) => `${prettyTime(b.startTime.slice(0, 5))} – ${prettyTime(b.endTime.slice(0, 5))}`;
const dayName = (ymd: string, today: string) => {
  if (ymd === today) return 'Today';
  const d = new Date(`${ymd}T12:00:00`);
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
};

/** "today", "tomorrow" or "on Sat 31 Oct", for the middle of a sentence. */
const onDay = (ymd: string, today: string) => {
  const d = dayName(ymd, today);
  return d === 'Today' || d === 'Tomorrow' ? d.toLowerCase() : `on ${d}`;
};

interface Transfer { id: string; amount: number | string; senderName?: string | null; receivedAt: string; status: string }

/**
 * A pitch's own page for its owner: requests to answer first, then the bookings coming up by day,
 * one Share button for the link, and the pitch's hours, days off, details and money as rows.
 */
export default function PitchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [pitch, setPitch] = useState<IPitch | null>(null);
  const [schedule, setSchedule] = useState<IPitchSchedule[]>([]);
  const [bookings, setBookings] = useState<IPitchBooking[]>([]);
  const [overrides, setOverrides] = useState<IPitchSlotOverride[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<IPitchBooking | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s, b, o] = await Promise.all([getPitch(id), getSchedule(id), listBookings(id), listOverrides(id)]);
      setPitch(p);
      setSchedule(s);
      setBookings(b);
      setOverrides(o);
      setState('ready');
      if (p.accountNumber) listPitchTransfers(id).then((t) => setTransfers(t.filter((x: Transfer) => x.status === 'unmatched'))).catch(() => {});
    } catch {
      setState((s) => (s === 'ready' ? s : 'missing'));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const today = localYmd(new Date());
  const { waiting, coming, earlier } = useMemo(() => {
    const byTime = (a: IPitchBooking, b: IPitchBooking) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
    const upcoming = (b: IPitchBooking) => b.date >= today;
    return {
      waiting: bookings.filter((b) => b.status === 'pending' && upcoming(b)).sort(byTime),
      coming: bookings.filter((b) => b.status === 'confirmed' && upcoming(b)).sort(byTime),
      earlier: bookings.filter((b) => !(upcoming(b) && (b.status === 'pending' || b.status === 'confirmed'))).sort(byTime).reverse(),
    };
  }, [bookings, today]);

  async function act(key: string, run: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await run();
      toast.success(done);
      setOpen(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (state === 'loading') return <div className="flex justify-center py-20"><BallLoader /></div>;
  if (state === 'missing' || !pitch) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <BackButton label="Your pitches" href="/my-pitches" />
        <p className="mt-6 rounded-3xl bg-chalk px-5 py-6 text-sm text-gray-600">We couldn’t find that pitch. It may belong to another account.</p>
      </div>
    );
  }

  const place = [pitch.city, pitch.state].filter(Boolean).join(', ');
  const openDays = schedule.length;
  const hoursLine = !openDays ? 'Set the days and hours it opens' : hoursSummary(schedule);
  const changesLine = overrides.length ? `${overrides.length} coming up` : 'Close a day or change its hours';
  // Coming up, under their day
  const days = coming.reduce<[string, IPitchBooking[]][]>((acc, b) => {
    const last = acc[acc.length - 1];
    if (last && last[0] === b.date) last[1].push(b);
    else acc.push([b.date, [b]]);
    return acc;
  }, []);
  const toCollect = coming.filter((b) => b.paymentStatus !== 'paid').reduce((s, b) => s + Number(b.price), 0);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Your pitches" href="/my-pitches" />

      {/* The pitch, and the one way to get it booked: its link */}
      <section className="relative rounded-3xl bg-ink turf-stripes text-white shadow-card px-5 pt-4 pb-5 overflow-hidden">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-volt-300">Your pitch</p>
        <h1 className="mt-1 font-display text-[26px] leading-[1.1] font-extrabold break-words">{pitch.name}</h1>
        <p className="mt-1 text-[13px] text-white/70 truncate">{[place, `${naira(pitch.defaultPrice)} a game`].filter(Boolean).join(' · ')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat value={String(waiting.length)} label={waiting.length === 1 ? 'request waiting' : 'requests waiting'} hot={waiting.length > 0} />
          <Stat value={String(coming.length)} label={coming.length === 1 ? 'booking coming up' : 'bookings coming up'} />
        </div>
        <SharePitch name={pitch.name} code={pitch.shareCode} />
      </section>

      {pitch.status === 'inactive' && <div className="mt-4"><HiddenPitchBanner pitchId={id} onShown={load} /></div>}

      {/* 1. Requests: the owner's answer is what's needed */}
      {waiting.length > 0 && (
        <section className="mt-6" aria-labelledby="waiting-title">
          <h2 id="waiting-title" className="text-base font-bold text-ink">Waiting for you</h2>
          <p className="text-xs text-gray-500 mb-2.5">Answer within a day, or the time frees up.</p>
          <ul className="space-y-2">
            {waiting.map((b) => (
              <li key={b.id} className="rounded-3xl bg-white border border-gray-100 shadow-card px-4 pt-3.5 pb-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 font-display text-[18px] font-extrabold text-ink truncate">{dayName(b.date, today)} · {span(b)}</p>
                  <p className="shrink-0 font-display text-[16px] font-extrabold text-ink tabular-nums">{naira(b.price)}</p>
                </div>
                <p className="mt-0.5 text-[13px] text-gray-600 truncate">
                  {b.bookerName}
                  {b.bookerPhone ? ` · ${b.bookerPhone}` : ''}
                </p>
                {b.notes && <p className="mt-1 text-[13px] text-gray-500 line-clamp-2">“{b.notes}”</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={!!busy} onClick={() => act(`no-${b.id}`, () => rejectBooking(id, b.id), 'Request declined')} className={`${btnSecondary} disabled:opacity-50`}>
                    {busy === `no-${b.id}` ? 'Declining…' : 'Decline'}
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => act(`yes-${b.id}`, () => confirmBooking(id, b.id), 'Booking confirmed')} className={`${btnPrimary} disabled:opacity-50`}>
                    {busy === `yes-${b.id}` ? 'Confirming…' : 'Confirm'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. What's booked, by day */}
      <section className="mt-6" aria-labelledby="coming-title">
        <h2 id="coming-title" className="text-base font-bold text-ink">Coming up</h2>
        {coming.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 mb-2.5">{toCollect > 0 ? `${naira(toCollect)} still to be paid. Tap a booking for more.` : 'All paid. Tap a booking for more.'}</p>
            <div className="space-y-4">
              {days.map(([d, list]) => (
                <div key={d}>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-1.5">{dayName(d, today)}</h3>
                  <ul className="rounded-3xl bg-white border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
                    {list.map((b) => (
                      <li key={b.id}>
                        <button type="button" onClick={() => setOpen(b)} className="press w-full flex items-center gap-3 px-4 min-h-16 py-2.5 text-left hover:bg-chalk/60">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-bold text-ink tabular-nums">{span(b)}</span>
                            <span className="block text-[13px] text-gray-600 truncate">{b.bookerName}</span>
                          </span>
                          <PaidChip booking={b} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-2 flex items-center gap-3 rounded-3xl bg-chalk px-4 py-4">
            <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-pitch-700" aria-hidden>
              <Icon d={PITCH_ICONS.calendar} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-ink">No bookings coming up</span>
              <span className="block text-[12px] text-gray-600">Share your pitch so groups can book it.</span>
            </span>
          </div>
        )}
      </section>

      {/* 3. The pitch itself: each row opens its part of Pitch details */}
      <section className="mt-6" aria-labelledby="pitch-title">
        <h2 id="pitch-title" className="text-base font-bold text-ink mb-2.5">Your pitch</h2>
        <ul className="rounded-3xl bg-white border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
          <Row href={`/my-pitches/${id}/settings?open=hours`} icon={PITCH_ICONS.clock} title="Hours and prices" line={hoursLine} />
          <Row href={`/my-pitches/${id}/settings?open=changes`} icon={PITCH_ICONS.calendar} title="Days off and changes" line={changesLine} />
          <Row href={`/my-pitches/${id}/settings?open=photos`} icon={PITCH_ICONS.camera} title="Photos and details" line={`${pitch.photoKeys?.length ?? 0} photo${pitch.photoKeys?.length === 1 ? '' : 's'} · where it is, size, surface`} />
          <Row href={`/my-pitches/${id}/settings?open=${pitch.accountNumber ? 'account' : 'bank'}`} icon={PITCH_ICONS.bank} title="Money" line={pitch.accountNumber ? `Pitch account ${pitch.accountNumber}` : 'Where booking money goes'} />
        </ul>
      </section>

      {/* 4. Done, declined and cancelled, out of the way */}
      {earlier.length > 0 && (
        <section className="mt-6 mb-4">
          <button type="button" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)} className="press w-full min-h-11 flex items-center justify-between text-[14px] font-bold text-ink">
            Earlier bookings · {earlier.length}
            <svg className={`w-4 h-4 transition-transform ${showEarlier ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showEarlier && (
            <ul className="mt-1.5 rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {earlier.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => setOpen(b)} className="press w-full flex items-center gap-3 px-4 min-h-14 py-2 text-left hover:bg-chalk/60">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-ink truncate">{dayName(b.date, today)} · {span(b)}</span>
                      <span className="block text-[12px] text-gray-500 truncate">{b.bookerName}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-bold text-gray-500">{WORDS[b.status] ?? b.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {open && (
        <BookingSheet
          booking={open}
          today={today}
          transfers={transfers}
          busy={busy}
          onClose={() => setOpen(null)}
          onPaid={() => act(`paid-${open.id}`, () => markBookingPaid(id, open.id), 'Marked as paid')}
          onMatch={(tid) => act(`match-${open.id}`, () => assignPitchTransfer(id, tid, open.id), 'Payment matched')}
          onCancel={() => act(`cancel-${open.id}`, () => cancelBookingOwner(id, open.id), 'Booking cancelled')}
        />
      )}
    </div>
  );
}

const WORDS: Record<string, string> = { confirmed: 'Played', pending: 'Not answered', rejected: 'Declined', cancelled: 'Cancelled', expired: 'Not answered' };

/** "Mon–Fri 6am–11pm" for one window, else "Open 6 days". */
function hoursSummary(schedule: IPitchSchedule[]) {
  const days = [...new Set(schedule.map((s) => s.dayOfWeek))];
  const windows = new Set(schedule.map((s) => `${s.openTime.slice(0, 5)}-${s.closeTime.slice(0, 5)}`));
  const count = days.length === 7 ? 'Every day' : `Open ${days.length} day${days.length === 1 ? '' : 's'}`;
  if (windows.size !== 1) return `${count} · times vary by day`;
  const [o, c] = [...windows][0].split('-');
  return `${count} · ${prettyTime(o)}–${prettyTime(c)}`;
}

function Stat({ value, label, hot = false }: { value: string; label: string; hot?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-2.5 ${hot ? 'bg-white text-ink' : 'bg-white/10'}`}>
      <p className="font-display text-[22px] leading-none font-extrabold tabular-nums">{value}</p>
      <p className={`mt-1 text-[12px] truncate ${hot ? 'text-ink/80' : 'text-white/70'}`}>{label}</p>
    </div>
  );
}

/** The pitch's link, shared the phone's way (WhatsApp and the rest), or copied where that's not there. */
function SharePitch({ name, code }: { name: string; code: string }) {
  const toast = useToast();
  async function share() {
    const url = `${window.location.origin}/p/${code}`;
    const text = `Book ${name} on PitchAside: pick a day and time, then send a request.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error(`Copy this link: ${url}`);
    }
  }
  return (
    <button type="button" onClick={share} className="press mt-3 w-full min-h-12 rounded-2xl bg-volt-300 text-ink text-[15px] font-bold flex items-center justify-center gap-2">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
      </svg>
      Share pitch link
    </button>
  );
}

function PaidChip({ booking }: { booking: IPitchBooking }) {
  return booking.paymentStatus === 'paid' ? (
    <span className="shrink-0 rounded-full bg-pitch-100 px-2.5 py-1 text-[12px] font-bold text-pitch-800">Paid</span>
  ) : (
    <span className="shrink-0 rounded-full bg-kit-500/15 px-2.5 py-1 text-[12px] font-bold text-kit-700 tabular-nums">To pay {naira(booking.price)}</span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Row({ href, icon, title, line }: { href: string; icon: string; title: string; line: string }) {
  return (
    <li>
      <Link href={href} className="press flex items-center gap-3 px-4 min-h-16 py-2.5 hover:bg-chalk/60">
        <span className="w-10 h-10 shrink-0 rounded-full bg-chalk flex items-center justify-center text-pitch-700" aria-hidden>
          <Icon d={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">{title}</span>
          <span className="block text-[12px] text-gray-500 truncate">{line}</span>
        </span>
        <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </Link>
    </li>
  );
}

/** One booking: who and when, its money, and what the owner can still do with it. */
function BookingSheet({
  booking: b,
  today,
  transfers,
  busy,
  onClose,
  onPaid,
  onMatch,
  onCancel,
}: {
  booking: IPitchBooking;
  today: string;
  transfers: Transfer[];
  busy: string | null;
  onClose: () => void;
  onPaid: () => void;
  onMatch: (transferId: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const live = b.status === 'confirmed' && b.date >= today;
  const unpaid = b.status === 'confirmed' && b.paymentStatus !== 'paid';
  return (
    <>
      <Sheet
        titleId={titleId}
        onClose={onClose}
        align="left"
        footer={
          unpaid ? (
            <button type="button" disabled={!!busy} onClick={onPaid} className={`w-full ${btnPrimary} disabled:opacity-50`}>
              {busy?.startsWith('paid') ? 'Saving…' : `Paid in cash or transfer · ${naira(b.price)}`}
            </button>
          ) : undefined
        }
      >
        <SheetTitle id={titleId} title={`${dayName(b.date, today)} · ${span(b)}`} sub={b.bookerName} onClose={onClose} />
        <dl className="mt-4 rounded-2xl border border-gray-200 divide-y divide-gray-100">
          <Fact label="Price" value={naira(b.price)} />
          <Fact label="Payment" value={b.paymentStatus === 'paid' ? (b.paymentMethod === 'on_platform' ? 'Paid into the pitch account' : 'Paid outside the app') : b.status === 'confirmed' ? 'Not paid yet' : '—'} />
          {b.bookerPhone && <Fact label="Phone" value={<a href={`tel:${b.bookerPhone}`} className="font-bold text-pitch-700">{b.bookerPhone}</a>} />}
          <Fact label="Status" value={WORDS[b.status] && !live ? WORDS[b.status] : b.status === 'confirmed' ? 'Confirmed' : 'Waiting for you'} />
        </dl>
        {b.notes && <p className="mt-3 text-[13px] text-gray-600">“{b.notes}”</p>}

        {/* Money in the pitch account that isn't tied to a booking: tie it to this one */}
        {unpaid && transfers.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500 mb-1.5">Paid in, not matched yet</h3>
            <ul className="rounded-2xl border border-gray-200 divide-y divide-gray-100">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-center gap-3 pl-4 pr-2 min-h-14">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink tabular-nums">{naira(t.amount)}</span>
                    <span className="block text-[12px] text-gray-500 truncate">{[t.senderName, new Date(t.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button type="button" disabled={!!busy} onClick={() => onMatch(t.id)} className="press shrink-0 min-h-11 px-3 rounded-xl border border-gray-300 text-[13px] font-bold text-ink disabled:opacity-50">
                    It’s this one
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {live && (
          <button type="button" onClick={() => setConfirmCancel(true)} className="press mt-5 w-full min-h-12 rounded-xl text-[15px] font-semibold text-kit-600 hover:bg-kit-500/10">
            Cancel this booking
          </button>
        )}
      </Sheet>
      <ConfirmSheet
        open={confirmCancel}
        title="Cancel this booking?"
        message={
          b.paymentStatus === 'paid'
            ? `${b.bookerName}'s ${span(b)} ${onDay(b.date, today)} is freed for others to book. What they paid isn't sent back by the app: refund them yourself.`
            : `${b.bookerName}'s ${span(b)} ${onDay(b.date, today)} is freed for others to book. Call them to let them know.`
        }
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
        danger
        onConfirm={() => {
          setConfirmCancel(false);
          onCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 min-h-12">
      <dt className="text-[13px] text-gray-500">{label}</dt>
      <dd className="text-[14px] font-bold text-ink text-right truncate">{value}</dd>
    </div>
  );
}
