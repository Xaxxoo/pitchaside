'use client';

import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { setIdentity } from '@/lib/api';
import { BallSpinner } from '@/components/skeleton';

const HOW = {
  bvn: { label: 'BVN', where: 'Dial *565*0# from the phone number your bank has.' },
  nin: { label: 'NIN', where: 'It\u2019s on your NIN slip, or dial *346# from your registered number.' },
};

/**
 * Collects an organiser's BVN and NIN (both required to unlock a group collection account).
 * Only shows fields for numbers the user hasn't provided yet.
 * Used after sign-in, on the Money page and in Settings.
 */
export function IdentityForm({ submitLabel = 'Save', onDone }: { submitLabel?: string; onDone?: () => void | Promise<void> }) {
  const { user, refreshUser } = useAuth();
  const bvnId = useId();
  const ninId = useId();
  const needsBvn = !user?.bvn;
  const needsNin = !user?.nin;
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const bvnReady = !needsBvn || bvn.length === 11;
  const ninReady = !needsNin || nin.length === 11;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bvnReady || !ninReady) return;
    setBusy(true);
    setError('');
    try {
      await setIdentity({
        ...(needsBvn && { bvn }),
        ...(needsNin && { nin }),
      });
      await refreshUser();
      setBvn('');
      setNin('');
      await onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\u2019t save your details');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      {needsBvn && (
        <div>
          <label htmlFor={bvnId} className="block text-xs font-bold text-gray-700 mb-1.5">
            Your {HOW.bvn.label}
          </label>
          <input
            id={bvnId}
            inputMode="numeric"
            autoComplete="off"
            value={bvn}
            onChange={(e) => setBvn(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="11-digit BVN"
            className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-base tracking-widest tabular-nums focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          />
          <p className="text-xs text-gray-500 mt-1.5">{HOW.bvn.where}</p>
        </div>
      )}
      {needsNin && (
        <div>
          <label htmlFor={ninId} className="block text-xs font-bold text-gray-700 mb-1.5">
            Your {HOW.nin.label}
          </label>
          <input
            id={ninId}
            inputMode="numeric"
            autoComplete="off"
            value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="11-digit NIN"
            className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-base tracking-widest tabular-nums focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          />
          <p className="text-xs text-gray-500 mt-1.5">{HOW.nin.where}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-kit-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !bvnReady || !ninReady}
        className="w-full min-h-11 py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <BallSpinner />}
        {bvnReady && ninReady ? submitLabel : 'Fill in all fields'}
      </button>
    </form>
  );
}
