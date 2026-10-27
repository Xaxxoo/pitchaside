'use client';

import { use, useState } from 'react';
import { BackButton } from '@/components/back-button';
import { PageHeader } from '@/components/brand';
import { Sheet } from '@/components/sheet';
import { formatCurrency } from '@/lib/api';
import { hq, actionLabel, compactNaira, dayTime, shortDay, type GroupDiagnostics } from '@/lib/hq';
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

  const [diagGroupId, setDiagGroupId] = useState<string | null>(null);
  const [diagData, setDiagData] = useState<GroupDiagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  function openDiag(groupId: string) {
    setDiagGroupId(groupId);
    setDiagData(null);
    setDiagError(null);
    setDiagLoading(true);
    hq.groupDiagnostics(groupId)
      .then(setDiagData)
      .catch((err: Error) => setDiagError(err.message))
      .finally(() => setDiagLoading(false));
  }

  function closeDiag() {
    setDiagGroupId(null);
    setDiagData(null);
    setDiagError(null);
  }

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
                      <button
                        type="button"
                        onClick={() => openDiag(g.id)}
                        className="mt-1 text-[11px] font-bold text-pitch-600 hover:text-pitch-800 transition-colors"
                      >
                        Diagnose
                      </button>
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
              <p className="text-sm text-gray-500">No activity recorded.</p>
            ) : (
              <ul className="space-y-3">
                {club.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="text-ink">
                      <span className="font-semibold">{a.actor ?? 'Someone'}</span> · {actionLabel(a.action)}
                    </p>
                    <p className="text-xs text-gray-500">{dayTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {diagGroupId && (
        <Sheet titleId="diag-title" onClose={closeDiag} align="left">
          <h2 id="diag-title" className="text-lg font-bold text-ink mb-4">
            Group diagnostics
          </h2>

          {diagLoading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-20 bg-gray-100 rounded-2xl" />
              <div className="h-20 bg-gray-100 rounded-2xl" />
              <div className="h-20 bg-gray-100 rounded-2xl" />
            </div>
          )}

          {diagError && <LoadError message={diagError} />}

          {diagData && (
            <div className="space-y-5">
              {/* Group header */}
              <p className="text-sm text-gray-500">
                <span className="font-bold text-ink">{diagData.group.name}</span>
                {diagData.group.accountNumber && (
                  <> &middot; <span className="tabular-nums">{diagData.group.accountNumber}</span> ({diagData.group.bankName})</>
                )}
              </p>

              {/* Balance tiles */}
              <div className="grid grid-cols-2 gap-2">
                <Tile
                  label="Bank balance"
                  tone="volt"
                  value={typeof diagData.balance.bankBalance === 'number' ? compactNaira(diagData.balance.bankBalance) : diagData.balance.bankBalance}
                />
                <Tile label="Available" value={compactNaira(diagData.balance.available)} />
                <Tile label="Total in" value={compactNaira(diagData.balance.ledgerIn)} />
                <Tile label="Total out" value={compactNaira(diagData.balance.ledgerOut)} />
              </div>

              {/* Payout stats */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Payout stats</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="good">{diagData.payoutStats.completedPayouts} completed</Pill>
                  <Pill tone="bad">{diagData.payoutStats.failedPayouts} failed</Pill>
                  <Pill tone="warn">{diagData.payoutStats.processingPayouts} processing</Pill>
                  <Pill tone="muted">{diagData.payoutStats.pendingPayouts} pending</Pill>
                </div>
              </div>

              {/* Recent payouts */}
              {diagData.recentPayouts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Recent payouts</h3>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-xs text-left" style={{ minWidth: 460 }}>
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-gray-500">Status</th>
                          <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-gray-500">Amount</th>
                          <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-gray-500">Beneficiary</th>
                          <th className="pb-2 font-bold uppercase tracking-wider text-gray-500">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {diagData.recentPayouts.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2 pr-3">
                              <Pill tone={p.status === 'completed' ? 'good' : p.status === 'failed' ? 'bad' : 'muted'}>
                                {p.status}
                              </Pill>
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-ink">{formatCurrency(p.amount)}</td>
                            <td className="py-2 pr-3 text-ink max-w-[140px] truncate">{p.beneficiaryName}</td>
                            <td className="py-2 whitespace-nowrap text-gray-500">{dayTime(p.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Show error messages for failed payouts */}
                  {diagData.recentPayouts.filter((p) => p.errorMessage).map((p) => (
                    <p key={p.id} className="mt-1 text-xs text-kit-600">
                      <span className="font-bold">{p.beneficiaryName}:</span> {p.errorMessage}
                    </p>
                  ))}
                </div>
              )}

              {/* Recent transfers */}
              {diagData.recentTransfers.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Recent transfers</h3>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-xs text-left" style={{ minWidth: 380 }}>
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-gray-500">Status</th>
                          <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-gray-500">Amount</th>
                          <th className="pb-2 pr-3 font-bold uppercase tracking-wider text-gray-500">Sender</th>
                          <th className="pb-2 font-bold uppercase tracking-wider text-gray-500">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {diagData.recentTransfers.map((t) => (
                          <tr key={t.id}>
                            <td className="py-2 pr-3">
                              <Pill tone={t.status === 'matched' ? 'good' : t.status === 'unmatched' ? 'bad' : 'muted'}>
                                {t.status}
                              </Pill>
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-ink">{formatCurrency(t.amount)}</td>
                            <td className="py-2 pr-3 text-ink max-w-[140px] truncate">{t.senderName}</td>
                            <td className="py-2 whitespace-nowrap text-gray-500">{dayTime(t.receivedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Members */}
              {diagData.members.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Members ({diagData.members.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {diagData.members.map((m) => (
                      <li key={m.playerId} className="flex items-center justify-between text-xs">
                        <span className="text-ink font-medium truncate mr-2">{m.name}</span>
                        <span className="flex gap-2 shrink-0 tabular-nums text-gray-500">
                          {m.credit > 0 && <span className="text-pitch-600">+{formatCurrency(m.credit)}</span>}
                          {m.extra > 0 && <span className="text-amber-600">{formatCurrency(m.extra)} extra</span>}
                          {m.waiting > 0 && <span className="text-kit-600">{formatCurrency(m.waiting)} waiting</span>}
                          {m.credit === 0 && m.extra === 0 && m.waiting === 0 && <span>—</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
