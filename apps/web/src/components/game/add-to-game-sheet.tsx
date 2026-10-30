'use client';

import { Avatar } from '@/components/ratings';
import { useId, useRef, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { stagger } from '@/components/motion';
import { PhoneHint, useTouched } from '@/components/phone-hint';

/** Someone not in the group yet: added to the group and put on the game in one go. */
export type NewPlayer = { firstName: string; lastName: string; phone?: string };

/** `name` is what they go by (nickname first); `fullName` is for initials and search. */
export type GroupMember = { playerId: string; name: string; fullName?: string; photoKey?: string | null };

/**
 * Putting players on a game by hand, for players who told the organiser rather than the app, or
 * who turned up late. The name box is the way in (decided 30 Oct with the council): type a name to
 * find someone in the group, or add them as new when they aren't there. The QR code sits under it
 * for several new players at once, and the group below it, one tap each. Whoever is added stays at
 * the top, marked in, so the sheet shows what's been done.
 */
export function AddToGameSheet({
  members,
  late = false,
  onAdd,
  onAddNew,
  onQr,
  onClose,
}: {
  /** Group members not on this game yet. */
  members: GroupMember[];
  /** Past kick-off: they're joining a game that's under way. */
  late?: boolean;
  onAdd: (m: GroupMember) => Promise<void>;
  /** Left out where only group members can be added. Gives the new player as added. */
  onAddNew?: (p: NewPlayer) => Promise<GroupMember>;
  /** Shows the game's QR code: players scan it to join themselves. */
  onQr?: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const boxRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Added from this sheet, newest first: they leave `members` once the game reloads, so kept here
  const [added, setAdded] = useState<GroupMember[]>([]);
  const addedIds = new Set(added.map((m) => m.playerId));
  const q = query.trim().toLowerCase();
  const left = members.filter((m) => !addedIds.has(m.playerId));
  const shown = left.filter((m) => !q || `${m.name} ${m.fullName ?? ''}`.toLowerCase().includes(q));
  const everyoneIn = members.length === 0 && added.length === 0;
  // Someone new: the form, filled from what was typed. Open straight away when the whole group is in.
  const [form, setForm] = useState<{ firstName: string; lastName: string; phone: string } | null>(everyoneIn && onAddNew ? { firstName: '', lastName: '', phone: '' } : null);
  const phoneSeen = useTouched();
  const ready = !!form && form.firstName.trim().length >= 2 && form.lastName.trim().length >= 1;

  /** What was typed as a name: "Tunde Bello" → Tunde / Bello; one word → no last name yet. */
  const typed = (() => {
    const words = query.trim().split(/\s+/).filter(Boolean);
    return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
  })();
  const exact = !!q && left.some((m) => [m.name, m.fullName].some((n) => n?.toLowerCase() === q));
  const addRow = !!onAddNew && !form && q.length >= 2;
  const addLabel = exact
    ? { title: `Add another “${query.trim()}”`, sub: 'Only if it’s someone else' }
    : !typed.lastName
      ? { title: `Add “${query.trim()}” as new`, sub: 'Needs a last name' }
      : shown.length
        ? { title: `Not them? Add “${query.trim()}” as new`, sub: 'New to the group and this game' }
        : { title: `Add “${query.trim()}” as new`, sub: 'New to the group and this game' };

  function openForm() {
    setForm({ firstName: typed.firstName, lastName: typed.lastName, phone: '' });
  }

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !onAddNew || busy || !form) return;
    setBusy('new');
    try {
      const m = await onAddNew({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() || undefined });
      setAdded((list) => [m, ...list]);
      setForm(null);
      setQuery('');
      boxRef.current?.focus();
    } catch {
      // The page says what went wrong; the form keeps what was typed.
    } finally {
      setBusy(null);
    }
  }

  async function add(m: GroupMember) {
    if (busy) return;
    setBusy(m.playerId);
    try {
      await onAdd(m);
      setAdded((list) => [m, ...list]);
      // Found by typing: clear the box for the next name
      if (q) {
        setQuery('');
        boxRef.current?.focus();
      }
    } catch {
      // The page says what went wrong
    } finally {
      setBusy(null);
    }
  }

  const row = (m: GroupMember, i: number, isIn: boolean) => (
    <li key={m.playerId} className="animate-rise flex items-center gap-3 px-3.5 min-h-16 py-2.5" style={stagger(Math.min(i, 10), 25, 0)}>
      <Avatar name={m.fullName ?? m.name} photoKey={m.photoKey} className="w-10 h-10 text-sm" />
      <span className="flex-1 min-w-0 text-[15px] font-bold text-ink truncate">{m.name}</span>
      {isIn ? (
        <span className="shrink-0 h-11 px-3.5 rounded-xl bg-volt-300 text-ink text-[13px] font-bold inline-flex items-center animate-pop-in">In ✓</span>
      ) : (
        <button
          onClick={() => add(m)}
          disabled={!!busy}
          aria-label={`Mark ${m.name} in`}
          className="press shrink-0 h-11 px-3.5 rounded-xl border-[1.5px] border-ink bg-white text-ink text-[13px] font-bold hover:bg-chalk disabled:opacity-60"
        >
          {busy === m.playerId ? '…' : 'Mark in'}
        </button>
      )}
    </li>
  );

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <SheetTitle
        id={titleId}
        title="Add players to this game"
        sub={late ? 'Then pick their side in Teams. They pay like everyone else.' : 'They pay like everyone else.'}
        onClose={onClose}
      />

      {/* The way in: find someone in the group, or add them as new. Stays put while the list scrolls. */}
      {!everyoneIn && (
        <div className="sticky top-0 z-10 -mx-6 px-6 pt-4 pb-2 bg-white">
          <input
            ref={boxRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setForm(null);
            }}
            placeholder={onAddNew ? 'Find or add a player' : 'Find a player'}
            aria-label={onAddNew ? 'Find or add a player' : 'Find a player'}
            autoComplete="off"
            className="w-full h-12 px-4 bg-chalk rounded-2xl text-[16px] placeholder:text-gray-500 focus:outline-none focus:bg-white focus:ring-4 focus:ring-volt-300/70"
          />
        </div>
      )}

      {/* Several new players at once: they scan and join themselves. Out of the way while typing. */}
      {onQr && !q && !form && (
        <button
          type="button"
          onClick={onQr}
          className="press mt-1 w-full min-h-14 flex items-center gap-3 px-3.5 rounded-3xl bg-chalk text-left hover:bg-gray-100"
        >
          <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-ink" aria-hidden>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
            </svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-ink">Show the game’s QR code</span>
            <span className="block text-[13px] text-gray-600 truncate">For new players to join themselves</span>
          </span>
        </button>
      )}

      {/* The whole group is on the game: said in a designed block, and the new-player form opens */}
      {everyoneIn && (
        <div className="mt-4 flex items-center gap-3 rounded-3xl border border-gray-100 bg-white px-3.5 min-h-16">
          <span className="w-10 h-10 shrink-0 rounded-full bg-volt-300 text-ink flex items-center justify-center" aria-hidden>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">The whole group is in</span>
        </div>
      )}

      {/* Added from here, newest first, marked in */}
      {added.length > 0 && (
        <section aria-label="Just added" className="mt-3">
          <h3 className="px-1 mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">Just added</h3>
          <ul className="rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden">{added.map((m, i) => row(m, i, true))}</ul>
        </section>
      )}

      {/* Someone new: the add row once a name is typed, then the form in its place */}
      {(addRow || form) && onAddNew && (
        <div className="mt-3 rounded-3xl bg-chalk">
          {form ? (
            <form onSubmit={addNew} className="p-3.5 space-y-2" aria-label="Someone new">
              <p className="px-0.5 text-[15px] font-bold text-ink">Someone new</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="First name"
                  aria-label="First name"
                  autoComplete="off"
                  maxLength={50}
                  autoFocus={!form.firstName}
                  className={field}
                />
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Last name"
                  aria-label="Last name"
                  autoComplete="off"
                  maxLength={50}
                  autoFocus={!!form.firstName && !form.lastName}
                  className={field}
                />
              </div>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                type="tel"
                inputMode="tel"
                placeholder="WhatsApp number (optional)"
                aria-label="WhatsApp number (optional)"
                autoComplete="off"
                autoFocus={!!form.firstName && !!form.lastName}
                onBlur={phoneSeen.onBlur}
                className={field}
              />
              <PhoneHint value={form.phone} touched={phoneSeen.touched}>With a number you can send them their payment details on WhatsApp.</PhoneHint>
              <button
                type="submit"
                disabled={!ready || !!busy}
                className="press w-full min-h-12 rounded-2xl bg-ink text-volt-300 text-[15px] font-bold hover:bg-pitch-900 disabled:opacity-40"
              >
                {busy === 'new' ? 'Adding…' : 'Add to group & game'}
              </button>
            </form>
          ) : (
            <button type="button" onClick={openForm} className="press w-full min-h-16 flex items-center gap-3 px-3.5 py-2 text-left">
              <span className="w-10 h-10 shrink-0 rounded-full bg-white border border-dashed border-gray-400 flex items-center justify-center text-ink" aria-hidden>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-bold text-ink truncate">{addLabel.title}</span>
                <span className="block text-[13px] text-gray-600 truncate">{addLabel.sub}</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* The group: everyone not on the game yet, filtered by what's typed */}
      {shown.length > 0 ? (
        <ul className="mt-3 rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden" aria-label="In the group">
          {shown.map((m, i) => row(m, i, false))}
        </ul>
      ) : (
        q &&
        !onAddNew && (
          // Said in a row like the list it stands in for, not a line floating in the middle
          <div className="mt-3 flex items-center gap-3 rounded-3xl border border-gray-100 bg-white px-3.5 min-h-16">
            <span className="w-10 h-10 shrink-0 rounded-full bg-chalk text-ink flex items-center justify-center" aria-hidden>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.2-5.2M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">No one called “{query.trim()}”</span>
          </div>
        )
      )}
    </Sheet>
  );
}

const field =
  'w-full min-h-11 px-3.5 bg-white border border-gray-200 rounded-xl text-[16px] focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';
