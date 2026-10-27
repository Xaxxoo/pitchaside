'use client';

import { Avatar } from '@/components/ratings';
import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { stagger } from '@/components/motion';
import { Collapse } from '@/components/collapse';
import { PhoneHint, useTouched } from '@/components/phone-hint';

/** Someone not in the group yet: added to the group and put on the game in one go. */
export type NewPlayer = { firstName: string; lastName: string; phone?: string };

/** `name` is what they go by (nickname first); `fullName` is for initials and search. */
export type GroupMember = { playerId: string; name: string; fullName?: string; photoKey?: string | null };

/**
 * Putting players on a game by hand, for players who told the organiser rather than the app, or
 * who turned up late. Everyone in the group who isn't on the game yet, searchable, one tap each;
 * and someone new, added to the group and the game together.
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
  /** Left out where only group members can be added. */
  onAddNew?: (p: NewPlayer) => Promise<void>;
  /** Shows the game's QR code: players scan it to join themselves. */
  onQr?: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const shown = members.filter((m) => !q || `${m.name} ${m.fullName ?? ''}`.toLowerCase().includes(q));
  // Someone new: open straight away when there's no one in the group left to add.
  const [newOpen, setNewOpen] = useState(members.length === 0);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [newAdded, setNewAdded] = useState<string[]>([]);
  const phoneSeen = useTouched();
  const ready = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2;
  const newId = `${titleId}-new`;

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !onAddNew || busy) return;
    setBusy('new');
    try {
      const p = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() || undefined };
      await onAddNew(p);
      setNewAdded((list) => [...list, p.firstName]);
      setForm({ firstName: '', lastName: '', phone: '' });
    } catch {
      // The page says what went wrong; the form keeps what was typed.
    } finally {
      setBusy(null);
    }
  }

  async function add(m: GroupMember) {
    setBusy(m.playerId);
    try {
      await onAdd(m);
      setAdded((prev) => new Set(prev).add(m.playerId));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <SheetTitle
        id={titleId}
        title="Add players to this game"
        sub={
          late
            ? 'Mark them in, then pick their side in Teams. They pay like everyone else.'
            : 'For players who told you they’re in. They pay like everyone else.'
        }
        onClose={onClose}
      />
      {/* Stays at the top of the sheet while the list scrolls under it */}
      {members.length > 8 && (
        <div className="sticky top-0 z-10 -mx-6 px-6 pt-5 pb-2 mt-1 bg-white">
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
      {shown.length === 0 ? (
        // Said in a row like the list it stands in for, not a line floating in the middle
        <div className="mt-4 flex items-center gap-3 rounded-3xl border border-gray-100 bg-white px-3.5 min-h-16">
          <span className="w-10 h-10 shrink-0 rounded-full bg-volt-300 text-ink flex items-center justify-center" aria-hidden>
            {members.length ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.2-5.2M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">
            {members.length ? `No one called “${query.trim()}”` : 'The whole group is in'}
          </span>
        </div>
      ) : (
        <ul className="mt-2 rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          {shown.map((m, i) => {
            const isIn = added.has(m.playerId);
            return (
              <li key={m.playerId} className="animate-rise flex items-center gap-3 px-3.5 min-h-16 py-2.5" style={stagger(Math.min(i, 10), 25, 0)}>
                <Avatar name={m.fullName ?? m.name} photoKey={m.photoKey} className="w-10 h-10 text-sm" />
                <span className="flex-1 min-w-0 text-[15px] font-bold text-ink truncate">{m.name}</span>
                <button
                  onClick={() => add(m)}
                  disabled={isIn || busy === m.playerId}
                  className={`press shrink-0 h-11 px-3.5 rounded-xl text-[13px] font-bold ${isIn ? 'bg-volt-300 text-ink' : 'bg-ink text-volt-300 hover:bg-pitch-900'} disabled:cursor-default`}
                >
                  {isIn ? 'In ✓' : busy === m.playerId ? '…' : 'Mark in'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {onQr && (
        <button
          type="button"
          onClick={onQr}
          className="press mt-3 w-full min-h-14 flex items-center gap-3 px-3.5 rounded-3xl bg-chalk text-left hover:bg-gray-100"
        >
          <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-ink" aria-hidden>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
            </svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-ink">Show the game’s QR code</span>
            <span className="block text-[13px] text-gray-600 truncate">They scan it and join themselves</span>
          </span>
        </button>
      )}

      {onAddNew && (
        <div className="mt-3 rounded-3xl bg-chalk">
          <button
            type="button"
            onClick={() => setNewOpen((o) => !o)}
            aria-expanded={newOpen}
            aria-controls={newId}
            className="press w-full min-h-14 flex items-center gap-3 px-3.5 text-left"
          >
            <span className="w-10 h-10 shrink-0 rounded-full bg-white border border-dashed border-gray-400 flex items-center justify-center text-ink" aria-hidden>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-bold text-ink">Someone new</span>
              <span className="block text-[13px] text-gray-600 truncate">Not in the group yet</span>
            </span>
            <svg className={`w-4 h-4 shrink-0 text-ink transition-transform duration-300 ${newOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <Collapse open={newOpen} id={newId}>
            <form onSubmit={addNew} className="px-3.5 pb-3.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="First name"
                  aria-label="First name"
                  autoComplete="off"
                  maxLength={50}
                  className={field}
                />
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Last name"
                  aria-label="Last name"
                  autoComplete="off"
                  maxLength={50}
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
                onBlur={phoneSeen.onBlur}
                className={field}
              />
              <PhoneHint value={form.phone} touched={phoneSeen.touched}>With a number you can send them their payment details on WhatsApp.</PhoneHint>
              <button
                type="submit"
                disabled={!ready || !!busy}
                className="press w-full min-h-12 rounded-2xl bg-ink text-volt-300 text-[15px] font-bold hover:bg-pitch-900 disabled:opacity-40"
              >
                {busy === 'new' ? 'Adding…' : 'Add to the group and this game'}
              </button>
              {newAdded.length > 0 && (
                <p className="text-[13px] font-semibold text-pitch-700" aria-live="polite">
                  ✓ {newAdded.join(', ')} {newAdded.length === 1 ? 'is' : 'are'} in
                </p>
              )}
            </form>
          </Collapse>
        </div>
      )}
    </Sheet>
  );
}

const field =
  'w-full min-h-11 px-3.5 bg-white border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';
