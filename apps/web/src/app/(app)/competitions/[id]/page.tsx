'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { useToast } from '@/components/toast';
import { LeagueTable } from '@/components/league-table';
import { KnockoutBracket } from '@/components/knockout-bracket';
import {
  getCompetition,
  getCompetitionTeams,
  getCompetitionMatches,
  getCompetitionStandings,
  getCompetitionBracket,
  updateCompetitionStatus,
  provisionCompetitionAccount,
  generateFixtures,
  confirmTeamPayment,
  removeCompetitionTeam,
  recordMatchResult,
  updateMatchSchedule,
  formatCurrency,
  type CompetitionWithCount,
} from '@/lib/api';
import {
  CompetitionStatus,
  CompetitionFormat,
  CompetitionScope,
  CompetitionVisibility,
  TeamRegistrationStatus,
  MatchStatus,
} from '@pitchaside/shared';
import type { ICompetitionTeam, ICompetitionMatch, ICompetitionStanding } from '@pitchaside/shared';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [CompetitionStatus.DRAFT]: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  [CompetitionStatus.REGISTRATION_OPEN]: { label: 'Registration Open', color: 'bg-green-100 text-green-700' },
  [CompetitionStatus.REGISTRATION_CLOSED]: { label: 'Registration Closed', color: 'bg-yellow-100 text-yellow-700' },
  [CompetitionStatus.IN_PROGRESS]: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  [CompetitionStatus.COMPLETED]: { label: 'Completed', color: 'bg-pitch-100 text-pitch-700' },
  [CompetitionStatus.CANCELLED]: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
};

const STATUS_ACTIONS: Record<string, { label: string; next: CompetitionStatus }[]> = {
  [CompetitionStatus.DRAFT]: [{ label: 'Open Registration', next: CompetitionStatus.REGISTRATION_OPEN }],
  [CompetitionStatus.REGISTRATION_OPEN]: [{ label: 'Close Registration', next: CompetitionStatus.REGISTRATION_CLOSED }],
  [CompetitionStatus.REGISTRATION_CLOSED]: [
    { label: 'Start Competition', next: CompetitionStatus.IN_PROGRESS },
    { label: 'Reopen Registration', next: CompetitionStatus.REGISTRATION_OPEN },
  ],
  [CompetitionStatus.IN_PROGRESS]: [{ label: 'Mark Completed', next: CompetitionStatus.COMPLETED }],
};

const TABS = ['Overview', 'Teams', 'Matches', 'Results'] as const;
type Tab = typeof TABS[number];

