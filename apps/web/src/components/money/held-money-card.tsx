'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { useToast } from '@/components/toast';
import { Callout } from '@/components/callout';
import { formatCurrency } from '@/lib/api';
import { cancelHeldMoneyRequest, requestHeldMoney, spendHeldMoney, type PlayerGroup } from '@/lib/player';

type Choice = 'use' | 'give' | 'refund' | 'cancel';

/**
 * Money of theirs a group's organiser is holding (sent beyond what was owed, or from a game called
 * off), and what they want done with it. Using it for their games happens at once; giving it to
 * the group or asking for it back waits for the organiser, and they can take that back until then.
 */
export function HeldMoneyCard({ group, showGroup, onChanged }: { group: PlayerGroup; showGroup: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [asking, setAsking] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const held = group.extra;
  const pending = group.extraRequest ?? null;
  // What they asked about; more may have come in since, which stays theirs to sort.
  const asked = pending ? group.extraRequestAmount || held : 0;
  const since = pending ? Math.max(0, held - asked) : 0;

  // Said before they tap, from the server's own figures: what it pays now, what's kept for later.
  const owe = group.toPay;
  const useWords =
    owe <= 0
      ? `You don’t owe anything now, so all ${formatCurrency(held)} is kept for your next games. It pays each one when it’s due.`
      : held >= owe
        ? `${formatCurrency(owe)} pays what you owe now.${held - owe > 0.001 ? ` The other ${formatCurrency(held - owe)} is kept for your next games.` : ''}`
        : `It goes toward the ${formatCurrency(owe)} you owe now. You’ll still have ${formatCurrency(owe - held)} to send.`;

  const dialogs: Record<Choice, { title: string; message: string; confirm: string; danger?: boolean }> = {
    use: { title: `Use ${formatCurrency(held)} for your games?`, message: useWords, confirm: 'Use it for my games' },
    give: {
      title: `Give ${formatCurrency(held)} to the group?`,
      message: 'Your organiser confirms it. Then it’s the group’s: it won’t pay your games or come back to you. You can take the offer back until they confirm.',
      confirm: 'Offer it to the group',
    },
    refund: {
      title: `Ask for ${formatCurrency(held)} back?`,
      message: 'Your organiser sends it back to you. You can take the request back until they do.',
      confirm: 'Ask for it back',
    },
    cancel: {
      title: pending === 'give' ? 'Take back your offer?' : 'Take back your request?',
      message: `The ${formatCurrency(asked)} stays with your organiser, and you can choose again.`,
      confirm: pending === 'give' ? 'Take back offer' : 'Take back request',
    },
  };

  async function go(choice: Choice) {
    setBusy(true);
    try {
      if (choice === 'use') {
        await spendHeldMoney(group.id);
        toast.success(owe > 0 ? `${formatCurrency(held)} is now paying your games` : `${formatCurrency(held)} kept for your next games`);
      } else if (choice === 'cancel') {
        await cancelHeldMoneyRequest(group.id);
        toast.success(pending === 'give' ? 'Offer taken back' : 'Request taken back');
      } else {
        await requestHeldMoney(group.id, choice);
        toast.success(choice === 'give' ? 'Offered to the group. Your organiser confirms it.' : 'Asked. Your organiser sends it back.');
      }
      setAsking(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That didn’t go through. Try again.');
      setAsking(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const d = asking ? dialogs[asking] : null;

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-4">
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-gray-600">
        <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-sun-400" aria-hidden />
        <span className="truncate">With your organiser{showGroup ? ` · ${group.name}` : ''}</span>
      </p>
      <p className="mt-1 font-display text-[28px] leading-tight font-extrabold text-ink tabular-nums break-words">{formatCurrency(held)}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
        Extra you sent, or from a game called off.
      </p>

      {pending ? (
        <div className="mt-3" aria-live="polite">
          <Callout
            tone="note"
            title={pending === 'give' ? `You offered ${formatCurrency(asked)} to the group` : `You asked for ${formatCurrency(asked)} back`}
          >
            Waiting for your organiser to {pending === 'give' ? 'confirm' : 'send it'}.
            {since > 0.001 && ` The other ${formatCurrency(since)} came in after you asked and isn’t part of it.`}
          </Callout>
          <button onClick={() => setAsking('cancel')} disabled={busy} className={`${btnSecondary} mt-3 w-full`}>
            {pending === 'give' ? 'Take back offer' : 'Take back request'}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[13px] font-bold text-ink">What should happen to it?</p>
          <button onClick={() => setAsking('use')} disabled={busy} className={`${btnPrimary} mt-2 w-full`}>
            Use it for my games
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => setAsking('give')} disabled={busy} className={`${btnSecondary} px-2 text-[14px]`}>
              Give to group
            </button>
            <button onClick={() => setAsking('refund')} disabled={busy} className={`${btnSecondary} px-2 text-[14px]`}>
              Get it back
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!d}
        title={d?.title ?? ''}
        message={d?.message ?? ''}
        confirmLabel={busy ? 'One moment…' : d?.confirm}
        cancelLabel="Not now"
        variant={d?.danger ? 'danger' : 'default'}
        onConfirm={() => asking && !busy && go(asking)}
        onCancel={() => !busy && setAsking(null)}
      />
    </div>
  );
}
