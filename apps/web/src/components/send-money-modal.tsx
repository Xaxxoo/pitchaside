'use client';

import { useEffect, useId, useState } from 'react';
import { BankPicker } from '@/components/group-payee';
import { Sheet } from '@/components/sheet';
import { BallSpinner } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { formatCurrency, initiateGroupPayout, nameEnquiry, type NigerianBank, type PayoutCategory } from '@/lib/api';
import { PAYOUT, PAYOUT_PICKS } from '@/lib/money-categories';

const input =
  'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

const SERVICE_FEE = 350;

type Lookup = { state: 'idle' } | { state: 'checking' } | { state: 'found'; name: string } | { state: 'failed'; message: string };

/**
 * The account holder's name, looked up as soon as there's a bank and a 10-digit
 * number — no "Verify" step. A newer lookup always wins over an older, slower one.
 */
function useAccountName(groupId: string, bankCode: string, account: string): Lookup {
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });

  useEffect(() => {
    if (!bankCode || account.length !== 10) {
      setLookup({ state: 'idle' });
      return;
    }
    let current = true;
    setLookup({ state: 'checking' });
    nameEnquiry(groupId, bankCode, account)
      .then((r) => current && setLookup(r.accountName ? { state: 'found', name: r.accountName } : { state: 'failed', message: 'No name came back for this account' }))
      .catch((err) => current && setLookup({ state: 'failed', message: err instanceof Error ? err.message : "Couldn't check this account" }));
    return () => {
      current = false;
    };
  }, [groupId, bankCode, account]);

  return lookup;
}

/** A member with money of theirs in the account (extra to sort, or kept for them) who can be refunded. */
export interface RefundableMember {
  playerId: string;
  name: string;
  /** Kept for their games. */
  credit: number;
  /** Sent beyond what they owed, not sorted yet: refunded first. */
  extra: number;
}

/** What a member can be sent back: their extra and their kept money together. */
const heldBy = (m: RefundableMember) => m.credit + m.extra;

/**
 * Send money from the group's account to any Nigerian bank account — or refund a member,
 * which also takes the amount off their credit.
 */
