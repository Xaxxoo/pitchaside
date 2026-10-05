'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { Pagination } from '@/components/pagination';
import { formatCurrency } from '@/lib/api';
import { hq, shortDay } from '@/lib/hq';
import { Chips, LoadError, Pill, SearchBox, Table, TableSkeletonRows, useLoad } from '@/components/hq-ui';

type Tab = 'players' | 'organisers';

const roleLabels: Record<string, string> = {
  super_admin: 'Super admin',
  org_admin: 'Admin',
  member: 'Co-organiser',
  treasurer: 'Treasurer',
};

function PlayersTable({ search }: { search: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => hq.players({ page, search }), [page, search]);

  if (error) return <LoadError message={error} />;
  if (!data) return <TableSkeletonRows />;
  if (data.data.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-12">{search ? `No players match “${search}”.` : 'No players yet.'}</p>;
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      <Table head={['Player', 'Contact', 'Clubs', 'Login', 'First seen', 'Paid', 'Owes']} minWidth={780}>
        {data.data.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 font-bold text-ink">{p.name}</td>
            <td className="px-4 py-3 text-gray-600">
              {p.email ? <p>{p.email}</p> : <p className="text-gray-500">No email — can&apos;t sign in</p>}
              {p.phone && <p className="text-xs tabular-nums">{p.phone}</p>}
            </td>
            <td className="px-4 py-3 text-gray-600">{p.clubs.join(', ')}</td>
            <td className="px-4 py-3">{p.hasLogin ? <Pill tone="good">Set up</Pill> : <Pill>Not yet</Pill>}</td>
            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{shortDay(p.firstSeen)}</td>
            <td className="px-4 py-3 tabular-nums font-semibold text-ink">{formatCurrency(p.paid)}</td>
            <td className="px-4 py-3 tabular-nums text-gray-600">{formatCurrency(p.owed)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} limit={data.meta.limit} onPageChange={setPage} />
    </div>
  );
}

function OrganisersTable({ search }: { search: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => hq.organisers({ page, search }), [page, search]);

  if (error) return <LoadError message={error} />;
  if (!data) return <TableSkeletonRows />;
  if (data.data.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-12">{search ? `No organisers match “${search}”.` : 'No organisers yet.'}</p>;
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      <Table head={['Organiser', 'Club', 'Role', '2FA', 'Joined']} minWidth={680}>
        {data.data.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-3">
              <p className="font-bold text-ink">
                {u.firstName} {u.lastName}
              </p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </td>
            <td className="px-4 py-3">
              {u.role === 'super_admin' ? (
                <span className="text-gray-500">{u.clubName}</span>
              ) : (
                <Link href={`/hq/clubs/${u.clubId}`} className="text-ink hover:text-pitch-600">
                  {u.clubName}
                </Link>
              )}
            </td>
            <td className="px-4 py-3">
              <Pill tone={u.role === 'org_admin' || u.role === 'super_admin' ? 'volt' : 'muted'}>{roleLabels[u.role] ?? u.role}</Pill>
            </td>
            <td className="px-4 py-3">{u.twoFactorEnabled ? <Pill tone="good">On</Pill> : <Pill>Off</Pill>}</td>
            <td className="px-4 py-3 whitespace-nowrap text-gray-600">{shortDay(u.createdAt)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} limit={data.meta.limit} onPageChange={setPage} />
    </div>
  );
}

export default function HqPeoplePage() {
  const [tab, setTab] = useState<Tab>('players');
  const [search, setSearch] = useState('');
  const onSearch = useCallback((term: string) => setSearch(term), []);

  return (
    <>
      <PageHeader eyebrow="HQ" title="People" subtitle="Players are counted once per email address, however many clubs they play for." />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <SearchBox placeholder={tab === 'players' ? 'Search name, email or club' : 'Search name, email or club'} onSearch={onSearch} />
        <Chips
          label="Who to show"
          options={[
            { value: 'players', label: 'Players' },
            { value: 'organisers', label: 'Organisers' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Keyed so each tab and each search starts back on page 1. */}
      {tab === 'players' ? <PlayersTable key={`p-${search}`} search={search} /> : <OrganisersTable key={`o-${search}`} search={search} />}
    </>
  );
}
