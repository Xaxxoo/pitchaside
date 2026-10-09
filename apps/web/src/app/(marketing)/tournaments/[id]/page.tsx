'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { LeagueTable } from '@/components/league-table';
import { KnockoutBracket } from '@/components/knockout-bracket';
import { useToast } from '@/components/toast';
import {
  getPublicCompetition,
  getPublicCompetitionTeams,
  getPublicCompetitionMatches,
  getPublicCompetitionStandings,
  getPublicCompetitionBracket,
  registerTeam,
  formatCurrency,
  type CompetitionWithCount,
} from '@/lib/api';
import {
  CompetitionStatus,
  CompetitionFormat,
  CompetitionScope,
  TeamRegistrationStatus,
  MatchStatus,
} from '@pitchaside/shared';
import type { ICompetitionTeam, ICompetitionMatch, ICompetitionStanding } from '@pitchaside/shared';

const TABS = ['Info', 'Teams', 'Matches', 'Results'] as const;
type Tab = typeof TABS[number];

export default function PublicCompetitionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [comp, setComp] = useState<CompetitionWithCount | null>(null);
  const [teams, setTeams] = useState<ICompetitionTeam[]>([]);
  const [matches, setMatches] = useState<ICompetitionMatch[]>([]);
  const [standings, setStandings] = useState<ICompetitionStanding[]>([]);
  const [bracket, setBracket] = useState<Record<number, ICompetitionMatch[]>>({});
  const [tab, setTab] = useState<Tab>('Info');
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [registered, setRegistered] = useState<ICompetitionTeam | null>(null);

  useEffect(() => {
    Promise.all([
      getPublicCompetition(id).then(setComp),
      getPublicCompetitionTeams(id).then(setTeams),
      getPublicCompetitionMatches(id).then(setMatches),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!comp) return;
    if (comp.format === CompetitionFormat.LEAGUE) {
      getPublicCompetitionStandings(id).then(setStandings).catch(() => {});
    } else {
      getPublicCompetitionBracket(id).then((b) => setBracket(b.rounds)).catch(() => {});
    }
  }, [comp, id]);

  if (loading || !comp) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  const isLeague = comp.format === CompetitionFormat.LEAGUE;
  const canRegister = comp.status === CompetitionStatus.REGISTRATION_OPEN;
  const confirmedTeams = teams.filter((t) => t.registrationStatus === TeamRegistrationStatus.CONFIRMED);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-ink/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo href="/" />
          <Link href="/tournaments" className="text-xs font-bold text-gray-500 hover:text-ink transition-colors">
            All Competitions
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <h1 className="text-2xl font-extrabold text-ink">{comp.name}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
            {comp.format === CompetitionFormat.KNOCKOUT ? 'Knockout' : 'League'}
          </span>
          <span className="text-xs text-gray-500">
            {comp.scope === CompetitionScope.NATIONWIDE ? 'Nationwide' : comp.state}{comp.city ? `, ${comp.city}` : ''}
            {' \u00b7 '}{confirmedTeams.length}/{comp.maxTeams} teams
          </span>
        </div>

        {/* Register CTA */}
        {canRegister && !registered && (
          <button
            onClick={() => setShowRegister(true)}
            className="mt-4 px-6 py-3 text-sm font-bold rounded-xl bg-ink text-volt-300 hover:bg-pitch-900 transition-colors"
          >
            Register Your Team
          </button>
        )}

        {/* Registration success */}
        {registered && (
          <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 p-4">
            <p className="text-sm font-bold text-green-700">Team registered!</p>
            {Number(comp.entryFee) > 0 && comp.accountNumber && (
              <div className="mt-2 text-sm text-green-600">
                <p>Pay <span className="font-bold">{formatCurrency(Number(comp.entryFee))}</span> to:</p>
                <div className="mt-1 p-3 bg-white rounded-xl">
                  <p className="font-bold text-ink">{comp.accountNumber}</p>
                  <p className="text-xs text-gray-500">{comp.accountName} &middot; {comp.bankName}</p>
                </div>
                <p className="mt-2 text-xs">Include <code className="px-1.5 py-0.5 bg-white rounded font-mono font-bold">{registered.paymentRef}</code> in the transfer narration.</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-6 mb-5 overflow-x-auto">
          {TABS.map((t) => {
            const label = t === 'Results' ? (isLeague ? 'Standings' : 'Bracket') : t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
                  tab === t ? 'bg-ink text-volt-300' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'Info' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              {comp.description && <p className="text-sm text-gray-600">{comp.description}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Entry Fee</p>
                  <p className="font-bold text-ink">{Number(comp.entryFee) > 0 ? formatCurrency(Number(comp.entryFee)) : 'Free'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Players per Team</p>
                  <p className="font-bold text-ink">{comp.minPlayersPerTeam}–{comp.maxPlayersPerTeam}</p>
                </div>
                {comp.startDate && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Start</p>
                    <p className="font-bold text-ink">{new Date(comp.startDate).toLocaleDateString()}</p>
                  </div>
                )}
                {comp.registrationDeadline && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Deadline</p>
                    <p className="font-bold text-ink">{new Date(comp.registrationDeadline).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              {comp.rules && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Rules</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{comp.rules}</p>
                </div>
              )}
            </div>

            {/* Payment info */}
            {Number(comp.entryFee) > 0 && comp.accountNumber && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Payment</p>
                <p className="text-sm text-gray-600 mb-2">Pay <span className="font-bold text-ink">{formatCurrency(Number(comp.entryFee))}</span> to:</p>
                <div className="bg-chalk rounded-xl p-3">
                  <p className="text-sm font-bold text-ink">{comp.accountNumber}</p>
                  <p className="text-xs text-gray-500">{comp.accountName} &middot; {comp.bankName}</p>
                </div>
                <p className="text-xs text-gray-400 mt-2">Include your payment reference in the narration for automatic confirmation.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'Teams' && (
          <div className="space-y-2">
            {confirmedTeams.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">No confirmed teams yet.</p>
            ) : (
              confirmedTeams.map((team, i) => (
                <div key={team.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3">
                  <span className="w-6 h-6 rounded-full bg-chalk flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm font-bold text-ink truncate">{team.name}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'Matches' && (
          <div className="space-y-4">
            {matches.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Fixtures not yet generated.</p>
            ) : (
              (() => {
                const grouped: Record<number, ICompetitionMatch[]> = {};
                matches.forEach((m) => {
                  if (!grouped[m.round]) grouped[m.round] = [];
                  grouped[m.round].push(m);
                });
                return Object.entries(grouped).map(([round, roundMatches]) => (
                  <div key={round}>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Round {round}</h4>
                    <div className="space-y-2">
                      {roundMatches.map((match) => (
                        <div key={match.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold truncate ${match.winnerId === match.homeTeamId ? 'text-ink' : 'text-gray-500'}`}>
                            {match.homeTeam?.name ?? 'TBD'}
                          </span>
                          {match.status === MatchStatus.COMPLETED || match.status === MatchStatus.WALKOVER ? (
                            <span className="text-xs font-bold text-ink tabular-nums shrink-0">{match.homeScore} - {match.awayScore}</span>
                          ) : (
                            <span className="text-xs text-gray-300 shrink-0">vs</span>
                          )}
                          <span className={`text-xs font-bold truncate text-right ${match.winnerId === match.awayTeamId ? 'text-ink' : 'text-gray-500'}`}>
                            {match.awayTeam?.name ?? 'TBD'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
        )}

        {tab === 'Results' && (
          isLeague ? <LeagueTable standings={standings} /> : <KnockoutBracket rounds={bracket} />
        )}
      </div>

      {/* Registration modal */}
      {showRegister && (
        <RegisterModal
          competitionId={id}
          onClose={() => setShowRegister(false)}
          onRegistered={(team) => {
            setRegistered(team);
            setShowRegister(false);
            setTeams((prev) => [...prev, team]);
            toast.success('Team registered!');
          }}
        />
      )}
    </div>
  );
}

function RegisterModal({
  competitionId,
  onClose,
  onRegistered,
}: {
  competitionId: string;
  onClose: () => void;
  onRegistered: (team: ICompetitionTeam) => void;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = (form.get('teamName') as string).trim();
    const captainName = (form.get('captainName') as string).trim();
    const captainPhone = (form.get('captainPhone') as string).trim();
    const captainEmail = (form.get('captainEmail') as string).trim() || undefined;

    if (!name || !captainName || !captainPhone) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const team = await registerTeam(competitionId, { name, captainName, captainPhone, captainEmail });
      onRegistered(team);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-lift max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-ink mb-4">Register Your Team</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="teamName" className="block text-xs font-bold text-gray-700 mb-1.5">Team Name *</label>
            <input id="teamName" name="teamName" type="text" placeholder="e.g. Lagos Lions" className={inputClass} required />
          </div>
          <div>
            <label htmlFor="captainName" className="block text-xs font-bold text-gray-700 mb-1.5">Captain Name *</label>
            <input id="captainName" name="captainName" type="text" placeholder="Full name" className={inputClass} required />
          </div>
          <div>
            <label htmlFor="captainPhone" className="block text-xs font-bold text-gray-700 mb-1.5">Captain Phone *</label>
            <input id="captainPhone" name="captainPhone" type="tel" placeholder="+234..." className={inputClass} required />
          </div>
          <div>
            <label htmlFor="captainEmail" className="block text-xs font-bold text-gray-700 mb-1.5">Captain Email</label>
            <input id="captainEmail" name="captainEmail" type="email" placeholder="Optional" className={inputClass} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-ink text-volt-300 hover:bg-pitch-900 transition-colors disabled:opacity-50">
              {submitting ? 'Registering...' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
