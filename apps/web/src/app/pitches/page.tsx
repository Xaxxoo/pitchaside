'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand';
import { BallLoader } from '@/components/skeleton';
import { EmptyState } from '@/components/empty-state';
import { naira, pitchFacts } from '@/components/pitch/pitch-facts';
import { getPitchDirectory, pitchPhotoUrl, type DirectoryPitch } from '@/lib/pitch';

/**
 * Pitches on PitchAside, for anyone: the ones ready to book (live, with hours and their own
 * account), by state. Tapping one opens its page to pick a time; a pitch code still works too.
 */
export default function PitchDirectoryPage() {
  const router = useRouter();
  const [pitches, setPitches] = useState<DirectoryPitch[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<string>('all');
  const [code, setCode] = useState('');

  const load = () => {
    setFailed(false);
    getPitchDirectory().then(setPitches).catch(() => setFailed(true));
  };
  useEffect(load, []);

  // The states that have pitches, most first: the only filter there's any point offering
  const states = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of pitches ?? []) if (p.state) count.set(p.state, (count.get(p.state) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
  }, [pitches]);
  const shown = (pitches ?? []).filter((p) => state === 'all' || p.state === state);

  function openCode(e: React.FormEvent) {
    e.preventDefault();
    // A whole link or just the code
    const c = code.trim().split('/').filter(Boolean).pop();
    if (c) router.push(`/p/${encodeURIComponent(c)}`);
  }

  return (
    <div className="min-h-screen bg-chalk">
      <div className="bg-ink">
        <div className="max-w-2xl mx-auto px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
          <Logo tone="light" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-10">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-pitch-700">Pitches</p>
        <h1 className="mt-1 font-display text-[28px] leading-tight font-extrabold text-ink">Find a pitch</h1>
        <p className="mt-1 text-sm text-gray-600">Pick one, choose a time, send a request.</p>

        {states.length > 1 && (
          <div role="group" aria-label="Where" className="-mx-4 px-4 mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {['all', ...states].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={state === s}
                onClick={() => setState(s)}
                className={`press shrink-0 min-h-11 px-4 rounded-full border-[1.5px] text-[14px] font-bold whitespace-nowrap ${
                  state === s ? 'bg-pitch-700 border-pitch-700 text-white' : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                {s === 'all' ? 'Everywhere' : s}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          {failed ? (
            <div className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6" role="alert">
              <p className="text-[15px] font-bold text-ink">Pitches didn’t load</p>
              <p className="mt-0.5 text-sm text-gray-600">Check your connection and try again.</p>
              <button type="button" onClick={load} className="press mt-3 min-h-11 px-4 rounded-xl bg-ink text-volt-300 text-sm font-bold">Try again</button>
            </div>
          ) : !pitches ? (
            <div className="flex justify-center py-16"><BallLoader /></div>
          ) : shown.length === 0 ? (
            <EmptyState icon="calendar" title="No pitches listed yet" description="Pitches show here once their owners open them for booking." actionLabel="List your pitch" actionHref="/signup?as=pitch" />
          ) : (
            <ul className="space-y-3">
              {shown.map((p) => (
                <li key={p.code}>
                  <PitchTile pitch={p} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* A pitch shared by its owner still opens straight from its code */}
        <form onSubmit={openCode} className="mt-6 rounded-3xl bg-white border border-gray-100 p-4">
          <label htmlFor="pitch-code" className="block text-[14px] font-bold text-ink">Have a pitch link or code?</label>
          <div className="mt-2 flex gap-2">
            <input
              id="pitch-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 72bba483"
              autoCapitalize="none"
              autoComplete="off"
              className="min-w-0 flex-1 min-h-12 px-3.5 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
            <button type="submit" disabled={!code.trim()} className="press shrink-0 min-h-12 px-5 rounded-2xl bg-white border border-gray-300 text-sm font-bold text-ink disabled:opacity-50">Open</button>
          </div>
        </form>
        <p className="mt-4 text-center text-[13px] text-gray-600">
          Own a pitch?{' '}
          <Link href="/signup?as=pitch" className="font-semibold text-pitch-700">List it</Link>
        </p>
      </div>
    </div>
  );
}

/** One pitch: its photo (or the turf), name, where, what it is, and the least a game costs. */
function PitchTile({ pitch: p }: { pitch: DirectoryPitch }) {
  const where = [p.city, p.state].filter(Boolean).join(', ');
  const facts = pitchFacts(p, false).join(' · ');
  return (
    <Link href={`/p/${p.code}`} className="press block rounded-3xl bg-white border border-gray-100 shadow-card overflow-hidden">
      <div className="relative h-32 bg-ink turf-stripes">
        {p.photoKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pitchPhotoUrl(p.photoKey)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        )}
        <span className="absolute left-3 bottom-3 rounded-full bg-ink/80 px-3 py-1 text-[13px] font-bold text-volt-300 tabular-nums">from {naira(p.priceFrom)} a game</span>
      </div>
      <div className="px-4 py-3">
        <p className="font-display text-[18px] leading-tight font-extrabold text-ink line-clamp-2">{p.name}</p>
        <p className="text-[13px] text-gray-600 truncate">{[where, facts].filter(Boolean).join(' · ') || 'Tap to see times'}</p>
      </div>
    </Link>
  );
}
