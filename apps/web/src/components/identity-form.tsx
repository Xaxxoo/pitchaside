'use client';

import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { setIdentity } from '@/lib/api';
import { BallSpinner } from '@/components/skeleton';

type Kind = 'bvn' | 'nin';

const HOW: Record<Kind, { label: string; where: string }> = {
  bvn: { label: 'BVN', where: 'Dial *565*0# from the phone number your bank has.' },
  nin: { label: 'NIN', where: 'It’s on your NIN slip, or dial *346# from your registered number.' },
};

/**
 * An organiser's BVN or NIN, 11 digits. Either one unlocks a group collection account: the bank
 * needs to know who the account belongs to. Used after sign-in, on the Money page and in Settings.
 */
export function IdentityForm({ submitLabel = 'Save', onDone }: { submitLabel?: string; onDone?: () => void | Promise<void> }) {
  const { refreshUser } = useAuth();
  const inputId = useId();
  const [kind, setKind] = useState<Kind>('bvn');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { label, where } = HOW[kind];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.length !== 11) return;
    setBusy(true);
    setError('');
    try {
      await setIdentity({ [kind]: value });
      await refreshUser();
      setValue('');
      await onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn’t save your ${label}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div role="radiogroup" aria-label="Which number" className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
        {(['bvn', 'nin'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setError('');
            }}
            className={`min-h-11 rounded-lg text-sm font-bold transition-colors ${kind === k ? 'bg-white text-ink shadow-sm' : 'text-gray-500'}`}
          >
            {HOW[k].label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor={inputId} className="block text-xs font-bold text-gray-700 mb-1.5">
          Your {label}
        </label>
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder={`11-digit ${label}`}
          className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-base tracking-widest tabular-nums focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
        />
        <p className="text-xs text-gray-500 mt-1.5">{where}</p>
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-kit-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || value.length !== 11}
        className="w-full min-h-11 py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <BallSpinner />}
        {value.length === 11 ? submitLabel : `${11 - value.length} digits to go`}
      </button>
    </form>
  );
}
