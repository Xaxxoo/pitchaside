'use client';

import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { nameFit, senderFrom } from '@/lib/name-match';
import { formatCurrency, type BankTransfer, type OwedItem } from '@/lib/api';
import { describeUse, type MatchMember } from '@/lib/give-outcome';

/** "Today, 18:34" / "Fri 16 Oct, 09:10". */
export function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}, ${time}`;
}

/** ", account ending 4444" when the bank said which account it came from: a clue to who sent it. */
export function accountHint(t: BankTransfer) {
  return t.senderAccount ? `, account ending ${t.senderAccount.slice(-4)}` : '';
}

/** What the bank told us about who sent it, in normal case. */
export function from(t: BankTransfer) {
  const name = senderFrom(t);
  if (name) return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return t.narration ? `“${t.narration}”` : 'No name or description';
}

/**
 * Marking a player paid when there's money in the group account no one could put a name to:
 * one of those transfers may be theirs. Closest to what they owe first. Cash is one tap away.
 */
export function HowPaidSheet({
  member,
  paymentId,
  owed,
  due,
  game,
  transfers,
  busy,
  onUseTransfer,
  onOtherWay,
  onClose,
}: {
  member: MatchMember;
  paymentId: string;
  /** Everything the group's players owe, to say where any extra goes. */
  owed: OwedItem[];
  due: number;
  /** "Sat 17 Oct", or "October 2026 dues". */
  game: string;
  transfers: BankTransfer[];
  busy: boolean;
  onUseTransfer: (t: BankTransfer, toast: string) => void;
  onOtherWay: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const first = member.name.split(' ')[0];
  const [picked, setPicked] = useState<string | null>(null);
  // The name on the transfer is the best clue: theirs (or nearly) first. Then enough to pay it,
  // nearest the amount first; then the ones that aren't enough.
  const looksLike = (t: BankTransfer) => nameFit(member.name, `${senderFrom(t) ?? ''} ${t.narration ?? ''}`).fit !== null;
  const sorted = [...transfers].sort((a, b) => {
    if (looksLike(a) !== looksLike(b)) return looksLike(a) ? -1 : 1;
    const da = Number(a.amount) - due;
    const db = Number(b.amount) - due;
    if (da >= -0.001 !== db >= -0.001) return da >= -0.001 ? -1 : 1;
    return Math.abs(da) - Math.abs(db) || new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
  });
  const choice = sorted.find((t) => t.id === picked) ?? null;
  const outcome = choice ? describeUse(Number(choice.amount), paymentId, member, owed) : null;

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <div className="space-y-2">
          {outcome && (
            <p className="text-[13px] leading-snug text-ink font-semibold" aria-live="polite">
              {outcome.brief}.
            </p>
          )}
          <button
            disabled={!choice || busy}
            onClick={() => choice && outcome && onUseTransfer(choice, outcome.toast)}
            className={`${btnPrimary} w-full disabled:opacity-40`}
          >
            {choice ? `Use this ${formatCurrency(Number(choice.amount))}` : 'Pick a transfer'}
          </button>
          <button disabled={busy} onClick={onOtherWay} className="w-full h-11 text-[15px] font-bold text-ink hover:text-pitch-700 disabled:opacity-40">
            Paid in cash
          </button>
        </div>
      }
    >
      <SheetTitle id={titleId} title={`How did ${first} pay?`} sub={`${formatCurrency(due)} for ${game}`} onClose={onClose} />
      <h3 className="mt-5 px-1 mb-1.5 text-[13px] font-semibold text-gray-500">Was it one of these transfers?</h3>
      <p className="px-1 mb-2 text-[13px] leading-snug text-gray-600">Money came in that we couldn’t put a name to.</p>
      <ul className="rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden" role="radiogroup" aria-label="Transfers">
        {sorted.map((t) => {
          const on = picked === t.id;
          const short = Number(t.amount) + 0.001 < due;
          return (
            <li key={t.id}>
              <button
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(t.id)}
                className={`w-full flex items-center gap-3 min-h-16 px-3.5 py-2.5 text-left transition-colors ${on ? 'bg-volt-300/35' : 'hover:bg-chalk'}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-ink truncate">{from(t)}</span>
                  {looksLike(t) && <span className="block text-[13px] font-semibold text-pitch-600">Looks like {first}</span>}
                  <span className="block text-[13px] text-gray-500 truncate">
                    {when(t.receivedAt)}
                    {accountHint(t)}
                    {short && <span className="text-amber-700 font-semibold">, not enough</span>}
                  </span>
                </span>
                <span className="shrink-0 font-display text-[15px] font-extrabold tabular-nums text-ink">{formatCurrency(Number(t.amount))}</span>
                <span
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-colors ${on ? 'bg-ink text-volt-300' : 'border-2 border-gray-200'}`}
                  aria-hidden
                >
                  {on && (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
