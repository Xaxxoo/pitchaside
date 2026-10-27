'use client';

import { useState } from 'react';
import type { PaymentType } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { formatCurrency, type GroupAccount } from '@/lib/api';
import { formatAccountNumber, frequencyShort } from '@/lib/billing';
import { claimPayment } from '@/lib/player';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    /** Resolves false when the browser won't copy (no clipboard access, or not over https). */
    copy(key: string, text: string): Promise<boolean> {
      return (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
        () => {
          setCopied(key);
          setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
          return true;
        },
        () => false,
      );
    },
  };
}

/**
 * Asked after a player copies the account number. Saying they've sent it doesn't mark them paid:
 * their payment code or name matches the transfer when it lands, and if neither is on it the
 * organiser sees that they said they paid and confirms it.
 */
function PaidSheet({
  groupId,
  account,
  amount,
  reference,
  onClose,
  onClaimed,
}: {
  groupId: string;
  account: GroupAccount;
  amount: number;
  reference?: string;
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
      <Sheet titleId="paid-title" onClose={onClose} footer={<button onClick={onClose} className={`${btnPrimary} w-full`}>Done</button>}>
        <p className="text-4xl" aria-hidden>
          {result === 'matched' ? '✅' : '👍'}
        </p>
        <h2 id="paid-title" className="font-display text-xl font-extrabold text-ink mt-2">
          {result === 'matched' ? 'Got it, you’re marked as paid' : 'Thanks, your organiser can see it'}
        </h2>
        <p className="text-sm text-gray-600 mt-2" role="status">
          {result === 'matched'
            ? 'We found your transfer and matched it to you.'
            : `If your payment code or your name is on the transfer, it’s matched to you as soon as it lands. If not, your organiser sees that you said you sent ₦${Number(sent).toLocaleString('en-NG')} and confirms it.`}
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      titleId="paid-title"
      onClose={onClose}
      align="left"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className={btnSecondary}>
            Not yet
          </button>
          <button onClick={confirm} disabled={busy || !(Number(sent) > 0)} className={btnPrimary}>
            {busy ? 'Sending…' : 'Yes, I’ve sent it'}
          </button>
        </div>
      }
    >
      <SheetTitle
        id="paid-title"
        title="Have you sent it?"
        sub={`To ${account.bankName} ${formatAccountNumber(account.accountNumber)}. Tell us here so your organiser knows it’s yours.`}
        onClose={onClose}
      />
      <label className="block text-left mt-4" htmlFor="paid-amount">
        <span className="text-xs font-bold text-gray-500">Amount you sent</span>
        <span className="mt-1 flex items-center min-h-12 rounded-xl border border-gray-200 focus-within:ring-4 focus-within:ring-volt-300/70 focus-within:border-pitch-600">
          <span className="pl-3.5 text-[15px] font-bold text-gray-500">₦</span>
          <input
            id="paid-amount"
            inputMode="numeric"
            value={sent ? Number(sent.replace(/\D/g, '')).toLocaleString('en-NG') : ''}
            onChange={(e) => setSent(e.target.value.replace(/\D/g, ''))}
            className="w-full px-2 py-3 text-[15px] font-bold tabular-nums bg-transparent focus:outline-none"
          />
        </span>
      </label>
      {reference && (
        <p className="mt-3 rounded-2xl bg-chalk px-3.5 py-2.5 text-[13px] text-gray-700">
          Did you put <b className="font-mono text-ink">{reference}</b> in the description? Then it’s matched as soon as it lands.
        </p>
      )}
      {error && (
        <p className="text-[13px] font-semibold text-kit-600 mt-2 text-left" role="alert">
          {error}
        </p>
      )}
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
  /** For a signed-in member: "I've sent it" tells the organiser, with the amount filled in. */
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
          onClick={() => copy('acct', account.accountNumber)}
          aria-label={`Copy account number ${account.accountNumber}`}
          className="press group mt-4 flex items-center gap-3 text-left w-full min-w-0"
        >
          <span className="min-w-0 font-display text-[26px] font-extrabold tracking-[0.05em] tabular-nums leading-none">
            {formatAccountNumber(account.accountNumber)}
          </span>
          <span className="ml-auto shrink-0 inline-flex items-center min-h-11 px-3.5 rounded-xl text-[13px] font-bold bg-white/10 group-hover:bg-volt-400 group-hover:text-ink transition-colors">
            {copied === 'acct' ? 'Copied ✓' : 'Copy'}
          </span>
        </button>
        <p className="text-sm text-white/60 mt-2">{account.accountName}</p>

        {reference && (
          <button
            onClick={() => copy('ref', reference)}
            aria-label={`Copy payment code ${reference}`}
            className="press mt-4 w-full flex items-center justify-between gap-3 rounded-2xl bg-volt-400 text-ink px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/60">Payment code</span>
              <span className="block font-display text-2xl font-extrabold tracking-[0.12em]">{reference}</span>
              <span className="block text-[12px] font-semibold text-ink/70 truncate">Put it in the transfer note</span>
            </span>
            <span className="shrink-0 inline-flex items-center min-h-11 px-3.5 rounded-xl text-[13px] font-bold bg-ink text-volt-300">
              {copied === 'ref' ? 'Copied ✓' : 'Copy'}
            </span>
          </button>
        )}

        {claim && (
          <button
            onClick={() => setAsking(true)}
            className="press mt-3 w-full h-12 inline-flex items-center justify-center rounded-2xl border border-white/20 text-[15px] font-bold text-white hover:bg-white/10 transition-colors"
          >
            I&apos;ve sent it
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {copied === 'acct' ? 'Account number copied' : copied === 'ref' ? 'Payment code copied' : ''}
      </p>
      {asking && claim && (
        <PaidSheet
          groupId={claim.groupId}
          account={account}
          amount={claim.amount}
          reference={reference}
          onClose={() => setAsking(false)}
          onClaimed={onClaimed}
        />
      )}
    </div>
  );
}

export interface SendLine {
  id: string;
  label: string;
  amount: number;
  /** Part paid already: this line is what's left. */
  paidSoFar?: number;
}

/**
 * The player's Pay card for one group, in the order they act on it: the account number to copy
 * first, then the payment code for the description, then how much to send and what it's for,
 * then "I've sent it". Each group has its own account, so each owing group gets its own card.
 */
export function SendCard({
  groupName,
  account,
  reference,
  fee,
  paymentType,
  now,
  later = [],
  paidAhead = 0,
  claim,
  onClaimed,
}: {
  groupName: string;
  account: GroupAccount | null;
  reference?: string;
  fee: number;
  paymentType: PaymentType | string;
  /** What to send now; empty when nothing is owed (the card is then just where to pay). */
  now: SendLine[];
  later?: SendLine[];
  paidAhead?: number;
  claim?: { groupId: string; amount: number };
  onClaimed?: (status: 'matched' | 'waiting') => void;
}) {
  const { copied, copy } = useCopy();
  const [asking, setAsking] = useState(false);
  const total = now.reduce((s, l) => s + l.amount, 0);

  return (
    <div className="relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
      <div className="absolute inset-0 turf-stripes" aria-hidden />
      <div className="relative p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Pay {groupName}</p>
          <span className="shrink-0 text-[11px] font-bold text-white/60 tabular-nums">
            {formatCurrency(fee)} {frequencyShort(paymentType)}
          </span>
        </div>

        {account ? (
          <>
            {/* 1. Where to send it: the number first, big, one tap to copy */}
            <p className="mt-3 text-[12px] font-semibold text-white/60">Account number</p>
            <button
              onClick={() => copy('acct', account.accountNumber)}
              aria-label={`Copy account number ${account.accountNumber}`}
              className="press group mt-1 flex items-center gap-3 text-left w-full min-w-0"
            >
              <span className="min-w-0 whitespace-nowrap font-display text-[27px] font-extrabold tracking-[0.03em] tabular-nums leading-none">
                {formatAccountNumber(account.accountNumber)}
              </span>
              <span className="ml-auto shrink-0 inline-flex items-center min-h-11 px-3.5 rounded-xl text-[13px] font-bold bg-white/10 group-hover:bg-volt-400 group-hover:text-ink transition-colors">
                {copied === 'acct' ? 'Copied ✓' : 'Copy'}
              </span>
            </button>
            <p className="mt-1.5 text-[13px] text-white/70 leading-snug">
              {account.bankName} · {account.accountName}
            </p>

            {/* 2. What to write on it */}
            {reference && (
              <button
                onClick={() => copy('ref', reference)}
                aria-label={`Copy payment code ${reference}`}
                className="press mt-4 w-full flex items-center justify-between gap-3 rounded-2xl bg-volt-400 text-ink px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-ink/70">Payment code</span>
                  <span className="block font-display text-2xl font-extrabold tracking-[0.12em]">{reference}</span>
                  <span className="block text-[12px] font-semibold text-ink/70 truncate">Put it in the transfer note</span>
                </span>
                <span className="shrink-0 inline-flex items-center min-h-11 px-3.5 rounded-xl text-[13px] font-bold bg-ink text-volt-300">
                  {copied === 'ref' ? 'Copied ✓' : 'Copy'}
                </span>
              </button>
            )}
          </>
        ) : (
          <p className="mt-3 rounded-2xl bg-white/[0.07] px-4 py-3 text-[13px] leading-snug text-white/80">
            Your organiser hasn’t set up this group’s account yet. Where to send it shows here as soon as it’s ready.
          </p>
        )}

        {/* 3. How much, and what it's for */}
        {now.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-semibold text-white/70">Send</p>
              <p className="font-display text-[30px] leading-none font-extrabold text-volt-300 tabular-nums">{formatCurrency(total)}</p>
            </div>
            <ul className="mt-2 space-y-1">
              {now.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-white/80">
                    {l.label}
                    {l.paidSoFar ? <span className="block text-[12px] text-volt-300">{formatCurrency(l.paidSoFar)} paid so far · this is what’s left</span> : null}
                  </span>
                  {now.length > 1 && <span className="shrink-0 font-bold tabular-nums text-white/80">{formatCurrency(l.amount)}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(later.length > 0 || paidAhead > 0) && (
          <ul className={`${now.length ? 'mt-3' : 'mt-4 pt-4 border-t border-white/10'} space-y-1 text-[12px] text-white/60`}>
            {later.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">Later: {l.label} · pay once it’s your next</span>
                <span className="shrink-0 tabular-nums">{formatCurrency(l.amount)}</span>
              </li>
            ))}
            {paidAhead > 0 && <li>{formatCurrency(paidAhead)} paid ahead · it pays your next game</li>}
          </ul>
        )}

        {claim && account && (
          <button
            onClick={() => setAsking(true)}
            className="press mt-4 w-full h-12 inline-flex items-center justify-center rounded-2xl border border-white/20 text-[15px] font-bold text-white hover:bg-white/10 transition-colors"
          >
            I&apos;ve sent it
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {copied === 'acct' ? 'Account number copied' : copied === 'ref' ? 'Payment code copied' : ''}
      </p>
      {asking && claim && account && (
        <PaidSheet groupId={claim.groupId} account={account} amount={claim.amount} reference={reference} onClose={() => setAsking(false)} onClaimed={onClaimed} />
      )}
    </div>
  );
}
