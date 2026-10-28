'use client';

import { btnPrimary } from '@/components/buttons';
import { Steps } from '@/components/steps';
import { SessionVotingCard } from '@/components/ratings';
import type { Lineup } from '@/lib/api';
import type { GamePhase } from '@/lib/game-player';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';
import { Swatch } from './teams-step';

/**
 * Step 4 of match day: full time. Before it's ended, one button: say who came, which ends the game
 * and sends the vote link to the players who came. After, the day's result and the vote.
 */
export function FullTimeStep({
  sessionId,
  groupName,
  phase,
  lineup,
  onEnd,
}: {
  sessionId: string;
  groupName: string;
  phase: GamePhase;
  lineup: Lineup | null;
  onEnd: () => void;
}) {
  const ended = phase === 'ended';
  const games = lineup?.games.length ?? 0;
  const winner = lineup?.teamOfTheDay ?? null;

  if (phase === 'cancelled') {
    return (
      <div className="py-12 text-center">
        <p className="text-[15px] font-bold text-ink">This game was called off</p>
        <p className="mt-1 text-sm text-gray-600">Bring it back from Options if it’s on again.</p>
      </div>
    );
  }

  return (
    <section aria-label="Full time">
      {/* The day in one line: how many games, and who won it */}
      {lineup && games > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-3xl bg-white border border-gray-100 shadow-card px-4 min-h-16 py-3">
          <span className="text-2xl" aria-hidden>
            🏆
          </span>
          <p className="flex-1 min-w-0 text-[14px] leading-snug text-gray-600">
            {winner ? (
              <>
                <b className="flex items-center gap-1.5 text-[15px] text-ink">
                  <Swatch team={winner} bibs={lineup.bibs} />
                  <span className="truncate">{teamName(winner, lineup.captains, lineup.bibs)}</span>
                </b>
                {ended ? 'Team of the Day' : 'Team of the Day so far'} · {games} game{games === 1 ? '' : 's'}
              </>
            ) : (
              <>
                <b className="block text-[15px] text-ink">No clear winner</b>
                Level at the top after {games} game{games === 1 ? '' : 's'}, so no Team of the Day.
              </>
            )}
          </p>
        </div>
      )}

      {!ended && (
        <div className="rounded-3xl bg-white border border-gray-100 shadow-card p-5">
          <h3 className="font-display text-lg font-extrabold text-ink leading-tight">Full time</h3>
          <Steps
            className="mt-3"
            steps={[
              { title: 'Tick who came', sub: 'Anyone who didn’t owes nothing' },
              { title: 'End the game', sub: phase === 'before' ? 'Early is fine if it’s been played' : undefined },
              { title: 'The vote link goes out', sub: 'To the players who came' },
            ]}
          />
          <button onClick={onEnd} className={`${btnPrimary} w-full mt-4`}>
            End game &amp; send vote link
          </button>
        </div>
      )}

      {ended && <SessionVotingCard sessionId={sessionId} groupName={groupName} />}
    </section>
  );
}
