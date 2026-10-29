'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { getPublicAvailability, createBooking } from '@/lib/pitch';
import type { IPublicPitch, IPitchDayAvailability, IPitchSlot } from '@pitchaside/shared';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
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
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
    };
  }, [weekOffset]);

  useEffect(() => {
    setLoading(true);
    getPublicAvailability(code, from, to)
      .then((res) => { setPitch(res.pitch); setDays(res.days); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [code, from, to]);

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
      <div className="max-w-sm mx-auto text-center pt-20">
        <h1 className="text-2xl font-extrabold text-ink mb-2">Booking requested</h1>
        <p className="text-sm text-gray-500">
          Your booking at <strong>{pitch.name}</strong> on {selectedSlot?.date} {selectedSlot?.slot.startTime}-{selectedSlot?.slot.endTime} is pending confirmation from the pitch owner.
        </p>
        {pitch.accountNumber && (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4 text-left">
            <p className="text-xs font-bold text-gray-700 mb-2">Payment details</p>
            <p className="text-sm text-ink">
              Pay <strong>{pitch.currency} {selectedSlot?.slot.price.toLocaleString()}</strong> to:
            </p>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-mono font-bold text-ink">{pitch.accountNumber}</p>
              <p className="text-xs text-gray-500">{pitch.accountName}</p>
              <p className="text-xs text-gray-500">{pitch.virtualBankName}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-ink">{pitch.name}</h1>
      <p className="text-sm text-gray-500 mt-0.5">
        {[pitch.city, pitch.state].filter(Boolean).join(', ')}
        {' \u00b7 '}
        {pitch.currency} {Number(pitch.defaultPrice).toLocaleString()} / slot
      </p>

      {/* Week nav */}
      <div className="flex items-center justify-between my-4">
        <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0} className="text-sm font-bold text-pitch-600 disabled:text-gray-300">
          &larr; Prev
        </button>
        <span className="text-sm font-bold text-ink">{from} &mdash; {to}</span>
        <button onClick={() => setWeekOffset(weekOffset + 1)} className="text-sm font-bold text-pitch-600">
          Next &rarr;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Slots */}
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.date}>
              <p className="text-xs font-bold text-ink mb-1">{formatDate(day.date)}</p>
              <div className="flex flex-wrap gap-1">
                {day.slots.filter((s) => s.available).length === 0 ? (
                  <span className="text-xs text-gray-400">No available slots</span>
                ) : (
                  day.slots.filter((s) => s.available).map((slot) => {
                    const isSelected = selectedSlot?.date === day.date && selectedSlot.slot.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        onClick={() => setSelectedSlot({ date: day.date, slot })}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          isSelected
                            ? 'bg-ink text-volt-300 border-ink'
                            : 'bg-white text-ink border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {slot.startTime}-{slot.endTime}
                        <span className="ml-1 font-normal">{pitch.currency} {slot.price.toLocaleString()}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Booking form */}
        {selectedSlot && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-bold text-ink mb-3">Book this slot</h2>
            <p className="text-xs text-gray-500 mb-4">
              {selectedSlot.date} \u00b7 {selectedSlot.slot.startTime} - {selectedSlot.slot.endTime} \u00b7 {pitch.currency} {selectedSlot.slot.price.toLocaleString()}
            </p>
            <form onSubmit={handleBook} className="space-y-3">
              <input required placeholder="Your name *" value={bookerName} onChange={(e) => setBookerName(e.target.value)} className={inputClass} />
              <input placeholder="Phone (optional)" value={bookerPhone} onChange={(e) => setBookerPhone(e.target.value)} className={inputClass} />
              <textarea placeholder="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              <button type="submit" disabled={submitting} className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
                {submitting ? 'Booking...' : 'Request booking'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
