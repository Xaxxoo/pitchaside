'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { Pagination } from '@/components/pagination';
import { formatCurrency } from '@/lib/api';
import { hq, compactNaira, dayTime, type TransferStatus } from '@/lib/hq';
import { Chips, LoadError, Pill, Table, TableSkeletonRows, Tile, initialParam, useLoad } from '@/components/hq-ui';

type Filter = TransferStatus | '';

const statusMeta: Record<TransferStatus, { label: string; tone: 'good' | 'bad' | 'muted' }> = {
  matched: { label: 'Matched', tone: 'good' },
  assigned: { label: 'Assigned by hand', tone: 'good' },
  unmatched: { label: 'Unmatched', tone: 'bad' },
  ignored: { label: 'Ignored', tone: 'muted' },
  other: { label: 'Not a player', tone: 'muted' },
};

const statuses = Object.keys(statusMeta) as TransferStatus[];

export default function HqMoneyPage() {
  const [status, setStatus] = useState<Filter>(() => statuses.find((s) => s === initialParam('status')) ?? '');
  const [page, setPage] = useState(1);

  const { data, error, loading } = useLoad(() => hq.money({ page, status }), [page, status]);

  const countFor = (s: TransferStatus) => data?.byStatus.find((b) => b.status === s)?.count ?? 0;
  const allCount = data?.byStatus.reduce((sum, b) => sum + b.count, 0) ?? 0;
  const unmatched = data?.byStatus.find((b) => b.status === 'unmatched');

  return (
    <>
      <PageHeader
        eyebrow="HQ"
        title="Money"
        subtitle="What clubs have collected, and every transfer into a group account."
      />

      {error ? (
        <LoadError message={error} />
      ) : !data ? (
        <TableSkeletonRows />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile
              tone="volt"
              label="Collected, all time"
              value={compactNaira(data.summary.collected)}
              sub={`${formatCurrency(data.summary.byTransfer)} by transfer · ${formatCurrency(data.summary.byHand)} marked by hand`}
            />
            <Tile label="Still owed" value={compactNaira(data.summary.outstanding)} sub="Pending, excluding cancelled games" />
            <Tile label="Free" value={compactNaira(data.summary.waived)} sub="Played free, by the organiser" />
            <Tile
              label="Unmatched transfers"
              value={(unmatched?.count ?? 0).toLocaleString()}
              sub={unmatched?.count ? `${formatCurrency(unmatched.amount)} waiting for an organiser` : 'All transfers accounted for'}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-bold text-ink">Bank transfers</h2>
            <Chips<Filter>
              label="Transfer status"
              options={[
                { value: '', label: 'All', count: allCount },
                ...statuses.map((s) => ({ value: s, label: statusMeta[s].label, count: countFor(s) })),
              ]}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
          </div>

          {data.transfers.data.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12 bg-white rounded-3xl border border-dashed border-gray-300">
              {status ? `No ${statusMeta[status].label.toLowerCase()} transfers.` : 'No transfers have come in yet.'}
            </p>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>
              <Table head={['Received', 'From', 'Amount', 'Group', 'Status']} minWidth={760}>
                {data.transfers.data.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{dayTime(t.receivedAt)}</td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{t.senderName ?? 'Unknown sender'}</p>
                      {t.narration && <p className="text-xs text-gray-500 break-words max-w-xs">{t.narration}</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink whitespace-nowrap">{formatCurrency(t.amount)}</td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{t.groupName ?? '—'}</p>
                      {t.clubId && (
                        <Link href={`/admin/clubs/${t.clubId}`} className="text-xs text-gray-500 hover:text-pitch-600">
                          {t.clubName}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={statusMeta[t.status].tone}>{statusMeta[t.status].label}</Pill>
                    </td>
                  </tr>
                ))}
              </Table>
              <Pagination
                page={data.transfers.meta.page}
                totalPages={data.transfers.meta.totalPages}
                total={data.transfers.meta.total}
                limit={data.transfers.meta.limit}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
