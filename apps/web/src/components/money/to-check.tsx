'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { Avatar } from '@/components/ratings';
import { btnDanger, btnPrimary, btnSecondary } from '@/components/buttons';
import { Callout } from '@/components/callout';
import { stagger } from '@/components/motion';
import { useToast } from '@/components/toast';
import { confirmClaim, formatCurrency, getToCheck, recheckReceipt, rejectClaim, type ToCheck as ToCheckData } from '@/lib/api';
import { receiptUrl } from '@/lib/http';

type Claim = ToCheckData['claims'][number];
type OnReceipt = ToCheckData['onReceipt'][number];

const nameOf = (p: Claim['player']) => p.nickname || p.firstName;
const fullOf = (p: Claim['player']) => `${p.firstName} ${p.lastName}`;
/** "2h ago", "yesterday", "3 days ago": when they said it. */
function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * "To check" on Money: players who say they've paid, newest first, each with their receipt and the
 * bank transfer that fits it (if one has come in). One tap opens it to confirm or say it wasn't
 * received. Below, games confirmed on a receipt that the bank still hasn't confirmed after 3 days.
 * Nothing shows when there's nothing to check.
 */
export function ToCheck({ groupId, onChanged }: { groupId: string; onChanged: () => void }) {
  const [data, setData] = useState<ToCheckData | null>(null);
  const [open, setOpen] = useState<Claim | null>(null);
  const [recheck, setRecheck] = useState<OnReceipt | null>(null);
  const load = useCallback(() => {
    getToCheck(groupId).then(setData).catch(() => setData(null));
  }, [groupId]);
  useEffect(load, [load]);

  const done = () => {
    setOpen(null);
    setRecheck(null);
    load();
    onChanged();
  };

  if (!data || (!data.claims.length && !data.onReceipt.length)) return null;
  return (
    <section aria-labelledby="to-check" className="mb-5">
      <h2 id="to-check" className="flex items-center gap-2 text-base font-bold text-ink">
        To check
        <span className="min-w-6 h-6 px-1.5 rounded-full bg-kit-500 text-ink text-[12px] font-extrabold leading-6 text-center tabular-nums">{data.claims.length + data.onReceipt.length}</span>
      </h2>
      <p className="mb-2 text-xs text-gray-500">Players who say they’ve paid: open one, check it, confirm.</p>
      <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
        {data.claims.map((c, i) => (
          <li key={c.id} className="animate-rise" style={stagger(i, 30, 0)}>
            <button onClick={() => setOpen(c)} className="press w-full flex items-center gap-3 min-h-16 px-4 py-3 text-left hover:bg-chalk">
              <Avatar name={fullOf(c.player)} photoKey={c.player.photoKey} className="w-10 h-10 text-xs" />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold text-ink truncate">{nameOf(c.player)}</span>
                  <span className="shrink-0 font-display text-[17px] font-extrabold text-ink tabular-nums">{formatCurrency(c.amount)}</span>
                </span>
                <span className={`block text-[12px] truncate ${c.transfer ? 'text-pitch-700 font-semibold' : 'text-gray-500'}`}>
                  {c.transfer ? `Transfer in: ${formatCurrency(c.transfer.amount)}${c.transfer.senderName ? ` from ${c.transfer.senderName}` : ''} ✓` : `${ago(c.createdAt)} · ${c.hasReceipt ? 'receipt sent' : 'no receipt'}`}
                </span>
              </span>
              {c.hasReceipt && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptUrl(c.id)} alt="" className="w-9 h-12 shrink-0 rounded-md object-cover object-top bg-chalk border border-gray-200" />
              )}
            </button>
          </li>
        ))}
        {data.onReceipt.map((p) => (
          <li key={p.paymentId}>
            <button onClick={() => setRecheck(p)} className="press w-full flex items-center gap-3 min-h-16 px-4 py-3 text-left hover:bg-chalk">
              <Avatar name={fullOf(p.player)} photoKey={p.player.photoKey} className="w-10 h-10 text-xs" />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold text-ink truncate">{nameOf(p.player)}</span>
                  <span className="shrink-0 font-display text-[17px] font-extrabold text-ink tabular-nums">{formatCurrency(p.amount)}</span>
                </span>
                <span className="block text-[12px] text-amber-700 font-semibold truncate">Paid on receipt {ago(p.paidAt)} · no transfer yet</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <CheckSheet claim={open} onClose={() => setOpen(null)} onDone={done} />}
      {recheck && <RecheckSheet item={recheck} onClose={() => setRecheck(null)} onDone={done} />}
    </section>
  );
}

