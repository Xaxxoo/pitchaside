'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GameCard, Section } from '@/components/player-ui';
import { getPlayerGame, type GamePlayer, type PlayerGame } from '@/lib/player';

/** One game from the player's side: their game card, where it is, and who's playing. */
export default function PlayerGamePage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<PlayerGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      getPlayerGame(id).then(setGame, (err) => setError(err instanceof Error ? err.message : 'Could not load this game')),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Link
        href="/me/games"
        className="inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 -ml-1 mb-4 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-full hover:text-ink hover:border-gray-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Games
      </Link>

      {error ? (
        <p className="text-sm text-gray-500 bg-chalk rounded-2xl px-4 py-5 text-center">{error}</p>
      ) : !game ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-48 bg-gray-100 rounded-3xl" />
          <div className="h-40 bg-gray-100 rounded-3xl" />
        </div>
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <div className="space-y-3">
            {game.status === 'cancelled' ? (
              <p className="text-sm font-semibold text-kit-600 bg-kit-500/10 rounded-2xl px-4 py-3">This game was cancelled.</p>
            ) : (
              <GameCard game={game} onChange={load} showDetails={false} />
            )}
            {game.location && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(game.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-card px-4 py-3 hover:border-gray-300 transition-colors"
              >
                <svg className="w-5 h-5 text-pitch-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-gray-500">Where</span>
                  <span className="block text-sm font-bold text-ink truncate">{game.location}</span>
                </span>
                <span className="text-xs font-bold text-pitch-600 shrink-0">Map ›</span>
              </a>
            )}
          </div>

          <div>
            <Section title={`Who's playing (${game.playing.length}${game.requireRsvp ? `/${game.capacity}` : ''})`}>
              {game.playing.length === 0 ? (
                <p className="text-sm text-gray-500 bg-chalk rounded-2xl px-4 py-5 text-center">
                  {game.requireRsvp ? 'Nobody’s said they’re in yet. Be the first.' : 'The squad isn’t set yet.'}
                </p>
              ) : (
                <Names people={game.playing} />
              )}
            </Section>
            {game.waitlistNames.length > 0 && (
              <Section title={`Waitlist (${game.waitlistNames.length})`}>
                <Names people={game.waitlistNames} numbered />
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Names({ people, numbered = false }: { people: GamePlayer[]; numbered?: boolean }) {
  return (
    <ul className="bg-white rounded-2xl border border-gray-100 shadow-card divide-y divide-gray-100">
      {people.map((p, i) => (
        <li key={`${p.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
              p.me ? 'bg-ink text-volt-300' : 'bg-volt-100 text-pitch-800'
            }`}
          >
            {numbered ? i + 1 : initials(p.name)}
          </span>
          <span className="text-sm font-semibold text-ink truncate flex-1">{p.name}</span>
          {p.me && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-volt-400 text-ink">You</span>}
        </li>
      ))}
    </ul>
  );
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}
