'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyPitches } from '@/lib/pitch';
import type { IPitch } from '@pitchaside/shared';

export default function PitchListPage() {
  const [pitches, setPitches] = useState<IPitch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyPitches()
      .then(setPitches)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-ink">My Pitches</h1>
        <Link
          href="/pitch-owner/pitches/new"
          className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
        >
          Add pitch
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : pitches.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">No pitches yet. Add your first pitch to get started.</p>
          <Link
            href="/pitch-owner/pitches/new"
            className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Add pitch
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {pitches.map((pitch) => (
            <Link
              key={pitch.id}
              href={`/pitch-owner/pitches/${pitch.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-4 hover:border-gray-200 transition-colors"
            >
              <div>
                <h2 className="font-bold text-ink">{pitch.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[pitch.city, pitch.state].filter(Boolean).join(', ') || 'No location set'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-ink">
                  {pitch.currency} {Number(pitch.defaultPrice).toLocaleString()}
                </p>
                <span className={`text-xs font-bold ${pitch.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                  {pitch.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