export function SendMoneyModal({
  groupId,
  groupName,
  banks,
  available,
  refundable = [],
  refundTo,
  onClose,
  onSent,
}: {
  groupId: string;
  groupName: string;
  banks: NigerianBank[];
  available: number;
  refundable?: RefundableMember[];
  /** Open with a refund to this member ready (from "Send it back"). */
  refundTo?: string | null;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const titleId = useId();
  const toast = useToast();
  const [refundFor, setRefundFor] = useState('');
  const [amount, setAmount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [account, setAccount] = useState('');
  const [narration, setNarration] = useState('');
  const [category, setCategory] = useState<PayoutCategory | null>(null);
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);
  const lookup = useAccountName(groupId, bankCode, account);

  const member = refundable.find((m) => m.playerId === refundFor);
  const limit = member ? Math.min(available - SERVICE_FEE, heldBy(member)) : available - SERVICE_FEE;
  const value = Number(amount);
  const tooMuch = value > limit;
  const ready = lookup.state === 'found' && value >= 100 && !tooMuch && pin.length === 4;

  function chooseRefund(playerId: string) {
    setRefundFor(playerId);
    const m = refundable.find((x) => x.playerId === playerId);
    if (!m) return;
    setAmount(String(Math.floor(Math.min(available, heldBy(m)))));
    if (!narration.trim()) setNarration(`Refund from ${groupName}`);
  }

  useEffect(() => {
    if (refundTo && refundable.some((m) => m.playerId === refundTo)) chooseRefund(refundTo);
    // Once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    try {
      const payout = await initiateGroupPayout(groupId, {
        amount: value,
        beneficiaryAccount: account,
        beneficiaryBankCode: bankCode,
        narration: narration.trim() || undefined,
        refundPlayerId: member?.playerId,
        category: member ? undefined : (category ?? undefined),
        pin,
      });
      if (payout.status === 'failed') {
        toast.error(payout.errorMessage || 'The bank couldn\u2019t process this transfer. Try again shortly.');
      } else {
        toast.success(`${member ? 'Refunding' : 'Sending'} ${formatCurrency(value)} to ${lookup.name}`);
      }
      await onSent();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <form onSubmit={send} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-extrabold text-ink">
            Send money
          </h2>
          <button type="button" onClick={onClose} className="text-xs font-bold text-gray-500 hover:text-ink">
            Close
          </button>
        </div>
        <p className="text-xs text-gray-500 -mt-1">
          From the group&apos;s account · <span className="font-bold text-ink">{formatCurrency(available)}</span> available
        </p>

        {refundable.length > 0 && (
          <div>
            <label htmlFor={`${titleId}-for`} className="text-xs font-semibold text-gray-600 mb-1 block">
              What&apos;s it for?
            </label>
            <select id={`${titleId}-for`} value={refundFor} onChange={(e) => chooseRefund(e.target.value)} className={input}>
              <option value="">A payment (pitch, kit, anything else)</option>
              {refundable.map((m) => (
                <option key={m.playerId} value={m.playerId}>
                  Refund {m.name}: {formatCurrency(heldBy(m))} of theirs
                </option>
              ))}
            </select>
            {member && (
              <p className="text-xs text-gray-500 mt-1">
                Comes off {member.name}’s extra first, then money kept for them. Send it to their own account.
              </p>
            )}
          </div>
        )}

        {!member && (
          <div>
            <p id={`${titleId}-cat`} className="text-xs font-semibold text-gray-600 mb-1.5">
              {refundable.length > 0 ? 'Spent on' : 'What’s it for?'} <span className="text-gray-500 font-medium">(helps you see where the money went)</span>
            </p>
            <div role="radiogroup" aria-labelledby={`${titleId}-cat`} className="flex flex-wrap gap-2">
              {PAYOUT_PICKS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={category === k}
                  onClick={() => setCategory(category === k ? null : k)}
                  className={`press min-h-11 px-3.5 rounded-full text-[13px] font-bold border transition-colors ${
                    category === k ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-gray-600 hover:text-ink'
                  }`}
                >
                  {PAYOUT[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1 block">Bank</label>
          <BankPicker banks={banks} value={bankCode} onChange={setBankCode} />
        </div>

        <div>
          <label htmlFor={`${titleId}-acct`} className="text-xs font-semibold text-gray-600 mb-1 block">
            Account number
          </label>
          <input
            id={`${titleId}-acct`}
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={account}
            onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="0123456789"
            className={input}
          />
          <div role="status" className="min-h-5 mt-1.5 text-sm">
            {lookup.state === 'checking' && (
              <span className="inline-flex items-center gap-2 text-gray-500">
                <BallSpinner /> Checking the name…
              </span>
            )}
            {lookup.state === 'found' && (
              <span className="block font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">{lookup.name}</span>
            )}
            {lookup.state === 'failed' && <span className="text-kit-600 text-xs font-semibold">{lookup.message}</span>}
          </div>
        </div>

        <div>
          <label htmlFor={`${titleId}-amt`} className="text-xs font-semibold text-gray-600 mb-1 block">
            Amount (₦)
          </label>
          <input
            id={`${titleId}-amt`}
            type="number"
            min={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={input}
          />
          {tooMuch && (
            <p className="text-xs text-kit-600 mt-1">
              {member && heldBy(member) < available - SERVICE_FEE
                ? `More than the ${formatCurrency(heldBy(member))} of ${member.name}'s in the account.`
                : `More than the ${formatCurrency(Math.max(0, available - SERVICE_FEE))} available after the ${formatCurrency(SERVICE_FEE)} service fee.`}
            </p>
          )}
          {value > 0 && !tooMuch && (
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(SERVICE_FEE)} service fee applies · total debit: {formatCurrency(value + SERVICE_FEE)}</p>
          )}
        </div>

        <div>
          <label htmlFor={`${titleId}-note`} className="text-xs font-semibold text-gray-600 mb-1 block">
            Description <span className="text-gray-500 font-medium">(optional)</span>
          </label>
          <input
            id={`${titleId}-note`}
            type="text"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="e.g. Pitch rental — Week 12"
            className={input}
          />
        </div>

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Transfer PIN"
          aria-label="Transfer PIN"
          className={`${input} text-center tracking-[0.3em]`}
          autoComplete="off"
        />

        <button
          type="submit"
          disabled={!ready || sending}
          className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sending && <BallSpinner />}
          {sending ? 'Sending…' : value ? `${member ? 'Refund' : 'Send'} ${formatCurrency(value)} + ${formatCurrency(SERVICE_FEE)} fee` : member ? 'Refund' : 'Send'}
        </button>
      </form>
    </Sheet>
  );
}
