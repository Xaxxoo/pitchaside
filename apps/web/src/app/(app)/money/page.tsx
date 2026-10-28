'use client';

import { useCallback, useEffect, useState } from 'react';
import { ToCheck } from '@/components/money/to-check';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserRole } from '@pitchaside/shared';
import { PageHeader } from '@/components/brand';
import { EmptyState } from '@/components/empty-state';
import { GroupSwitch } from '@/components/group-switch';
import { AccountDetailsSheet, useGroupMoney } from '@/components/money-card';
import { GroupMoney, type MoneyView } from '@/components/money/group-money';
import { getGroup, getGroups, getSessionsPaginated, type IGroupWithMembers, type ISessionWithDetails } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCurrentGroup } from '@/lib/current-group';

/**
 * The current group's money: the account, payments with no name, money in and withdrawals. It
 * follows the group switch; `?group=` (from a link or a notification) switches to that group.
 */
export default function MoneyPage() {
  const { user } = useAuth();
  const canManage = user?.role !== UserRole.TREASURER;
  const router = useRouter();
  const params = useSearchParams();
  const { groupId: current, setGroupId } = useCurrentGroup();
  const [groups, setGroups] = useState<IGroupWithMembers[] | null>(null);
  const [sessions, setSessions] = useState<ISessionWithDetails[]>([]);
  const [view, setView] = useState<MoneyView>(params.get('view') === 'payouts' ? 'payouts' : 'transfers');
  // A link inside the page can switch the tab too (e.g. "Send it back" opens Withdrawals).
  const askedView = params.get('view');
  useEffect(() => {
    if (askedView === 'payouts') setView('payouts');
  }, [askedView]);
  const [focusTransfer, setFocusTransfer] = useState<string | null>(params.get('transfer'));
  const [showAccount, setShowAccount] = useState(false);

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
  const money = useGroupMoney(group?.id ?? null, null);

  const loadSessions = useCallback(async () => {
    if (!groupId) return;
    setSessions((await getSessionsPaginated(1, 20, groupId)).data);
  }, [groupId]);
  useEffect(() => {
    loadSessions().catch(() => setSessions([]));
  }, [loadSessions]);

  function pickView(v: MoneyView) {
    setView(v);
    const q = new URLSearchParams(window.location.search);
    if (v === 'payouts') q.set('view', 'payouts');
    else q.delete('view');
    window.history.replaceState(window.history.state, '', `/money${q.size ? `?${q}` : ''}`);
  }

  if (!groups) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto animate-pulse space-y-4">
        <div className="h-7 bg-gray-200 rounded w-24" />
        <div className="h-10 bg-gray-100 rounded-full w-48" />
        <div className="h-64 bg-gray-100 rounded-[28px]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader title="Money" subtitle="The group’s account: what came in, who it’s from, and what went out." />
      {!group ? (
        <EmptyState icon="users" title="No groups yet" description="Create a group to open its bank account and collect money." actionLabel="Create a group" actionHref="/groups/new" />
      ) : (
        <>
          <div className="-mt-2 mb-4">
            <GroupSwitch
              groups={groups}
              currentId={group.id}
              canManage={canManage}
              onGroupsChanged={() => getGroups().then(setGroups).catch(() => {})}
              onPick={(id) => {
                setGroupId(id);
                setAsked(null);
                setFocusTransfer(null);
                window.history.replaceState(window.history.state, '', `/money${view === 'payouts' ? '?view=payouts' : ''}`);
              }}
            />
          </div>
          {showAccount && money.billing && <AccountDetailsSheet group={group} billing={money.billing} onClose={() => setShowAccount(false)} />}
          {/* Players who say they've paid: first, it's what needs a decision */}
          <ToCheck key={group.id} groupId={group.id} onChanged={() => void Promise.all([loadSessions(), money.reload()])} />
          <GroupMoney
            group={group}
            money={money}
            sessions={sessions}
            canManage={canManage}
            view={view}
            onView={pickView}
            focusTransfer={focusTransfer}
            onFocusTransfer={setFocusTransfer}
            onRefresh={async () => {
              await Promise.all([loadSessions(), money.reload()]);
            }}
            onGroupChanged={async () => {
              const fresh = await getGroup(group.id);
              setGroups((list) => (list ?? []).map((g) => (g.id === fresh.id ? fresh : g)));
            }}
            onAddPlayers={() => router.push(`/squad?group=${group.id}`)}
            onOpenAccount={() => setShowAccount(true)}
          />
        </>
      )}
    </div>
  );
}
