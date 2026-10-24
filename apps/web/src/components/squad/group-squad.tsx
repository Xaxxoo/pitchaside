'use client';

import { leftToPay } from '@/lib/game-player';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { kitFor } from '@/components/illustrations';
import { PlusIcon, daysFromToday, gameDay, gameStatusOf } from '@/components/money-card';
import { QuickAddPlayers } from '@/components/group/quick-add-players';
import { PlayerSheet, type MemberDue } from '@/components/group/member-sheet';
import { openWhatsApp, paymentDetailsMessage, pickWhy, whatsappNumber } from '@/lib/whatsapp';
import { useAuth } from '@/lib/auth';
import {
  addMember,
  addMeToGroup,
  formatCurrency,
  getGroup,
  getGroupTable,
  getPlayers,
  type LeagueTable,
  removeMember,
  getLeavingPreview,
  type LeavingPreview,
  type GroupBilling,
  type IGroupWithMembers,
  type ISessionWithDetails,
} from '@/lib/api';
import { PaymentStatus, PaymentType } from '@pitchaside/shared';
import type { IPlayer } from '@pitchaside/shared';
import { InfoTip } from '@/components/info-tip';
import { FilterBar, FilterMenu } from '@/components/filter-menu';
import { Avatar } from '@/components/ratings';

/**
 * A group's squad, about the players: how many, who's coming to the next game, how it's made up
 * (rating, games played, level, who's new), searchable and sortable. Money for a game is on that
 * game's page; each player's own (what they owe, paid ahead) is in their card.
 */