/** One "I've paid": the receipt big, the transfer that fits (or that none has come in), then confirm or not received. */
function CheckSheet({ claim: c, onClose, onDone }: { claim: Claim; onClose: () => void; onDone: () => void }) {
  const titleId = useId();
  const noteId = useId();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState('');
  const name = nameOf(c.player);

  async function act(fn: () => Promise<unknown>, said: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(said);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const footer = refusing ? (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => setRefusing(false)} disabled={busy} className={btnSecondary}>
        Back
      </button>
      <button onClick={() => act(() => rejectClaim(c.id, note), `${name} has been told`)} disabled={busy} className={btnDanger}>
        {busy ? 'Sending…' : `Tell ${name}`}
      </button>
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => setRefusing(true)} disabled={busy} className={btnSecondary}>
        Not received
      </button>
      <button
        onClick={() => act(() => confirmClaim(c.id), c.transfer ? `${formatCurrency(c.transfer.amount)} given to ${name}` : `${name} marked paid on the receipt`)}
        disabled={busy}
        className={btnPrimary}
      >
        {busy ? 'Saving…' : c.transfer ? `Give it to ${name}` : 'Confirm'}
      </button>
    </div>
  );

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left" footer={footer}>
      <SheetTitle id={titleId} title={`${name} says they sent ${formatCurrency(c.amount)}`} sub={`${fullOf(c.player)} · ${ago(c.createdAt)}`} onClose={onClose} />
      {refusing ? (
        <div className="mt-4">
          <p className="text-[14px] text-gray-700">
            {name} gets a message that it hasn’t been found. Say why, if you like.
          </p>
          <label htmlFor={noteId} className="mt-3 block text-xs font-bold text-gray-500">
            Note to {name} (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            rows={3}
            placeholder="e.g. Nothing in the account from you on Saturday"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[15px] focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          />
        </div>
      ) : (
        <>
          {/* What the bank says, first: that's what decides it */}
          {c.transfer ? (
            <Callout
              tone="good"
              className="mt-4"
              title={`${formatCurrency(c.transfer.amount)} came in${c.transfer.senderName ? ` from ${c.transfer.senderName}` : ''} ${ago(c.transfer.receivedAt)}`}
            >
              Confirming gives it to {name}.
            </Callout>
          ) : (
            <Callout tone="note" className="mt-4" title="No transfer that fits has come in yet">
              Confirm marks {name} paid on the receipt; the bank confirms it when it lands.
            </Callout>
          )}
          {c.hasReceipt ? (
            <a href={receiptUrl(c.id)} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-2xl border border-gray-200 bg-chalk overflow-hidden" aria-label={`Open ${name}’s receipt`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptUrl(c.id)} alt={`${name}’s receipt`} className="w-full max-h-[46vh] object-contain" />
            </a>
          ) : (
            <Callout tone="warn" className="mt-3" title="No receipt sent">
              Check your bank app before confirming.
            </Callout>
          )}
        </>
      )}
    </Sheet>
  );
}

/** A game paid on a receipt with no transfer after 3 days: keep it (you've seen the money) or back to owed. */
function RecheckSheet({ item: p, onClose, onDone }: { item: OnReceipt; onClose: () => void; onDone: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const name = nameOf(p.player);
  async function act(keep: boolean) {
    setBusy(true);
    try {
      await recheckReceipt(p.paymentId, keep);
      toast.success(keep ? `${name} stays paid` : `${name} owes ${formatCurrency(p.amount)} again`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => act(false)} disabled={busy} className={btnSecondary}>
            Back to owed
          </button>
          <button onClick={() => act(true)} disabled={busy} className={btnPrimary}>
            {busy ? 'Saving…' : 'It came in'}
          </button>
        </div>
      }
    >
      <SheetTitle id={titleId} title={`No transfer yet for ${name}’s ${formatCurrency(p.amount)}`} sub={`Paid on receipt ${ago(p.paidAt)}${p.markedBy ? ` by ${p.markedBy}` : ''}`} onClose={onClose} />
      <Callout tone="note" className="mt-4" title="Seen the money another way? Keep it paid">
        Cash, or a transfer that came in another way. If not, it goes back to owed.
      </Callout>
    </Sheet>
  );
}
