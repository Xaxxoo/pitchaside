'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { IPitchBooking } from '@pitchaside/shared';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/brand';
import { BallLoader } from '@/components/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ConfirmSheet } from '@/components/match-day/confirm-sheet';
import { prettyTime } from '@/components/player-ui';
import { naira } from '@/components/pitch/pitch-facts';
import { cancelMyBooking, getMyBookings, localYmd } from '@/lib/pitch';

/** Where a booking stands, in a word or two, and how it looks. Colour is never the only signal. */
function stateOf(b: IPitchBooking): { word: string; tone: string } {
  if (b.paymentStatus === 'paid') return { word: 'Paid', tone: 'bg-volt-300 text-ink' };
  if (b.status === 'confirmed') return { word: 'To pay', tone: 'bg-kit-500 text-ink' };
  if (b.status === 'pending') return { word: 'Waiting', tone: 'bg-chalk text-gray-700' };
  if (b.status === 'rejected') return { word: 'Turned down', tone: 'bg-gray-100 text-gray-600' };
  if (b.status === 'expired') return { word: 'No reply', tone: 'bg-gray-100 text-gray-600' };
  return { word: 'Cancelled', tone: 'bg-gray-100 text-gray-600' };
}

const day = (ymd: string) => new Date(`${ymd}T12:00:00`);

/** Your pitch bookings: what's coming up (and what to do about it), then the rest. */
export default function MyBookingsPage() {
  const toast = useToast();
  const [bookings, setBookings] = useState<IPitchBooking[] | null>(null);
  const [cancelling, setCancelling] = useState<IPitchBooking | null>(null);

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .catch(() => {
        setBookings([]);
        toast.error('Couldn’t load your bookings. Try again in a moment.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel(b: IPitchBooking) {
    try {
      const updated = await cancelMyBooking(b.id);
      setBookings((list) => list?.map((x) => (x.id === b.id ? { ...x, ...updated, pitch: x.pitch } : x)) ?? null);
      toast.success('Booking cancelled');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    }
  }

  const today = localYmd(new Date());
  const live = (b: IPitchBooking) => b.date >= today && (b.status === 'pending' || b.status === 'confirmed');
  const upcoming = (bookings ?? []).filter(live).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const earlier = (bookings ?? []).filter((b) => !live(b));

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader eyebrow="Pitches" title="Your bookings" />
      {!bookings ? (
        <div className="flex justify-center py-20"><BallLoader /></div>
      ) : bookings.length === 0 ? (
        <EmptyState icon="calendar" title="No pitch booked yet" description="Open a pitch owner’s link to pick a day and times." actionLabel="Book a pitch" actionHref="/book-pitch" />
      ) : (
        <>
          <Group title="Coming up" empty="Nothing coming up.">
            {upcoming.map((b) => <BookingCard key={b.id} b={b} onCancel={() => setCancelling(b)} />)}
          </Group>
          {earlier.length > 0 && (
            <Group title="Earlier">
              {earlier.map((b) => <BookingCard key={b.id} b={b} />)}
            </Group>
          )}
          <Link href="/book-pitch" className="press mt-6 flex items-center justify-center min-h-12 text-[15px] font-bold text-pitch-700">
            Book another time
          </Link>
        </>
      )}
      <ConfirmSheet
        open={!!cancelling}
        title="Cancel this booking?"
        message="The time goes back to the owner for others to book."
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
        danger
        onConfirm={() => { const b = cancelling!; setCancelling(null); cancel(b); }}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}

function Group({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode[] }) {
  return (
    <section className="mt-5 first:mt-0">
      <h2 className="mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">{title}</h2>
      {children.length ? <ul className="space-y-2">{children}</ul> : <p className="px-1 text-[13px] text-gray-500">{empty}</p>}
    </section>
  );
}

function BookingCard({ b, onCancel }: { b: IPitchBooking; onCancel?: () => void }) {
  const toast = useToast();
  const s = stateOf(b);
  const d = day(b.date);
  const toPay = b.status === 'confirmed' && b.paymentStatus !== 'paid';
  const canCancel = onCancel && (b.status === 'pending' || toPay);
  return (
    <li className="rounded-3xl bg-white border border-gray-100 shadow-card px-4 py-3.5">
      <div className="flex items-center gap-3">
        {/* The day, like the picker's day tiles */}
        <span className="w-12 h-14 shrink-0 rounded-2xl bg-chalk flex flex-col items-center justify-center" aria-hidden>
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
          <span className="font-display text-[20px] font-extrabold leading-none text-ink tabular-nums">{d.getDate()}</span>
          <span className="text-[10px] text-gray-500">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink truncate">{b.pitch?.name ?? 'Pitch'}</span>
          <span className="block text-[13px] text-gray-600 truncate tabular-nums">
            <span className="sr-only">{d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, </span>
            {prettyTime(b.startTime)} – {prettyTime(b.endTime)} · {naira(b.price)}
          </span>
        </span>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-extrabold whitespace-nowrap ${s.tone}`}>{s.word}</span>
      </div>

      {b.status === 'rejected' && b.rejectionReason && <p className="mt-2 text-[12px] text-gray-600 truncate">The owner said: “{b.rejectionReason}”</p>}
      {b.status === 'pending' && <p className="mt-2 text-[12px] text-gray-500">The owner has 24 hours to answer.</p>}

      {toPay && b.pitch?.accountNumber && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-chalk px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] text-gray-600">Pay {naira(b.price)} to</span>
            <span className="block font-display text-[17px] font-extrabold text-ink tracking-wide">{b.pitch.accountNumber}</span>
            <span className="block text-[11px] text-gray-500 truncate">{b.pitch.accountName} · {b.pitch.virtualBankName}</span>
          </span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(b.pitch!.accountNumber!).then(() => toast.success('Account number copied'), () => {})}
            className="press shrink-0 min-h-11 px-3 rounded-xl bg-white border border-gray-200 text-[13px] font-bold text-ink"
          >
            Copy
          </button>
        </div>
      )}

      {(canCancel || (b.pitch?.mapUrl && onCancel)) && (
        <div className="mt-2 flex items-center justify-between">
          {b.pitch?.mapUrl ? (
            <a href={b.pitch.mapUrl} target="_blank" rel="noopener noreferrer" className="press min-h-11 inline-flex items-center text-[13px] font-bold text-pitch-700">
              Directions
            </a>
          ) : <span />}
          {canCancel && (
            <button type="button" onClick={onCancel} className="press min-h-11 px-1 text-[13px] font-bold text-gray-600 hover:text-ink">
              Cancel booking
            </button>
          )}
        </div>
      )}
    </li>
  );
}
