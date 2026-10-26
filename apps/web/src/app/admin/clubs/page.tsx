'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { Pagination } from '@/components/pagination';
import { formatCurrency } from '@/lib/api';
import { hq, shortDay, type ClubSort } from '@/lib/hq';
import { Chips, LoadError, SearchBox, Table, TableSkeletonRows, initialParam, useLoad } from '@/components/hq-ui';

const sorts: { value: ClubSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'collected', label: 'Most collected' },
  { value: 'outstanding', label: 'Most owed' },
  { value: 'players', label: 'Most players' },
];

export default function HqClubsPage() {
  const [sort, setSort] = useState<ClubSort>(() => sorts.find((s) => s.value === initialParam('sort'))?.value ?? 'newest');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, error, loading } = useLoad(() => hq.clubs({ page, search, sort }), [page, search, sort]);

  const onSearch = useCallback((term: string) => {
    setSearch(term);
    setPage(1);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="HQ"
        title="Clubs"
        subtitle={data ? `${data.meta.total.toLocaleString()} club${data.meta.total === 1 ? '' : 's'}` : 'Every organisation on PitchAside'}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <SearchBox placeholder="Search club or organiser" onSearch={onSearch} />
        <Chips
          label="Sort clubs"
          options={sorts}
          value={sort}
          onChange={(v) => {
            setSort(v);
            setPage(1);
          }}
        />
      </div>

      {error ? (
        <LoadError message={error} />
      ) : !data ? (
        <TableSkeletonRows />
      ) : data.data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">{search ? `No clubs match “${search}”.` : 'No clubs have signed up yet.'}</p>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <Table head={['Club', 'Organiser', 'Groups', 'Players', 'Games', 'Last game', 'Collected', 'Owed']} minWidth={860}>
            {data.data.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clubs/${c.id}`} className="font-bold text-ink hover:text-pitch-600">
                    {c.name}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {[c.state, c.country].filter(Boolean).join(', ') || 'No location'} · joined {shortDay(c.createdAt)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-ink">{c.ownerName ?? '—'}</p>
                  <p className="text-xs text-gray-500">{c.ownerEmail}</p>
                </td>
                <td className="px-4 py-3 tabular-nums">{c.groups}</td>
                <td className="px-4 py-3 tabular-nums">{c.players}</td>
                <td className="px-4 py-3 tabular-nums">{c.games}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{c.lastGame ? shortDay(c.lastGame) : '—'}</td>
                <td className="px-4 py-3 tabular-nums font-semibold text-ink">{formatCurrency(c.collected)}</td>
                <td className="px-4 py-3 tabular-nums text-gray-600">{formatCurrency(c.outstanding)}</td>
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
