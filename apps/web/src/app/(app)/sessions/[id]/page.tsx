'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { KeepHyphens } from '@/components/brand';
import { PlayerPaymentRow } from '@/components/player-payment-row';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/toast';
import { getSession, markPaid, waivePayment, bulkMarkPaid, deleteSession, updateSessionStatus, exportSessionPaymentsCsv, sendReminders, formatCurrency, type ISessionWithDetails } from '@/lib/api';
import { PaymentStatus, SessionStatus } from '@pitchaside/shared';
import { Trophy } from '@/components/illustrations';
import { BallSpinner } from '@/components/skeleton';
import { SessionVotingCard } from '@/components/ratings';
import { LineupCard } from '@/components/lineup-card';
import { TeamSheet } from '@/components/team-sheet';
import { prettyTime } from '@/components/player-ui';

type Tab = 'payments' | 'teams' | 'stars';
const TABS: Tab[] = ['payments', 'teams', 'stars'];

/** Shirts shown in the summary card; the rest are a count. */
const SHIRTS = 24;

/** Groups whose period dues cover their games. */
const PERIODIC = ['weekly', 'monthly', 'quarterly', 'annually'];

const statusStyles: Record<string, { bg: string; text: string }> = {
  upcoming: { bg: 'bg-volt-400', text: 'text-ink' },
  completed: { bg: 'bg-white', text: 'text-ink' },
  cancelled: { bg: 'bg-kit-500', text: 'text-white' },
};

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<ISessionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMarking, setBulkMarking] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  // Long squads (30+) made this page endless: payments, teams and stars each get a tab.
  const [tab, setTab] = useState<Tab | null>(null);
  const [filter, setFilter] = useState<'owing' | 'paid' | 'all' | null>(null);
  const [search, setSearch] = useState('');

  const fetchSession = useCallback(() => {
    return getSession(id)
      .then(setSession)
      .catch(() => router.push('/sessions'));
  }, [id, router]);

  useEffect(() => {
    fetchSession().finally(() => setLoading(false));
  }, [fetchSession]);

  // Opening tab: ?tab= if given, else Teams on match day, else Payments.
  useEffect(() => {
    if (!session || tab) return;
    const asked = new URLSearchParams(window.location.search).get('tab');
    const today = new Date().toLocaleDateString('en-CA');
    setTab(
      TABS.includes(asked as Tab)
        ? (asked as Tab)
        : session.status === SessionStatus.UPCOMING && String(session.date).slice(0, 10) === today
          ? 'teams'
          : 'payments',
    );
  }, [session, tab]);

  function chooseTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  }

  async function handleMarkPaid(paymentId: string) {
    setMarkingId(paymentId);
    try {
      await markPaid(paymentId);
      await fetchSession();
      toast.success('Payment marked as paid');
    } catch {
      toast.error('Failed to mark payment');
    } finally {
      setMarkingId(null);
    }
  }

  async function handleWaive(paymentId: string) {
    setMarkingId(paymentId);
    try {
      await waivePayment(paymentId);
      await fetchSession();
      toast.success('Payment waived');
    } catch {
      toast.error('Failed to waive payment');
    } finally {
      setMarkingId(null);
    }
  }

  async function handleBulkMarkPaid() {
    if (selectedIds.size === 0) return;
    setBulkMarking(true);
    try {
      await bulkMarkPaid(Array.from(selectedIds));
      setSelectedIds(new Set());
      await fetchSession();
      toast.success(`${selectedIds.size} payment(s) marked as paid`);
    } catch {
      toast.error('Failed to mark payments');
    } finally {
      setBulkMarking(false);
    }
  }

  function handleToggle(paymentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) next.delete(paymentId);
      else next.add(paymentId);
      return next;
    });
  }

  async function handleDelete() {
    setShowDeleteConfirm(false);
    try {
      await deleteSession(id);
      toast.success('Session deleted');
      router.push('/sessions');
    } catch {
      toast.error('Failed to delete session');
    }
  }

  async function handleStatusChange(status: 'upcoming' | 'completed' | 'cancelled') {
    setUpdatingStatus(true);
    try {
      await updateSessionStatus(id, status);
      await fetchSession();
      toast.success(`Session marked as ${status}`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading || !session) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-20" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
          <div className="h-12 bg-gray-100 rounded-xl" />
          <div className="h-12 bg-gray-100 rounded-xl" />
          <div className="h-12 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  const payments = session.payments || [];
  // Monthly-type groups: a game costs nothing extra; a player has paid for it when their dues
  // for that period are paid, and that's where they're collected.
  const coveredByDues = session.kind !== 'dues' && PERIODIC.includes(session.group?.paymentType ?? '');
  const statusOf = (p: (typeof payments)[number]) =>
    !coveredByDues
      ? p.status
      : p.gamePaid === 'paid'
        ? PaymentStatus.PAID
        : p.gamePaid === 'waived'
          ? PaymentStatus.WAIVED
          : PaymentStatus.PENDING;
  const paidCount = payments.filter((p) => statusOf(p) === PaymentStatus.PAID).length;
  const waivedCount = payments.filter((p) => statusOf(p) === PaymentStatus.WAIVED).length;
  const owingCount = payments.filter((p) => statusOf(p) === PaymentStatus.PENDING).length;
  const pendingPayments = coveredByDues ? [] : payments.filter((p) => p.status === PaymentStatus.PENDING);
  const progress = coveredByDues
    ? payments.length ? Math.round((paidCount / payments.length) * 100) : 0
    : session.targetAmount > 0
      ? Math.round((session.collectedAmount / session.targetAmount) * 100)
      : 0;
  const style = statusStyles[session.status] || { bg: 'bg-gray-100', text: 'text-gray-500' };
  const isGame = session.kind !== 'dues';
  // Unpaid first: with 30+ players the paid ones are noise until everyone's in.
  const shownFilter = filter ?? (owingCount > 0 ? 'owing' : 'all');
  const needle = search.trim().toLowerCase();
  const visible = payments.filter((p) => {
    const st = statusOf(p);
    if (shownFilter === 'owing' && st !== PaymentStatus.PENDING) return false;
    if (shownFilter === 'paid' && st !== PaymentStatus.PAID) return false;
    if (!needle) return true;
    return `${p.player?.firstName ?? ''} ${p.player?.lastName ?? ''}`.toLowerCase().includes(needle);
  });
  const kickoff = session.kickoffTime || session.group?.kickoffTime;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Sessions" />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Session"
        message="Delete this session and all payment records? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Hero card — scoreboard on turf */}
      <div className="relative bg-pitch-800 rounded-[28px] mb-5 text-white overflow-hidden shadow-lift">
        <div className="absolute inset-0 turf-stripes" />
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 400 300" aria-hidden>
          <g stroke="white" strokeOpacity="0.12" strokeWidth="2" fill="none">
            <rect x="12" y="12" width="376" height="276" rx="12" />
            <line x1="12" y1="150" x2="388" y2="150" />
            <circle cx="200" cy="150" r="46" />
          </g>
        </svg>
        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between mb-5 gap-3">
            <div className="min-w-0">
              <p className="text-white/60 text-xs font-semibold">
                {session.kind === 'dues' && session.label
                  ? `${session.label} dues`
                  : `${new Date(session.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}${kickoff ? ` · ${prettyTime(kickoff)}` : ''}`}
              </p>
              <h1 className="font-display text-[28px] leading-[1.05] font-extrabold mt-1 line-clamp-2">
                <KeepHyphens text={session.group?.name || 'Game Session'} />
              </h1>
            </div>
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${style.bg} ${style.text}`}>
              {session.status}
            </span>
          </div>

          {/* Financial summary */}
          <div className="flex items-end justify-between gap-3 mb-3">
            {coveredByDues ? (
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-extrabold tabular-nums">{paidCount}</span>
                <span className="text-white/45 text-sm tabular-nums">/ {payments.length} paid their dues</span>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-extrabold tabular-nums">{formatCurrency(session.collectedAmount)}</span>
                <span className="text-white/45 text-sm tabular-nums">/ {formatCurrency(session.targetAmount)}</span>
              </div>
            )}
            <span className="font-display text-2xl font-extrabold text-volt-300 tabular-nums">{progress}%</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-black/25 rounded-full h-2.5 mb-5">
            <div
              className={`h-2.5 rounded-full animate-progress ${
                progress >= 50 ? 'bg-volt-400' : 'bg-sun-400'
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>

          {/* Squad board — one shirt per player, coloured by payment status */}
          {payments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-4" aria-label="Payment status by player">
              {payments.slice(0, SHIRTS).map((p) => (
                <svg
                  key={p.id}
                  viewBox="0 0 48 48"
                  className="w-7 h-7"
                  aria-label={`${p.player?.firstName ?? 'Player'}: ${statusOf(p)}`}
                >
                  <title>{`${p.player?.firstName ?? 'Player'} — ${statusOf(p)}`}</title>
                  <path
                    d="M14 6 L19 4 Q24 8 29 4 L34 6 L45 13 L40 22 L35 19 L35 44 L13 44 L13 19 L8 22 L3 13 Z"
                    fill={statusOf(p) === PaymentStatus.PAID ? '#d4f53c' : statusOf(p) === PaymentStatus.WAIVED ? 'rgba(255,255,255,0.25)' : 'transparent'}
                    stroke={statusOf(p) === PaymentStatus.PENDING ? '#ffc93c' : 'transparent'}
                    strokeWidth="2.5"
                    strokeDasharray={statusOf(p) === PaymentStatus.PENDING ? '4 3' : undefined}
                    strokeLinejoin="round"
                  />
                  <text x="24" y="34" textAnchor="middle" fontSize="15" fontWeight="800" fill={statusOf(p) === PaymentStatus.PAID ? '#0f1a14' : 'rgba(255,255,255,0.8)'}>
                    {p.player?.firstName?.charAt(0) ?? '?'}
                  </text>
                </svg>
              ))}
              {payments.length > SHIRTS && (
                <span className="text-xs font-bold text-white/70 tabular-nums">+{payments.length - SHIRTS}</span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-white/70">
              <span className="w-2 h-2 rounded-full bg-volt-400" />
              <span className="font-bold text-white tabular-nums">{paidCount}</span> paid
            </span>
            <span className="flex items-center gap-1.5 text-white/70">
              <span className="w-2 h-2 rounded-full border-2 border-dashed border-sun-400" />
              <span className="font-bold text-white tabular-nums">{owingCount}</span> {coveredByDues ? 'not paid' : 'pending'}
            </span>
            {waivedCount > 0 && (
              <span className="flex items-center gap-1.5 text-white/70">
                <span className="w-2 h-2 rounded-full bg-white/30" />
                <span className="font-bold text-white tabular-nums">{waivedCount}</span> waived
              </span>
            )}
          </div>
        </div>
      </div>

      {payments.length > 0 && owingCount === 0 && (
        <div className="flex items-center gap-4 bg-volt-300 border-2 border-ink shadow-sticker rounded-3xl p-4 mb-5">
          <Trophy className="w-20 h-auto shrink-0" />
          <div>
            <p className="font-display text-lg font-extrabold text-ink leading-tight">Full-time! Everyone&apos;s settled up.</p>
            <p className="text-xs text-ink/70 mt-1">No chasing needed for this one.</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 items-center">
        {session.status !== SessionStatus.COMPLETED && (
          <button
            onClick={() => handleStatusChange('completed')}
            disabled={updatingStatus}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Complete
          </button>
        )}
        {session.status !== SessionStatus.UPCOMING && (
          <button
            onClick={() => handleStatusChange('upcoming')}
            disabled={updatingStatus}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-ink bg-white border border-gray-200 rounded-xl hover:border-ink disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            Reopen
          </button>
        )}
        <button
          onClick={async () => {
            setSendingReminders(true);
            try {
              const result = await sendReminders(id);
              toast.success(
                result.missed
                  ? `Reminder pushed to ${result.sent} — ${result.missed} don't have notifications on yet`
                  : `Reminder pushed to ${result.sent} player${result.sent === 1 ? '' : 's'}`,
              );
            } catch {
              toast.error('Failed to send reminders');
            } finally {
              setSendingReminders(false);
            }
          }}
          disabled={sendingReminders}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-ink bg-white border border-gray-200 rounded-xl hover:border-ink disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {sendingReminders ? 'Sending...' : 'Remind'}
        </button>
        <button
          onClick={() => exportSessionPaymentsCsv(id).catch(() => toast.error('Export failed'))}
          className="p-2.5 ml-auto text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-ink transition-colors"
          title="Export CSV"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        {session.status !== SessionStatus.CANCELLED && (
          <button
            onClick={() => handleStatusChange('cancelled')}
            disabled={updatingStatus}
            className="p-2.5 text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-kit-600 hover:border-kit-400 transition-colors"
            title="Cancel session"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-2.5 text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-kit-600 hover:border-kit-400 transition-colors"
          title="Delete session"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tabs: payments / teams / stars */}
      {isGame && (
        <div className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 mb-4 bg-chalk/95 backdrop-blur">
          <div className="flex p-1 bg-white border border-gray-200 rounded-2xl" role="tablist">
            {([
              ['payments', coveredByDues ? 'Dues' : 'Payments', owingCount ? `${owingCount} to pay` : null],
              ['teams', 'Teams', null],
              ['stars', 'Stars', null],
            ] as [Tab, string, string | null][]).map(([t, name, note]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => chooseTab(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                  tab === t ? 'bg-ink text-volt-300' : 'text-gray-500 hover:text-ink'
                }`}
              >
                {name}
                {note && <span className={`block text-[10px] font-semibold ${tab === t ? 'text-white/60' : 'text-kit-600'}`}>{note}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {isGame && tab === 'teams' && (
        <>
          {session.status === SessionStatus.UPCOMING && <TeamSheet sessionId={id} onChange={fetchSession} />}
          {session.status !== SessionStatus.CANCELLED && (
            <div id="lineup" className="scroll-mt-20">
              <LineupCard sessionId={id} />
            </div>
          )}
        </>
      )}

      {isGame && tab === 'stars' && session.status !== SessionStatus.CANCELLED && (
        <SessionVotingCard sessionId={id} groupName={session.group?.name ?? 'Game'} />
      )}

      {(!isGame || tab === 'payments') && (
        <>
      {/* Payment tracker */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-ink">Payment tracker</h2>
        {pendingPayments.length > 0 && (
          <button
            onClick={() => {
              if (selectedIds.size > 0) {
                handleBulkMarkPaid();
              } else {
                setSelectedIds(new Set(pendingPayments.map((p) => p.id)));
              }
            }}
            disabled={bulkMarking}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 disabled:opacity-50 transition-colors"
          >
            {bulkMarking ? (
              <>
                <BallSpinner className="w-4 h-4" />
                Marking...
              </>
            ) : selectedIds.size > 0 ? (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Mark {selectedIds.size} Paid
              </>
            ) : (
              'Select All'
            )}
          </button>
        )}
      </div>

      {payments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {([
            ['owing', coveredByDues ? 'Not paid' : 'To pay', owingCount],
            ['paid', 'Paid', paidCount],
            ['all', 'All', payments.length],
          ] as const).map(([f, name, n]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold tabular-nums ${
                shownFilter === f ? 'bg-ink text-volt-300' : 'bg-white border border-gray-200 text-gray-600 hover:border-ink'
              }`}
            >
              {name} · {n}
            </button>
          ))}
          {payments.length > 12 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a player"
              aria-label="Find a player"
              className="flex-1 min-w-[140px] px-3 py-1.5 border border-gray-200 rounded-full text-xs focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
          )}
        </div>
      )}
      {payments.length > 0 && visible.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-6">
          {needle ? `No one called “${search.trim()}”.` : shownFilter === 'owing' ? 'Everyone has paid. 🎉' : 'Nobody here yet.'}
        </p>
      )}

      {coveredByDues && payments.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-1">
            This group collects {session.group?.paymentType} dues, so the game costs nothing extra. A player has paid for it when
            their dues for that period are paid —{' '}
            <Link href={`/groups/${session.groupId}`} className="font-bold text-pitch-600 hover:text-pitch-800">
              collect them on the group
            </Link>
            .
          </p>
          {visible.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 shadow-card px-4 py-3">
              <span className="text-sm font-semibold text-ink truncate">
                {p.player ? `${p.player.firstName} ${p.player.lastName}` : 'Unknown Player'}
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${
                  statusOf(p) === PaymentStatus.PAID
                    ? 'bg-volt-300 text-ink'
                    : statusOf(p) === PaymentStatus.WAIVED
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-kit-500/15 text-kit-600'
                }`}
              >
                {statusOf(p) === PaymentStatus.PAID ? 'Dues paid' : statusOf(p) === PaymentStatus.WAIVED ? 'Waived' : 'Dues not paid'}
              </span>
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No payments yet"
          description="Payments are auto-generated when a session is created from a group with members."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((payment) => (
            <PlayerPaymentRow
              key={payment.id}
              playerName={
                payment.player
                  ? `${payment.player.firstName} ${payment.player.lastName}`
                  : 'Unknown Player'
              }
              amount={payment.amount}
              status={payment.status}
              viaTransfer={payment.source === 'transfer'}
              onMarkPaid={() => handleMarkPaid(payment.id)}
              onWaive={() => handleWaive(payment.id)}
              loading={markingId === payment.id}
              selected={selectedIds.has(payment.id)}
              onToggle={() => handleToggle(payment.id)}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
