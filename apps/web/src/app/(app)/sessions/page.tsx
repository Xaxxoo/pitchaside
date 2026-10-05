'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/brand';
import { isVotingOpen } from '@/components/ratings';
import { getSessionsPaginated, getGroups, deleteSession, formatCurrency, type ISessionWithDetails, type IGroupWithMembers, type PaginatedResponse } from '@/lib/api';
import { SessionStatus, UserRole } from '@pitchaside/shared';
import { NewSessionSheet } from '@/components/new-session-sheet';
import { prettyTime } from '@/components/player-ui';
import { useAuth } from '@/lib/auth';

const statusFilters = [
  { label: 'All', value: '' },
  { label: 'Upcoming', value: SessionStatus.UPCOMING },
  { label: 'Completed', value: SessionStatus.COMPLETED },
  { label: 'Cancelled', value: SessionStatus.CANCELLED },
];

const statusStyles: Record<string, string> = {
  upcoming: 'bg-volt-300 text-ink',
  completed: 'bg-ink text-white',
  cancelled: 'bg-kit-500/15 text-kit-600',
};

export default function SessionsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role !== UserRole.TREASURER;
  const [showNewGame, setShowNewGame] = useState(false);
  const [sessions, setSessions] = useState<ISessionWithDetails[]>([]);
  const [groups, setGroups] = useState<IGroupWithMembers[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ISessionWithDetails | null>(null);

  function fetchData(p = page) {
    return Promise.all([getSessionsPaginated(p, 10), getGroups()])
      .then(([res, g]) => {
        setSessions(res.data);
        setMeta(res.meta);
        setGroups(g);
      })
      .catch(() => {});
  }

  useEffect(() => {
    setLoading(true);
    fetchData(page).finally(() => setLoading(false));
  }, [page]);

  function handlePageChange(p: number) {
    setPage(p);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    try {
      await deleteSession(deleteTarget.id);
      await fetchData(page);
      toast.success('Session deleted');
    } catch {
      toast.error('Failed to delete session');
    }
  }

  const filtered = filter ? sessions.filter((s) => s.status === filter) : sessions;
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  if (loading && sessions.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-28" />
          <div className="flex gap-2">
            <div className="h-8 bg-gray-100 rounded-full w-14" />
            <div className="h-8 bg-gray-100 rounded-full w-20" />
            <div className="h-8 bg-gray-100 rounded-full w-22" />
          </div>
          <div className="h-28 bg-gray-200 rounded-xl" />
          <div className="h-28 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Session"
        message="Delete this session and all its payment records? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <PageHeader
        eyebrow="Fixtures"
        title="Sessions"
        subtitle={meta.total > 0 ? `${meta.total} match day${meta.total === 1 ? '' : 's'} logged` : undefined}
        actions={
          canManage && groups.length > 0 ? (
            <button
              onClick={() => setShowNewGame(true)}
              className="px-3.5 py-2 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 transition-colors"
            >
              + New game
            </button>
          ) : undefined
        }
      />

      {showNewGame && <NewSessionSheet groups={groups} onClose={() => setShowNewGame(false)} />}

      {/* Filters */}
      <div className="inline-flex gap-1 p-1 mb-5 bg-white border border-gray-200 rounded-2xl overflow-x-auto max-w-full">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-colors ${
              filter === f.value
                ? 'bg-ink text-volt-300'
                : 'text-gray-500 hover:text-ink hover:bg-chalk'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {meta.total === 0 ? (
        <EmptyState
          icon="calendar"
          title="No sessions yet"
          description={
            groups.length > 0
              ? 'Schedule a game and everyone in the group gets a due for it.'
              : 'Create a group first, then schedule its games here.'
          }
          actionLabel={groups.length > 0 ? (canManage ? 'Schedule a game' : undefined) : 'Create a group'}
          onAction={groups.length > 0 && canManage ? () => setShowNewGame(true) : undefined}
          actionHref={groups.length > 0 ? undefined : '/groups/new'}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No sessions match"
          description="Try a different filter to see your sessions."
        />
      ) : (
        <>
          <div className="space-y-2">
            {filtered.map((session) => {
              const group = groupMap.get(session.groupId);
              const progress = session.targetAmount > 0
                ? Math.round((session.collectedAmount / session.targetAmount) * 100)
                : 0;
              const paidCount = session.payments?.filter((p) => p.status === 'paid').length ?? 0;
              const totalCount = session.payments?.length ?? 0;

              return (
                <div key={session.id} className="relative bg-white rounded-2xl shadow-card border border-gray-100 hover:border-gray-200 transition-colors">
                  <Link
                    href={`/sessions/${session.id}`}
                    className="block p-4"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-gray-200 text-center bg-white">
                          <div className={`${session.status === 'cancelled' ? 'bg-gray-400' : 'bg-kit-500'} text-white text-[9px] font-extrabold uppercase tracking-wider py-0.5`}>
                            {new Date(session.date).toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                          <div className="font-display text-lg font-extrabold text-ink leading-7">{new Date(session.date).getDate()}</div>
                        </div>
                        <div>
                          <p className="text-base font-bold text-ink">
                            {group?.name || 'Game'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {session.kind === 'dues' && session.label
                              ? `${session.label} dues`
                              : `${new Date(session.date).toLocaleDateString('en-US', {
                                  weekday: 'long',
                                })}${
                                  (session.kickoffTime || group?.kickoffTime)
                                    ? ` · ${prettyTime(session.kickoffTime || group?.kickoffTime)}`
                                    : ''
                                }`}
                          </p>
                        </div>
                      </div>
                      {isVotingOpen(session) && (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider bg-sun-400 text-ink ml-auto mr-2 whitespace-nowrap">
                          ★ Vote open
                        </span>
                      )}
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider mr-7 ${
                        statusStyles[session.status] || 'bg-gray-100 text-gray-500'
                      }`}>
                        {session.status}
                      </span>
                    </div>

                    {/* Progress bar */}
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
                        <span className="font-bold text-ink">{formatCurrency(session.collectedAmount)}</span> / {formatCurrency(session.targetAmount)}
                      </span>
                      <span className="text-xs font-medium text-gray-500 tabular-nums">
                        {totalCount > 0 ? `${paidCount}/${totalCount} paid` : `${progress}%`}
                      </span>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); setDeleteTarget(session); }}
                    className="absolute top-3.5 right-3 p-1.5 text-gray-300 hover:text-kit-600 transition-colors"
                    title="Delete session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
