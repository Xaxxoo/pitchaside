'use client';

import { useId, useState } from 'react';
import type { IPayment } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { FilterBar, FilterMenu } from '@/components/filter-menu';
import { SheetTitle } from '@/components/home/sheet-title';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { stagger } from '@/components/motion';
import { formatCurrency } from '@/lib/api';
import { Avatar } from '@/components/ratings';
import { leftToPay, playerState, type PlayerStateKey } from '@/lib/game-player';


type Filter = 'to_pay' | 'paid' | 'no_show' | 'all';
type Action = 'paid' | 'cash' | 'no_show' | 'came' | 'free' | 'unpaid' | 'out' | 'details' | 'move';

const fullName = (p: IPayment) => (p.player ? `${p.player.firstName} ${p.player.lastName}` : 'Player');
/** What they go by: their nickname, else their full name. */
const name = (p: IPayment) => p.player?.nickname || fullName(p);
const tone: Record<PlayerStateKey, string> = {
  to_pay: 'text-amber-700 font-semibold',
  paid: 'text-pitch-600 font-semibold',
  dues_paid: 'text-pitch-600 font-semibold',
  dues_unpaid: 'text-amber-700',
  free: 'text-gray-500',
  no_show: 'text-gray-500',
};

/**
 * What can be done for a player, by where they stand and whether the game has been played, each
 * said in plain words. Before the game: paid ahead, free, or off the game. After: who didn't come.
 */
function actionsFor(p: IPayment, key: PlayerStateKey, before: boolean): { action: Action; title: string; detail: string }[] {
  const amount = formatCurrency(Number(p.amount));
  const byTransfer = p.source === 'transfer';
  const kept = byTransfer ? ' What they paid by transfer goes to Extra money to sort on Money, where you say what it was for.' : '';
  // Taking someone off sends money paid by transfer to extra to sort; cash marked paid has to be undone first.
  const takeOff = { action: 'out' as const, title: 'Take off this game', detail: `Frees their place. Nothing to pay.${kept}` };
  // Part paid by transfer: Mark paid means the rest came another way.
  const markPaidRest = p.paidSoFar
    ? `${formatCurrency(p.paidSoFar)} came by transfer; they paid the other ${formatCurrency(leftToPay(p))} in cash or by a transfer with no name.`
    : null;
  if (before) {
    switch (key) {
      case 'to_pay':
        return [
          { action: 'cash', title: 'Paid cash', detail: 'They handed you money for this game.' },
          { action: 'paid', title: 'Mark paid', detail: markPaidRest ?? 'Paid another way — a transfer with no name, or someone paid for them.' },
          { action: 'free', title: 'Let them play free', detail: 'They won’t be charged for this game.' },
          takeOff,
        ];
      case 'paid':
        return [{ action: 'unpaid', title: 'Undo payment', detail: `Back to ${amount} not paid yet.${kept}` }, ...(byTransfer ? [takeOff] : [])];
      case 'free':
        return [{ action: 'unpaid', title: 'Charge them after all', detail: `Back to ${amount} not paid yet.` }, takeOff];
      default:
        return [takeOff];
    }
  }
  switch (key) {
    case 'to_pay':
      return [
        { action: 'cash', title: 'Paid cash', detail: 'They handed you money for this game.' },
        { action: 'paid', title: 'Mark paid', detail: markPaidRest ?? 'Paid another way — a transfer with no name, or someone paid for them.' },
        { action: 'no_show', title: 'Didn’t come', detail: 'Said they were in and didn’t show. Nothing to pay.' },
        { action: 'free', title: 'Played free', detail: 'They came. Don’t charge them for this game.' },
      ];
    case 'paid':
      return [
        { action: 'unpaid', title: 'Undo payment', detail: `Back to ${amount} to pay.${kept}` },
        { action: 'no_show', title: 'Didn’t come', detail: `Nothing to pay.${kept}` },
      ];
    case 'free':
      return [
        { action: 'unpaid', title: 'Charge them after all', detail: `Back to ${amount} to pay.` },
        { action: 'no_show', title: 'Didn’t come', detail: 'Nothing to pay.' },
      ];
    case 'no_show':
      return [{ action: 'came', title: 'Came after all', detail: Number(p.amount) > 0 ? `Back to ${amount} to pay.` : 'Counts as played.' }];
    default:
      // Dues groups: the game itself costs nothing; only whether they came.
      return [{ action: 'no_show', title: 'Didn’t come', detail: 'Leaves them out of the vote and the team sheet.' }];
  }
}

