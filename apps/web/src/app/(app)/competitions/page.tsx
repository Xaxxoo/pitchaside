'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/brand';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { useToast } from '@/components/toast';
import { getCompetitions, deleteCompetition, formatCurrency } from '@/lib/api';
import type { ICompetition } from '@pitchaside/shared';
import { CompetitionStatus, CompetitionFormat, CompetitionScope } from '@pitchaside/shared';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [CompetitionStatus.DRAFT]: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  [CompetitionStatus.REGISTRATION_OPEN]: { label: 'Registration Open', color: 'bg-green-100 text-green-700' },
  [CompetitionStatus.REGISTRATION_CLOSED]: { label: 'Registration Closed', color: 'bg-yellow-100 text-yellow-700' },
  [CompetitionStatus.IN_PROGRESS]: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  [CompetitionStatus.COMPLETED]: { label: 'Completed', color: 'bg-pitch-100 text-pitch-700' },
  [CompetitionStatus.CANCELLED]: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
};

const FORMAT_LABELS: Record<string, string> = {
  [CompetitionFormat.KNOCKOUT]: 'Knockout',
  [CompetitionFormat.LEAGUE]: 'League',
};

const SCOPE_LABELS: Record<string, string> = {
  [CompetitionScope.NATIONWIDE]: 'Nationwide',
  [CompetitionScope.STATE]: 'State',
  [CompetitionScope.CITY]: 'City',
};

export default function CompetitionsPage() {
  const toast = useToast();
  const router = useRouter();
  const [competitions, setCompetitions] = useState<ICompetition[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ICompetition | null>(null);

  function fetchCompetitions(p = page) {
    return getCompetitions(p, 10)
      .then((res) => {
        setCompetitions(res.data);
        setMeta(res.meta);
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetchCompetitions(page).finally(() => setLoading(false));
  }, [page]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    setDeleteTarget(null);
    try {
      await deleteCompetition(deleteTarget.id);
      await fetchCompetitions(page);
      toast.success(`"${name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete competition');
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader
        eyebrow="Tournaments"
        title="Cups"
        actions={
          <Link
            href="/competitions/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Cup
          </Link>
        }
      />

      {competitions.length === 0 ? (
        <EmptyState
          title="No competitions yet"
          description="Create your first cup to start collecting entries and scheduling matches."
          actionLabel="Create Cup"
          onAction={() => router.push('/competitions/new')}
        />
      ) : (
        <>
          <div className="grid gap-3">
            {competitions.map((comp) => {
              const status = STATUS_LABELS[comp.status] ?? { label: comp.status, color: 'bg-gray-100 text-gray-600' };
              return (
                <Link
                  key={comp.id}
                  href={`/competitions/${comp.id}`}
                  className="relative bg-white rounded-2xl shadow-card p-4 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-ink truncate">{comp.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {FORMAT_LABELS[comp.format]} &middot; {SCOPE_LABELS[comp.scope]}
                          {comp.state ? ` &middot; ${comp.state}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {Number(comp.entryFee) > 0 && <span>{formatCurrency(Number(comp.entryFee))} entry</span>}
                        <span>{comp.maxTeams} max teams</span>
                        {comp.startDate && <span>Starts {new Date(comp.startDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                  {comp.status === CompetitionStatus.DRAFT && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget(comp);
                      }}
                      className="absolute top-3 right-12 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                </Link>
              );
            })}
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-lift max-w-sm w-full p-6">
            <h3 className="text-base font-bold text-ink">Delete &ldquo;{deleteTarget.name}&rdquo;?</h3>
            <p className="text-sm text-gray-500 mt-2">This cannot be undone.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
