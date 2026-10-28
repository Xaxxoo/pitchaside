'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/brand';
import { EmptyState } from '@/components/empty-state';
import { GroupSwitch } from '@/components/group-switch';
import { InviteSheet } from '@/components/home/invite-sheet';
import { ICON_PATHS, InviteIcon, icon } from '@/components/icons';
import { GroupSettingsSheet } from '@/components/group/group-settings';
import { GroupSquad } from '@/components/squad/group-squad';
import { GroupTable } from '@/components/squad/group-table';
import { GroupStats, type StatSort } from '@/components/squad/group-stats';
import { getGroupBilling, getGroups, getSessionsPaginated, type GroupBilling, type IGroupWithMembers, type ISessionWithDetails } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCurrentGroup } from '@/lib/current-group';
import { UserRole } from '@pitchaside/shared';

type View = 'players' | 'table' | 'stats';

/**
 * The current group's people: the squad (with each player's card) and the season's table, plus
 * inviting. It follows the group switch; `?group=` (from a link) switches to that group.
 */
export default function SquadPage() {
  const { user } = useAuth();
  const canManage = user?.role !== UserRole.TREASURER;
  const params = useSearchParams();
  const { groupId: current, setGroupId } = useCurrentGroup();
  const [groups, setGroups] = useState<IGroupWithMembers[] | null>(null);
  const [sessions, setSessions] = useState<ISessionWithDetails[]>([]);
  const [billing, setBilling] = useState<GroupBilling | null>(null);
  const asView = (v: string | null): View => (v === 'table' || v === 'stats' ? v : 'players');
  const [view, setView] = useState<View>(asView(params.get('view')));
  const [sort, setSort] = useState<StatSort>((params.get('sort') as StatSort) || 'rating');
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState(false);

  // A link naming a group switches to it, for the whole app, until another group is picked here.
  const [asked, setAsked] = useState(params.get('group'));
  useEffect(() => {
    if (asked) setGroupId(asked);
  }, [asked, setGroupId]);

  useEffect(() => {
    getGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  const groupId = (groups ?? []).some((g) => g.id === (asked ?? current)) ? (asked ?? current) : (groups?.[0]?.id ?? null);
  const group = groups?.find((g) => g.id === groupId) ?? null;

  const loadSessions = useCallback(async () => {
    if (!groupId) return;
    setSessions((await getSessionsPaginated(1, 20, groupId)).data);
  }, [groupId]);
  useEffect(() => {
    setSessions([]);
    loadSessions().catch(() => setSessions([]));
  }, [loadSessions]);
  useEffect(() => {
    setBilling(null);
    if (groupId) getGroupBilling(groupId).then(setBilling).catch(() => {});
  }, [groupId]);

  // The tab (and the Stats ranking) live in the address, so refresh, Back and shared links keep them.
  function pickView(v: View, rankBy?: StatSort) {
    setView(v);
    if (rankBy) setSort(rankBy);
    const q = new URLSearchParams(window.location.search);
    if (v === 'players') q.delete('view');
    else q.set('view', v);
    if (v === 'stats') q.set('sort', rankBy ?? sort);
    else q.delete('sort');
    window.history.replaceState(window.history.state, '', `/squad${q.size ? `?${q}` : ''}`);
    if (rankBy) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!groups) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto animate-pulse space-y-4" aria-busy aria-label="Loading the squad">
        <div className="h-7 bg-gray-200 rounded w-24" />
        <div className="h-10 bg-gray-100 rounded-full w-48" />
        <div className="h-12 bg-gray-100 rounded-2xl" />
        <div className="h-80 bg-gray-100 rounded-3xl" />
      </div>
    );
  }

  const memberCount = group?.memberships?.length ?? 0;
  // Still building the squad (fewer players than places in a game): inviting is the main job here.
  const recruiting = !!group && memberCount < group.targetPlayers;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Squad"
        subtitle="Your players, their table and their stats."
        actions={
          // Editing the group in plain sight, not only inside the group switch
          group && canManage ? (
            <button
              onClick={() => setEditing(true)}
              aria-haspopup="dialog"
              aria-label={`Edit group ${group.name}: name, pitch, day, kick-off, fee`}
              className="press shrink-0 inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full bg-white border border-gray-200 text-sm font-bold text-ink hover:border-ink"
            >
              {icon(ICON_PATHS.pencil)}
              <span aria-hidden>Edit group</span>
            </button>
          ) : undefined
        }
      />
      {!group ? (
        <EmptyState icon="users" title="No groups yet" description="Create a group, then invite your players to it." actionLabel="Create a group" actionHref="/groups/new" />
      ) : (
        <>
          <div className="-mt-2 mb-4 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <GroupSwitch
                groups={groups}
                currentId={group.id}
                canManage={canManage}
                onGroupsChanged={() => getGroups().then(setGroups).catch(() => {})}
                onPick={(id) => {
                  setGroupId(id);
                  setAsked(null);
                  window.history.replaceState(window.history.state, '', `/squad${view !== 'players' ? `?view=${view}` : ''}`);
                }}
              />
            </div>
            {billing && (
              <button
                onClick={() => setShowInvite(true)}
                aria-haspopup="dialog"
                className={`press shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-bold transition-colors ${
                  recruiting ? 'bg-volt-400 text-ink hover:bg-volt-300' : 'bg-white border border-gray-200 text-ink shadow-card hover:border-ink'
                }`}
              >
                <InviteIcon />
                Invite
              </button>
            )}
          </div>
          {editing && (
            <GroupSettingsSheet
              group={group}
              onClose={() => setEditing(false)}
              onSaved={() => getGroups().then(setGroups).catch(() => {})}
              onDeleted={() => getGroups().then(setGroups).catch(() => {})}
            />
          )}
          {showInvite && billing && (
            <InviteSheet group={group} billing={billing} canManage={canManage} onBilling={setBilling} onClose={() => setShowInvite(false)} />
          )}

          <div role="radiogroup" aria-label="Show" className="mb-4 grid grid-cols-3 p-1 bg-white border border-gray-200 rounded-2xl">
            {(
              [
                { key: 'players', label: `Players ${memberCount}` },
                { key: 'table', label: 'Table' },
                { key: 'stats', label: 'Stats' },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                role="radio"
                aria-checked={view === v.key}
                onClick={() => pickView(v.key)}
                className={`press min-h-10 rounded-xl text-[13px] font-bold tabular-nums transition-colors ${
                  view === v.key ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === 'players' ? (
            <GroupSquad
              key={group.id}
              group={group}
              sessions={sessions}
              billing={billing}
              canManage={canManage}
              onGroupChanged={(fresh) => setGroups((list) => (list ?? []).map((g) => (g.id === fresh.id ? fresh : g)))}
              onPaymentsChanged={() => loadSessions().catch(() => {})}
              startAdding={params.get('add') === '1'}
            />
          ) : view === 'table' ? (
            <GroupTable groupId={group.id} groupName={group.name} onSeeAll={(s) => pickView('stats', s)} />
          ) : (
            <GroupStats
              groupId={group.id}
              sort={sort}
              onSort={(s) => pickView('stats', s)}
            />
          )}
        </>
      )}
    </div>
  );
}
