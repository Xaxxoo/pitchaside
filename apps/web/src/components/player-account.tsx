'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';
import { PasswordField } from '@/components/password-sign-in';
import { changeMyPassword, updateMyName } from '@/lib/player';

const input =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

/** Edit name (updates every club) and change password, on the player's Me tab. */
export function PlayerAccountSettings({
  firstName,
  lastName,
  email,
  onSaved,
}: {
  firstName: string;
  lastName: string;
  email: string;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<'name' | 'password' | null>(null);
  const [name, setName] = useState({ firstName, lastName });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyName(name.firstName.trim(), name.lastName.trim());
      await onSaved();
      toast.success('Name updated in all your clubs');
      setOpen(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await changeMyPassword(pw.current, pw.next);
      toast.success('Password changed');
      setPw({ current: '', next: '' });
      setOpen(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: string, key: 'name' | 'password') => (
    <button
      onClick={() => setOpen(open === key ? null : key)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      aria-expanded={open === key}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
        <span className="block text-sm font-bold text-ink truncate">{value}</span>
      </span>
      <span className="text-xs font-bold text-pitch-600 shrink-0">{open === key ? 'Close' : 'Edit'}</span>
    </button>
  );

  const save = (label: string, disabled = false) => (
    <button
      type="submit"
      disabled={busy || disabled}
      className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {busy && <BallSpinner />}
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100">
      {row('Name', `${firstName} ${lastName}`, 'name')}
      {open === 'name' && (
        <form onSubmit={saveName} className="px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              aria-label="First name"
              required
              minLength={2}
              value={name.firstName}
              onChange={(e) => setName({ ...name, firstName: e.target.value })}
              className={input}
            />
            <input
              aria-label="Last name"
              required
              minLength={2}
              value={name.lastName}
              onChange={(e) => setName({ ...name, lastName: e.target.value })}
              className={input}
            />
          </div>
          {save('Save name')}
        </form>
      )}

      <div className="px-4 py-3">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">Email (sign-in)</span>
        <span className="block text-sm font-bold text-ink break-all">{email}</span>
      </div>

      {row('Password', '••••••••', 'password')}
      {open === 'password' && (
        <form onSubmit={savePassword} className="px-4 pb-4 pt-3 space-y-3">
          <PasswordField
            id="pw-current"
            label="Current password"
            value={pw.current}
            onChange={(v) => setPw({ ...pw, current: v })}
            autoComplete="current-password"
            required={false}
          />
          <PasswordField id="pw-new" label="New password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" />
          {save('Change password', pw.next.length < 8)}
        </form>
      )}
    </div>
  );
}
