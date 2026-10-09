'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { KeepHyphens } from '@/components/brand';
import {
  getGroups,
  getSessions,
  getGroupBilling,
  getGroupBalance,
  formatCurrency,
  type GroupBilling,
  type IGroupWithMembers,
  type ISessionWithDetails,
} from '@/lib/api';
import { SessionStatus, UserRole } from '@pitchaside/shared';
import { Celebration, Player, Ball, BallIcon, kitFor, palette, skins } from '@/components/illustrations';
import { GroupAccountCard } from '@/components/group-billing';
import { NewSessionSheet } from '@/components/new-session-sheet';
import { useToast } from '@/components/toast';
import { formatAccountNumber } from '@/lib/billing';
import { prettyTime } from '@/components/player-ui';

const onboardingSteps = [
  {
    step: 1,
    title: 'Create your first group',
    description: 'Set up a pitch group with your team name, player fee, and target size.',
    href: '/groups/new',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
  {
    step: 2,
    title: 'Add players',
    description: 'Add the regulars so you can track who\'s paid and who hasn\'t.',
    href: '/players/new',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
      </svg>
    ),
  },
  {
    step: 3,
    title: 'Schedule a session',
    description: 'Create a match session and payments are auto-generated for each player.',
    href: '/sessions',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<IGroupWithMembers[]>([]);
  const [sessions, setSessions] = useState<ISessionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGame, setShowNewGame] = useState(false);
  // Most organisers run one team: their account sits right on the home page.
  const [billing, setBilling] = useState<GroupBilling | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  // Several groups: each one's balance, by group id.
  const [balances, setBalances] = useState<Record<string, number>>({});
  const router = useRouter();
  const toast = useToast();
  // Treasurers can look but not change anything.
  const canManage = user?.role !== UserRole.TREASURER;

  // The PitchAside team doesn't run a club — their home is HQ.
  useEffect(() => {
    if (user?.role === UserRole.SUPER_ADMIN) router.replace('/hq');
  }, [user, router]);

  useEffect(() => {
    Promise.all([getGroups(), getSessions()])
      .then(([g, s]) => {
        setGroups(g);
        setSessions(s);
        if (g.length === 1) {
          getGroupBilling(g[0].id).then(setBilling).catch(() => {});
          getGroupBalance(g[0].id).then((b) => setBalance(b.available)).catch(() => {});
        } else {
          for (const group of g.filter((x) => x.accountNumber)) {
            getGroupBalance(group.id)
              .then((b) => setBalances((prev) => ({ ...prev, [group.id]: b.available })))
              .catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Dues periods aren't games — keep them out of "next game" / "coming up".
  const upcomingSessions = sessions
    .filter((s) => s.status === SessionStatus.UPCOMING && s.kind !== 'dues')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextSession = upcomingSessions[0];

  const nextGroup = nextSession ? groups.find((g) => g.id === nextSession.groupId) : null;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-40" />
          <div className="h-8 bg-gray-200 rounded w-56" />
          <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
            <div className="h-60 bg-gray-200 rounded-3xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-28 bg-gray-200 rounded-2xl" />
              <div className="h-28 bg-gray-200 rounded-2xl" />
              <div className="h-28 bg-gray-200 rounded-2xl col-span-2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // New user — no groups yet
  if (groups.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="relative rounded-[32px] bg-volt-300 border-2 border-ink shadow-sticker overflow-hidden px-6 pt-6 pb-0 sm:px-10 sm:pt-10 mb-5">
          <div className="absolute inset-0 chalk-dots opacity-60" />
          <div className="relative grid sm:grid-cols-[1fr_auto] items-end gap-2">
            <div className="pb-6 sm:pb-10">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/60">Pre-season</p>
              <h1 className="text-4xl font-extrabold text-ink mt-1 leading-none">
                Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
              </h1>
              <p className="text-sm text-ink/70 mt-3 max-w-xs">
                Let&apos;s get your pitch set up. Follow these steps to start tracking payments.
              </p>
            </div>
            <Celebration className="w-44 sm:w-52 h-auto mx-auto -mb-1" />
          </div>
        </div>

        <div className="space-y-2.5">
          {onboardingSteps.map((item) => (
            <Link
              key={item.step}
              href={item.href}
              className="group flex items-center gap-4 bg-white rounded-2xl p-4 border border-gray-100 shadow-card hover:border-ink hover:-translate-y-0.5 transition-all"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-ink text-volt-300 flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-white/50 leading-none">Step</span>
                <span className="font-display text-lg font-extrabold leading-none mt-0.5">{item.step}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-ink">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-chalk group-hover:bg-volt-400 flex items-center justify-center shrink-0 transition-colors">
                <svg className="w-4 h-4 text-ink" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/groups/new"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-2xl hover:bg-pitch-900 transition-colors shadow-lift"
          >
            Get Started
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    );
  }

  const nextProgress = nextSession && nextSession.targetAmount > 0
    ? Math.round((nextSession.collectedAmount / nextSession.targetAmount) * 100)
    : 0;
  // gamePaid covers groups whose monthly (weekly…) dues pay for games; otherwise the game's own due.
  const paidForGame = (p: { status: string; gamePaid?: string }) => (p.gamePaid ? p.gamePaid === 'paid' : p.status === 'paid');
  const owesForGame = (p: { status: string; gamePaid?: string }) => (p.gamePaid ? p.gamePaid === 'unpaid' : p.status === 'pending');
  const nextPaidCount = nextSession?.payments?.filter(paidForGame).length ?? 0;
  const nextTotalCount = nextSession?.payments?.length ?? 0;
  const nextUnpaid = (nextSession?.payments ?? []).filter(owesForGame);
  const nextPendingCount = nextUnpaid.length;
  const coveredByDues = !!nextSession && Number(nextSession.targetAmount) === 0 && nextTotalCount > 0;
  const gameProgress = coveredByDues ? Math.round((nextPaidCount / nextTotalCount) * 100) : nextProgress;
  const daysToGo = nextSession
    ? Math.max(0, Math.ceil((new Date(nextSession.date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000))
    : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-pitch-600">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-[32px] leading-none font-extrabold text-ink mt-1.5">
            {greeting}, {user?.firstName || 'there'}
          </h1>
        </div>
      </div>

      {showNewGame && <NewSessionSheet groups={groups} onClose={() => setShowNewGame(false)} />}

      {/* One team: its account, balance and share buttons, first thing on the page */}
      {groups.length === 1 && billing && (
        <GroupAccountCard
          groupId={groups[0].id}
          groupName={groups[0].name}
          fee={Number(groups[0].feePerPlayer)}
          billing={billing}
          balance={balance}
          onChange={setBilling}
        />
      )}

      <div className={groups.length > 1 ? 'grid md:grid-cols-[1.45fr_1fr] gap-4 items-start' : ''}>
        <div className="space-y-4">
          {/* Next Game Card — the hero section */}
          {nextSession ? (
            <Link
              href={`/sessions/${nextSession.id}`}
              className="group block bg-pitch-800 rounded-[28px] text-white relative overflow-hidden shadow-lift"
            >
              <div className="absolute inset-0 turf-stripes" />
              {/* Pitch markings */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 400 260" aria-hidden>
                <g stroke="white" strokeOpacity="0.14" strokeWidth="2" fill="none">
                  <rect x="12" y="12" width="376" height="236" rx="10" />
                  <line x1="260" y1="12" x2="260" y2="248" />
                  <circle cx="260" cy="130" r="42" />
                </g>
              </svg>
              <svg className="absolute right-0 bottom-0 w-40 sm:w-48 h-auto pointer-events-none" viewBox="0 0 200 190" aria-hidden>
                <Player x={104} y={178} scale={1} pose="kick" kit={palette.volt} skin={skins[1]} hair="afro" number={10} />
                <g className="group-hover:-translate-y-2 transition-transform duration-500">
                  <Ball x={170} y={120} r={13} spin={15} />
                </g>
              </svg>

              <div className="relative p-5 sm:p-6 pr-36 sm:pr-44">
                <div className="flex items-center gap-2 mb-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-volt-400 text-ink text-[10px] font-extrabold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse-soft" />
                    Next game
                  </span>
                  <span className="text-xs font-semibold text-white/60">
                    {daysToGo === 0 ? 'Today' : daysToGo === 1 ? 'Tomorrow' : `In ${daysToGo} days`}
                  </span>
                </div>
                <p className="font-display text-2xl sm:text-[28px] font-extrabold leading-tight"><KeepHyphens text={nextGroup?.name || 'Game'} /></p>
                <p className="text-sm text-white/60 mt-1">
                  {new Date(nextSession.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {(nextSession.kickoffTime || nextGroup?.kickoffTime) &&
                    ` · ${prettyTime(nextSession.kickoffTime || nextGroup?.kickoffTime)}`}
                </p>

                {/* Payment progress */}
                <div className="mt-6">
                  <div className="flex items-baseline gap-2 mb-2">
                    {coveredByDues ? (
                      <>
                        <span className="font-display text-3xl font-extrabold tabular-nums">{nextPaidCount}</span>
                        <span className="text-sm text-white/50 tabular-nums">of {nextTotalCount} paid their dues</span>
                      </>
                    ) : (
                      <>
                        <span className="font-display text-3xl font-extrabold tabular-nums">
                          {formatCurrency(nextSession.collectedAmount)}
                        </span>
                        <span className="text-sm text-white/50 tabular-nums">
                          of {formatCurrency(nextSession.targetAmount)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="w-full bg-black/25 rounded-full h-2.5">
                    <div
                      className="bg-volt-400 h-2.5 rounded-full animate-progress"
                      style={{ width: `${Math.min(gameProgress, 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-3">
                    <span className="flex items-center gap-1.5 text-xs text-white/70">
                      <span className="w-2 h-2 rounded-full bg-volt-400" />
                      <span className="font-bold text-white tabular-nums">{nextPaidCount}</span> paid
                    </span>
                    {nextPendingCount > 0 && (
                      <span className="flex items-center gap-1.5 text-xs text-white/70">
                        <span className="w-2 h-2 rounded-full bg-sun-400" />
                        <span className="font-bold text-white tabular-nums">{nextPendingCount}</span> pending
                      </span>
                    )}
                    <span className="text-xs font-extrabold text-volt-300 tabular-nums">{gameProgress}%</span>
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div className="bg-white rounded-[28px] border border-dashed border-gray-300 chalk-dots p-6 text-center">
              <BallIcon className="w-10 h-10 mx-auto mb-3 animate-bounce-ball" />
              <p className="text-base font-bold text-ink mb-0.5">No upcoming games</p>
              <p className="text-xs text-gray-500">Schedule one and everyone in the group gets a due for it.</p>
              {canManage && (
                <button
                  onClick={() => setShowNewGame(true)}
                  className="mt-4 inline-flex items-center gap-2 py-2.5 px-4 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Schedule a game
                </button>
              )}
            </div>
          )}

          {/* Still to pay for the next game */}
          {nextSession && nextUnpaid.length > 0 && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-ink">Still to pay</h2>
                <Link href={`/sessions/${nextSession.id}`} className="text-xs font-bold text-pitch-600 hover:text-pitch-800">
                  Collect →
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextUnpaid.slice(0, 8).map((p) => {
                  const name = p.player ? `${p.player.firstName} ${p.player.lastName}` : 'Player';
                  const k = kitFor(name);
                  return (
                    <span key={p.id} className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-chalk border border-gray-200">
                      <span className={`w-6 h-6 rounded-full ${k.bg} ${k.fg} flex items-center justify-center text-[10px] font-extrabold font-display`}>
                        {name.charAt(0)}
                      </span>
                      <span className="text-xs font-semibold text-ink">{p.player?.firstName ?? name}</span>
                      {Number(p.amount) > 0 && <span className="text-[11px] text-gray-500 tabular-nums">{formatCurrency(p.amount)}</span>}
                    </span>
                  );
                })}
                {nextUnpaid.length > 8 && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-ink text-volt-300 text-xs font-bold">
                    +{nextUnpaid.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Other Upcoming Sessions */}
          {upcomingSessions.length > 1 && (
            <div>
              <h2 className="text-base font-bold text-ink mb-3">Coming up</h2>
              <div className="space-y-2">
                {upcomingSessions.slice(1, 5).map((session) => {
                  const progress = session.targetAmount > 0
                    ? Math.round((session.collectedAmount / session.targetAmount) * 100)
                    : 0;
                  const group = groups.find((g) => g.id === session.groupId);
                  const d = new Date(session.date);

                  return (
                    <Link
                      key={session.id}
                      href={`/sessions/${session.id}`}
                      className="flex items-center gap-4 bg-white rounded-2xl p-3 border border-gray-100 shadow-card hover:border-gray-300 transition-colors"
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-gray-200 text-center">
                        <div className="bg-kit-500 text-white text-[9px] font-extrabold uppercase tracking-wider py-0.5">
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div className="font-display text-lg font-extrabold text-ink leading-7">{d.getDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-ink truncate">{group?.name || 'Game'}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 max-w-[140px] bg-gray-100 rounded-full h-1.5">
                            <div className="bg-pitch-500 h-1.5 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
                          </div>
                          <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{progress}%</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-ink tabular-nums">{formatCurrency(session.collectedAmount)}</p>
                        <p className="text-[11px] text-gray-500">
                          {d.toLocaleDateString('en-US', { weekday: 'short' })}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Several groups: their accounts in a rail */}
        {groups.length > 1 && (
          <div>
            <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-5">
              <h2 className="text-base font-bold text-ink mb-3">Group accounts</h2>
              <div className="space-y-2">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-chalk px-3 py-2.5">
                    <Link href={`/groups/${g.id}`} className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{g.name}</p>
                      {g.accountNumber && (
                        <p className="font-display text-xl font-extrabold text-ink tabular-nums leading-tight mt-0.5">
                          {g.id in balances ? formatCurrency(balances[g.id]) : '—'}
                        </p>
                      )}
                      {g.accountNumber ? (
                        <p className="text-xs text-gray-500 truncate">
                          <span className="font-bold tracking-[0.04em] tabular-nums">
                            {formatAccountNumber(g.accountNumber)}
                          </span>{' '}
                          · {g.bankName}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-pitch-600">Set up its account →</p>
                      )}
                    </Link>
                    {g.accountNumber && (
                      <button
                        onClick={() =>
                          navigator.clipboard
                            .writeText(g.accountNumber!)
                            .then(() => toast.success(`${g.name} account number copied`))
                        }
                        className="shrink-0 px-2.5 py-1.5 text-xs font-bold text-ink bg-white border border-gray-200 rounded-lg hover:border-ink transition-colors"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
