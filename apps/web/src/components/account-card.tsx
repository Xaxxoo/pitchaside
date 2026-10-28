'use client';

import { useId, useState } from 'react';
import type { PaymentType } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { Callout } from '@/components/callout';
import { Steps } from '@/components/steps';
import { formatCurrency, type GroupAccount } from '@/lib/api';
import { formatAccountNumber, frequencyShort } from '@/lib/billing';
import { claimPayment, type MyClaim } from '@/lib/player';
import { resizeReceipt } from '@/lib/photo';
import { receiptUrl } from '@/lib/http';

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
 * organiser checks it on "To check" (with the screenshot of the transfer, when they add one).
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
  // The screenshot of their transfer, made small enough to send (optional, but it's what the organiser checks)
  const [receipt, setReceipt] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileId = useId();
  async function pick(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    setError('');
    try {
      setReceipt(await resizeReceipt(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That picture couldn’t be used. Try another.');
    } finally {
      setPreparing(false);
    }
  }
  // What's still to pay once it's in: a part payment isn't "paid"
  const [owes, setOwes] = useState(0);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const { status, owes: left } = await claimPayment(groupId, Number(sent), receipt ?? undefined);
      setResult(status);
      setOwes(left ?? 0);
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
          {result === 'matched' ? (owes > 0 ? `Got it: ₦${owes.toLocaleString('en-NG')} still to pay` : 'Got it, you’re all paid') : 'Thanks, your organiser can see it'}
        </h2>
        {result === 'matched' ? (
          <p className="text-sm text-gray-600 mt-2" role="status">
            {owes > 0 ? 'We found your transfer and matched it to you. It counts towards what you owe.' : 'We found your transfer and matched it to you.'}
          </p>
        ) : (
          // Not matched yet: what happens from here, in order, with what's done ticked
          <div role="status" className="mt-4 text-left">
            <Steps
              heading="What happens next"
              steps={
                receipt
                  ? [
                      { title: `You sent ₦${Number(sent).toLocaleString('en-NG')}`, done: true },
                      { title: 'Your organiser has the receipt', done: true },
                      { title: 'They check it against the account', sub: 'Or it’s matched by itself when it lands' },
                      { title: 'You get a message either way' },
                    ]
                  : [
                      { title: `You told your organiser: ₦${Number(sent).toLocaleString('en-NG')}`, done: true },
                      { title: 'It’s matched when it lands', sub: 'If your payment code or name is on it' },
                      { title: 'If not, your organiser checks it', sub: 'You get a message either way' },
                    ]
              }
            />
          </div>
        )}
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
          <button onClick={confirm} disabled={busy || preparing || !(Number(sent) > 0)} className={btnPrimary}>
            {busy ? 'Sending…' : receipt ? 'Send receipt' : 'Yes, I’ve sent it'}
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
      {/* The receipt: a screenshot of the transfer in their bank app */}
      <div className="mt-4">
        <input id={fileId} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        {receipt ? (
          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receipt} alt="Your receipt" className="w-14 h-20 shrink-0 rounded-lg object-cover object-top bg-chalk" />
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold text-ink">Receipt added ✓</span>
              <span className="block text-[12px] text-gray-500 truncate">For your organiser</span>
            </span>
            <label htmlFor={fileId} className="press shrink-0 min-h-11 px-3 inline-flex items-center rounded-xl text-[13px] font-bold text-pitch-700 cursor-pointer">
              Change
            </label>
          </div>
        ) : (
          <label
            htmlFor={fileId}
            className="press flex items-center gap-3 min-h-16 rounded-2xl border-2 border-dashed border-gray-300 px-3.5 py-3 cursor-pointer hover:border-ink"
          >
            <span className="w-10 h-10 shrink-0 rounded-xl bg-volt-300 text-ink flex items-center justify-center" aria-hidden>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-ink">{preparing ? 'Getting it ready…' : 'Add the receipt'}</span>
              <span className="block text-[12px] text-gray-500 truncate">A screenshot of the transfer · helps it get confirmed</span>
            </span>
          </label>
        )}
      </div>
      {reference && (
        <Callout tone="info" className="mt-3" title={<>Put <span className="font-mono">{reference}</span> in the description</>}>
          It’s matched to you as soon as it lands.
        </Callout>
      )}
      {error && (
        <Callout tone="warn" live className="mt-2">
          {error}
        </Callout>
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
      <Callout tone="note" title="The account isn’t ready yet">
        Your organiser is setting it up. Where to pay shows here once it is.
      </Callout>
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
  pending,
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
  /** Their latest "I've paid" while it's news: waiting for the organiser, or not found. */
  pending?: MyClaim | null;
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
          <Callout tone="note" onDark className="mt-3" title="The account isn’t ready yet">
            Your organiser is setting it up. Where to pay shows here once it is.
          </Callout>
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

        {/* What happened to their "I've sent it": waiting, or not found (with what the organiser said) */}
        {pending?.status === 'pending' && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.07] px-3.5 py-3" role="status">
            {pending.hasReceipt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptUrl(pending.id, true)} alt="Your receipt" className="w-10 h-14 shrink-0 rounded-md object-cover object-top bg-white/10" />
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold text-white truncate">Waiting for a check</span>
              <span className="block text-[12px] text-white/60 truncate tabular-nums">
                {formatCurrency(pending.amount)} sent{pending.hasReceipt ? ' · receipt sent' : ' · no receipt yet'}
              </span>
            </span>
          </div>
        )}
        {pending?.status === 'rejected' && (
          <div className="mt-4 rounded-2xl bg-kit-500/15 border border-kit-500/40 px-3.5 py-3" role="status">
            <p className="text-[14px] font-bold text-white">Your {formatCurrency(pending.amount)} wasn’t found yet</p>
            <p className="mt-0.5 text-[12px] leading-snug text-white/70">{pending.note || 'Check the account number, then send your receipt again.'}</p>
          </div>
        )}
        {claim && account && (
          <button
            onClick={() => setAsking(true)}
            className="press mt-4 w-full h-12 inline-flex items-center justify-center rounded-2xl border border-white/20 text-[15px] font-bold text-white hover:bg-white/10 transition-colors"
          >
            {pending?.status === 'pending' ? (pending.hasReceipt ? 'Change receipt or amount' : 'Add the receipt') : 'I’ve sent it · add receipt'}
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
