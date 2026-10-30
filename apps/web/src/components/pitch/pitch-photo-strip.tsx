'use client';

import { useState } from 'react';
import { pitchPhotoUrl } from '@/lib/pitch';

/** A pitch's photos, swiped sideways, with "2 / 4" so it's clear there are more. */
export function PitchPhotoStrip({ keys, name }: { keys: string[]; name: string }) {
  const [at, setAt] = useState(0);
  if (!keys.length) return null;
  return (
    <div className="relative">
      <ul
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`Photos of ${name}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {keys.map((k, i) => (
          <li key={k} className="snap-start shrink-0 w-full aspect-[4/3] bg-pitch-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pitchPhotoUrl(k)} alt={`${name}, photo ${i + 1} of ${keys.length}`} loading={i ? 'lazy' : 'eager'} className="w-full h-full object-cover" />
          </li>
        ))}
      </ul>
      {keys.length > 1 && (
        <span className="absolute right-3 bottom-3 px-2 py-0.5 rounded-full bg-ink/75 text-white text-[12px] font-bold tabular-nums" aria-hidden>
          {Math.min(at, keys.length - 1) + 1} / {keys.length}
        </span>
      )}
    </div>
  );
}
