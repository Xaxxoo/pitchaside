'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/brand';
import { JerseyBadge } from '@/components/illustrations';
import { getGroupsPaginated, deleteGroup, exportGroupsCsv, formatCurrency, type IGroupWithMembers, type PaginatedResponse } from '@/lib/api';

export default function GroupsPage() {
  const toast = useToast();
  const [groups, setGroups] = useState<IGroupWithMembers[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<IGroupWithMembers | null>(null);

  function fetchGroups(p = page) {
    return getGroupsPaginated(p, 10)
      .then((res) => {
        setGroups(res.data);
        setMeta(res.meta);
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetchGroups(page).finally(() => setLoading(false));
  }, [page]);

  function handlePageChange(p: number) {
    setPage(p);
    setLoading(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    setDeleteTarget(null);
    try {
      await deleteGroup(deleteTarget.id);
      await fetchGroups(page);
      toast.success(`"${name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete group');
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 rounded w-24" />
          <div className="h-24 bg-gray-100 rounded-xl" />
          <div className="h-24 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Group"
        message={`Delete "${deleteTarget?.name}" and all its sessions? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <PageHeader
        eyebrow="Your squads"
        title="Groups"
        subtitle={meta.total > 0 ? `${meta.total} group${meta.total === 1 ? '' : 's'} on the books` : undefined}
        actions={
        <>
          {meta.total > 0 && (
            <button
              onClick={() => exportGroupsCsv().catch(() => toast.error('Export failed'))}
              className="p-2.5 text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-ink hover:border-gray-300 transition-colors"
              title="Export CSV"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
          <Link
            href="/groups/new"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Group
          </Link>
        </>
        }
      />

      {groups.length === 0 && meta.total === 0 ? (
        <EmptyState
          icon="users"
          title="Your first group starts here"
          description="Create a football group to start tracking players, games, and payments."
          actionLabel="Create Group"
          actionHref="/groups/new"
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {groups.map((group) => {
              const memberCount = group.memberships?.length || 0;
              const memberProgress = group.targetPlayers > 0
                ? Math.round((memberCount / group.targetPlayers) * 100)
                : 0;

              return (
                <div key={group.id} className="relative bg-white rounded-2xl shadow-card border border-gray-100 hover:border-gray-200 transition-colors">
                  <Link
                    href={`/groups/${group.id}`}
                    className="block p-4"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-start gap-3 pr-6 min-w-0">
                        <JerseyBadge label={group.name.charAt(0).toUpperCase()} name={group.name} className="w-12 h-12 shrink-0 -mt-0.5" />
                        <div>
                          <h3 className="text-base font-bold text-ink">{group.name}</h3>
                          {group.schedule && (
                            <p className="text-xs text-gray-500 mt-0.5">{group.schedule}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${memberProgress >= 100 ? 'bg-volt-500' : 'bg-pitch-500'}`}
                          style={{ width: `${Math.min(memberProgress, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{memberProgress}% full</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                          </svg>
                          <span className="tabular-nums">{memberCount}/{group.targetPlayers}</span>
                        </span>
                        <span className="font-bold text-ink tabular-nums bg-chalk px-2 py-0.5 rounded-full">{formatCurrency(group.feePerPlayer)} / player</span>
                      </div>
                      <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); setDeleteTarget(group); }}
                    className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-kit-600 transition-colors z-10"
                    title="Delete group"
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
