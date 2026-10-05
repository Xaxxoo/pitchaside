'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { Pagination } from '@/components/pagination';
import { hq, actionLabel, dayTime } from '@/lib/hq';
import { LoadError, Table, TableSkeletonRows, useLoad } from '@/components/hq-ui';

export default function HqActivityPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => hq.activity({ page, limit: 30 }), [page]);

  return (
    <>
      <PageHeader eyebrow="HQ" title="Activity" subtitle="What organisers are doing across every club, newest first." />

      {error ? (
        <LoadError message={error} />
      ) : !data ? (
        <TableSkeletonRows />
      ) : data.data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12 bg-white rounded-3xl border border-dashed border-gray-300">
          No organiser activity recorded yet.
        </p>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <Table head={['When', 'Who', 'What', 'Club']} minWidth={620}>
            {data.data.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{dayTime(a.createdAt)}</td>
                <td className="px-4 py-3 text-ink">{a.actor ?? 'Unknown'}</td>
                <td className="px-4 py-3 text-ink">{actionLabel(a.action)}</td>
                <td className="px-4 py-3">
                  {a.clubId ? (
                    <Link href={`/hq/clubs/${a.clubId}`} className="text-ink hover:text-pitch-600">
                      {a.clubName}
                    </Link>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            limit={data.meta.limit}
            onPageChange={setPage}
          />
        </div>
      )}
    </>
  );
}