export function GroupSquad({
  group,
  sessions,
  billing,
  canManage,
  onGroupChanged,
  onPaymentsChanged,
}: {
  group: IGroupWithMembers;
  /** The group's recent games, for "who still owes" against the next one. */
  sessions: ISessionWithDetails[];
  billing: GroupBilling | null;
  canManage: boolean;
  onGroupChanged: (g: IGroupWithMembers) => void;
  /** Someone joined or left: the games' payment lists change too. */
  onPaymentsChanged: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const id = group.id;
  const [query, setQuery] = useState('');
  const [memberFilter, setMemberFilter] = useState<'all' | 'in' | 'out' | 'new' | 'fix' | 'none'>('all');
  const [sort, setSort] = useState<'name' | 'rating' | 'games'>('name');
  // Ratings and games played, from the season table: how the squad is made up.
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [tableFailed, setTableFailed] = useState(false);
  useEffect(() => {
    setTableFailed(false);
    getGroupTable(group.id).then(setTable, () => {
      setTable(null);
      setTableFailed(true);
    });
  }, [group.id]);
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  // Players from the organiser's other groups, loaded when "Add player" opens.
  const [allPlayers, setAllPlayers] = useState<IPlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [addingMe, setAddingMe] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  async function reloadGroup() {
    onGroupChanged(await getGroup(id));
    onPaymentsChanged();
  }

  function toggleAdd() {
    if (!showAddMember) getPlayers().then(setAllPlayers).catch(() => setAllPlayers([]));
    setShowAddMember((v) => !v);
  }

  async function handleAddMember() {
    if (!selectedPlayerId) return;
    setAddingMember(true);
    try {
      await addMember(id, { playerId: selectedPlayerId });
      await reloadGroup();
      setSelectedPlayerId('');
      toast.success('Player added');
    } catch {
      toast.error('The player wasn’t added. Try again.');
    } finally {
      setAddingMember(false);
    }
  }

  /** The organiser plays too: add their own player record to this group. */
  async function handleAddMe() {
    setAddingMe(true);
    try {
      await addMeToGroup(id);
      await reloadGroup();
      toast.success("You're in the squad");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add you to the group");
    } finally {
      setAddingMe(false);
    }
  }

  async function handleRemoveMember(playerId: string, playerName: string) {
    const first = playerName.split(' ')[0];
    // Said before it happens, from the server: the games still to come they come off, and money that goes with them.
    let ahead: LeavingPreview;
    try {
      ahead = await getLeavingPreview(id, playerId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t check their games and money. Try again.');
      return;
    }
    const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
    const lines = [
      ahead.games > 0
        ? `${first} comes off this group and the ${ahead.games === 1 ? 'game' : `${ahead.games} games`} still to come. Games already played stay in the table and history.`
        : `${first} comes off this group’s list. Games already played stay in the table and history.`,
      ahead.held > 0.001 ? `${first} has ${formatCurrency(ahead.held)} with the group.` : null,
      ahead.byTransfer > 0.001 ? `${first} paid ${formatCurrency(ahead.byTransfer)} by transfer for games still to come.` : null,
      ahead.dropped > 0.001
        ? `Removing ${first} drops ${formatCurrency(ahead.dropped)} from the group’s books. To give it back, ${
            ahead.byTransfer > 0.001 ? `first take ${first} off those games, then ` : ''
          }send it with Send money.`
        : null,
      ...ahead.cash.map((c) => `${first} paid ${formatCurrency(c.amount)} in cash for ${day(c.date)}. Give it back yourself.`),
    ].filter(Boolean);
    setConfirm({
      title: `Remove ${playerName}?`,
      message: lines.join(' '),
      confirmLabel: ahead.dropped > 0.001 ? 'Remove anyway' : 'Remove',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await removeMember(id, playerId, ahead.dropped > 0.001);
          onGroupChanged(await getGroup(id));
          toast.success(`${playerName} removed`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'They weren’t removed. Try again.');
        }
      },
    });
  }


  const memberIds = new Set(group.memberships?.map((m) => m.player.id) || []);
  const availablePlayers = allPlayers.filter((p) => !memberIds.has(p.id));
  const memberCount = group.memberships?.length || 0;
  const myEmail = user?.email.trim().toLowerCase();
  const imAMember = group.memberships?.some((m) => m.player.email?.trim().toLowerCase() === myEmail);
  const offerMe = canManage && !!user && !imAMember;

  // What each member's row says about money: the next game (or this period's dues, for groups
  // that collect monthly/weekly), so "who still owes" reads straight off the list.
  const perGame = group.paymentType === PaymentType.PER_SESSION;
  const nextDue = perGame
    ? sessions
        .filter((s) => s.kind !== 'dues' && s.status === 'upcoming' && daysFromToday(s.date) >= 0)
        .sort((a, b) => gameDay(a.date).getTime() - gameDay(b.date).getTime())[0]
    : sessions
        .filter((s) => s.kind === 'dues' && s.status !== 'cancelled')
        .sort((a, b) => gameDay(b.date).getTime() - gameDay(a.date).getTime())
        .find((s) => daysFromToday(s.date) <= 0);
  const dueLabel = nextDue
    ? nextDue.kind === 'dues' && nextDue.label
      ? `${nextDue.label} dues`
      : gameDay(nextDue.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
    : '';
  const dueOf = (playerId: string): MemberDue => {
    if (!nextDue) return null;
    const p = nextDue.payments?.find((x) => x.playerId === playerId);
    if (!p) return group.requireRsvp ? { label: dueLabel, state: 'out', amount: 0 } : null;
    // Didn't come: off the game, owes nothing.
    if (p.attendance === 'no_show') return { label: dueLabel, state: 'out', amount: 0 };
    const st = gameStatusOf(p);
    return {
      label: dueLabel,
      state: st === PaymentStatus.PAID ? 'paid' : st === PaymentStatus.WAIVED ? 'waived' : 'owes',
      amount: leftToPay(p),
      paidSoFar: p.paidSoFar ?? 0,
    };
  };
  // Who's coming: the next game, whatever the group pays by. Money for it lives on the game page.
  const nextGame = sessions
    .filter((s) => s.kind !== 'dues' && s.status === 'upcoming' && daysFromToday(s.date) >= 0)
    .sort((a, b) => gameDay(a.date).getTime() - gameDay(b.date).getTime())[0];
  const nextLabel = nextGame
    ? gameDay(nextGame.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
    : '';
  const inNext = new Set((nextGame?.payments ?? []).filter((p) => p.attendance !== 'no_show').map((p) => p.playerId));
  const stats = new Map((table?.rows ?? []).map((r) => [r.player.id, r]));
  // Joined in the last 30 days: worth a word (the exact date is in their card).
  const isNew = (joinedAt: string) => Date.now() - new Date(joinedAt).getTime() < 30 * 86_400_000;
  const members = (group.memberships ?? []).map((m) => ({
    ...m,
    due: dueOf(m.player.id),
    coming: nextGame ? inNext.has(m.player.id) : null,
    stat: stats.get(m.player.id),
    fresh: isNew(m.joinedAt),
  }));
  // In a squad that's all new, "New" picks no one out: say it only when some are.
  if (members.every((m) => m.fresh)) members.forEach((m) => (m.fresh = false));
  const inCount = members.filter((m) => m.coming).length;
  const outCount = members.filter((m) => m.coming === false).length;
  const newCount = members.filter((m) => m.fresh).length;
  // Who WhatsApp can't reach: a number it can't open (worth fixing), or no number at all.
  const badNumber = (m: (typeof members)[number]) => !!m.player.phone?.trim() && !whatsappNumber(m.player.phone);
  const noNumber = (m: (typeof members)[number]) => !m.player.phone?.trim();
  const fixCount = members.filter(badNumber).length;
  const noneCount = members.filter(noNumber).length;
  const filterOptions = (
    [
      { value: 'all', label: `Everyone · ${memberCount}`, show: true },
      { value: 'in', label: `Coming · ${inCount}`, show: !!nextGame },
      { value: 'out', label: `Not in yet · ${outCount}`, show: !!nextGame && outCount > 0 },
      { value: 'new', label: `New · ${newCount}`, show: newCount > 0 },
      { value: 'fix', label: `Number to fix · ${fixCount}`, show: fixCount > 0 },
      { value: 'none', label: `No number · ${noneCount}`, show: noneCount > 0 && noneCount < memberCount },
    ] as { value: typeof memberFilter; label: string; show: boolean }[]
  ).filter((f) => f.show);
  const filterSays = { all: '', in: `${inCount} coming to ${nextLabel}`, out: `${outCount} not in yet for ${nextLabel}`, new: `${newCount} new in the last 30 days`,
    fix: `${fixCount} with a number WhatsApp can’t open`,
    none: `${noneCount} with no number`,
  }[memberFilter];
  const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const LEVEL: Record<string, string> = { beginner: 'Beginner', average: 'Average', good: 'Good', strong: 'Strong' };
  const q = query.trim().toLowerCase();
  const byName = (a: (typeof members)[number], b: (typeof members)[number]) =>
    `${a.player.firstName} ${a.player.lastName}`.localeCompare(`${b.player.firstName} ${b.player.lastName}`);
  const shown = members
    .filter((m) =>
      memberFilter === 'in'
        ? m.coming
        : memberFilter === 'out'
          ? m.coming === false
          : memberFilter === 'new'
            ? m.fresh
            : memberFilter === 'fix'
              ? badNumber(m)
              : memberFilter === 'none'
                ? noNumber(m)
                : true,
    )
    .filter((m) => !q || `${m.player.firstName} ${m.player.lastName} ${m.player.nickname ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'rating'
        ? (b.stat?.ovr ?? -1) - (a.stat?.ovr ?? -1) || byName(a, b)
        : sort === 'games'
          ? (b.stat?.games ?? 0) - (a.stat?.games ?? 0) || byName(a, b)
          : byName(a, b),
    );
  const rated = members.filter((m) => m.stat && !m.stat.provisional).map((m) => m.stat?.ovr).filter((x): x is number => typeof x === 'number');
  const avgRating = rated.length >= 3 ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length) : null;
  const opened = members.find((m) => m.player.id === openMember);

  return (
    <section aria-labelledby="squad-title">
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        variant="danger"
        onConfirm={confirm?.onConfirm ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />
      {opened && (
        <PlayerSheet
          key={opened.player.id}
          player={opened.player}
          membership={{ joinedAt: opened.joinedAt, credit: Number(opened.credit ?? 0), extra: Number(opened.extra ?? 0), waiting: Number(opened.waiting ?? 0), paymentCode: opened.paymentRef, due: opened.due }}
          canEdit={canManage}
          onClose={() => setOpenMember(null)}
          onSaved={(p) =>
            onGroupChanged({ ...group, memberships: group.memberships?.map((m) => (m.player.id === p.id ? { ...m, player: { ...m.player, ...p } } : m)) })
          }
          onSendDetails={
            billing?.account
              ? () => {
                  const went = openWhatsApp(
                    paymentDetailsMessage({
                      firstName: opened.player.firstName,
                      groupName: group.name,
                      account: billing.account!,
                      code: opened.paymentRef,
                      amount: opened.due?.state === 'owes' ? opened.due.amount : undefined,
                      forWhat: opened.due?.state === 'owes' ? opened.due.label : undefined,
                    }),
                    opened.player.phone,
                  );
                  const why = pickWhy(opened.player.firstName, opened.player.phone, went);
                  if (why) toast.success(why);
                }
              : undefined
          }
          onRemove={() => {
            setOpenMember(null);
            handleRemoveMember(opened.player.id, `${opened.player.firstName} ${opened.player.lastName}`);
          }}
        />
      )}

      {/* Heading row like the home's sections: a plain title and one text action */}
      <div className="flex items-center justify-between">
        <h2 id="squad-title" className="text-base font-bold text-ink">
          Players
        </h2>
        {canManage && (
          <button onClick={toggleAdd} aria-expanded={showAddMember} className="h-11 -my-2 px-1 text-sm font-bold text-pitch-700">
            {showAddMember ? 'Close' : 'Add player'}
          </button>
        )}
      </div>

      {showAddMember && (
        <div className="mt-2 bg-white rounded-3xl border border-gray-100 shadow-card p-4 animate-fade-in-up space-y-4">
          <QuickAddPlayers groupId={id} onAdded={reloadGroup} />
          {availablePlayers.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[13px] font-bold text-ink mb-2">Already one of your players</p>
              <div className="flex gap-2">
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  aria-label="Player to add"
                  className="flex-1 min-w-0 min-h-11 px-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
                >
                  <option value="">Pick from your other groups</option>
                  {availablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={!selectedPlayerId || addingMember}
                  className="shrink-0 min-h-11 px-4 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 disabled:opacity-40 transition-colors"
                >
                  {addingMember ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!group.memberships?.length ? (
        <div className="mt-2">
          <EmptyState
            icon="users"
            title="No one in the group yet"
            description={canManage ? 'Send the invite link to your group chat, or add players yourself.' : 'Players show up here once the organiser adds them or they join with the link.'}
            actionLabel={canManage && !showAddMember ? 'Add players' : undefined}
            onAction={canManage && !showAddMember ? toggleAdd : undefined}
          />
          {offerMe && (
            <div className="mt-3 text-center">
              <button onClick={handleAddMe} disabled={addingMe} className="h-11 px-3 text-sm font-bold text-pitch-700 disabled:opacity-50">
                {addingMe ? 'Adding you…' : 'Playing too? Add yourself'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* The squad at a glance: how many, who's coming, how it's made up */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-card px-3 py-2.5">
              <p className="font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">{memberCount}</p>
              <p className="mt-1 text-[12px] leading-snug text-gray-600">player{memberCount === 1 ? '' : 's'}{newCount ? `, ${newCount} new` : ''}</p>
            </div>
            {nextGame ? (
              <Link href={`/sessions/${nextGame.id}`} className="press rounded-2xl bg-white border border-gray-100 shadow-card px-3 py-2.5 hover:border-gray-300">
                <p className="font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">
                  {inCount}
                  {group.targetPlayers > 0 && <span className="text-[13px] font-bold text-gray-400"> / {group.targetPlayers}</span>}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-gray-600">
                  coming <span className="whitespace-nowrap">{nextLabel} ›</span>
                </p>
              </Link>
            ) : (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-card px-3 py-2.5">
                <p className="font-display text-[22px] leading-none font-extrabold text-gray-400">—</p>
                <p className="mt-1 text-[12px] leading-snug text-gray-600">No game coming up</p>
              </div>
            )}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-card px-3 py-2.5">
              <p className={`font-display text-[22px] leading-none font-extrabold tabular-nums ${avgRating ? 'text-ink' : 'text-gray-400'}`}>{avgRating ?? '—'}</p>
              <p className="mt-1 text-[12px] leading-snug text-gray-600">
                {avgRating ? 'average rating' : 'Ratings settle after 3 games'}{' '}
                <InfoTip label="What's the rating?" align="right">
                  Each player’s rating, from 40 to 99: 40% goals, assists and saves (cards take a little off), 40% votes (Player of the Match, Best VII, awards), 20% team results, compared with the rest of the club. It settles once
                  they’ve played 3 games with scores.
                </InfoTip>
              </p>
            </div>
          </div>

          {/* Search on the left, sort on the right: one row; sort drops its choices under it */}
          <FilterBar className="mt-3">
            {memberCount > 6 ? (
              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search players"
                  aria-label="Search the squad"
                  className="w-full min-h-11 pl-10 pr-3 bg-white border border-gray-200 rounded-2xl text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
                />
              </div>
            ) : (
              <span className="flex-1" />
            )}
            {filterOptions.length > 1 && (
              <FilterMenu
                label="Show players"
                title="Show"
                value={memberFilter}
                onChange={setMemberFilter}
                columns={2}
                options={filterOptions}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25h18M6.75 12h10.5M10.5 18.75h3" />
                  </svg>
                }
              />
            )}
            <FilterMenu
              label="Sort players"
              title="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'name', label: 'Name (A–Z)' },
                { value: 'rating', label: 'Rating' },
                { value: 'games', label: 'Games played' },
              ]}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                </svg>
              }
            />
          </FilterBar>
          {tableFailed && sort !== 'name' && (
            <p className="mt-2 px-1 text-[13px] text-amber-800" role="status">
              Ratings and games didn’t load, so the list is A–Z for now.
            </p>
          )}

          {/* Numbers WhatsApp can't open: said once, a tap away from the list of who */}
          {memberFilter === 'all' && fixCount > 0 && (
            <p className="mt-2 px-1 flex items-center justify-between gap-3 text-[13px] text-kit-600 animate-rise" role="status">
              <span className="min-w-0 font-semibold">
                {fixCount === 1 ? '1 number won’t open WhatsApp' : `${fixCount} numbers won’t open WhatsApp`}
              </span>
              <button onClick={() => setMemberFilter('fix')} className="shrink-0 min-h-11 px-1 font-bold text-ink hover:text-pitch-700">
                See who
              </button>
            </p>
          )}
          {memberFilter !== 'all' && (
            <p className="mt-2 px-1 flex items-center justify-between gap-3 text-[13px] text-gray-600" role="status">
              <span className="min-w-0">
                Showing <b className="text-ink">{filterSays}</b>
              </span>
              <button onClick={() => setMemberFilter('all')} className="shrink-0 min-h-11 px-1 font-bold text-pitch-700 hover:text-ink">
                Show all
              </button>
            </p>
          )}

          {shown.length === 0 && !(offerMe && !q && memberFilter === 'all') ? (
            <p className="mt-6 text-sm text-gray-600 text-center">
              {q
                ? `No one called “${query.trim()}”.`
                : memberFilter === 'in'
                  ? `No one’s said they’re coming to ${nextLabel} yet.`
                  : memberFilter === 'out'
                    ? `Everyone’s coming to ${nextLabel}.`
                    : memberFilter === 'fix'
                      ? 'Every number opens WhatsApp now.'
                      : 'No one here.'}
            </p>
          ) : (
            <ul className="mt-2 bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
              {/* The organiser plays too: a row like "Needs you", not a banner */}
              {offerMe && !q && memberFilter === 'all' && (
                <li>
                  <button
                    onClick={handleAddMe}
                    disabled={addingMe}
                    className="w-full flex items-center gap-3 px-4 min-h-16 py-3 text-left hover:bg-chalk disabled:opacity-60 transition-colors"
                  >
                    <span className="w-10 h-10 rounded-xl bg-volt-300 text-ink flex items-center justify-center shrink-0" aria-hidden>
                      <PlusIcon />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-bold text-ink leading-snug">{addingMe ? 'Adding you…' : 'Add yourself'}</span>
                      <span className="block text-xs text-gray-500 mt-0.5 truncate">If you play in this group too</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-pitch-700">Add me</span>
                  </button>
                </li>
              )}
              {shown.map((m) => {
                const name = `${m.player.firstName} ${m.player.lastName}`;
                const kit = kitFor(name);
                const st = m.stat;
                const level = m.player.level ? LEVEL[m.player.level] : null;
                const detail = [
                  st?.ovr != null ? `Rating ${st.ovr}${st.provisional ? ' (settling)' : ''}` : null,
                  st ? `${st.games} game${st.games === 1 ? '' : 's'}` : null,
                  level,
                  m.role !== 'player' && sentence(m.role),
                ].filter(Boolean) as string[];
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => setOpenMember(m.player.id)}
                      className="w-full flex items-center gap-3 px-4 min-h-16 py-3 text-left hover:bg-chalk transition-colors"
                    >
                      {m.player.photoKey ? (
                        <Avatar name={name} photoKey={m.player.photoKey} className="w-10 h-10" />
                      ) : (
                        <span className={`w-10 h-10 shrink-0 rounded-full ${kit.bg} ${kit.fg} flex items-center justify-center text-sm font-extrabold font-display`} aria-hidden>
                          {m.player.firstName.charAt(0)}
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[15px] font-bold text-ink leading-snug truncate">{name}</span>
                          {m.fresh && <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-volt-300 text-ink">New</span>}
                        </span>
                        <span className="block text-xs text-gray-500 mt-0.5 truncate">
                          {m.player.nickname ? `“${m.player.nickname}”${detail.length ? ' · ' : ''}` : ''}
                          {detail.join(' · ')}
                        </span>
                      </span>
                      {/* Coming to the next game: said in words, not just colour */}
                      {m.coming !== null && (
                        <span
                          className={`shrink-0 text-[11px] font-extrabold px-2 py-1 rounded-full ${m.coming ? 'bg-volt-300 text-ink' : 'bg-chalk text-gray-600'}`}
                        >
                          {m.coming ? 'Coming' : 'Not in yet'}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
