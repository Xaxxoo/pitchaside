'use client';

import type { ICompetitionStanding } from '@pitchaside/shared';

interface LeagueTableProps {
  standings: ICompetitionStanding[];
}

export function LeagueTable({ standings }: LeagueTableProps) {
  if (!standings.length) {
    return <p className="text-sm text-gray-500 text-center py-6">No results yet.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left py-2.5 px-3 w-8">#</th>
            <th className="text-left py-2.5 px-3">Team</th>
            <th className="text-center py-2.5 px-2 w-8">P</th>
            <th className="text-center py-2.5 px-2 w-8">W</th>
            <th className="text-center py-2.5 px-2 w-8">D</th>
            <th className="text-center py-2.5 px-2 w-8">L</th>
            <th className="text-center py-2.5 px-2 w-10">GF</th>
            <th className="text-center py-2.5 px-2 w-10">GA</th>
            <th className="text-center py-2.5 px-2 w-10">GD</th>
            <th className="text-center py-2.5 px-2 w-10 font-extrabold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.teamId} className="border-b border-gray-50 hover:bg-chalk/50 transition-colors">
              <td className="py-2.5 px-3 font-bold text-gray-400">{row.position}</td>
              <td className="py-2.5 px-3 font-bold text-ink truncate max-w-[160px]">{row.team.name}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.played}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.won}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.drawn}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.lost}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.goalsFor}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.goalsAgainst}</td>
              <td className="text-center py-2.5 px-2 text-gray-600">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
              <td className="text-center py-2.5 px-2 font-extrabold text-ink">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