/**
 * Everyone in a game, with where they stand. Unpaid first while anyone owes. Each row has its one
 * likely action (Mark paid) on it; tapping the row opens the rest, each explained first. "Select" marks
 * several paid at once, after a confirm that names them.
 */
export function PlayerList({
  payments,
  coveredByDues,
  before,
  canSendDetails = false,
  canMove,
  busyId,
  onAdd,
  onAction,
  onBulkPaid,
}: {
  payments: IPayment[];
  coveredByDues: boolean;
  /** The game hasn't been played yet: everyone listed has said they're in. */
  before: boolean;
  /** The group has an account, so players can be sent its details on WhatsApp. */
  canSendDetails?: boolean;
  /** Paid by transfer, and they have another unpaid game it could pay instead. */
  canMove?: (p: IPayment) => boolean;
  busyId: string | null;
  /** Put players on the game by hand (from the group, someone new, or the QR code). */
  onAdd?: () => void;
  onAction: (p: IPayment, action: Action) => void;
  onBulkPaid: (ids: string[]) => Promise<void>;
}) {
  const sheetTitle = useId();
  const rows = payments.map((p) => ({ p, s: playerState(p, coveredByDues, before) }));
  const count = (k: Filter) =>
    k === 'all' ? rows.length : rows.filter(({ s }) => (k === 'paid' ? s.key === 'paid' || s.key === 'dues_paid' : s.key === k)).length;
  const [filter, setFilter] = useState<Filter | null>(null);
  const shown: Filter = filter ?? (count('to_pay') ? 'to_pay' : 'all');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<IPayment | null>(null);

  const needle = search.trim().toLowerCase();
  const visible = rows.filter(({ p, s }) => {
    if (shown === 'to_pay' && s.key !== 'to_pay') return false;
    if (shown === 'paid' && s.key !== 'paid' && s.key !== 'dues_paid') return false;
    if (shown === 'no_show' && s.key !== 'no_show') return false;
    return !needle || `${name(p)} ${p.player?.nickname ?? ''}`.toLowerCase().includes(needle);
  });
  const selectable = visible.filter(({ s }) => s.key === 'to_pay');
  const pickedRows = rows.filter(({ p }) => picked.has(p.id));

  const filters = (
    [
      { key: 'to_pay', label: before ? 'Not paid' : 'To pay' },
      { key: 'paid', label: 'Paid' },
      { key: 'no_show', label: 'Didn’t come' },
      { key: 'all', label: 'All' },
    ] as { key: Filter; label: string }[]
  ).filter((f) => (f.key === 'to_pay' ? !coveredByDues : f.key === 'no_show' ? count('no_show') > 0 : true));

  // Adding players: the list's first row, shaped like a player, so it's found where players are.
  const addRow = onAdd && !selecting && !needle && (
    <li>
      <button onClick={onAdd} className="press w-full flex items-center gap-3 px-3.5 min-h-16 py-2.5 text-left hover:bg-chalk/70">
        <span className="w-10 h-10 shrink-0 rounded-full border-2 border-dashed border-gray-300 text-ink flex items-center justify-center" aria-hidden>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold text-ink">Add players</span>
          <span className="block text-[13px] text-gray-500 truncate">Group, someone new, or QR code</span>
        </span>
        <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </li>
  );

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-labelledby="players-title">
      {/* One job per row: the title (with Select, which changes how the list works), then the
          filter. Adding players is the list's first row, so it never crowds the title. */}
      <div className="flex items-center justify-between gap-3">
        <h2 id="players-title" className="text-base font-bold text-ink">
          {before ? 'Who’s in' : 'Who played'} <span className="font-semibold text-gray-500 tabular-nums">· {rows.length}</span>
        </h2>
        {!coveredByDues && count('to_pay') > 1 && (
          <button
            onClick={() => {
              setSelecting(!selecting);
              setPicked(new Set());
            }}
            aria-pressed={selecting}
            className="press shrink-0 min-h-11 -mr-1 px-2 text-[14px] font-bold text-pitch-700 hover:text-ink"
          >
            {selecting ? 'Cancel' : 'Select to mark paid'}
          </button>
        )}
      </div>

      {/* Who to show as a dropdown, with search beside it once the list is long */}
      <FilterBar className="mt-2">
        <FilterMenu
          label="Show players"
          title="Show"
          value={shown}
          onChange={setFilter}
          columns={2}
          options={filters.map((f) => ({ value: f.key, label: `${f.label} · ${count(f.key)}` }))}
        />
        {rows.length > 10 && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a player"
            aria-label="Find a player"
            className="flex-1 min-w-0 min-h-11 px-3.5 bg-white border border-gray-200 rounded-2xl text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          />
        )}
      </FilterBar>

      {selecting && selectable.length > 0 && (
        <button
          onClick={() => setPicked(picked.size === selectable.length ? new Set() : new Set(selectable.map(({ p }) => p.id)))}
          className="mt-2 min-h-11 px-1 text-[13px] font-bold text-ink"
        >
          {picked.size === selectable.length ? 'Clear' : `Select all ${selectable.length} shown`}
        </button>
      )}

      {visible.length === 0 ? (
        // Said as a row of the list it stands in for, not a line floating in the middle
        <ul className="mt-3 bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
          {addRow}
          <li className="flex items-center gap-3 px-3.5 min-h-16">
            <span className="w-10 h-10 shrink-0 rounded-full bg-volt-300 text-ink flex items-center justify-center" aria-hidden>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={needle ? 'm21 21-5.2-5.2M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z' : 'm4.5 12.75 6 6 9-13.5'} />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">
              {needle ? `No one called “${search.trim()}”` : shown === 'to_pay' ? (before ? 'Everyone in has paid' : 'Everyone who came has paid') : 'No one here'}
            </span>
          </li>
        </ul>
      ) : (
        <ul className="mt-3 bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
          {addRow}
          {visible.map(({ p, s }, i) => {
            const busy = busyId === p.id;
            const canPick = selecting && s.key === 'to_pay';
            return (
              <li key={p.id} className="animate-rise" style={stagger(Math.min(i, 12), 22, 0)}>
                <div className={`relative flex items-center gap-3 px-3.5 min-h-16 py-2.5 transition-colors ${picked.has(p.id) ? 'bg-volt-300/35' : ''}`}>
                  {/* The whole row opens their options (or picks them, when selecting) */}
                  <button
                    onClick={() => (selecting ? canPick && togglePick(p.id) : setMenuFor(p))}
                    disabled={busy || (selecting && !canPick)}
                    aria-label={selecting ? `Select ${name(p)}` : `Options for ${name(p)}`}
                    {...(selecting && canPick ? { role: 'checkbox', 'aria-checked': picked.has(p.id) } : {})}
                    className="absolute inset-0 w-full hover:bg-chalk/70 active:bg-chalk transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                  />
                  {canPick && (
                    <span
                      aria-hidden
                      className={`relative pointer-events-none w-6 h-6 shrink-0 rounded-full flex items-center justify-center ${picked.has(p.id) ? 'bg-ink text-volt-300' : 'border-2 border-gray-300'}`}
                    >
                      {picked.has(p.id) && (
                        <svg className="w-3.5 h-3.5 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className={`relative pointer-events-none shrink-0 ${s.key === 'no_show' ? 'grayscale opacity-50' : ''}`} aria-hidden>
                    <Avatar name={fullName(p)} photoKey={p.player?.photoKey} className="w-10 h-10 text-sm" />
                  </span>
                  <span className="relative pointer-events-none flex-1 min-w-0">
                    <span className={`block text-[15px] font-bold leading-snug truncate ${s.key === 'no_show' ? 'text-gray-500' : 'text-ink'}`}>
                      {name(p)}
                      {/* Money goes by real names: keep it next to the nickname. */}
                      {p.player?.nickname && <span className="font-semibold text-gray-500"> · {fullName(p)}</span>}
                    </span>
                    <span className={`block text-[13px] leading-snug ${tone[s.key]}`}>{s.label}</span>
                  </span>
                  {s.key === 'to_pay' && !selecting && (
                    <button
                      onClick={() => onAction(p, 'paid')}
                      disabled={busy}
                      className="press relative shrink-0 h-11 px-3.5 rounded-xl bg-ink text-volt-300 text-[13px] font-bold hover:bg-pitch-900 disabled:opacity-50"
                    >
                      {busy ? '…' : 'Mark paid'}
                    </button>
                  )}
                  {!selecting && (
                    <svg className="relative pointer-events-none w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selecting && picked.size > 0 && (
        <div className="sticky bottom-24 z-10 mt-3 animate-rise">
          <button
            onClick={() => setConfirmBulk(true)}
            disabled={bulkBusy}
            className="press w-full h-12 rounded-2xl bg-ink text-volt-300 text-[15px] font-bold shadow-lift disabled:opacity-60"
          >
            {bulkBusy ? 'Marking paid…' : `Mark ${picked.size} paid`}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulk}
        title={`Mark ${picked.size} player${picked.size === 1 ? '' : 's'} paid?`}
        message={`${pickedRows.map(({ p }) => name(p)).join(', ')}. Use this for cash or transfers with no name on them.`}
        confirmLabel={`Mark ${picked.size} paid`}
        onConfirm={async () => {
          if (bulkBusy) return;
          setBulkBusy(true);
          setConfirmBulk(false);
          try {
            await onBulkPaid([...picked]);
            setPicked(new Set());
            setSelecting(false);
          } finally {
            setBulkBusy(false);
          }
        }}
        onCancel={() => setConfirmBulk(false)}
      />

      {menuFor && (() => {
        const s = playerState(menuFor, coveredByDues, before);
        return (
          <Sheet titleId={sheetTitle} onClose={() => setMenuFor(null)} align="left">
            <SheetTitle id={sheetTitle} title={name(menuFor)} sub={s.label} onClose={() => setMenuFor(null)} />
            <ul className="mt-4 -mx-2">
              {[
                ...actionsFor(menuFor, s.key, before),
                // Placed on this game automatically, but meant for another of theirs.
                ...(canMove?.(menuFor)
                  ? [{ action: 'move' as const, title: 'Move to another game', detail: 'It paid this game, but they meant one of their other unpaid games.' }]
                  : []),
                // Reaches players the app can't: no notifications, or added by hand and never signed in.
                ...(canSendDetails && s.key === 'to_pay'
                  ? [{ action: 'details' as const, title: 'Send payment details', detail: 'On WhatsApp: the account, the amount and their payment code.' }]
                  : []),
              ].map((a, i) => (
                <li key={a.action} className="animate-rise" style={stagger(i, 50, 40)}>
                  <button
                    onClick={() => {
                      onAction(menuFor, a.action);
                      setMenuFor(null);
                    }}
                    className="press w-full text-left px-2 py-3 rounded-2xl hover:bg-chalk"
                  >
                    <span className="block text-[15px] font-bold text-ink">{a.title}</span>
                    <span className="block text-[13px] leading-snug text-gray-600">{a.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Sheet>
        );
      })()}
    </section>
  );
}

export type { Action as PlayerAction };
