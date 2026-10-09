'use client';

import { useEffect, useState } from 'react';
import { PayIntoCard } from '@/components/account-card';
import { PageTitle, Section, niceDate } from '@/components/player-ui';
import { formatCurrency } from '@/lib/api';
import { getPlayerPayments, type GroupKitty, type PlayerPayments } from '@/lib/player';

export default function PlayerPayPage() {
  const [data, setData] = useState<PlayerPayments | null>(null);

  const load = () => getPlayerPayments().then(setData).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  // Matched straight away: refresh so the due moves to History.
  const onClaimed = (status: 'matched' | 'waiting') => status === 'matched' && load();

  if (!data) {
    return (
      <>
        <PageTitle eyebrow="Money" title="Pay" />
        <div className="space-y-3 animate-pulse">
          <div className="h-24 bg-gray-100 rounded-3xl" />
          <div className="h-44 bg-gray-100 rounded-[28px]" />
        </div>
      </>
    );
  }

  const total = data.owed.reduce((s, o) => s + o.amount, 0);
  const owedGroups = data.groups.filter((g) => data.owed.some((o) => o.groupId === g.id));

  return (
    <>
      <PageTitle eyebrow="Money" title="Pay" />

      <div className={`rounded-3xl px-5 py-4 ${total > 0 ? 'bg-ink text-white' : 'bg-volt-100 border border-volt-300 text-ink'}`}>
        <p className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${total > 0 ? 'text-white/50' : 'text-ink/50'}`}>
          {total > 0 ? 'You owe' : 'Balance'}
        </p>
        <p className="font-display text-3xl font-extrabold tabular-nums">{total > 0 ? formatCurrency(total) : 'All square ✅'}</p>
        {total > 0 && <p className="text-xs text-white/60 mt-1">Put your reference in the transfer narration and it’s marked paid automatically.</p>}
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-6">
      {owedGroups.map((g) => {
        const items = data.owed.filter((o) => o.groupId === g.id);
        return (
          <Section key={g.id} title={g.name}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card divide-y divide-gray-100 mb-3">
              {items.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {o.label ?? `Game · ${niceDate(o.date, { weekday: 'short', day: 'numeric', month: 'short' })}`}
                    </p>
                    {o.paidSoFar > 0 && (
                      <p className="text-xs text-pitch-600 font-semibold">{formatCurrency(o.paidSoFar)} paid so far — this is what&apos;s left</p>
                    )}
                  </div>
                  <span className="font-display text-lg font-extrabold text-ink tabular-nums">{formatCurrency(o.amount)}</span>
                </div>
              ))}
            </div>
            <PayIntoCard
              account={g.account}
              fee={g.feePerPlayer}
              paymentType={g.paymentType}
              reference={g.paymentRef}
              claim={{ groupId: g.id, amount: items.reduce((sum, o) => sum + o.amount, 0) }}
              onClaimed={onClaimed}
            />
          </Section>
        );
      })}

      </div>

      {data.groups.length > 0 && owedGroups.length === 0 && (
        <Section title="Where to pay">
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
            {data.groups.map((g) => (
              <div key={g.id}>
                <p className="text-xs font-bold text-gray-500 mb-1.5">{g.name}</p>
                <PayIntoCard
                  account={g.account}
                  fee={g.feePerPlayer}
                  paymentType={g.paymentType}
                  reference={g.paymentRef}
                  claim={{ groupId: g.id, amount: g.feePerPlayer }}
                  onClaimed={onClaimed}
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.contributions.length > 0 && (
        <Section title="Group kitty">
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
            {data.contributions.map((k) => (
              <KittyCard key={k.groupId} kitty={k} />
            ))}
          </div>
        </Section>
      )}

      <Section title="History">
        {data.paid.length === 0 ? (
          <p className="text-sm text-gray-500 bg-chalk rounded-2xl px-4 py-5 text-center">No payments yet.</p>
        ) : (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100">
            {data.paid.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{p.groupName}</p>
                  <p className="text-xs text-gray-500">
                    {p.label ?? `Game · ${niceDate(p.date, { day: 'numeric', month: 'short' })}`}
                    {p.viaTransfer ? ' · bank transfer' : ''}
                  </p>
                </div>
                <span className="text-right">
                  <span className="block font-display font-extrabold text-ink tabular-nums">{formatCurrency(p.amount)}</span>
                  <span className="block text-[10px] font-bold text-pitch-600">✓ Paid</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

    </>
  );
}

/** What the organiser shares of a group's contributions: progress, and who's paid if names are on. */
function KittyCard({ kitty }: { kitty: GroupKitty }) {
  const pct = kitty.expected > 0 ? Math.min(100, Math.round((kitty.collected / kitty.expected) * 100)) : 0;
  const period = kitty.period
    ? kitty.period.label ?? `Game · ${niceDate(kitty.period.date, { weekday: 'short', day: 'numeric', month: 'short' })}`
    : null;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-ink truncate">{kitty.groupName}</p>
          {period && <p className="text-[11px] font-bold text-gray-500 shrink-0">{period}</p>}
        </div>
        {kitty.total === 0 ? (
          <p className="text-sm text-gray-500 mt-2">Nothing to collect yet.</p>
        ) : (
          <>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink tabular-nums">
              {formatCurrency(kitty.collected)}
              <span className="text-sm font-bold text-gray-500"> of {formatCurrency(kitty.expected)}</span>
            </p>
            <div
              className="mt-2 h-2.5 rounded-full bg-gray-100 overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Collected"
            >
              <div className="h-full rounded-full bg-pitch-600" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              <span className="font-bold text-ink">{kitty.paidCount}</span> of {kitty.total} paid
              {kitty.allTime > 0 && <> · {formatCurrency(kitty.allTime)} collected all-time</>}
            </p>
          </>
        )}
      </div>
      {kitty.players && kitty.players.length > 0 && (
        <ul className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-1.5">
          {kitty.players.map((p, i) => (
            <li
              key={i}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                p.paid ? 'bg-volt-100 text-pitch-800' : 'bg-gray-100 text-gray-500'
              } ${p.me ? 'ring-2 ring-ink' : ''}`}
            >
              <span aria-hidden>{p.paid ? '✓' : '·'}</span>
              {p.me ? 'You' : p.name}
              <span className="sr-only">{p.paid ? ' paid' : ' not paid yet'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
