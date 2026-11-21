"use client";

import type { IGroupWithMembers, ISessionWithDetails } from "@/lib/api";
import { GroupAccountCard, TransfersPanel } from "@/components/group-billing";
import { PayoutsPanel } from "@/components/group-payouts";
import { MoneyCard, useGroupMoney } from "@/components/money-card";
import type { MoneyView } from "@/lib/money-href";

export type { MoneyView };

/**
 * One group's money in one place: the account (or setting it up), then either Money in (payments
 * with no name first, then everything received) or Withdrawals. The Money tab and a group's page
 * both show this, so they can't drift apart.
 */
export function GroupMoney({
  group,
  money,
  sessions,
  canManage,
  view,
  onView,
  focusTransfer,
  onFocusTransfer,
  onRefresh,
  onGroupChanged,
  onAddPlayers,
  onOpenAccount,
}: {
  group: IGroupWithMembers;
  money: ReturnType<typeof useGroupMoney>;
  /** For "what each payment paid for". */
  sessions: ISessionWithDetails[];
  canManage: boolean;
  view: MoneyView;
  onView: (v: MoneyView) => void;
  focusTransfer: string | null;
  onFocusTransfer: (id: string) => void;
  /** Reload transfers and games after a change. */
  onRefresh: () => Promise<void>;
  /** A refund or a matched payment changes members' paid-ahead; hand back the fresh group. */
  onGroupChanged: () => Promise<void>;
  onAddPlayers: () => void;
  onOpenAccount: () => void;
}) {
  const billing = money.billing;
  const unmatched = billing?.unmatchedTransfers ?? 0;
  const members = group.memberships ?? [];

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Show"
        className="mb-4 grid grid-cols-2 p-1 bg-white border border-gray-200 rounded-2xl"
      >
        {(
          [
            { key: "transfers", label: "Money in", badge: unmatched },
            { key: "payouts", label: "Withdrawals", badge: 0 },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            role="radio"
            aria-checked={view === v.key}
            onClick={() => onView(v.key)}
            className={`press min-h-10 rounded-xl text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
              view === v.key
                ? "bg-ink text-volt-300"
                : "text-gray-500 hover:text-ink"
            }`}
          >
            {v.label}
            {v.badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sun-400 text-ink text-[10px] font-extrabold inline-flex items-center justify-center">
                {v.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "transfers" ? (
        <>
          {/* The account: the home's card when there is one, the set-up card when there isn't yet */}
          {billing && !billing.account ? (
            <GroupAccountCard
              groupId={group.id}
              groupName={group.name}
              fee={Number(group.feePerPlayer)}
              billing={billing}
              balance={money.balance?.bankBalance ?? null}
              onChange={money.setBilling}
              onMatchTransfer={onFocusTransfer}
              showLink={false}
            />
          ) : (
            <div className="mb-3">
              <MoneyCard group={group} money={money} onOpenAccount={onOpenAccount} />
            </div>
          )}
          {money.transfers === null ? (
            money.transfersFailed ? (
              <div className="py-10 text-center" role="alert">
                <p className="text-sm text-gray-600">
                  The payments didn’t load.
                </p>
                <button
                  onClick={() => money.reload()}
                  className="mt-2 h-11 px-4 text-sm font-bold text-pitch-700 hover:text-ink"
                >
                  Try again
                </button>
              </div>
            ) : (
              <ul className="space-y-3" aria-busy aria-label="Loading payments">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="h-[92px] rounded-3xl bg-white border border-gray-100 animate-pulse"
                  />
                ))}
              </ul>
            )
          ) : (
            <TransfersPanel
              groupId={group.id}
              fee={Number(group.feePerPlayer)}
              transfers={money.transfers}
              sessions={sessions}
              mockMode={billing?.providerMode === "mock"}
              onRefresh={onRefresh}
              focusId={focusTransfer}
              onAddPlayers={canManage ? onAddPlayers : undefined}
              members={members.map((m) => ({
                playerId: m.player.id,
                name: `${m.player.firstName} ${m.player.lastName}`,
                nickname: m.player.nickname,
                photoKey: m.player.photoKey ?? null,
                credit: Number(m.credit ?? 0),
              }))}
            />
          )}
        </>
      ) : (
        <PayoutsPanel
          groupId={group.id}
          groupName={group.name}
          unsorted={(money.transfers ?? [])
            .filter((t) => t.status === "unmatched")
            .reduce((sum, t) => sum + Number(t.amount), 0)}
          refundable={members
            .filter((m) => Number(m.credit ?? 0) + Number(m.extra ?? 0) > 0)
            .map((m) => ({
              playerId: m.player.id,
              name: `${m.player.firstName} ${m.player.lastName}`,
              credit: Number(m.credit ?? 0),
              extra: Number(m.extra ?? 0),
            }))}
          onRefresh={async () => {
            await onRefresh();
            await onGroupChanged();
          }}
        />
      )}
    </div>
  );
}
