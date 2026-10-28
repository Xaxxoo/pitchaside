'use client';

import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';
import { PasswordField } from '@/components/password-sign-in';
import { changeMyPassword, updateMyName } from '@/lib/player';

const input =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

/** Edit name and nickname (updates every club) and change password, on the player's Me tab. */
export function PlayerAccountSettings({
  firstName,
  lastName,
  nickname,
  email,
  onSaved,
}: {
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState<'name' | 'password' | null>(null);
  const [name, setName] = useState({ firstName, lastName, nickname: nickname ?? '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const nameTitle = useId();
  const pwTitle = useId();

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyName(name.firstName.trim(), name.lastName.trim(), name.nickname.trim());
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

  const chevron = (
    <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
  const row = (label: string, value: string, key: 'name' | 'password') => (
    <button onClick={() => setOpen(key)} className="press w-full flex items-center justify-between gap-3 min-h-16 px-4 py-3 text-left hover:bg-chalk/60">
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500">{label}</span>
        <span className="block text-[15px] font-bold text-ink truncate">{value}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 text-[13px] font-bold text-pitch-700">
        Change
        {chevron}
      </span>
    </button>
  );
  const label = (id: string, text: string) => (
    <label htmlFor={id} className="block text-xs font-bold text-gray-600 mb-1">
      {text}
    </label>
  );
  const submit = (form: string, text: string, disabled = false) => (
    <button type="submit" form={form} disabled={busy || disabled} className={`${btnPrimary} w-full`}>
      {busy && <BallSpinner />}
      {text}
    </button>
  );

  return (
    <>
      <div className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
        {row('Name', nickname ? `${firstName} “${nickname}” ${lastName}` : `${firstName} ${lastName}`, 'name')}
        <div className="min-h-16 px-4 py-3">
          <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500">Email · you sign in with it</span>
          <span className="block text-[15px] font-bold text-ink [overflow-wrap:anywhere]">{email}</span>
        </div>
        {row('Password', '••••••••', 'password')}
      </div>

      {open === 'name' && (
        <Sheet titleId={nameTitle} onClose={() => setOpen(null)} align="left" footer={submit('name-form', 'Save name')}>
          <SheetTitle id={nameTitle} title="Your name" sub="It changes in every club you play in." onClose={() => setOpen(null)} />
          <form id="name-form" onSubmit={saveName} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                {label('me-first', 'First name')}
                <input id="me-first" required minLength={2} value={name.firstName} onChange={(e) => setName({ ...name, firstName: e.target.value })} className={input} />
              </div>
              <div>
                {label('me-last', 'Last name')}
                <input id="me-last" required minLength={1} value={name.lastName} onChange={(e) => setName({ ...name, lastName: e.target.value })} className={input} />
              </div>
            </div>
            <div>
              {label('me-nick', 'Nickname (optional)')}
              <input id="me-nick" maxLength={24} value={name.nickname} onChange={(e) => setName({ ...name, nickname: e.target.value })} className={input} />
              <p className="text-[12px] text-gray-500 mt-1">What they call you on the pitch. Team sheets and ballots show it instead of your name.</p>
            </div>
          </form>
        </Sheet>
      )}

      {open === 'password' && (
        <Sheet titleId={pwTitle} onClose={() => setOpen(null)} align="left" footer={submit('pw-form', 'Change password', pw.next.length < 8)}>
          <SheetTitle id={pwTitle} title="Change your password" sub="At least 8 characters." onClose={() => setOpen(null)} />
          <form id="pw-form" onSubmit={savePassword} className="mt-4 space-y-3">
            <PasswordField
              id="pw-current"
              label="Current password"
              value={pw.current}
              onChange={(v) => setPw({ ...pw, current: v })}
              autoComplete="current-password"
              required={false}
            />
            <PasswordField id="pw-new" label="New password (at least 8 characters)" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" />
          </form>
        </Sheet>
      )}
    </>
  );
}