export default function CompetitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [comp, setComp] = useState<CompetitionWithCount | null>(null);
  const [teams, setTeams] = useState<ICompetitionTeam[]>([]);
  const [matches, setMatches] = useState<ICompetitionMatch[]>([]);
  const [standings, setStandings] = useState<ICompetitionStanding[]>([]);
  const [bracket, setBracket] = useState<Record<number, ICompetitionMatch[]>>({});
  const [tab, setTab] = useState<Tab>('Overview');
  const [loading, setLoading] = useState(true);
  const [resultModal, setResultModal] = useState<ICompetitionMatch | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await getCompetition(id);
      setComp(c);
      const t = await getCompetitionTeams(id);
      setTeams(t);
      const m = await getCompetitionMatches(id);
      setMatches(m);
      if (c.format === CompetitionFormat.LEAGUE) {
        getCompetitionStandings(id).then(setStandings).catch(() => {});
      } else {
        getCompetitionBracket(id).then((b) => setBracket(b.rounds)).catch(() => {});
      }
    } catch {
      toast.error('Failed to load competition');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(next: CompetitionStatus) {
    try {
      const updated = await updateCompetitionStatus(id, next);
      setComp((prev) => prev ? { ...prev, ...updated } : prev);
      toast.success(`Status updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleProvisionAccount() {
    try {
      const updated = await provisionCompetitionAccount(id);
      setComp((prev) => prev ? { ...prev, ...updated } : prev);
      toast.success('Account created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleGenerateFixtures() {
    try {
      const m = await generateFixtures(id);
      setMatches(m);
      toast.success('Fixtures generated');
      setTab('Matches');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleConfirmPayment(teamId: string) {
    try {
      await confirmTeamPayment(id, teamId);
      const t = await getCompetitionTeams(id);
      setTeams(t);
      toast.success('Payment confirmed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleRemoveTeam(teamId: string) {
    try {
      await removeCompetitionTeam(id, teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      toast.success('Team removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleRecordResult(matchId: string, data: { homeScore: number; awayScore: number; homePenalties?: number; awayPenalties?: number }) {
    try {
      await recordMatchResult(id, matchId, data);
      setResultModal(null);
      await load();
      toast.success('Result recorded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  if (loading || !comp) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-6" />
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const status = STATUS_LABELS[comp.status] ?? { label: comp.status, color: 'bg-gray-100 text-gray-600' };
  const actions = STATUS_ACTIONS[comp.status] ?? [];
  const isLeague = comp.format === CompetitionFormat.LEAGUE;
  const confirmedTeams = teams.filter((t) => t.registrationStatus === TeamRegistrationStatus.CONFIRMED);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <BackButton label="Cups" />

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-ink">{comp.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${status.color}`}>
                {status.label}
              </span>
              <span className="text-xs text-gray-500">
                {comp.format === CompetitionFormat.KNOCKOUT ? 'Knockout' : 'League'} &middot; {comp.scope === CompetitionScope.NATIONWIDE ? 'Nationwide' : comp.state}{comp.city ? `, ${comp.city}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Status actions */}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {actions.map((a) => (
              <button key={a.next} onClick={() => handleStatusChange(a.next)} className="px-4 py-2 text-xs font-bold rounded-xl bg-ink text-volt-300 hover:bg-pitch-900 transition-colors">
                {a.label}
              </button>
            ))}
            {comp.status !== CompetitionStatus.COMPLETED && comp.status !== CompetitionStatus.CANCELLED && (
              <button onClick={() => handleStatusChange(CompetitionStatus.CANCELLED)} className="px-4 py-2 text-xs font-bold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
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

      {/* Tab content */}
      {tab === 'Overview' && (
        <div className="space-y-4">
          {/* Info card */}
          <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
            {comp.description && <p className="text-sm text-gray-600">{comp.description}</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Entry Fee</p>
                <p className="font-bold text-ink">{Number(comp.entryFee) > 0 ? formatCurrency(Number(comp.entryFee)) : 'Free'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Teams</p>
                <p className="font-bold text-ink">{confirmedTeams.length} / {comp.maxTeams}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Players</p>
                <p className="font-bold text-ink">{comp.minPlayersPerTeam}–{comp.maxPlayersPerTeam} per team</p>
              </div>
              {comp.startDate && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Start</p>
                  <p className="font-bold text-ink">{new Date(comp.startDate).toLocaleDateString()}</p>
                </div>
              )}
              {comp.endDate && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">End</p>
                  <p className="font-bold text-ink">{new Date(comp.endDate).toLocaleDateString()}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Visibility</p>
                <p className="font-bold text-ink">{comp.visibility === CompetitionVisibility.PUBLIC ? 'Public' : 'Invite Only'}</p>
              </div>
            </div>
            {comp.rules && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Rules</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{comp.rules}</p>
              </div>
            )}
          </div>

          {/* Payrep account */}
          <div className="bg-white rounded-2xl shadow-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Collection Account</p>
            {comp.accountNumber ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-ink">{comp.accountNumber}</p>
                <p className="text-xs text-gray-500">{comp.accountName} &middot; {comp.bankName}</p>
              </div>
            ) : (
              <button onClick={handleProvisionAccount} className="px-4 py-2 text-xs font-bold rounded-xl bg-ink text-volt-300 hover:bg-pitch-900 transition-colors">
                Create Payrep Account
              </button>
            )}
          </div>

          {/* Invite code */}
          {comp.inviteCode && (
            <div className="bg-white rounded-2xl shadow-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Invite Code</p>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 bg-chalk rounded-lg text-sm font-mono font-bold text-ink">{comp.inviteCode}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(comp.inviteCode!);
                    toast.success('Copied');
                  }}
                  className="text-xs text-gray-500 hover:text-ink transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Generate fixtures button */}
          {(comp.status === CompetitionStatus.REGISTRATION_CLOSED || comp.status === CompetitionStatus.IN_PROGRESS) && confirmedTeams.length >= 2 && (
            <button onClick={handleGenerateFixtures} className="w-full py-3 text-sm font-bold rounded-xl bg-ink text-volt-300 hover:bg-pitch-900 transition-colors">
              {matches.length > 0 ? 'Regenerate Fixtures' : 'Generate Fixtures'}
            </button>
          )}
        </div>
      )}

      {tab === 'Teams' && (
        <div className="space-y-2">
          {teams.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No teams registered yet.</p>
          ) : (
            teams.map((team) => (
              <div key={team.id} className="bg-white rounded-xl shadow-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{team.name}</p>
                  <p className="text-xs text-gray-500">{team.captainName} &middot; {team.captainPhone}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    team.registrationStatus === TeamRegistrationStatus.CONFIRMED
                      ? 'bg-green-100 text-green-700'
                      : team.registrationStatus === TeamRegistrationStatus.PENDING_PAYMENT
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {team.registrationStatus === TeamRegistrationStatus.CONFIRMED ? 'Confirmed' :
                     team.registrationStatus === TeamRegistrationStatus.PENDING_PAYMENT ? 'Pending' :
                     team.registrationStatus}
                  </span>
                  {team.registrationStatus === TeamRegistrationStatus.PENDING_PAYMENT && (
                    <button onClick={() => handleConfirmPayment(team.id)} className="text-[11px] font-bold text-green-600 hover:underline">
                      Confirm
                    </button>
                  )}
                  <button onClick={() => handleRemoveTeam(team.id)} className="text-[11px] font-bold text-red-500 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Matches' && (
        <div className="space-y-4">
          {matches.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No fixtures generated yet.</p>
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
                      <div key={match.id} className="bg-white rounded-xl shadow-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className={`text-xs font-bold truncate ${match.winnerId === match.homeTeamId ? 'text-ink' : 'text-gray-500'}`}>
                              {match.homeTeam?.name ?? 'TBD'}
                            </span>
                            {match.status === MatchStatus.COMPLETED || match.status === MatchStatus.WALKOVER ? (
                              <span className="text-xs font-bold text-ink tabular-nums">{match.homeScore} - {match.awayScore}</span>
                            ) : (
                              <span className="text-xs text-gray-300">vs</span>
                            )}
                            <span className={`text-xs font-bold truncate ${match.winnerId === match.awayTeamId ? 'text-ink' : 'text-gray-500'}`}>
                              {match.awayTeam?.name ?? 'TBD'}
                            </span>
                          </div>
                          {match.status === MatchStatus.SCHEDULED && match.homeTeamId && match.awayTeamId && (
                            <button
                              onClick={() => setResultModal(match)}
                              className="text-[11px] font-bold text-ink hover:underline shrink-0"
                            >
                              Enter Result
                            </button>
                          )}
                        </div>
                        {(match.venue || match.scheduledDate) && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            {match.venue}{match.venue && match.scheduledDate ? ' \u00b7 ' : ''}{match.scheduledDate ? new Date(match.scheduledDate).toLocaleDateString() : ''}
                            {match.scheduledTime ? ` ${match.scheduledTime}` : ''}
                          </p>
                        )}
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
        isLeague ? (
          <LeagueTable standings={standings} />
        ) : (
          <KnockoutBracket rounds={bracket} />
        )
      )}

      {/* Result entry modal */}
      {resultModal && (
        <ResultModal
          match={resultModal}
          isKnockout={!isLeague}
          onClose={() => setResultModal(null)}
          onSubmit={(data) => handleRecordResult(resultModal.id, data)}
        />
      )}
    </div>
  );
}

function ResultModal({
  match,
  isKnockout,
  onClose,
  onSubmit,
}: {
  match: ICompetitionMatch;
  isKnockout: boolean;
  onClose: () => void;
  onSubmit: (data: { homeScore: number; awayScore: number; homePenalties?: number; awayPenalties?: number }) => void;
}) {
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [homePens, setHomePens] = useState('');
  const [awayPens, setAwayPens] = useState('');
  const isDraw = homeScore !== '' && awayScore !== '' && homeScore === awayScore;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-lift max-w-sm w-full p-6">
        <h3 className="text-base font-bold text-ink mb-4">Enter Result</h3>
        <p className="text-xs text-gray-500 mb-3">{match.homeTeam?.name} vs {match.awayTeam?.name}</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">{match.homeTeam?.name}</label>
            <input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-center text-lg font-bold focus:outline-none focus:ring-4 focus:ring-volt-300/70" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">{match.awayTeam?.name}</label>
            <input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-center text-lg font-bold focus:outline-none focus:ring-4 focus:ring-volt-300/70" />
          </div>
        </div>
        {isKnockout && isDraw && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">Penalties</label>
              <input type="number" min={0} value={homePens} onChange={(e) => setHomePens(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-center font-bold focus:outline-none focus:ring-4 focus:ring-volt-300/70" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">Penalties</label>
              <input type="number" min={0} value={awayPens} onChange={(e) => setAwayPens(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-center font-bold focus:outline-none focus:ring-4 focus:ring-volt-300/70" />
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => {
              if (homeScore === '' || awayScore === '') return;
              onSubmit({
                homeScore: Number(homeScore),
                awayScore: Number(awayScore),
                homePenalties: homePens ? Number(homePens) : undefined,
                awayPenalties: awayPens ? Number(awayPens) : undefined,
              });
            }}
            disabled={homeScore === '' || awayScore === ''}
            className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-ink text-volt-300 hover:bg-pitch-900 transition-colors disabled:opacity-50"
          >
            Save Result
          </button>
        </div>
      </div>
    </div>
  );
}
