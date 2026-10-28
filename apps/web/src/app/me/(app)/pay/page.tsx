'use client';

import { PlayerGroupSwitch } from '@/components/player-group-switch';
import { Callout } from '@/components/callout';
import { usePlayerGroup } from '@/lib/player-group';
import { Avatar } from '@/components/ratings';
import { MonthList } from '@/components/money/month-list';
import { PageHeader } from '@/components/brand';
import { useEffect, useState } from 'react';
import { SendCard } from '@/components/account-card';
import { HeldMoneyCard } from '@/components/money/held-money-card';
import { LoadError, Section, niceDate } from '@/components/player-ui';
import { formatCurrency } from '@/lib/api';
import { getPlayerPayments, type GroupKitty, type PlayerPayments } from '@/lib/player';

/** Why the group kept it, said to the player. */
const KEPT_FOR_YOU: Record<string, string> = {
  player_agreed: 'You said the group can keep it',
  player_gave: 'You gave it to the group',
  unreachable: 'Your organiser couldn’t reach you',
  sorted_in_person: 'Sorted out in person',
};

export default function PlayerPayPage() {
  const [data, setData] = useState<PlayerPayments | null>(null);

  const [failed, setFailed] = useState<unknown>(null);
  // The group picked at the top of every tab: its money only, with a line for what's owed elsewhere.
  const [groupId, pickGroup] = usePlayerGroup(data?.groups);
  const load = () =>
    getPlayerPayments()
      .then((d) => {
        setData(d);
        setFailed(null);
      })
      .catch(setFailed);
  useEffect(() => {
    load();
  }, []);
  // Matched straight away: refresh so the due moves to History.
  // Matched or waiting, the card changes (paid, or "waiting for your organiser"): load it again
  const onClaimed = () => load();

  if (!data && failed) {
    return (
      <>
        <PageHeader title="Pay" subtitle="What you owe, where to send it, and what you’ve paid." />
        <LoadError
          what="Your payments"
          error={failed}
          onRetry={() => {
            setFailed(null);
            load();
          }}
        />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Pay" subtitle="What you owe, where to send it, and what you’ve paid." />
        <div className="space-y-3 animate-pulse">
          <div className="h-24 bg-gray-100 rounded-3xl" />
          <div className="h-44 bg-gray-100 rounded-[28px]" />
        </div>
      </>
    );
  }

  // Every figure comes from the server: what to send now, what's for later games, money sent
  // ahead, and money of theirs the organiser has to sort.
  const group = data.groups.find((g) => g.id === groupId) ?? null;
  const inGroup = (id: string | undefined, name: string) => !group || (id ? id === group.id : name === group.name);
  const groups = group ? [group] : data.groups;
  const total = groups.reduce((s, g) => s + g.toPay, 0);
  const later = groups.reduce((s, g) => s + g.later, 0);
  const extra = groups.reduce((s, g) => s + g.extra, 0);
  // What's owed in the groups not picked, so picking one never hides money.
  const elsewhere = group ? data.groups.filter((g) => g.id !== group.id && g.toPay > 0) : [];
  const elsewhereTotal = elsewhere.reduce((s, g) => s + g.toPay, 0);
  // Groups you can pay right now first: money owed with an account to send it to.
  const owedGroups = groups
    .filter((g) => data.owed.some((o) => o.groupId === g.id))
    .sort((a, b) => Number(!!b.account && b.toPay > 0) - Number(!!a.account && a.toPay > 0));
  const sending = groups.filter((g) => g.toPay > 0);
  const kept = (data.keptByGroup ?? []).filter((k) => inGroup(k.groupId, k.groupName));
  const kitties = data.contributions.filter((k) => inGroup(k.groupId, k.groupName));
  const paid = data.paid.filter((p) => inGroup(p.groupId, p.groupName));
  const dueLabel = (o: (typeof data.owed)[number]) => o.label ?? `Game · ${niceDate(o.date, { weekday: 'short', day: 'numeric', month: 'short' })}`;

  return (
    <>
      <PageHeader title="Pay" subtitle="What you owe, where to send it, and what you’ve paid." />
      <PlayerGroupSwitch className="mb-3" groups={data.groups} value={group?.id ?? null} onPick={pickGroup} />

      {/* Where to send it comes first: one card per group that wants money, as each group has its
          own account. The amount and what it's for follow inside the card. */}
      {total === 0 && (
        <div className="flex items-center gap-3 rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-4">
          <span className="w-10 h-10 shrink-0 rounded-full bg-volt-400 text-ink flex items-center justify-center text-lg font-extrabold" aria-hidden>
            ✓
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[22px] leading-tight font-extrabold text-ink">All square</span>
            <span className="block text-[13px] text-gray-600">
              {later > 0 ? 'Nothing to pay yet. Later games are below.' : group ? `Nothing to pay in ${group.name} right now.` : 'Nothing to pay right now.'}
            </span>
          </span>
        </div>
      )}
      {elsewhereTotal > 0 && (
        <button
          onClick={() => pickGroup(elsewhere.length === 1 ? elsewhere[0].id : null)}
          className="press mt-3 mb-3 w-full flex items-center gap-3 min-h-14 rounded-2xl bg-sun-400/20 border border-sun-400/60 px-4 py-2.5 text-left"
        >
          <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-sun-400" aria-hidden />
          <span className="flex-1 min-w-0 text-[14px] leading-snug text-ink">
            Also to pay: <b className="tabular-nums">{formatCurrency(elsewhereTotal)}</b> in {elsewhere.length === 1 ? elsewhere[0].name : `${elsewhere.length} other groups`}
          </span>
          <span className="shrink-0 text-[13px] font-bold text-pitch-700">{elsewhere.length === 1 ? 'See it ›' : 'See all ›'}</span>
        </button>
      )}
      {sending.length > 1 && (
        <p className="mb-2.5 text-[13px] text-gray-600">
          <b className="text-ink tabular-nums">{formatCurrency(total)}</b> to send across {sending.length} groups. Each has its own account, so send each one separately.
        </p>
      )}

      {owedGroups.length > 0 && (
        <div className={`space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 ${total === 0 ? 'mt-3' : ''}`}>
          {owedGroups.map((g) => {
            const mine = data.owed.filter((o) => o.groupId === g.id);
            const line = (o: (typeof data.owed)[number]) => ({ id: o.id, label: dueLabel(o), amount: o.amount, paidSoFar: o.paidSoFar });
            return (
              <SendCard
                key={g.id}
                groupName={g.name}
                account={g.account}
                reference={g.paymentRef}
                fee={g.feePerPlayer}
                paymentType={g.paymentType}
                now={mine.filter((o) => o.now).map(line)}
                later={mine.filter((o) => !o.now).map(line)}
                paidAhead={g.paidAhead}
                claim={g.toPay > 0 ? { groupId: g.id, amount: g.toPay } : undefined}
                onClaimed={onClaimed}
                pending={g.claim}
              />
            );
          })}
        </div>
      )}

      {groups.length > 0 && owedGroups.length === 0 && (
        <Section title="Where to pay">
          <p className="-mt-1 mb-2.5 text-[13px] text-gray-600">For when you next owe for a game.</p>
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
            {groups.map((g) => (
              <SendCard
                key={g.id}
                groupName={g.name}
                account={g.account}
                reference={g.paymentRef}
                fee={g.feePerPlayer}
                paymentType={g.paymentType}
                now={[]}
                paidAhead={g.paidAhead}
              />
            ))}
          </div>
        </Section>
      )}

      {extra > 0 && (
        <div className="mt-3 space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
          {groups
            .filter((g) => g.extra > 0)
            .map((g) => (
              <HeldMoneyCard key={g.id} group={g} showGroup={groups.length > 1} onChanged={load} />
            ))}
        </div>
      )}

      {kept.length > 0 && (
        <Section title="Kept by the group">
          <p className="-mt-1 mb-2.5 text-[13px] text-gray-600">Money of yours your organiser kept for the group. Nobody owes anybody for it now.</p>
          <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100">
            {kept.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-ink truncate">
                    {k.reason === 'other' && k.note ? k.note : KEPT_FOR_YOU[k.reason] ?? 'Kept by the group'}
                  </span>
                  <span className="block text-[13px] text-gray-600 truncate">
                    {k.groupName} · {niceDate(k.date, { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[15px] font-extrabold text-ink tabular-nums">{formatCurrency(k.amount)}</span>
                  <span className="block text-[11px] font-bold text-gray-500">Kept by group</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {kitties.length > 0 && (
        <Section title="Group kitty">
          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
            {kitties.map((k) => (
              <KittyCard key={k.groupId} kitty={k} />
            ))}
          </div>
        </Section>
      )}

      <Section title="History">
        {paid.length === 0 ? (
          <div className="rounded-3xl bg-chalk px-5 py-6 text-center">
            <p className="text-[15px] font-bold text-ink">{group ? `No payments in ${group.name} yet` : 'No payments yet'}</p>
            <p className="mt-1 text-[13px] text-gray-600">Each game you pay for shows here, on the day it was paid.</p>
          </div>
        ) : (
          // Like the organiser's money list: month by month, each day with what went out, and
          // each line says which game it paid for (so an early payment reads as one).
          <MonthList
            items={paid}
            idOf={(p) => p.id}
            dateOf={(p) => p.paidAt ?? p.date}
            amountOf={(p) => p.amount}
            direction="out"
            sticky
            idPrefix="paid-"
          >
            {(p) => (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink truncate">{p.label ?? `Game · ${niceDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' })}`}</p>
                  <p className="text-[13px] text-gray-600 truncate">
                    {p.groupName}
                    {p.viaTransfer ? ' · bank transfer' : ''}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[15px] font-extrabold text-ink tabular-nums">{formatCurrency(p.amount)}</span>
                  <span className="block text-[11px] font-bold text-pitch-700">✓ Paid</span>
                </span>
              </div>
            )}
          </MonthList>
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
              className={`inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs font-semibold ${
                p.paid ? 'bg-volt-100 text-pitch-800' : 'bg-gray-100 text-gray-500'
              } ${p.me ? 'ring-2 ring-ink' : ''}`}
            >
              <Avatar name={p.name} photoKey={p.photoKey} className={`w-6 h-6 text-[9px] ${p.paid ? '' : 'opacity-60'}`} />
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
