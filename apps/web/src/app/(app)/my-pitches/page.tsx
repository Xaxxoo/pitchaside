'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyPitches } from '@/lib/pitch';
import type { IPitch } from '@pitchaside/shared';
import { PageHeader } from '@/components/brand';
import { btnPrimary } from '@/components/buttons';
import { BallLoader } from '@/components/skeleton';
import { EmptyState } from '@/components/empty-state';
import { naira } from '@/components/pitch/pitch-facts';

/** The pitches you run: one card each (tap for its bookings), and a way to add another. */
export default function PitchListPage() {
  const [pitches, setPitches] = useState<IPitch[] | null>(null);

  useEffect(() => {
    getMyPitches().then(setPitches).catch(() => setPitches([]));
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader eyebrow="Pitches" title="Your pitches" subtitle={pitches?.length ? 'Tap one for its bookings and details.' : undefined} />
      {!pitches ? (
        <div className="flex justify-center py-20"><BallLoader /></div>
      ) : pitches.length === 0 ? (
        <EmptyState icon="calendar" title="No pitch yet" description="Own or run a pitch? Add it so groups can book it from your link." actionLabel="Add a pitch" actionHref="/my-pitches/new" />
      ) : (
        <>
          <ul className="space-y-2">
            {pitches.map((p) => {
              const hidden = p.status !== 'active';
              return (
                <li key={p.id}>
                  <Link href={`/my-pitches/${p.id}`} className="press flex items-center gap-3 rounded-3xl bg-ink turf-stripes text-white shadow-card px-5 py-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[18px] font-extrabold leading-tight truncate">{p.name}</span>
                      <span className="block text-[12px] text-white/70 truncate">
                        {[p.city, p.state].filter(Boolean).join(', ') || 'Add where it is'} · {naira(p.defaultPrice)} a game
                      </span>
                    </span>
                    {hidden && <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/15 text-[11px] font-extrabold">Hidden</span>}
                    <svg className="w-4 h-4 shrink-0 text-white/70" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/my-pitches/new" className={`mt-4 w-full ${btnPrimary}`}>Add another pitch</Link>
        </>
      )}
    </div>
  );
}
