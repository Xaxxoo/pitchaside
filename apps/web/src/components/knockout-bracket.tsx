'use client';

import type { ICompetitionMatch } from '@pitchaside/shared';
import { MatchStatus } from '@pitchaside/shared';

interface KnockoutBracketProps {
  rounds: Record<number, ICompetitionMatch[]>;
}

const ROUND_NAMES: Record<number, string> = {};

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round ${round}`;
}

export function KnockoutBracket({ rounds }: KnockoutBracketProps) {
  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  if (!roundNumbers.length) {
    return <p className="text-sm text-gray-500 text-center py-6">No fixtures generated yet.</p>;
  }
  const totalRounds = Math.max(...roundNumbers);

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 pb-4">
      <div className="flex gap-6 min-w-max px-4 sm:px-0">
        {roundNumbers.map((round) => (
          <div key={round} className="flex flex-col gap-3 min-w-[200px]">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              {roundLabel(round, totalRounds)}
            </h4>
            {rounds[round].map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: ICompetitionMatch }) {
  const isCompleted = match.status === MatchStatus.COMPLETED || match.status === MatchStatus.WALKOVER;
  const hasPenalties = match.homePenalties != null && match.awayPenalties != null;

  return (
    <div className={`rounded-xl border ${isCompleted ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-chalk/50'} overflow-hidden`}>
      <TeamRow
        name={match.homeTeam?.name ?? 'TBD'}
        score={match.homeScore}
        penalties={match.homePenalties}
        hasPenalties={hasPenalties}
        isWinner={match.winnerId === match.homeTeamId}
        isCompleted={isCompleted}
        isTbd={!match.homeTeamId}
      />
      <div className="border-t border-gray-100" />
      <TeamRow
        name={match.awayTeam?.name ?? 'TBD'}
        score={match.awayScore}
        penalties={match.awayPenalties}
        hasPenalties={hasPenalties}
        isWinner={match.winnerId === match.awayTeamId}
        isCompleted={isCompleted}
        isTbd={!match.awayTeamId}
      />
      {match.venue && (
        <div className="px-2.5 py-1 bg-chalk border-t border-gray-100 text-[10px] text-gray-400 truncate">
          {match.venue}
          {match.scheduledDate && ` \u00b7 ${new Date(match.scheduledDate).toLocaleDateString()}`}
        </div>
      )}
    </div>
  );
}

function TeamRow({
  name,
  score,
  penalties,
  hasPenalties,
  isWinner,
  isCompleted,
  isTbd,
}: {
  name: string;
  score?: number;
  penalties?: number;
  hasPenalties: boolean;
  isWinner: boolean;
  isCompleted: boolean;
  isTbd: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 ${isWinner ? 'bg-volt-300/20' : ''}`}>
      <span className={`flex-1 text-xs truncate ${isTbd ? 'text-gray-300 italic' : isWinner ? 'font-bold text-ink' : 'text-gray-600'}`}>
        {name}
      </span>
      {isCompleted && score != null && (
        <span className={`text-xs tabular-nums ${isWinner ? 'font-bold text-ink' : 'text-gray-500'}`}>
          {score}
          {hasPenalties && penalties != null && (
            <span className="text-[10px] text-gray-400 ml-0.5">({penalties})</span>
          )}
        </span>
      )}
    </div>
  );
}
