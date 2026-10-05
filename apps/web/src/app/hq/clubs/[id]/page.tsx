'use client';

import { use } from 'react';
import { BackButton } from '@/components/back-button';
import { PageHeader } from '@/components/brand';
import { formatCurrency } from '@/lib/api';
import { hq, actionLabel, dayTime, shortDay } from '@/lib/hq';
import { LoadError, Panel, Pill, Table, TableSkeletonRows, Tile, useLoad } from '@/components/hq-ui';

const roleLabels: Record<string, string> = {
  super_admin: 'Super admin',
  org_admin: 'Admin',
  member: 'Co-organiser',
  treasurer: 'Treasurer',
};

const billingLabels: Record<string, string> = {
  per_session: 'per game',
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  annually: 'yearly',
};

const sessionTones = { upcoming: 'volt', completed: 'good', cancelled: 'muted' } as const;

export default function HqClubPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { data: club, error } = useLoad(() => hq.club(params.id), [params.id]);

  if (error) {
    return (
      <>
        <BackButton label="Clubs" />
        <LoadError message={error} />
      </>
    );
  }

  if (!club) {
    return (
      <>
        <BackButton label="Clubs" />
        <TableSkeletonRows rows={5} />
      </>
    );
  }

  return (
    <>
      <BackButton label="Clubs" />
      <PageHeader
        eyebrow="Club"
        title={club.name}
        subtitle={`${[club.state, club.country].filter(Boolean).join(', ') || 'No location set'} · joined ${shortDay(club.createdAt)}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Tile tone="volt" label="Collected" value={formatCurrency(club.collected)} />
        <Tile label="Still owed" value={formatCurrency(club.outstanding)} />
        <Tile label="Players" value={club.players.toLocaleString()} />
        <Tile label="Groups" value={club.groups.length} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div>
            <h2 className="text-base font-bold text-ink mb-2">Groups</h2>
            {club.groups.length === 0 ? (
              <p className="text-sm text-gray-500 bg-white rounded-3xl border border-dashed border-gray-300 p-5">
                This club hasn&apos;t created a group yet.
              </p>
            ) : (
              <Table head={['Group', 'Members', 'Collection account', 'Collected', 'Owed']} minWidth={620}>
                {club.groups.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-ink">{g.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(g.feePerPlayer)} {billingLabels[g.paymentType] ?? g.paymentType}
                      </p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {g.members} / {g.targetPlayers}
                    </td>
                    <td className="px-4 py-3">
                      {g.accountNumber ? (
                        <>
                          <p className="tabular-nums text-ink">{g.accountNumber}</p>
                          <p className="text-xs text-gray-500">{g.bankName}</p>
                        </>
                      ) : (
                        <Pill tone="warn">No account</Pill>
                      )}
                      {g.unmatchedTransfers > 0 && (
                        <p className="mt-1">
                          <Pill tone="bad">{g.unmatchedTransfers} unmatched</Pill>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-ink">{formatCurrency(g.collected)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">{formatCurrency(g.outstanding)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>

          <div>
            <h2 className="text-base font-bold text-ink mb-2">Recent games and dues</h2>
            {club.sessions.length === 0 ? (
              <p className="text-sm text-gray-500 bg-white rounded-3xl border border-dashed border-gray-300 p-5">Nothing scheduled yet.</p>
            ) : (
              <Table head={['Date', 'Group', 'Status', 'Paid', 'Collected']} minWidth={560}>
                {club.sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-ink">{s.kind === 'dues' && s.label ? s.label : shortDay(s.date)}</p>
                      <p className="text-xs text-gray-500">{s.kind === 'dues' ? 'Dues period' : 'Game'}</p>
                    </td>
                    <td className="px-4 py-3 text-ink">{s.groupName}</td>
                    <td className="px-4 py-3">
                      <Pill tone={sessionTones[s.status]}>{s.status}</Pill>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {s.paid} / {s.billed}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-ink">{formatCurrency(s.collectedAmount)}</span>
                      <span className="text-gray-500"> of {formatCurrency(s.targetAmount)}</span>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <Panel title="Organisers">
            <ul className="space-y-3">
              {club.organisers.map((u) => (
                <li key={u.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    {u.phone && <p className="text-xs text-gray-500 tabular-nums">{u.phone}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Pill tone={u.role === 'org_admin' ? 'volt' : 'muted'}>{roleLabels[u.role] ?? u.role}</Pill>
                    {u.twoFactorEnabled && <Pill tone="good">2FA</Pill>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent activity" hint="What this club's organisers have done.">
            {club.activity.length === 0 ? (
              <p className="text-sm text-gray-400">No activity recorded.</p>
            ) : (
              <ul className="space-y-3">
                {club.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="text-ink">
                      <span className="font-semibold">{a.actor ?? 'Someone'}</span> · {actionLabel(a.action)}
                    </p>
                    <p className="text-xs text-gray-400">{dayTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
