'use client';

import { PitchHomeRow } from '@/components/home/pitch-row';
import { NotifyPrompt } from '@/components/notify';
import { Avatar } from '@/components/ratings';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  getGroups,
  getSessions,
  getSessionVoting,
  formatCurrency,
  type IGroupWithMembers,
  type ISessionWithDetails,
  type SessionVoting,
} from '@/lib/api';
import { SessionStatus, UserRole } from '@pitchaside/shared';
import { Celebration } from '@/components/illustrations';
import { ErrorView } from '@/components/error-view';
import { NewSessionSheet } from '@/components/new-session-sheet';
import {
  AccountStrip,
  GameCard,
  faceOf,
  NeedsYou,
  daysFromToday,
  featuredGame,
  gameDay,
  gameMoney,
  useGroupMoney,
  type NeedsItem,
} from '@/components/money-card';
import { UpdatesBell, type Update } from '@/components/home/updates-bell';
import { transferName } from '@/components/home/transfers-sheet';
import { closeTime } from '@/components/ratings';
import { GroupSwitch } from '@/components/group-switch';
import { DidYouKnow } from '@/components/onboarding/did-you-know';
import { MatchDayNews } from '@/components/home/match-day-news';
import { GroupSettingsSheet } from '@/components/group/group-settings';
import { useCurrentGroup } from '@/lib/current-group';
import { moneyHref } from '@/lib/money-href';

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
    title: 'Schedule a game',
    description: 'Players say they’re in from the game link, and pay once they’ve played.',
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
  // Groups didn't load: say so, rather than greeting an organiser as if they had none.
  const [failed, setFailed] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  // Several groups: the one picked in the switch (remembered across the app); until then, the one playing soonest.
  const { groupId: picked, setGroupId: setPicked } = useCurrentGroup();
  const [voting, setVoting] = useState<{ sessionId: string; data: SessionVoting } | null>(null);
  const router = useRouter();
  // Treasurers can look but not change anything.
  const canManage = user?.role !== UserRole.TREASURER;

  // The PitchAside team doesn't run a club — their home is HQ.
  useEffect(() => {
    if (user?.role === UserRole.SUPER_ADMIN) router.replace('/admin');
  }, [user, router]);

  const loadAll = () => {
    setFailed(false);
    setLoading(true);
    Promise.all([getGroups(), getSessions()])
      .then(([g, s]) => {
        setGroups(g);
        setSessions(s);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };
  useEffect(loadAll, []);

  // Default to the group whose game is soonest (a game still being settled counts as now).
  const soonest = useMemo(() => {
    let best: { id: string; days: number } | null = null;
    for (const g of groups) {
      const game = featuredGame(sessions, g.id);
      if (!game) continue;
      const days = Math.abs(daysFromToday(game.date));
      if (!best || days < best.days) best = { id: g.id, days };
    }
    return best?.id ?? groups[0]?.id ?? null;
  }, [groups, sessions]);
  const groupId = picked && groups.some((g) => g.id === picked) ? picked : soonest;
  const group = groups.find((g) => g.id === groupId) ?? null;
  const game = group ? (featuredGame(sessions, group.id) ?? null) : null;
  const money = useGroupMoney(group?.id ?? null, game?.id ?? null);
  const liveGame = money.game ?? game;
  // The group's next game after the one on the card (the card stays on the last game while it's settled and voted on).
  const nextGame =
    sessions
      .filter((s) => s.groupId === groupId && s.id !== game?.id && s.status === SessionStatus.UPCOMING && s.kind !== 'dues' && daysFromToday(s.date) >= 0)
      .sort((a, b) => gameDay(a.date).getTime() - gameDay(b.date).getTime())[0] ?? null;

  // The vote worth chasing: the latest game played in the last week.
  const voteGame = useMemo(() => {
    if (!groupId) return null;
    return (
      sessions
        .filter((s) => s.groupId === groupId && s.kind !== 'dues' && s.status !== SessionStatus.CANCELLED)
        .filter((s) => {
          const d = daysFromToday(s.date);
          return d <= 0 && d >= -7;
        })
        .sort((a, b) => gameDay(b.date).getTime() - gameDay(a.date).getTime())[0] ?? null
    );
  }, [sessions, groupId]);
  useEffect(() => {
    if (!voteGame) return;
    getSessionVoting(voteGame.id)
      .then((data) => setVoting({ sessionId: voteGame.id, data }))
      .catch(() => {});
  }, [voteGame]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-40" />
          <div className="h-8 bg-gray-200 rounded w-56" />
          <div className="h-10 bg-gray-100 rounded-full w-48" />
          <div className="h-[150px] bg-gray-200 rounded-[28px]" />
          <div className="h-[300px] bg-gray-200 rounded-[28px]" />
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <ErrorView
        fullScreen={false}
        eyebrow="No signal"
        title="Couldn’t load your groups"
        message="Check your connection and try again. Your money and games are safe."
        onRetry={loadAll}
        homeHref="/groups"
        homeLabel="Go to groups"
      />
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
            Get started
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  // An organiser without BVN and NIN can't open the account yet: the banner asks for those, and the
  // account strip waits, so home shows one prompt for one problem, the step that comes first.
  const needsIdentity =
    !!user && (user.role === UserRole.ORG_ADMIN || user.role === UserRole.SUPER_ADMIN) && (!user.bvn || !user.nin) && groups.length > 0;
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── Needs you: only things there's something to do about ──
  const needs: NeedsItem[] = [];
  if (group && money.billing && money.billing.unmatchedTransfers > 0) {
    const n = money.billing.unmatchedTransfers;
    needs.push({
      key: 'unmatched',
      href: moneyHref(group.id),
      title: `${n} payment${n === 1 ? '' : 's'} with no name yet`,
      detail: 'Pick who paid so their due clears',
      tone: 'kit',
      icon: <span className="font-display text-base font-extrabold">₦</span>,
    });
  }
  // Sent more than they owed: nothing happens with it until the organiser says what it was for.
  const extraMembers = (group?.memberships ?? []).filter((m) => Number(m.extra ?? 0) > 0);
  if (group && extraMembers.length > 0) {
    const total = extraMembers.reduce((n, m) => n + Number(m.extra), 0);
    const names = extraMembers.map((m) => m.player.nickname || m.player.firstName);
    needs.push({
      key: 'extra',
      faces: extraMembers.map((m) => faceOf(m.player)),
      href: moneyHref(group.id, { extra: true }),
      title: `${formatCurrency(total)} extra money to sort`,
      detail: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''} sent more than they owed`,
      tone: 'sun',
      icon: <span className="font-display text-base font-extrabold">₦</span>,
    });
  }
  if (liveGame) {
    const { owing, coveredByDues } = gameMoney(liveGame);
    if (owing.length > 0) {
      const names = owing.map((p) => p.player?.nickname || p.player?.firstName).filter(Boolean) as string[];
      const when = gameDay(liveGame.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      needs.push({
        key: 'owing',
        faces: owing.filter((p) => p.player).map((p) => faceOf(p.player!)),
        href: `/sessions/${liveGame.id}?tab=payments`,
        title: `${owing.length} still to pay for ${when}`,
        detail:
          names.slice(0, 3).join(', ') +
          (names.length > 3 ? ` +${names.length - 3}` : '') +
          (!coveredByDues && Number(owing[0]?.amount) > 0 ? ` · ${formatCurrency(Number(owing[0].amount))} each` : ''),
        tone: 'sun',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ),
      });
    }
  }
  if (voting && voteGame && voting.sessionId === voteGame.id && voting.data.open) {
    const v = voting.data;
    const closes = v.closesAt ? closeTime(v.closesAt) : 'soon';
    needs.push({
      key: 'vote',
      href: `/sessions/${voteGame.id}?tab=stars`,
      title: `Game ended · vote open until ${closes}`,
      detail: `${v.ballots} of ${v.squadSize} have voted. It closes early once everyone who came has.`,
      tone: 'volt',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
      ),
    });
  }
  const newMembers = (group?.memberships ?? []).filter(
    (m) => Date.now() - new Date(m.joinedAt).getTime() < 7 * 86_400_000,
  );
  const squadHref = group ? `/squad?group=${group.id}` : '/squad';
  if (group && newMembers.length > 0) {
    const names = newMembers.map((m) => m.player.nickname || m.player.firstName);
    needs.push({
      key: 'new',
      faces: newMembers.map((m) => faceOf(m.player)),
      href: squadHref,
      title: `${newMembers.length} joined this week`,
      detail: names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : ''),
      tone: 'sky',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
        </svg>
      ),
    });
  }

  // The bell: everything that needs them, then what's happened lately (money in, new players).
  const toneIcon: Record<NeedsItem['tone'], string> = {
    kit: 'bg-kit-500 text-white',
    sun: 'bg-sun-400 text-ink',
    volt: 'bg-volt-300 text-ink',
    sky: 'bg-sky-300 text-ink',
  };
  const bellNeeds: Update[] = needs
    .filter((n) => n.key !== 'new')
    .map((n) => ({ key: n.key, href: n.href, title: n.title, detail: n.detail, icon: n.icon, iconCls: toneIcon[n.tone] }));
  const bellLatest: Update[] = [
    ...(money.transfers ?? [])
      .filter((t) => t.status !== 'ignored' && t.status !== 'unmatched')
      .slice(0, 6)
      .map((t) => ({
        key: `t-${t.id}`,
        href: group ? moneyHref(group.id, { transfer: t.id }) : '/money',
        title: `${formatCurrency(t.amount)} from ${transferName(t)}`,
        detail: new Date(t.receivedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
        icon: <span className="font-display text-base font-extrabold">₦</span>,
        iconCls: 'bg-volt-300 text-ink',
        at: new Date(t.receivedAt).getTime(),
      })),
    ...newMembers.map((m) => ({
      key: `m-${m.id}`,
      href: squadHref,
      title: `${m.player.nickname || `${m.player.firstName} ${m.player.lastName}`} joined`,
      detail: group?.name,
      icon: <Avatar name={`${m.player.firstName} ${m.player.lastName}`} photoKey={m.player.photoKey} className="w-9 h-9 text-xs" />,
      iconCls: 'bg-sky-300 text-ink overflow-hidden',
      at: new Date(m.joinedAt).getTime(),
    })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-pitch-600">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-[26px] leading-tight font-extrabold text-ink mt-0.5">
            {greeting}, {user?.firstName || 'there'}
          </h1>
        </div>
        <UpdatesBell needs={bellNeeds} latest={bellLatest} />
      </div>
      {/* Banner: stays until BVN/NIN are saved; the reasons are in Settings and the sign-in sheet */}
      {needsIdentity && (
        <Link
          href="/settings#identity"
          className="press mb-3 block rounded-2xl bg-sun-400/20 border border-sun-400/40 p-3.5 hover:border-sun-400 transition-colors"
        >
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-sun-400 text-ink flex items-center justify-center shrink-0 text-lg font-extrabold" aria-hidden>!</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">Add your BVN and NIN</span>
              <span className="block text-xs text-gray-600 mt-0.5">Players can’t pay you in the app until then.</span>
            </span>
          </span>
          {/* Looks like the button it is, and says where it goes */}
          <span className="mt-3 flex items-center justify-between gap-2 min-h-11 rounded-xl bg-white px-3.5 text-sm font-bold text-ink shadow-card">
            Add them in Settings
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
        </Link>
      )}

      {showNewGame && (
        <NewSessionSheet
          groups={group ? [group, ...groups.filter((g) => g.id !== group.id)] : groups}
          onClose={() => setShowNewGame(false)}
        />
      )}
      {/* Whose money and game this is: the group switch, shared with the rest of the app */}
      {groups.length > 0 && (
        <div className="mb-3">
          <GroupSwitch
            groups={groups}
            currentId={groupId}
            onPick={setPicked}
            canManage={canManage}
            onGroupsChanged={() => getGroups().then(setGroups).catch(() => {})}
          />
        </div>
      )}

      {/* Today: the money in one strip, then this week's game (it changes through the week) */}
      {group && (
        <>
          <AccountStrip group={group} money={money} canManage={canManage} identityFirst={needsIdentity} />
          <GameCard
            className="mt-3"
            group={group}
            money={money}
            gameFallback={game}
            canManage={canManage}
            onScheduleGame={() => setShowNewGame(true)}
            vote={voting && voting.sessionId === liveGame?.id ? voting.data : null}
            next={nextGame}
            onGameEnded={(id) => setSessions((all) => all.map((s) => (s.id === id ? { ...s, status: SessionStatus.COMPLETED } : s)))}
          />
        </>
      )}

      {/* Notifications on by default: one tap, once, for a phone that hasn't allowed them */}
      <div className="mb-3">
        <NotifyPrompt side="organiser" />
      </div>
      {/* Once, for groups made before match-day settings: where to set bibs and the timer */}
      {group && canManage && <MatchDayNews group={group} onSetUp={() => setSettingUp(true)} />}
      {settingUp && group && (
        <GroupSettingsSheet
          group={group}
          onClose={() => setSettingUp(false)}
          onSaved={() => getGroups().then(setGroups).catch(() => {})}
          onDeleted={() => getGroups().then(setGroups).catch(() => {})}
        />
      )}

      {/* Only what the two cards above don't already show; the bell keeps the full list */}
      <NeedsYou items={needs.filter((n) => !['unmatched', 'owing'].includes(n.key)).slice(0, 2)} />

      {/* Pitches: their own if they list any, else the ones ready to book */}
      <PitchHomeRow owner className="mt-4" />

      {/* Now and then: a "Did you know?" that fits what's going on today */}
      {group && canManage && (
        <DidYouKnow
          side="organiser"
          className="mt-4"
          context={{
            owing: needs.some((n) => n.key === 'owing') ? 1 : 0,
            unnamed: money.billing?.unmatchedTransfers ?? 0,
            noAccount: money.billing ? !money.billing.account : !group.accountNumber,
            voteOpen: needs.some((n) => n.key === 'vote'),
          }}
        />
      )}

    </div>
  );
}
