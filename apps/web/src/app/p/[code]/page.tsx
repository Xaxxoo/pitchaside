'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { getPublicAvailability } from '@/lib/pitch';
import type { IPublicPitch, IPitchDayAvailability } from '@pitchaside/shared';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
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
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0],
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-ink text-white">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Logo />
          <h1 className="text-2xl font-extrabold mt-4">{pitch.name}</h1>
          {pitch.address && <p className="text-sm text-white/70 mt-1">{pitch.address}</p>}
          <p className="text-sm text-white/70 mt-0.5">
            {[pitch.city, pitch.state].filter(Boolean).join(', ')}
          </p>
          {pitch.description && <p className="text-sm text-white/60 mt-2">{pitch.description}</p>}
          <p className="mt-3 text-volt-300 font-bold text-sm">
            {pitch.currency} {Number(pitch.defaultPrice).toLocaleString()} / {pitch.slotDurationMinutes} min
          </p>
        </div>
      </div>

      {/* Week nav */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
            disabled={weekOffset === 0}
            className="text-sm font-bold text-pitch-600 disabled:text-gray-300"
          >
            &larr; Previous
          </button>
          <span className="text-sm font-bold text-ink">{from} &mdash; {to}</span>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className="text-sm font-bold text-pitch-600"
          >
            Next &rarr;
          </button>
        </div>

        {/* Day columns */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {days.map((day) => (
            <div key={day.date} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-bold text-ink">{formatDate(day.date)}</p>
              </div>
              <div className="p-2 space-y-1">
                {day.slots.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 text-center">No slots</p>
                ) : (
                  day.slots.map((slot) => (
                    <div
                      key={slot.startTime}
                      className={`px-2 py-1.5 rounded-lg text-xs ${
                        slot.available
                          ? 'bg-green-50 text-green-700 border border-green-100'
                          : 'bg-gray-50 text-gray-400 border border-gray-100 line-through'
                      }`}
                    >
                      <span className="font-semibold">{slot.startTime}-{slot.endTime}</span>
                      <span className="ml-1">{pitch.currency} {slot.price.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Book CTA */}
        <div className="mt-8 text-center">
          <Link
            href={`/book-pitch/${code}`}
            className="inline-block px-6 py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Book a slot
          </Link>
          <p className="text-xs text-gray-400 mt-2">You&apos;ll need to sign in to complete your booking.</p>
        </div>
      </div>
    </div>
  );
}
