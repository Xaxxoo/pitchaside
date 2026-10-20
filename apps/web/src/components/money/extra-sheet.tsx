'use client';

import { useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { Avatar } from '@/components/ratings';
import { KEPT_REASON_WORDS, formatCurrency, getGiveExtraPreview, type ExtraMoney, type ExtraSource, type GiveExtraPreview, type KeptReason, type OwedItem } from '@/lib/api';
import { owedLabel, type MatchMember } from '@/lib/give-outcome';

type Choice = 'someone' | 'unknown' | 'keep' | 'back' | 'group' | 'release' | 'accept';

/** "Sat 17 Oct", or "October 2026 dues". */
const dueLabel = (d: { date: string; label: string | null; kind: string }) =>
  owedLabel({ date: d.date, label: d.label, kind: d.kind } as OwedItem);

/**
 * A member sent more than they owed: what was the extra for? Paying for someone else (it pays
 * what they owe now, shown before confirming), someone not in the group yet or no one knows who
 * (it waits, apart from the sender's money), keeping it for the sender's next game, or sending
 * it back. Nothing happens with the money until the organiser picks one.
 *
 * With `source` 'waiting' it sorts money already waiting for a player: give it to the player
 * once they're in the group, or put it back with the sender's extra.
 */
export function ExtraSheet({
  groupId,
  source = 'extra',
  item,
  members,
  owed,
  busy,
  onGive,
  onKeep,
  onSendBack,
  onHold,
  onRelease,
  onKeepForGroup,
  onAcceptGift,
  onClose,
}: {
  groupId: string;
  source?: ExtraSource;
  item: ExtraMoney;
  members: MatchMember[];
  owed: OwedItem[];
  busy: boolean;
  onGive: (to: MatchMember, toast: string) => void;
  onKeep: () => void;
  onSendBack: () => void;
  onHold: (note: string) => void;
  onRelease: () => void;
  /** The group keeps it (nobody is owed it). Left out for treasurers: only organisers decide that. */
  onKeepForGroup?: (reason: KeptReason, note: string) => void;
  /** They offered it to the group from their app: accept. Left out for treasurers. */
  onAcceptGift?: () => void;
  onClose: () => void;
}) {
  const waiting = source === 'waiting';
  const amount = waiting ? item.waiting : item.extra;
  const titleId = useId();
  const first = item.name.split(' ')[0];
  // What they asked for from their app comes ready picked: accept their offer, or send it back.
  const ask = waiting ? null : item.request ?? null;
  const offered = ask ? Math.min(ask.amount, amount) : 0;
  const [choice, setChoice] = useState<Choice | null>(ask?.kind === 'refund' ? 'back' : ask?.kind === 'give' && onAcceptGift ? 'accept' : null);
  const [query, setQuery] = useState('');
  const [to, setTo] = useState<MatchMember | null>(null);
  const [preview, setPreview] = useState<GiveExtraPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<KeptReason | null>(null);
  const [why, setWhy] = useState('');

  useEffect(() => {
    setPreview(null);
    setPreviewFailed(false);
    if (!to) return;
    getGiveExtraPreview(groupId, item.playerId, to.playerId, source).then(setPreview, () => setPreviewFailed(true));
  }, [groupId, item.playerId, to, source]);

  // Who owes, most first: the likeliest people the extra was for.
  const owes = (playerId: string) => owed.filter((o) => o.playerId === playerId).reduce((n, o) => n + o.amount, 0);
  const q = query.trim().toLowerCase();
  const others = members
    .filter((m) => m.playerId !== item.playerId)
    .filter((m) => !q || `${m.name} ${m.nickname ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => owes(b.playerId) - owes(a.playerId) || a.name.localeCompare(b.name));
  const toFirst = to?.name.split(' ')[0];
  // Name the transfer only when it alone explains the extra.
  const sent = item.lastTransfer && item.lastTransfer.amount + 0.001 >= amount
    ? `${formatCurrency(item.lastTransfer.amount)} on ${new Date(item.lastTransfer.receivedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}`
    : null;

  const options: { key: Choice; title: string; hint: string }[] = waiting
    ? [
        { key: 'someone', title: 'It was for a player in the group', hint: 'It pays what they owe now' },
        { key: 'release', title: `Put it back with ${first}’s extra`, hint: 'It wasn’t for anyone else' },
      ]
    : [
        ...(ask?.kind === 'give' && onAcceptGift
          ? [{ key: 'accept' as const, title: `Accept ${first}’s offer`, hint: `The group keeps ${formatCurrency(offered)}` }]
          : []),
        { key: 'someone', title: 'Paying for someone else', hint: 'Like a friend’s game fee' },
        { key: 'unknown', title: 'For someone not in the group yet', hint: 'Or you don’t know who yet' },
        { key: 'keep', title: `Keep it for ${first}’s next game`, hint: 'They paid ahead' },
        { key: 'back', title: `Send it back to ${first}`, hint: 'Refund it from the group account' },
        ...(onKeepForGroup ? [{ key: 'group' as const, title: 'Keep it for the group', hint: `Nobody owes anybody. ${first} sees why` }] : []),
      ];

  const outcome = (() => {
    if (!preview || !to) return null;
    const parts = [
      preview.pays.length ? `Pays ${toFirst}’s ${preview.pays.map(dueLabel).join(' and ')}` : null,
      preview.towards ? `${formatCurrency(preview.towards.paidSoFar)} towards ${toFirst}’s ${dueLabel(preview.towards)}` : null,
      preview.left > 0.5 ? `${formatCurrency(preview.left)} ${waiting ? 'keeps waiting' : 'stays to sort'}` : null,
    ].filter(Boolean);
    return parts.join('. ');
  })();

  const footer =
    choice === 'someone' ? (
      <div className="space-y-2">
        {to && (
          <p className="text-[13px] leading-snug font-semibold text-ink" aria-live="polite">
            {previewFailed ? 'We couldn’t check what this pays. Try again.' : !preview ? 'Checking what it pays…' : preview.move <= 0.001 ? `${toFirst} doesn’t owe anything that can be paid now.` : `${outcome}.`}
          </p>
        )}
        <button
          disabled={!to || !preview || preview.move <= 0.001 || busy}
          onClick={() => to && preview && onGive(to, `${formatCurrency(preview.move)} ${waiting ? 'from ' + first : 'of ' + first + '’s extra'} paid for ${to.name}. ${outcome}.`)}
          className={`${btnPrimary} w-full disabled:opacity-40`}
        >
          {busy ? 'Saving…' : to ? `Pay for ${toFirst}` : 'Pick who it was for'}
        </button>
      </div>
    ) : choice === 'unknown' ? (
      <button disabled={busy} onClick={() => onHold(note.trim())} className={`${btnPrimary} w-full`}>
        {busy ? 'Saving…' : `Hold ${formatCurrency(amount)} until you know who`}
      </button>
    ) : choice === 'release' ? (
      <button disabled={busy} onClick={onRelease} className={`${btnPrimary} w-full`}>
        {busy ? 'Saving…' : `Put ${formatCurrency(amount)} back with ${first}’s extra`}
      </button>
    ) : choice === 'keep' ? (
      <button disabled={busy} onClick={onKeep} className={`${btnPrimary} w-full`}>
        {busy ? 'Saving…' : `Keep ${formatCurrency(amount)} for ${first}`}
      </button>
    ) : choice === 'back' ? (
      <button onClick={onSendBack} className={`${btnPrimary} w-full`}>
        Send {formatCurrency(amount)} back to {first}
      </button>
    ) : choice === 'accept' && onAcceptGift ? (
      <button disabled={busy} onClick={onAcceptGift} className={`${btnPrimary} w-full`}>
        {busy ? 'Saving…' : `Accept ${formatCurrency(offered)} for the group`}
      </button>
    ) : choice === 'group' && onKeepForGroup ? (
      <button
        disabled={busy || !reason || (reason === 'other' && !why.trim())}
        onClick={() => reason && onKeepForGroup(reason, why.trim())}
        className={`${btnPrimary} w-full disabled:opacity-40`}
      >
        {busy ? 'Saving…' : !reason ? 'Pick why' : reason === 'other' && !why.trim() ? 'Say why in a few words' : `Keep ${formatCurrency(amount)} for the group`}
      </button>
    ) : (
      <button disabled className={`${btnPrimary} w-full opacity-40`}>
        Pick what it was for
      </button>
    );

  // What a choice does, in a line, shown under it once picked.
  const detail = (key: Choice) =>
    key === 'unknown' ? (
      <>
        <label className="block">
          <span className="sr-only">Who might it be for? (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder="Who might it be for? (optional)"
            className="w-full h-11 px-3.5 bg-white border border-gray-200 rounded-xl text-[15px] placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          />
        </label>
        <p className="mt-2 text-[13px] leading-snug text-gray-600">Kept apart from {first}’s money. It pays no game until you give it to someone.</p>
      </>
    ) : key === 'keep' ? (
      <p className="text-[13px] leading-snug text-gray-600">Pays {first}’s next game once it’s the next one, never games further ahead.</p>
    ) : key === 'back' ? (
      <p className="text-[13px] leading-snug text-gray-600">Opens Send money with a refund to {first}’s own account ready.</p>
    ) : key === 'group' ? (
      <>
        <p className="text-[13px] leading-snug text-gray-600">
          {first} won’t be owed it any more: it stops showing as theirs and can’t be refunded. The money stays in the account. {first} sees the reason in their history.
        </p>
        <div role="radiogroup" aria-label="Why is the group keeping it?" className="mt-2.5 flex flex-wrap gap-2">
          {(['player_agreed', 'unreachable', 'sorted_in_person', 'other'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={`press min-h-11 px-3.5 rounded-full border text-[13px] font-bold transition-colors ${
                reason === r ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-gray-700 hover:border-ink'
              }`}
            >
              {KEPT_REASON_WORDS[r]}
            </button>
          ))}
        </div>
        {reason === 'other' && (
          <label className="block mt-2.5">
            <span className="sr-only">Why is the group keeping it?</span>
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value.slice(0, 120))}
              maxLength={120}
              placeholder="e.g. Paid towards the new balls"
              className="w-full h-11 px-3.5 bg-white border border-gray-200 rounded-xl text-[15px] placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
          </label>
        )}
      </>
    ) : key === 'accept' ? (
      <p className="text-[13px] leading-snug text-gray-600">
        {first} won’t be owed it any more. The money stays in the account. {first} sees “You gave it to the group” in their history.
        {amount - offered > 0.001 && ` The other ${formatCurrency(amount - offered)} came in after they offered and stays to sort.`}
      </p>
    ) : key === 'release' ? (
      <p className="text-[13px] leading-snug text-gray-600">Back to {first}’s extra, to keep for them or send back.</p>
    ) : null;

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left" footer={footer}>
      <SheetTitle id={titleId} title={waiting ? 'Money waiting for a player' : 'What was the extra for?'} onClose={onClose} />

      {/* The money in question, first: how much, from whom, when */}
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-chalk px-3.5 py-3">
        {waiting ? (
          <span className="w-10 h-10 shrink-0 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center font-display text-[15px] font-extrabold text-gray-500" aria-hidden>
            ?
          </span>
        ) : (
          <Avatar name={item.name} className="w-10 h-10 text-[13px]" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-ink truncate">{waiting ? (item.waitingNote ? `For ${item.waitingNote}` : 'Not known yet') : item.name}</p>
          <p className="text-[13px] text-gray-500 truncate">
            {waiting ? `Sent by ${item.name}` : sent ? `Sent ${sent}` : 'From earlier payments'}
          </p>
        </div>
        <p className="shrink-0 font-display text-[22px] font-extrabold tabular-nums text-ink">{formatCurrency(amount)}</p>
      </div>
      {ask ? (
        <p className="mt-2 flex gap-2 rounded-2xl bg-volt-300/30 px-3.5 py-2.5 text-[13px] leading-snug text-ink" role="note">
          <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-pitch-600" aria-hidden />
          <span>
            <b>
              {ask.kind === 'give' ? `${first} offered ${formatCurrency(offered)} to the group` : `${first} asked for ${formatCurrency(offered)} back`}
            </b>
            {ask.at && ` · ${new Date(ask.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}`}
            {ask.kind === 'give' && !onAcceptGift && '. Only an organiser can accept it.'}
          </span>
        </p>
      ) : (
        <p className="mt-2 px-1 text-[12px] text-gray-500">{waiting ? 'It pays nothing until you choose.' : `More than ${first} owed. Nothing happens with it until you choose.`}</p>
      )}

      <div role="radiogroup" aria-label={waiting ? 'Who was it for?' : 'What was it for?'} className="mt-4 rounded-3xl bg-white border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {options.map((o) => {
          const on = choice === o.key;
          const more = on ? detail(o.key) : null;
          return (
            <div key={o.key} className={on ? 'bg-volt-300/25' : ''}>
              <button
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(o.key)}
                className="press w-full flex items-center gap-3 min-h-14 px-4 py-2.5 text-left transition-colors hover:bg-chalk/60"
              >
                <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${on ? 'bg-ink' : 'border-2 border-gray-300'}`} aria-hidden>
                  {on && <span className="w-2 h-2 rounded-full bg-volt-300" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-ink">{o.title}</span>
                  {!on && <span className="block text-[13px] leading-snug text-gray-500 truncate">{o.hint}</span>}
                </span>
              </button>
              {more && <div className="pl-12 pr-4 pb-3.5 -mt-1 animate-fade-in-up">{more}</div>}
            </div>
          );
        })}
      </div>

      {choice === 'someone' && (
        <div className="mt-4">
          <h3 className="px-1 mb-2 text-[13px] font-semibold text-gray-500">Who was it for?</h3>
          {members.length > 8 && (
            <div className="sticky top-0 z-10 -mx-6 px-6 pt-1 pb-2 bg-white">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a player"
                aria-label="Find a player"
                className="w-full h-11 px-3.5 bg-chalk rounded-xl text-[15px] placeholder:text-gray-500 focus:outline-none focus:bg-white focus:ring-4 focus:ring-volt-300/70"
              />
            </div>
          )}
          {others.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{q ? `No one called “${query.trim()}”.` : 'No one else in the group yet.'}</p>
          ) : (
            <ul role="radiogroup" aria-label="Who was it for?" className="rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {others.map((m) => {
                const on = to?.playerId === m.playerId;
                const due = owes(m.playerId);
                return (
                  <li key={m.playerId}>
                    <button
                      role="radio"
                      aria-checked={on}
                      onClick={() => setTo(m)}
                      className={`w-full flex items-center gap-3 min-h-16 px-3.5 py-2.5 text-left transition-colors ${on ? 'bg-volt-300/35' : 'hover:bg-chalk'}`}
                    >
                      <Avatar name={m.name} className="w-10 h-10 text-[13px]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-bold text-ink truncate">{m.name}</span>
                        <span className={`block text-[13px] ${due ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>{due ? `Owes ${formatCurrency(due)}` : 'Owes nothing'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
