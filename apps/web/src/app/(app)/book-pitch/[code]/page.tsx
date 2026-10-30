'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { getPublicAvailability, createBooking, localYmd } from '@/lib/pitch';
import type { IPublicPitch, IPitchDayAvailability, IPitchSlot } from '@pitchaside/shared';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

export default function BookPitchPage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [pitch, setPitch] = useState<IPublicPitch | null>(null);
  const [days, setDays] = useState<IPitchDayAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  // Booking form
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; slot: IPitchSlot } | null>(null);
  const [bookerName, setBookerName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [bookerPhone, setBookerPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);

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
      .then((res) => { setPitch(res.pitch); setDays(res.days); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [code, from, to]);

  // Clear selected slot when week changes
  useEffect(() => { setSelectedSlot(null); }, [weekOffset]);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !pitch) return;
    setSubmitting(true);
    try {
      await createBooking({
        pitchId: pitch.id,
        date: selectedSlot.date,
        startTime: selectedSlot.slot.startTime,
        endTime: selectedSlot.slot.endTime,
        bookerName,
        bookerPhone: bookerPhone || undefined,
        notes: notes || undefined,
      });
      setBooked(true);
      toast.success('Booking requested');
    } catch (err: any) {
      toast.error(err.message || 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;
  if (!pitch) return <div className="text-center py-20 text-gray-500">Pitch not found</div>;

  if (booked) {
    return (
      <div className="max-w-md mx-auto text-center pt-12 px-4">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <h1 className="text-2xl font-extrabold text-ink mb-2">Booking requested</h1>
        <p className="text-sm text-gray-500">
          <strong>{pitch.name}</strong> on {friendlyDate(selectedSlot!.date)}, {selectedSlot!.slot.startTime}–{selectedSlot!.slot.endTime}
        </p>
        <p className="text-sm text-gray-400 mt-1">The pitch owner will confirm your booking.</p>

        {pitch.accountNumber && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4 text-left">
            <p className="text-xs font-bold text-gray-700 mb-2">Payment details</p>
            <p className="text-sm text-ink">
              Pay <strong>{pitch.currency} {selectedSlot!.slot.price.toLocaleString()}</strong> to:
            </p>
            <div className="mt-2 space-y-0.5">
              <p className="text-sm font-mono font-bold text-ink">{pitch.accountNumber}</p>
              <p className="text-xs text-gray-500">{pitch.accountName}</p>
              <p className="text-xs text-gray-500">{pitch.virtualBankName}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link href="/book-pitch/mine" className="text-sm font-bold text-pitch-600 hover:text-pitch-700">
            View my bookings
          </Link>
          <Link href={`/book-pitch/${code}`} onClick={() => { setBooked(false); setSelectedSlot(null); }} className="text-sm text-gray-500 hover:text-gray-700">
            Book another slot
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="max-w-2xl mx-auto px-4">
      {/* Pitch header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-ink">{pitch.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {[pitch.city, pitch.state].filter(Boolean).join(', ')}
          {(pitch.city || pitch.state) && ' \u00b7 '}
          {pitch.currency} {Number(pitch.defaultPrice).toLocaleString()} / slot
        </p>
      </div>

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

      {/* Day slots + Booking form in responsive layout */}
      <div className="space-y-3">
        {days.map((day) => {
          const availableSlots = day.slots.filter((s) => s.available);
          return (
            <div key={day.date} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-bold text-ink">{friendlyDate(day.date)}</p>
                {availableSlots.length > 0 && (
                  <p className="text-xs text-gray-400">{availableSlots.length} available</p>
                )}
              </div>
              <div className="px-4 py-3">
                {availableSlots.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-1">No available slots</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot?.date === day.date && selectedSlot.slot.startTime === slot.startTime;
                      return (
                        <button
                          key={slot.startTime}
                          onClick={() => setSelectedSlot({ date: day.date, slot })}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                            isSelected
                              ? 'bg-ink text-volt-300 border-ink shadow-sm'
                              : 'bg-white text-ink border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          {slot.startTime}–{slot.endTime}
                          <span className={`font-normal ${isSelected ? 'text-volt-300/70' : 'text-gray-400'}`}>
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

      {/* Booking form — slides in when a slot is selected */}
      {selectedSlot && (
        <div className="mt-6 bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-ink">Confirm your booking</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {friendlyDate(selectedSlot.date)} &middot; {selectedSlot.slot.startTime}–{selectedSlot.slot.endTime} &middot; {pitch.currency} {selectedSlot.slot.price.toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setSelectedSlot(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Deselect slot"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
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
              {submitting ? 'Requesting...' : 'Request booking'}
            </button>
          </form>
        </div>
      )}

      {/* Quick link to my bookings */}
      <div className="mt-6 text-center">
        <Link href="/book-pitch/mine" className="text-xs text-gray-400 hover:text-gray-600">
          View my bookings
        </Link>
      </div>
    </div>
  );
}
