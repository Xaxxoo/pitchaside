'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { KeepHyphens } from '@/components/brand';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { JerseyBadge, kitFor } from '@/components/illustrations';
import { GroupAccountCard, TransfersPanel } from '@/components/group-billing';
import { PayoutsPanel } from '@/components/group-payouts';
import { NewSessionSheet } from '@/components/new-session-sheet';
import { frequencyLabel, frequencyOptions } from '@/lib/billing';
import { LeagueTableView } from '@/components/ratings';
import { ContributionsVisibilityPicker } from '@/components/contributions-visibility';
import { RsvpToggle } from '@/components/rsvp-toggle';
import { useAuth } from '@/lib/auth';
import {
  getGroup,
  getSessions,
  getPlayers,
  addMember,
  addMeToGroup,
  removeMember,
  deleteGroup,
  updateGroup,
  formatCurrency,
  getGroupBalance,
  getGroupBilling,
  getGroupTable,
  getGroupTransfers,
  type BankTransfer,
  type LeagueTable,
  type GroupBilling,
  type IGroupWithMembers,
  type ISessionWithDetails,
} from '@/lib/api';
import { PaymentType } from '@pitchaside/shared';
import type { ContributionsVisibility, IPlayer } from '@pitchaside/shared';

const statusStyles: Record<string, string> = {
  upcoming: 'bg-volt-300 text-ink',
  completed: 'bg-ink text-white',
  cancelled: 'bg-kit-500/15 text-kit-600',
};

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [group, setGroup] = useState<IGroupWithMembers | null>(null);
  const [sessions, setSessions] = useState<ISessionWithDetails[]>([]);
  const [allPlayers, setAllPlayers] = useState<IPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<'members' | 'sessions' | 'table' | 'transfers' | 'payouts'>(
    initialTab === 'sessions' || initialTab === 'table' || initialTab === 'transfers' || initialTab === 'payouts' ? initialTab : 'members',
  );
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [billing, setBilling] = useState<GroupBilling | null>(null);
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [focusTransfer, setFocusTransfer] = useState<string | null>(searchParams.get('transfer'));
  const [balance, setBalance] = useState<number | null>(null);

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [addingMe, setAddingMe] = useState(false);

  // Create session state
  const [showCreateSession, setShowCreateSession] = useState(false);

  // Edit group state
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    description: '',
    location: '',
    schedule: '',
    kickoffTime: '',
    targetPlayers: 10,
    feePerPlayer: 10,
    paymentType: PaymentType.PER_SESSION as string,
    requireRsvp: false,
    contributionsVisibility: 'private' as ContributionsVisibility,
  });
  const [saving, setSaving] = useState(false);

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'default';
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    Promise.all([getGroup(id), getSessions(id), getPlayers()])
      .then(([g, s, p]) => {
        setGroup(g);
        setSessions(s);
        setAllPlayers(p);
      })
      .catch(() => router.push('/groups'))
      .finally(() => setLoading(false));
    // Billing loads separately so a PulseMFB hiccup never blocks the page.
    getGroupBilling(id).then(setBilling).catch(() => {});
    getGroupBalance(id).then((b) => setBalance(b.available)).catch(() => {});
    getGroupTransfers(id).then(setTransfers).catch(() => {});
    getGroupTable(id).then(setTable).catch(() => {});
  }, [id, router]);

  async function refreshPayments() {
    const [s, t, b, bal] = await Promise.all([
      getSessions(id),
      getGroupTransfers(id),
      getGroupBilling(id),
      getGroupBalance(id).catch(() => null),
    ]);
    setSessions(s);
    setTransfers(t);
    setBilling(b);
    if (bal) setBalance(bal.available);
  }

  function startEdit() {
    if (!group) return;
    setEditData({
      name: group.name,
      description: group.description || '',
      location: group.location || '',
      schedule: group.schedule || '',
      kickoffTime: group.kickoffTime || '',
      targetPlayers: group.targetPlayers,
      feePerPlayer: group.feePerPlayer,
      paymentType: group.paymentType,
      requireRsvp: !!group.requireRsvp,
      contributionsVisibility: group.contributionsVisibility ?? 'private',
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      await updateGroup(id, {
        name: editData.name,
        description: editData.description || undefined,
        location: editData.location || undefined,
        schedule: editData.schedule || undefined,
        kickoffTime: editData.kickoffTime || undefined,
        targetPlayers: editData.targetPlayers,
        feePerPlayer: editData.feePerPlayer,
        paymentType: editData.paymentType as PaymentType,
        requireRsvp: editData.requireRsvp,
        contributionsVisibility: editData.contributionsVisibility,
      });
      const updated = await getGroup(id);
      setGroup(updated);
      setEditing(false);
      toast.success('Group updated');
      refreshPayments().catch(() => {});
    } catch {
      toast.error('Failed to update group');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup() {
    setConfirm({
      title: 'Delete Group',
      message: `Are you sure you want to delete "${group?.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteGroup(id);
          toast.success('Group deleted');
          router.push('/groups');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete group');
        }
      },
    });
  }

  async function handleAddMember() {
    if (!selectedPlayerId) return;
    setAddingMember(true);
    try {
      await addMember(id, { playerId: selectedPlayerId });
      const updated = await getGroup(id);
      setGroup(updated);
      refreshPayments().catch(() => {});
      setShowAddMember(false);
      setSelectedPlayerId('');
      toast.success('Member added');
    } catch {
      toast.error('Failed to add member');
    } finally {
      setAddingMember(false);
    }
  }

  /** The organiser plays too: add their own player record to this group. */
  async function handleAddMe() {
    setAddingMe(true);
    try {
      await addMeToGroup(id);
      setGroup(await getGroup(id));
      refreshPayments().catch(() => {});
      toast.success("You're in the squad");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add you to the group");
    } finally {
      setAddingMe(false);
    }
  }

  function handleRemoveMember(playerId: string, playerName: string, credit = 0) {
    setConfirm({
      title: 'Remove Member',
      // Their credit is dropped with them, so say how much before it goes.
      message:
        credit > 0
          ? `${playerName} has ${formatCurrency(credit)} credit in this group that hasn't paid a due yet. Removing them drops it from the books, so refund them first if it's owed back. Remove anyway?`
          : `Remove ${playerName} from this group?`,
      confirmLabel: credit > 0 ? 'Remove anyway' : 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await removeMember(id, playerId, credit > 0);
          const updated = await getGroup(id);
          setGroup(updated);
          toast.success(`${playerName} removed`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to remove member');
        }
      },
    });
  }

  if (loading || !group) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-20" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
          <div className="h-10 bg-gray-100 rounded-xl" />
          <div className="h-16 bg-gray-100 rounded-xl" />
          <div className="h-16 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  const memberIds = new Set(group.memberships?.map((m) => m.player.id) || []);
  const availablePlayers = allPlayers.filter((p) => !memberIds.has(p.id));
  const memberCount = group.memberships?.length || 0;
  const myEmail = user?.email.trim().toLowerCase();
  const imAMember = group.memberships?.some((m) => m.player.email?.trim().toLowerCase() === myEmail);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Groups" />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        onConfirm={confirm?.onConfirm ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />

      {/* Header */}
      {editing ? (
        <div className="mb-6 bg-white border border-gray-100 shadow-card rounded-3xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Group Name</label>
            <input
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Description</label>
            <textarea
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              rows={2}
              className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Pitch Location</label>
            <input
              value={editData.location}
              onChange={(e) => setEditData({ ...editData, location: e.target.value })}
              placeholder="e.g. Teslim Balogun Stadium, Surulere"
              className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
          </div>
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Schedule</label>
              <input
                value={editData.schedule}
                onChange={(e) => setEditData({ ...editData, schedule: e.target.value })}
                placeholder="e.g. Every Saturday"
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Kick-off</label>
              <input
                type="time"
                value={editData.kickoffTime}
                onChange={(e) => setEditData({ ...editData, kickoffTime: e.target.value })}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Target Players</label>
              <input
                type="number"
                min={1}
                value={editData.targetPlayers}
                onChange={(e) => setEditData({ ...editData, targetPlayers: Number(e.target.value) })}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Fee per Player</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editData.feePerPlayer}
                onChange={(e) => setEditData({ ...editData, feePerPlayer: Number(e.target.value) })}
                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Payment Type</label>
            <select
              value={editData.paymentType}
              onChange={(e) => setEditData({ ...editData, paymentType: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            >
              {frequencyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <RsvpToggle checked={editData.requireRsvp} onChange={(v) => setEditData({ ...editData, requireRsvp: v })} />
          <ContributionsVisibilityPicker
            value={editData.contributionsVisibility}
            onChange={(v) => setEditData({ ...editData, contributionsVisibility: v })}
          />
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving || !editData.name.trim()}
              className="flex-1 py-2.5 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative mb-6 bg-white rounded-3xl border border-gray-100 shadow-card p-5 overflow-hidden">
          <div className="absolute inset-0 chalk-dots opacity-70 pointer-events-none" />
          <div className="relative flex items-start justify-between mb-4 gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <JerseyBadge label={group.name.charAt(0).toUpperCase()} name={group.name} className="w-16 h-16 shrink-0 -mt-1" />
              <div className="min-w-0">
                <h1 className="text-[28px] leading-tight font-extrabold text-ink"><KeepHyphens text={group.name} /></h1>
                {group.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={startEdit}
                className="p-2.5 text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-ink hover:border-gray-300 transition-colors"
                title="Edit group"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
              </button>
              <button
                onClick={handleDeleteGroup}
                className="p-2.5 text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-kit-600 hover:border-kit-400 transition-colors"
                title="Delete group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {/* Meta pills */}
          <div className="relative flex flex-wrap gap-2 text-xs">
            {group.location && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-chalk border border-gray-200 text-gray-700 font-semibold rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                {group.location}
              </span>
            )}
            {group.schedule && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-chalk border border-gray-200 text-gray-700 font-semibold rounded-full">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {group.schedule}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-chalk border border-gray-200 text-gray-700 font-semibold rounded-full tabular-nums">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              {memberCount}/{group.targetPlayers}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-volt-300 border border-volt-400 text-ink font-bold rounded-full tabular-nums">
              {formatCurrency(group.feePerPlayer)}/player
            </span>
            <span className="px-2.5 py-1 bg-chalk border border-gray-200 text-gray-700 font-semibold rounded-full capitalize">
              {frequencyLabel(group.paymentType)}
            </span>
          </div>
        </div>
      )}

      {!editing && billing && (
        <GroupAccountCard
          groupId={id}
          groupName={group.name}
          fee={Number(group.feePerPlayer)}
          billing={billing}
          balance={balance}
          onChange={setBilling}
          onMatchTransfer={(transferId) => {
            setFocusTransfer(transferId);
            setTab('transfers');
          }}
        />
      )}

      {/* Tabs */}
      <div className="flex p-1 bg-white border border-gray-200 rounded-2xl mb-4">
        <button
          onClick={() => setTab('members')}
          className={`flex-1 px-1 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-colors ${
            tab === 'members' ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
          }`}
        >
          Members<span className="hidden sm:inline"> ({memberCount})</span>
        </button>
        <button
          onClick={() => setTab('sessions')}
          className={`flex-1 px-1 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-colors ${
            tab === 'sessions' ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
          }`}
        >
          {group.paymentType === PaymentType.PER_SESSION ? 'Sessions' : 'Dues'}<span className="hidden sm:inline"> ({sessions.length})</span>
        </button>
        <button
          onClick={() => setTab('table')}
          className={`flex-1 px-1 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-colors ${
            tab === 'table' ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
          }`}
        >
          Table
        </button>
        <button
          onClick={() => setTab('transfers')}
          className={`relative flex-1 px-1 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-colors ${
            tab === 'transfers' ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
          }`}
        >
          Transfers
          {billing && billing.unmatchedTransfers > 0 && (
            <span className="absolute -top-2 right-0 sm:top-1 sm:right-2 min-w-5 h-5 px-1 rounded-full bg-kit-500 text-white text-[10px] font-extrabold flex items-center justify-center">
              {billing.unmatchedTransfers}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('payouts')}
          className={`flex-1 px-1 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap rounded-xl transition-colors ${
            tab === 'payouts' ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
          }`}
        >
          Payouts
        </button>
      </div>

      {tab === 'table' && (table ? <LeagueTableView table={table} /> : <div className="h-40 bg-gray-100 rounded-3xl animate-pulse" />)}

      {tab === 'transfers' && (
        <TransfersPanel
          groupId={id}
          fee={Number(group.feePerPlayer)}
          transfers={transfers}
          sessions={sessions}
          mockMode={billing?.providerMode === 'mock'}
          onRefresh={refreshPayments}
          focusId={focusTransfer}
        />
      )}

      {tab === 'payouts' && (
        <PayoutsPanel
          groupId={id}
          groupName={group.name}
          refundable={(group.memberships ?? [])
            .filter((m) => Number(m.credit ?? 0) > 0)
            .map((m) => ({ playerId: m.player.id, name: `${m.player.firstName} ${m.player.lastName}`, credit: Number(m.credit) }))}
          onRefresh={async () => {
            await refreshPayments();
            // A refund changes the member's credit.
            setGroup(await getGroup(id));
          }}
        />
      )}

      {/* Members Tab */}
      {tab === 'members' && (
        <div>
          {user && !imAMember && (
            <div className="mb-3 flex items-center justify-between gap-3 bg-volt-300/40 border border-volt-400 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">Playing in this group too?</p>
                <p className="text-xs text-gray-600">Add yourself so your dues and games are tracked like everyone else&apos;s.</p>
              </div>
              <button
                onClick={handleAddMe}
                disabled={addingMe}
                className="shrink-0 px-3.5 py-2 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors"
              >
                {addingMe ? 'Adding…' : 'Add me'}
              </button>
            </div>
          )}

          <button
            onClick={() => setShowAddMember(!showAddMember)}
            className="w-full mb-3 py-3 text-sm font-bold text-ink border-2 border-dashed border-gray-300 rounded-2xl hover:border-ink hover:bg-white transition-colors"
          >
            + Add Member
          </button>

          {showAddMember && (
            <div className="bg-white border border-gray-100 shadow-card rounded-3xl p-5 mb-3 space-y-3 animate-fade-in-up">
              {availablePlayers.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No available players.{' '}
                  <Link href="/players/new" className="text-pitch-600 font-medium hover:underline">
                    Register one
                  </Link>
                </p>
              ) : (
                <>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
                  >
                    <option value="">Select a player...</option>
                    {availablePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!selectedPlayerId || addingMember}
                    className="w-full py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors"
                  >
                    {addingMember ? 'Adding...' : 'Add to Group'}
                  </button>
                </>
              )}
            </div>
          )}

          {!group.memberships?.length ? (
            <EmptyState
              icon="users"
              title="No members yet"
              description="Add players to this group so payments can be tracked."
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {group.memberships.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-card hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${kitFor(`${m.player.firstName} ${m.player.lastName}`).bg} ${kitFor(`${m.player.firstName} ${m.player.lastName}`).fg} flex items-center justify-center text-sm font-extrabold font-display`}>
                      {m.player.firstName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">
                        {m.player.firstName} {m.player.lastName}
                      </p>
                      <p className="text-xs text-gray-500">
                        <span className="capitalize">{m.role}</span>
                        {Number(m.credit) > 0 && (
                          <span className="ml-1.5 font-bold text-pitch-600">· {formatCurrency(Number(m.credit))} credit</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleRemoveMember(
                        m.player.id,
                        `${m.player.firstName} ${m.player.lastName}`,
                        Number(m.credit ?? 0)
                      )
                    }
                    className="p-1.5 text-gray-300 hover:text-kit-600 transition-colors"
                    title="Remove member"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {tab === 'sessions' && (
        <div>
          <button
            onClick={() => setShowCreateSession(true)}
            className="w-full mb-3 py-3 text-sm font-bold text-ink border-2 border-dashed border-gray-300 rounded-2xl hover:border-ink hover:bg-white transition-colors"
          >
            + Schedule a game
          </button>
          {showCreateSession && <NewSessionSheet groups={[group]} onClose={() => setShowCreateSession(false)} />}


          {sessions.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No sessions yet"
              description="Create a session to start tracking payments for this group."
            />
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const progress = s.targetAmount > 0
                  ? Math.round((s.collectedAmount / s.targetAmount) * 100)
                  : 0;
                const sStyle = statusStyles[s.status] || 'bg-gray-100 text-gray-500';
                return (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="block bg-white p-4 rounded-2xl border border-gray-100 shadow-card hover:border-gray-300 transition-colors"
                  >
                    <div className="flex justify-between items-center mb-2.5">
                      <p className="text-sm font-bold text-ink">
                        {s.kind === 'dues' && s.label
                          ? `${s.label} dues`
                          : new Date(s.date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                      </p>
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${sStyle}`}>
                        {s.status}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          progress >= 100 ? 'bg-volt-500' :
                          progress >= 50 ? 'bg-pitch-500' :
                          'bg-sun-400'
                        }`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 tabular-nums">
                        {formatCurrency(s.collectedAmount)} / {formatCurrency(s.targetAmount)}
                      </span>
                      <span className="text-xs font-medium text-gray-500 tabular-nums">{progress}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
