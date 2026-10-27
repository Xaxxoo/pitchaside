'use client';

import { useEffect, useId, useState } from 'react';
import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { UserRole } from '@pitchaside/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { btnPrimary } from '@/components/buttons';
import { EmptyState } from '@/components/empty-state';
import { PayeeCard } from '@/components/group-payee';
import { SendMoneyModal, type RefundableMember } from '@/components/send-money-modal';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { PAYOUT, PAYOUT_PICKS } from '@/lib/money-categories';
import { MonthList } from '@/components/money/month-list';
import { FilterBar, FilterMenu } from '@/components/filter-menu';
import { InfoTip } from '@/components/info-tip';
import {
  cancelPayout,
  formatCurrency,
  getGroupBalance,
  getGroupPayouts,
  getNigerianBanks,
  getTransferPinStatus,
  setPayoutCategory,
  setTransferPin,
  type GroupBalance,
  type NigerianBank,
  type OutgoingTransfer,
  type PayoutCategory,
} from '@/lib/api';

const statusStyles: Record<OutgoingTransfer['status'], string> = {
  pending: 'bg-sun-400/25 text-amber-800',
  processing: 'bg-sky-300/30 text-sky-800',
  completed: 'bg-volt-300 text-ink',
  failed: 'bg-kit-500/15 text-kit-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

/** Plain words for each state, so nothing relies on the colour alone. */
const statusWords: Record<OutgoingTransfer['status'], string> = {
  pending: 'Waiting',
  processing: 'Checking with bank',
  completed: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/**
 * What a payout's note says, in plain words. Older failures were saved with the bank's raw reply
 * ("Payrep MFB transfer failed (400): Transfer request timed out…"): read the same way as new ones.
 */
function payoutNote(p: OutgoingTransfer) {
  const raw = p.errorMessage ?? '';
  const bank = p.beneficiaryBankName;
  // Saved with the longer wording used before 28 Oct: shown in the short one.
  if (raw.startsWith('The bank timed out sending this')) return `${bank ?? 'The bank'} didn't answer. Nothing was sent. Try again shortly.`;
  if (raw.startsWith("The bank couldn't find that account")) return `Account not found${bank ? ` at ${bank}` : ''}. Check the number. Nothing was sent.`;
  if (raw.startsWith('Not enough in the group account for this transfer')) return 'Not enough in the group account. Nothing was sent.';
  const old = raw.match(/^The bank didn't send this[^.]*\. No money left the account\.(?: \((.*)\))?$/);
  if (old) return `Didn’t go through${bank ? ` to ${bank}` : ''}${old[1] ? ` (${old[1].replace(/\.$/, '').slice(0, 60)})` : ''}. Nothing was sent.`;
  if (!raw.startsWith('Payrep MFB')) return raw;
  if (/timed? ?out|timeout/i.test(raw)) return `${bank ?? 'The bank'} didn't answer. Nothing was sent. Try again shortly.`;
  const reason = raw.replace(/^Payrep MFB [^:]*\(\d+\): /, '').replace(/\.$/, '').slice(0, 60);
  return `Didn’t go through${bank ? ` to ${bank}` : ''}${reason ? ` (${reason})` : ''}. Nothing was sent.`;
}

type PayoutFilter = 'all' | 'sent' | 'waiting' | 'failed';
const FILTERS: [PayoutFilter, string, OutgoingTransfer['status'][]][] = [
  ['all', 'All', []],
  ['sent', 'Sent', ['completed']],
  ['waiting', 'Waiting', ['pending', 'processing']],
  ['failed', 'Didn’t go', ['failed', 'cancelled']],
];

/** Picking what a withdrawal was for, after it's gone. */
function CategorySheet({
  payout,
  busy,
  onPick,
  onClose,
}: {
  payout: OutgoingTransfer;
  busy: boolean;
  onPick: (c: PayoutCategory) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <SheetTitle
        id={titleId}
        title="What was it for?"
        sub={`${formatCurrency(Number(payout.amount))} to ${payout.beneficiaryName || payout.beneficiaryAccount}`}
        onClose={onClose}
      />
      <div role="radiogroup" aria-label="What was it for?" className="mt-4 grid grid-cols-2 gap-2">
        {PAYOUT_PICKS.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={payout.category === k}
            disabled={busy}
            onClick={() => onPick(k)}
            className={`press min-h-12 px-3.5 rounded-2xl text-left text-[15px] font-bold border transition-colors disabled:opacity-50 ${
              payout.category === k ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-ink hover:border-ink'
            }`}
          >
            {PAYOUT[k]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** What withdrawing is, before the first thing it asks for (a PIN) makes sense. */
function WithdrawIntro() {
  const steps = [
    ['Set a 4-digit PIN', 'You type it each time money leaves the account, so nobody else can send it.'],
    ['Pick who gets paid', 'Save the pitch owner once, or send to any Nigerian bank account.'],
    ['Send', 'The money leaves the group account, and every withdrawal is listed here.'],
  ];
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-5">
      <h3 className="text-base font-bold text-ink">Withdraw from the group account</h3>
      <p className="text-xs text-gray-600 mt-1">Pay the pitch, buy bibs or refund a player, straight from what&apos;s been collected.</p>
      <ol className="mt-4 space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="w-6 h-6 shrink-0 rounded-full bg-ink text-volt-300 text-xs font-extrabold flex items-center justify-center" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">{title}</span>
              <span className="block text-xs text-gray-600">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SetPinForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== confirm) { toast.error('PINs do not match'); return; }
    setBusy(true);
    try {
      await setTransferPin(pin);
      toast.success('Transfer PIN set');
      onDone();
    } catch (err: any) {
      toast.error(err.message || 'Could not set PIN');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-center tracking-[0.3em] focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <form onSubmit={handle} className="bg-white rounded-3xl border border-gray-100 shadow-card p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">Set transfer PIN</h3>
        <p className="text-xs text-gray-500 mt-1">You&apos;ll type it every time you withdraw money from any of your groups.</p>
      </div>
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        placeholder="Enter 4-digit PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className={input}
        autoComplete="off"
      />
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        placeholder="Confirm PIN"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className={input}
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={busy || pin.length < 4 || confirm.length < 4}
        className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
      >
        {busy ? 'Setting…' : 'Set PIN'}
      </button>
    </form>
  );
}

export function PayoutsPanel({
  groupId,
  groupName,
  refundable = [],
  unsorted = 0,
  onRefresh,
}: {
  groupId: string;
  groupName: string;
  /** Members with money of theirs in the account (extra or kept), who can be refunded. */
  refundable?: RefundableMember[];
  /** Money in with no name yet: part of the balance, but nobody's payment so far. */
  unsorted?: number;
  onRefresh: () => Promise<void>;
}) {
  const toast = useToast();
  const { user } = useAuth();
  // Treasurers record payments; sending money out is the organiser's.
  const canSend = user?.role !== UserRole.TREASURER;
  const [balance, setBalance] = useState<GroupBalance | null>(null);
  const [payouts, setPayouts] = useState<OutgoingTransfer[]>([]);
  const [banks, setBanks] = useState<NigerianBank[]>([]);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [picking, setPicking] = useState<OutgoingTransfer | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PayoutFilter>('all');
  const [cat, setCat] = useState<PayoutCategory | 'all' | 'none'>('all');
  const paidAhead = refundable.reduce((sum, m) => sum + m.credit, 0);
  const extraTotal = refundable.reduce((sum, m) => sum + m.extra, 0);
  // From "Send it back" on an extra: open Send money with that refund ready.
  const [refundTo, setRefundTo] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const who = q.get('refund');
    if (!who) return;
    setRefundTo(who);
    q.delete('refund');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`);
  }, []);
  useEffect(() => {
    if (refundTo && balance && hasPin && canSend) setShowForm(true);
  }, [refundTo, balance, hasPin, canSend]);

  async function load() {
    const [b, p] = await Promise.all([
      getGroupBalance(groupId),
      getGroupPayouts(groupId),
    ]);
    setBalance(b);
    setPayouts(p);
  }

  useEffect(() => {
    load().catch(() => {});
    getNigerianBanks().then(setBanks).catch(() => {});
    getTransferPinStatus().then((r) => setHasPin(r.hasPin)).catch(() => setHasPin(false));
  }, [groupId]);

  async function handleCancel() {
    if (!cancelId) return;
    try {
      await cancelPayout(cancelId);
      toast.success('Withdrawal cancelled');
      setCancelId(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not cancel');
    }
  }

  async function pickCategory(category: PayoutCategory) {
    if (!picking) return;
    setSavingCategory(true);
    try {
      await setPayoutCategory(picking.id, category);
      setPayouts((all) => all.map((p) => (p.id === picking.id ? { ...p, category } : p)));
      setPicking(null);
      toast.success(`Marked as ${PAYOUT[category].toLowerCase()}`);
    } catch (err: any) {
      toast.error(err.message || 'Could not save');
    } finally {
      setSavingCategory(false);
    }
  }

  // What the money that actually went out was spent on, biggest first.
  const spent = Object.entries(
    payouts
      .filter((p) => p.status === 'completed')
      .reduce<Record<string, number>>((by, p) => {
        const k = p.category ?? 'none';
        by[k] = (by[k] ?? 0) + Number(p.amount);
        return by;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const q = search.trim().toLowerCase().replace(/[₦,]/g, '');
  const statuses = FILTERS.find(([k]) => k === filter)![2];
  const shown = payouts.filter((p) => {
    if (statuses.length && !statuses.includes(p.status)) return false;
    if (cat === 'none' ? !!p.category : cat !== 'all' && p.category !== cat) return false;
    if (!q) return true;
    const words = [
      p.beneficiaryName,
      p.beneficiaryAccount,
      p.beneficiaryBankName,
      p.narration,
      p.category && PAYOUT[p.category],
      p.refundPlayer && `${p.refundPlayer.firstName} ${p.refundPlayer.lastName}`,
      String(Number(p.amount)),
    ];
    return words.some((w) => w && w.toLowerCase().includes(q));
  });

  if (hasPin === false && canSend) {
    return (
      <div className="space-y-3">
        <WithdrawIntro />
        <SetPinForm onDone={() => setHasPin(true)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!cancelId}
        title="Cancel withdrawal"
        message="This withdrawal got stuck before the bank confirmed it. Cancel it?"
        confirmLabel="Cancel withdrawal"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setCancelId(null)}
      />

      {/* Balance card */}
      {balance && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-5">
          <p className="text-xs font-semibold text-gray-500">Available to withdraw</p>
          <p className="font-display text-[34px] leading-none font-extrabold text-ink tabular-nums mt-1.5">
            {formatCurrency(balance.available)}
          </p>
          <p className="mt-2 text-xs text-gray-500 tabular-nums">
            {formatCurrency(balance.totalIn)} received, {formatCurrency(balance.totalOut)} sent out
          </p>
          {/* What's in the balance that isn't the group's to spend yet, so nobody pays the pitch with it by mistake. */}
          {(paidAhead > 0 || extraTotal > 0 || unsorted > 0) && (
            <div className="mt-3 rounded-2xl bg-sun-400/15 px-3.5 py-2.5 text-[13px] leading-snug text-amber-900">
              <p className="font-bold">
                This includes money that isn’t the group’s to spend yet:{' '}
                <InfoTip label="What's this money?" align="right">
                  <b>Extra to sort:</b> players sent more than they owed (maybe for a friend), or money came back off a game. It waits on Money in until you say what it was for.
                  <span className="block mt-1.5">
                    <b>Kept for players:</b> part of a game they still owe, or extra you chose to keep for their next game. It pays that game, or you
                    can send it back from Send money.
                  </span>
                </InfoTip>
              </p>
              <ul className="mt-1 space-y-0.5 tabular-nums">
                {extraTotal > 0 && <li>{formatCurrency(extraTotal)} extra players sent, still to sort</li>}
                {paidAhead > 0 && <li>{formatCurrency(paidAhead)} kept for players’ next games</li>}
                {unsorted > 0 && <li>{formatCurrency(unsorted)} with no name yet</li>}
              </ul>
            </div>
          )}
          {balance.manualIn > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {formatCurrency(balance.manualIn)} of that was recorded by hand, so it isn’t included in what you can send.
            </p>
          )}
          {canSend ? (
            <button onClick={() => setShowForm(true)} className={`${btnPrimary} mt-4 w-full`}>
              Send money
            </button>
          ) : (
            <p className="mt-4 text-[13px] text-gray-600">Only the group’s organiser can send money out. You can see every withdrawal here.</p>
          )}
        </div>
      )}

      {/* Pitch owner / facility manager: saved once, paid in one tap */}
      {balance && canSend && banks.length > 0 && (
        <PayeeCard
          groupId={groupId}
          groupName={groupName}
          banks={banks}
          available={balance.available}
          onPaid={async () => {
            await load();
            await onRefresh();
          }}
        />
      )}

      {showForm && balance && (
        <SendMoneyModal
          groupId={groupId}
          groupName={groupName}
          banks={banks}
          available={balance.available}
          refundable={refundable}
          refundTo={refundTo}
          onClose={() => {
            setShowForm(false);
            setRefundTo(null);
          }}
          onSent={async () => {
            await load();
            await onRefresh();
          }}
        />
      )}

      {picking && <CategorySheet payout={picking} busy={savingCategory} onPick={pickCategory} onClose={() => setPicking(null)} />}

      {/* Withdrawal history, headed like the page's other sections */}
      <h2 className="pt-3 text-base font-bold text-ink">Past withdrawals</h2>
      {spent.length > 0 && spent.some(([k]) => k !== 'none') && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-card px-4 py-3">
          <p className="text-xs font-semibold text-gray-500">Spent on</p>
          <ul className="mt-1.5 space-y-1 text-[14px] tabular-nums">
            {spent.map(([k, total]) => (
              <li key={k} className="flex items-baseline justify-between gap-3">
                <span className={k === 'none' ? 'text-gray-500' : 'font-semibold text-ink'}>
                  {k === 'none' ? 'Not said yet' : PAYOUT[k as PayoutCategory]}
                </span>
                <span className="font-display font-extrabold text-ink">{formatCurrency(total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {payouts.length > 0 && (
        <div className="space-y-2">
          {payouts.length > 4 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search who, what for or amount"
              aria-label="Search withdrawals"
              className="w-full min-h-11 px-3.5 bg-white border border-gray-200 rounded-2xl text-[15px] focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
          )}
          <FilterBar>
            <FilterMenu
              label="What it was for"
              value={cat}
              onChange={setCat}
              options={[
                { value: 'all', label: 'All categories' },
                ...(Object.keys(PAYOUT) as PayoutCategory[]).map((k) => ({ value: k, label: PAYOUT[k] })),
                { value: 'none', label: 'Not said yet' },
              ]}
            />
            <FilterMenu
              label="Status"
              value={filter}
              onChange={setFilter}
              columns={2}
              options={FILTERS.map(([k, label]) => ({ value: k, label: k === 'all' ? 'All status' : label }))}
            />
          </FilterBar>
        </div>
      )}
      {payouts.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No withdrawals yet"
          description="When you send money out of this group's account, it shows up here."
        />
      ) : shown.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">{q ? `Nothing matches “${search.trim()}”.` : 'None of these yet.'}</p>
          <button
            onClick={() => {
              setSearch('');
              setFilter('all');
              setCat('all');
            }}
            className="mt-1 min-h-11 px-3 text-sm font-bold text-pitch-700"
          >
            Show everything
          </button>
        </div>
      ) : (
        <MonthList
          items={shown}
          idOf={(p) => p.id}
          dateOf={(p) => p.createdAt}
          // Only money that left counts in a month's total.
          amountOf={(p) => (p.status === 'failed' || p.status === 'cancelled' ? 0 : Number(p.amount))}
          direction="out"
          sticky={!q}
        >
          {(p) => (
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 shrink-0 rounded-full bg-chalk text-ink flex items-center justify-center" aria-hidden>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0-6.75 6.75M12 4.5l6.75 6.75" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-ink truncate">
                    {p.refundPlayer ? `Refund to ${p.refundPlayer.firstName} ${p.refundPlayer.lastName}` : `To ${p.beneficiaryName || p.beneficiaryAccount}`}
                  </p>
                  <p className="text-[13px] text-gray-600 mt-0.5 truncate">
                    {new Date(p.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {p.initiatedBy && ` · ${p.initiatedBy.firstName}`}
                  </p>
                  {(p.narration || p.beneficiaryBankName) && (
                    <p className="text-[12px] text-gray-500 mt-0.5 truncate">{[p.beneficiaryBankName, p.narration].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-display text-[15px] font-extrabold tabular-nums ${p.status === 'failed' || p.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-ink'}`}>
                    −{formatCurrency(Number(p.amount))}
                  </p>
                  {/* A transfer that didn't go costs nothing: say so rather than show a fee */}
                  {p.status === 'failed' || p.status === 'cancelled' ? (
                    <p className="text-[11px] text-gray-500">No fee taken</p>
                  ) : (
                    Number(p.fee) > 0 && <p className="text-[11px] text-gray-500 tabular-nums">+ {formatCurrency(Number(p.fee))} fee</p>
                  )}
                  <span className={`mt-1 inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusStyles[p.status]}`}>
                    {statusWords[p.status]}
                  </span>
                </div>
              </div>
              {p.errorMessage && (
                <div className={`mt-2 ml-[52px] rounded-xl px-3 py-2 text-[13px] leading-snug ${p.status === 'processing' ? 'bg-sky-300/20 text-ink' : 'bg-kit-500/10 text-kit-600'}`}>
                  <p>{payoutNote(p)}</p>
                  {/* For Payrep's support, if it keeps happening */}
                  {p.providerReference && <p className="mt-1 text-[11px] text-gray-500 tabular-nums select-all">Ref {p.providerReference}</p>}
                </div>
              )}
              <div className="ml-[52px] flex flex-wrap items-center gap-2 empty:hidden">
                {/* "What was it for?" only for money that went (or may still) */}
                {!p.refundPlayerId && p.status !== 'failed' && p.status !== 'cancelled' &&
                  (canSend ? (
                    <button
                      onClick={() => setPicking(p)}
                      className={`press mt-2 inline-flex items-center gap-1 min-h-11 px-3 rounded-full text-[13px] font-bold border transition-colors ${
                        p.category ? 'bg-chalk border-chalk text-ink' : 'bg-white border-dashed border-gray-300 text-gray-600 hover:text-ink'
                      }`}
                      aria-label={p.category ? `For ${PAYOUT[p.category]}. Change` : 'Say what it was for'}
                    >
                      {p.category ? PAYOUT[p.category] : '+ What was it for?'}
                      {p.category && (
                        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    p.category && <p className="mt-2 text-[13px] font-semibold text-ink">For: {PAYOUT[p.category]}</p>
                  ))}
                {/* Pending means the bank call is under way; only one stuck there (the server stopped) can be cancelled. */}
                {p.status === 'pending' && Date.now() - new Date(p.createdAt).getTime() > 15 * 60 * 1000 && (
                  <button
                    onClick={() => setCancelId(p.id)}
                    className="mt-2 min-h-11 px-4 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-ink transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </MonthList>
      )}
    </div>
  );
}
