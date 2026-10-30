'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { getPublicAvailability, localYmd } from '@/lib/pitch';
import type { IPublicPitch, IPitchDayAvailability } from '@pitchaside/shared';

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

export default function PublicPitchPage() {
  const { code } = useParams<{ code: string }>();
  const [pitch, setPitch] = useState<IPublicPitch | null>(null);
  const [days, setDays] = useState<IPitchDayAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

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

  const hasAvailableSlots = days.some((d) => d.slots.some((s) => s.available));

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

        {/* Day list */}
        <div className="space-y-3">
          {days.map((day) => {
            const available = day.slots.filter((s) => s.available);
            const booked = day.slots.filter((s) => !s.available);
            return (
              <div key={day.date} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <p className="text-sm font-bold text-ink">{friendlyDate(day.date)}</p>
                  {day.slots.length > 0 && (
                    <p className="text-xs text-gray-400">
                      {available.length} available{booked.length > 0 ? `, ${booked.length} booked` : ''}
                    </p>
                  )}
                </div>
                <div className="px-4 py-3">
                  {day.slots.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-1">Closed</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {day.slots.map((slot) => (
                        <span
                          key={slot.startTime}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                            slot.available
                              ? 'bg-green-50 text-green-700 border border-green-100'
                              : 'bg-gray-50 text-gray-400 border border-gray-100 line-through'
                          }`}
                        >
                          {slot.startTime}–{slot.endTime}
                          <span className="font-normal text-[11px] opacity-70">{pitch.currency} {slot.price.toLocaleString()}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Book CTA */}
        {hasAvailableSlots && (
          <div className="mt-8 text-center">
            <Link
              href={`/book-pitch/${code}`}
              className="inline-block px-8 py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
            >
              Book a slot
            </Link>
            <p className="text-xs text-gray-400 mt-2">Sign in to complete your booking</p>
          </div>
        )}

        {!hasAvailableSlots && days.length > 0 && (
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
