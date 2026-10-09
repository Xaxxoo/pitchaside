'use client';

import { useState } from 'react';
import type { PaymentType } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { formatCurrency, type GroupAccount } from '@/lib/api';
import { formatAccountNumber, frequencyShort } from '@/lib/billing';
import { claimPayment } from '@/lib/player';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy(key: string, text: string) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
      });
    },
  };
}

/**
 * Asked after a player copies the account number: once they say they've sent it, a transfer
 * that arrives without their reference or name can still be matched to them.
 */
function PaidSheet({
  groupId,
  account,
  amount,
  onClose,
  onClaimed,
}: {
  groupId: string;
  account: GroupAccount;
  amount: number;
  onClose: () => void;
  onClaimed?: (status: 'matched' | 'waiting') => void;
}) {
  const [sent, setSent] = useState(amount > 0 ? String(amount) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<'matched' | 'waiting' | null>(null);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const { status } = await claimPayment(groupId, Number(sent));
      setResult(status);
      onClaimed?.(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Sheet titleId="paid-title" onClose={onClose}>
        <p className="text-4xl" aria-hidden>
          {result === 'matched' ? '✅' : '👍'}
        </p>
        <h2 id="paid-title" className="font-display text-xl font-extrabold text-ink mt-2">
          {result === 'matched' ? 'Got it, you’re marked as paid' : 'Thanks, we’ll match it'}
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          {result === 'matched'
            ? 'We found your transfer and matched it to you.'
            : 'As soon as your transfer lands in the group account, it’s matched to you. That’s usually within a minute.'}
        </p>
        <button onClick={onClose} className="mt-5 w-full py-3 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 transition-colors">
          Done
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet titleId="paid-title" onClose={onClose}>
      <h2 id="paid-title" className="font-display text-xl font-extrabold text-ink">
        Have you made the transfer?
      </h2>
      <p className="text-sm text-gray-600 mt-2">
        Account number copied. Send it to <span className="font-bold text-ink">{account.bankName}</span>{' '}
        <span className="font-bold text-ink tabular-nums">{formatAccountNumber(account.accountNumber)}</span>, then tap
        &ldquo;Yes&rdquo; so we can match it to you.
      </p>
      <label className="block text-left mt-4">
        <span className="text-xs font-bold text-gray-500">Amount you sent</span>
        <span className="mt-1 flex items-center rounded-xl border border-gray-200 focus-within:ring-4 focus-within:ring-volt-300/70 focus-within:border-pitch-600">
          <span className="pl-3 text-sm font-bold text-gray-500">₦</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={sent}
            onChange={(e) => setSent(e.target.value)}
            className="w-full px-2 py-2.5 text-sm font-bold tabular-nums bg-transparent focus:outline-none"
          />
        </span>
      </label>
      {error && <p className="text-xs font-semibold text-kit-600 mt-2 text-left">{error}</p>}
      <div className="grid grid-cols-2 gap-2 mt-5">
        <button
          onClick={onClose}
          className="py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-ink transition-colors"
        >
          Not yet
        </button>
        <button
          onClick={confirm}
          disabled={busy || !(Number(sent) > 0)}
          className="py-3 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Sending…' : 'Yes, I’ve paid'}
        </button>
      </div>
    </Sheet>
  );
}

/** "Pay into" card players see: account number, amount, and their personal reference. */
export function PayIntoCard({
  account,
  fee,
  paymentType,
  reference,
  eyebrow = 'Pay into',
  claim,
  onClaimed,
}: {
  account: GroupAccount | null;
  fee: number;
  paymentType: PaymentType | string;
  reference?: string;
  eyebrow?: string;
  /** For a signed-in member: copying the number asks if they've paid, so we can match it. */
  claim?: { groupId: string; amount: number };
  onClaimed?: (status: 'matched' | 'waiting') => void;
}) {
  const { copied, copy } = useCopy();
  const [asking, setAsking] = useState(false);
  if (!account) {
    return (
      <div className="rounded-3xl bg-chalk border border-gray-200 p-5 text-sm text-gray-600">
        Payment details will appear here once your organiser&apos;s group account is ready.
      </div>
    );
  }
  return (
    <div className="relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
      <div className="absolute inset-0 turf-stripes" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">{eyebrow}</p>
            <p className="text-sm font-semibold text-white/70 mt-1">{account.bankName}</p>
          </div>
          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-volt-400 text-ink tabular-nums whitespace-nowrap">
            {formatCurrency(fee)} {frequencyShort(paymentType)}
          </span>
        </div>
        <button
          onClick={() => {
            copy('acct', account.accountNumber);
            if (claim) setAsking(true);
          }}
          className="group mt-4 flex items-center gap-3 text-left w-full"
        >
          <span className="font-display text-[30px] font-extrabold tracking-[0.06em] tabular-nums leading-none">
            {formatAccountNumber(account.accountNumber)}
          </span>
          <span className="ml-auto text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white/10 group-hover:bg-volt-400 group-hover:text-ink transition-colors">
            {copied === 'acct' ? 'Copied!' : 'Copy'}
          </span>
        </button>
        <p className="text-sm text-white/60 mt-2">{account.accountName}</p>

        {reference && (
          <button
            onClick={() => copy('ref', reference)}
            className="mt-4 w-full flex items-center justify-between gap-3 rounded-2xl bg-volt-400 text-ink px-4 py-3 text-left"
          >
            <span>
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/60">Narration / reference</span>
              <span className="font-display text-2xl font-extrabold tracking-[0.12em]">{reference}</span>
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-ink text-volt-300">
              {copied === 'ref' ? 'Copied!' : 'Copy'}
            </span>
          </button>
        )}

        {claim && (
          <button
            onClick={() => setAsking(true)}
            className="mt-3 w-full py-2.5 text-sm font-bold text-white bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
          >
            I&apos;ve paid
          </button>
        )}
      </div>
      {asking && claim && (
        <PaidSheet
          groupId={claim.groupId}
          account={account}
          amount={claim.amount}
          onClose={() => setAsking(false)}
          onClaimed={onClaimed}
        />
      )}
    </div>
  );
}
