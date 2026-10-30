'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { getPublicAvailability, createBooking, localYmd } from '@/lib/pitch';
import type { IPublicPitch, IPitchDayAvailability, IPitchSlot } from '@pitchaside/shared';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface SelectedSlot { date: string; slot: IPitchSlot }

function slotKey(date: string, slot: IPitchSlot) {
  return `${date}|${slot.startTime}`;
}

function friendlyDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

function weekLabel(from: string, to: string) {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  const sameMonth = a.getMonth() === b.getMonth();
  if (sameMonth) {
    return `${a.getDate()} – ${b.getDate()} ${MONTH_LABELS[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTH_LABELS[a.getMonth()]} – ${b.getDate()} ${MONTH_LABELS[b.getMonth()]}`;
}

export default function PublicPitchPage() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [pitch, setPitch] = useState<IPublicPitch | null>(null);
  const [days, setDays] = useState<IPitchDayAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

  // Booking state — multi-select
  const bookingRef = useRef<HTMLDivElement>(null);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [bookerName, setBookerName] = useState('');
  const [bookerPhone, setBookerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<SelectedSlot[]>([]);

  // Pre-fill name/phone once auth loads
  useEffect(() => {
    if (user && !bookerName) {
      setBookerName(`${user.firstName} ${user.lastName}`);
      setBookerPhone(user.phone || '');
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + weekOffset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      from: localYmd(start),
      to: localYmd(end),
    };
  }, [weekOffset]);

  useEffect(() => {
    setLoading(true);
    getPublicAvailability(code, from, to)
      .then((res) => {
        setPitch(res.pitch);
        setDays(res.days);
      })
      .catch((err) => setError(err.message || 'Pitch not found'))
      .finally(() => setLoading(false));
  }, [code, from, to]);

  // Clear selection when week changes
  useEffect(() => { setSelectedSlots([]); }, [weekOffset]);

  const totalPrice = selectedSlots.reduce((sum, s) => sum + s.slot.price, 0);

  function isSelected(date: string, slot: IPitchSlot) {
    return selectedSlots.some((s) => slotKey(s.date, s.slot) === slotKey(date, slot));
  }

  function handleToggleSlot(date: string, slot: IPitchSlot) {
    if (!slot.available) return;
    const key = slotKey(date, slot);
    const already = selectedSlots.some((s) => slotKey(s.date, s.slot) === key);
    if (already) {
      setSelectedSlots(selectedSlots.filter((s) => slotKey(s.date, s.slot) !== key));
    } else {
      setSelectedSlots([...selectedSlots, { date, slot }]);
      setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  }

  function clearSelection() {
    setSelectedSlots([]);
  }

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (selectedSlots.length === 0 || !pitch) return;
    setSubmitting(true);
    const succeeded: SelectedSlot[] = [];
    const failed: string[] = [];
    for (const sel of selectedSlots) {
      try {
        await createBooking({
          pitchId: pitch.id,
          date: sel.date,
          startTime: sel.slot.startTime,
          endTime: sel.slot.endTime,
          bookerName,
          bookerPhone: bookerPhone || undefined,
          notes: notes || undefined,
        });
        succeeded.push(sel);
      } catch (err: any) {
        failed.push(`${friendlyDate(sel.date)} ${sel.slot.startTime}: ${err.message || 'failed'}`);
      }
    }
    setSubmitting(false);
    if (succeeded.length > 0) {
      setBookedSlots(succeeded);
      toast.success(`${succeeded.length} booking${succeeded.length > 1 ? 's' : ''} requested`);
    }
    if (failed.length > 0) {
      toast.error(failed.join('\n'));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error || !pitch) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error || 'Pitch not found'}</p>
          <Link href="/" className="text-pitch-600 font-bold text-sm">Go home</Link>
        </div>
      </div>
    );
  }

  // Booking confirmation
  if (bookedSlots.length > 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-ink text-white">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <Logo />
          </div>
        </div>
        <div className="max-w-md mx-auto text-center pt-12 px-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </div>
          <h1 className="text-2xl font-extrabold text-ink mb-2">
            {bookedSlots.length === 1 ? 'Booking requested' : `${bookedSlots.length} bookings requested`}
          </h1>
          <p className="text-sm text-gray-400 mt-1">The pitch owner will confirm your booking{bookedSlots.length > 1 ? 's' : ''}.</p>

          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 text-left space-y-2">
            {bookedSlots.map((s) => (
              <div key={slotKey(s.date, s.slot)} className="flex items-center justify-between text-sm">
                <span className="text-ink font-medium">{friendlyDate(s.date)}, {s.slot.startTime}–{s.slot.endTime}</span>
                <span className="text-gray-500">{pitch.currency} {s.slot.price.toLocaleString()}</span>
              </div>
            ))}
            {bookedSlots.length > 1 && (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100 font-bold">
                <span className="text-ink">Total</span>
                <span className="text-ink">{pitch.currency} {bookedSlots.reduce((sum, s) => sum + s.slot.price, 0).toLocaleString()}</span>
              </div>
            )}
          </div>

          {pitch.accountNumber && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 text-left">
              <p className="text-xs font-bold text-gray-700 mb-2">Payment details</p>
              <p className="text-sm text-ink">
                Pay <strong>{pitch.currency} {bookedSlots.reduce((sum, s) => sum + s.slot.price, 0).toLocaleString()}</strong> to:
              </p>
              <div className="mt-2 space-y-0.5">
                <p className="text-sm font-mono font-bold text-ink">{pitch.accountNumber}</p>
                <p className="text-xs text-gray-500">{pitch.accountName}</p>
                <p className="text-xs text-gray-500">{pitch.virtualBankName}</p>
              </div>
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={() => { setBookedSlots([]); setSelectedSlots([]); }}
              className="text-sm font-bold text-pitch-600 hover:text-pitch-700"
            >
              Book more slots
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-ink text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Logo />
          <h1 className="text-2xl font-extrabold mt-4">{pitch.name}</h1>
          {pitch.address && <p className="text-sm text-white/70 mt-1">{pitch.address}</p>}
          {(pitch.city || pitch.state) && (
            <p className="text-sm text-white/70 mt-0.5">
              {[pitch.city, pitch.state].filter(Boolean).join(', ')}
            </p>
          )}
          {pitch.description && <p className="text-sm text-white/60 mt-2">{pitch.description}</p>}
          <div className="flex items-center gap-3 mt-3">
            <span className="text-volt-300 font-bold text-sm">
              {pitch.currency} {Number(pitch.defaultPrice).toLocaleString()} / {pitch.slotDurationMinutes} min
            </span>
          </div>
          {pitch.accountNumber && (
            <div className="mt-4 bg-white/10 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-white/70 mb-1">Pay via bank transfer</p>
              <p className="text-sm font-mono text-white">{pitch.accountNumber}</p>
              <p className="text-xs text-white/70">{pitch.accountName} &middot; {pitch.virtualBankName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Availability */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm font-bold text-ink mb-4">
          Tap slots to select them
        </p>

        {/* Week nav */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
            disabled={weekOffset === 0}
            className="flex items-center gap-1 text-sm font-bold text-pitch-600 disabled:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Prev
          </button>
          <span className="text-sm font-bold text-ink">{weekLabel(from, to)}</span>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className="flex items-center gap-1 text-sm font-bold text-pitch-600 transition-colors"
          >
            Next
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>

        {/* Day list with clickable slots */}
        <div className="space-y-3">
          {days.map((day) => {
            const available = day.slots.filter((s) => s.available);
            const unavailable = day.slots.filter((s) => !s.available);
            return (
              <div key={day.date} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-sm font-bold text-ink">{friendlyDate(day.date)}</p>
                  {day.slots.length > 0 && (
                    <p className="text-xs text-gray-400">
                      {available.length} available{unavailable.length > 0 ? `, ${unavailable.length} booked` : ''}
                    </p>
                  )}
                </div>
                <div className="px-4 py-3">
                  {day.slots.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-1">Closed</p>
                  ) : available.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-1">Fully booked</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {available.map((slot) => {
                        const selected = isSelected(day.date, slot);
                        return (
                          <button
                            key={slot.startTime}
                            onClick={() => handleToggleSlot(day.date, slot)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                              selected
                                ? 'bg-ink text-volt-300 border-ink shadow-sm'
                                : 'bg-green-50 text-green-700 border-green-100 hover:border-green-300 hover:shadow-sm'
                            }`}
                          >
                            {selected && (
                              <svg className="w-3 h-3 text-volt-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            )}
                            {slot.startTime}–{slot.endTime}
                            <span className={`font-normal ${selected ? 'text-volt-300/70' : 'text-green-600/60'}`}>
                              {pitch.currency} {slot.price.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Booking form / sign-in prompt — appears when slots are selected */}
        {selectedSlots.length > 0 && (
          <div ref={bookingRef} className="mt-6 bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">
                  {selectedSlots.length === 1 ? 'Book this slot' : `Book ${selectedSlots.length} slots`}
                </h2>
              </div>
              <button
                onClick={clearSelection}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear all
              </button>
            </div>

            {/* Selected slots summary */}
            <div className="space-y-1 mb-4">
              {selectedSlots.map((s) => (
                <div key={slotKey(s.date, s.slot)} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{friendlyDate(s.date)}, {s.slot.startTime}–{s.slot.endTime}</span>
                  <span className="text-gray-500">{pitch.currency} {s.slot.price.toLocaleString()}</span>
                </div>
              ))}
              {selectedSlots.length > 1 && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100 font-bold">
                  <span className="text-ink">Total</span>
                  <span className="text-ink">{pitch.currency} {totalPrice.toLocaleString()}</span>
                </div>
              )}
            </div>

            {!authLoading && user ? (
              <form onSubmit={handleBook} className="space-y-3">
                <div>
                  <label htmlFor="bookerName" className="block text-xs font-bold text-gray-700 mb-1">Your name *</label>
                  <input id="bookerName" required value={bookerName} onChange={(e) => setBookerName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="bookerPhone" className="block text-xs font-bold text-gray-700 mb-1">Phone (optional)</label>
                  <input id="bookerPhone" value={bookerPhone} onChange={(e) => setBookerPhone(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="notes" className="block text-xs font-bold text-gray-700 mb-1">Notes (optional)</label>
                  <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? 'Requesting...'
                    : selectedSlots.length === 1
                      ? 'Request booking'
                      : `Request ${selectedSlots.length} bookings \u00b7 ${pitch.currency} ${totalPrice.toLocaleString()}`}
                </button>
              </form>
            ) : !authLoading ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-3">Sign in to book {selectedSlots.length === 1 ? 'this slot' : 'these slots'}</p>
                <Link
                  href={`/signin?redirect=${encodeURIComponent(`/p/${code}`)}`}
                  className="inline-block px-6 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
                >
                  Sign in
                </Link>
                <p className="text-xs text-gray-400 mt-2">
                  Don&apos;t have an account?{' '}
                  <Link href={`/signup?redirect=${encodeURIComponent(`/p/${code}`)}`} className="text-pitch-600 font-semibold">
                    Sign up
                  </Link>
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* No slots hint */}
        {!days.some((d) => d.slots.some((s) => s.available)) && days.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">No available slots this week</p>
            <button
              onClick={() => setWeekOffset(weekOffset + 1)}
              className="mt-2 text-sm font-bold text-pitch-600 hover:text-pitch-700"
            >
              Check next week
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
