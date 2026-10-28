'use client';

import { PhoneHint, useTouched } from '@/components/phone-hint';
import { useRef, useState } from 'react';
import { useToast } from '@/components/toast';
import { addMember, createPlayer } from '@/lib/api';

/**
 * Adding players without leaving the group: name and (optionally) a WhatsApp number, Add, and
 * the form is ready for the next one. Players added here get a payment code in this group.
 */
export function QuickAddPlayers({ groupId, onAdded }: { groupId: string; onAdded: () => Promise<unknown> }) {
  const toast = useToast();
  const first = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const phoneSeen = useTouched();
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const ready = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 1;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const player = await createPlayer({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
      });
      await addMember(groupId, { playerId: player.id });
      setAdded((list) => [...list, `${player.firstName} ${player.lastName}`]);
      setForm({ firstName: '', lastName: '', phone: '' });
      first.current?.focus();
      await onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The player wasn’t added. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const input =
    'w-full min-h-11 px-3.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <form onSubmit={add} className="space-y-2">
      <p className="text-[13px] font-bold text-ink">New player</p>
      <div className="grid grid-cols-2 gap-2">
        <input ref={first} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" aria-label="First name" autoComplete="off" className={input} />
        <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" aria-label="Last name" autoComplete="off" className={input} />
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
        className={input}
      />
      <PhoneHint value={form.phone} touched={phoneSeen.touched}>With a number you can send them their payment details on WhatsApp.</PhoneHint>
      <button type="submit" disabled={!ready || saving} className="w-full min-h-11 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 disabled:opacity-40 transition-colors">
        {saving ? 'Adding…' : added.length ? 'Add another' : 'Add to the group'}
      </button>
      {added.length > 0 && (
        <p className="text-[13px] text-pitch-700 font-semibold" aria-live="polite">
          ✓ Added {added.join(', ')}
        </p>
      )}
    </form>
  );
}
