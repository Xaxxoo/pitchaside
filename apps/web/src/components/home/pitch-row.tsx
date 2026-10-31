'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyPitches, getPitchDirectory } from '@/lib/pitch';
import { PITCH_ICONS } from '@/components/pitch/pitch-facts';

/**
 * Pitches, from home, as one quiet row: an owner's own pitches if they list any, else the pitches
 * ready to book on PitchAside (only once there are some, so it never leads to an empty list).
 */
export function PitchHomeRow({ owner = false, className = '' }: { owner?: boolean; className?: string }) {
  const [row, setRow] = useState<{ href: string; title: string; line: string } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const mine = owner ? await getMyPitches().catch(() => []) : [];
      if (mine.length) {
        if (live) setRow({ href: '/my-pitches', title: 'Your pitches', line: mine.length === 1 ? `${mine[0].name}: bookings and requests` : `${mine.length} pitches: bookings and requests` });
        return;
      }
      const ready = await getPitchDirectory().catch(() => []);
      if (live && ready.length) setRow({ href: '/pitches', title: 'Find a pitch', line: `${ready.length} ready to book on PitchAside` });
    })();
    return () => {
      live = false;
    };
  }, [owner]);
  if (!row) return null;
  return (
    <Link href={row.href} className={`press flex items-center gap-3 rounded-3xl bg-white border border-gray-100 shadow-card px-4 min-h-16 py-3 animate-pop-in ${className}`}>
      <span className="w-10 h-10 shrink-0 rounded-full bg-chalk flex items-center justify-center text-pitch-700" aria-hidden>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={PITCH_ICONS.pitch} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{row.title}</span>
        <span className="block text-[12px] text-gray-500 truncate">{row.line}</span>
      </span>
      <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}
