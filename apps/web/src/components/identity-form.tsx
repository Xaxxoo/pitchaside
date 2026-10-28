'use client';

import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { setIdentity } from '@/lib/api';
import { BallSpinner } from '@/components/skeleton';

const HOW = {
  bvn: { label: 'BVN', where: 'Dial *565*0# from your bank phone number.' },
  nin: { label: 'NIN', where: 'On your NIN slip, or dial *346# from your NIN line.' },
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
  // Changing numbers already on file: both boxes show, and either can be left as it is.
  const [changing, setChanging] = useState(false);
  const haveBoth = !!user?.bvn && !!user?.nin;
  const needsBvn = !user?.bvn || changing;
  const needsNin = !user?.nin || changing;
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Missing ones must be filled; when changing, a box left empty keeps the number on file.
  const bvnReady = changing ? bvn.length === 0 || bvn.length === 11 : !needsBvn || bvn.length === 11;
  const ninReady = changing ? nin.length === 0 || nin.length === 11 : !needsNin || nin.length === 11;
  const anything = bvn.length === 11 || nin.length === 11;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bvnReady || !ninReady || !anything) return;
    setBusy(true);
    setError('');
    try {
      await setIdentity({
        ...(bvn.length === 11 && { bvn }),
        ...(nin.length === 11 && { nin }),
      });
      await refreshUser();
      setBvn('');
      setNin('');
      setChanging(false);
      await onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn\u2019t save your details');
    } finally {
      setBusy(false);
    }
  }

  // Both on file: nothing to fill in, just a way to change them.
  if (haveBoth && !changing) {
    return (
      <button type="button" onClick={() => setChanging(true)} className="min-h-11 px-1 text-sm font-bold text-pitch-700 hover:text-ink">
        Change BVN or NIN
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      {needsBvn && (
        <div>
          <label htmlFor={bvnId} className="block text-xs font-bold text-gray-700 mb-1.5">
            {changing ? `New ${HOW.bvn.label}` : `Your ${HOW.bvn.label}`}
            {changing && <span className="font-medium text-gray-500"> (leave empty to keep ••••{user?.bvn?.slice(-4)})</span>}
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
            {changing ? `New ${HOW.nin.label}` : `Your ${HOW.nin.label}`}
            {changing && <span className="font-medium text-gray-500"> (leave empty to keep ••••{user?.nin?.slice(-4)})</span>}
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
        disabled={busy || !bvnReady || !ninReady || !anything}
        className="w-full min-h-11 py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <BallSpinner />}
        {changing ? (anything && bvnReady && ninReady ? 'Save changes' : 'Type the new number (11 digits)') : bvnReady && ninReady ? submitLabel : 'Fill in all fields'}
      </button>
      {changing && (
        <button type="button" onClick={() => { setChanging(false); setBvn(''); setNin(''); setError(''); }} className="w-full min-h-11 text-sm font-bold text-gray-600 hover:text-ink">
          Cancel
        </button>
      )}
    </form>
  );
}
