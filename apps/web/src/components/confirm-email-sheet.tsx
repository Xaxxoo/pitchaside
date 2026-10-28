'use client';

import { useId, useState } from 'react';
import { Callout } from '@/components/callout';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { BallSpinner } from '@/components/skeleton';
import { playerTokenFromOrganiser } from '@/lib/api';

/**
 * "Confirm it's your email": the one-off step before the Playing switch opens player records that
 * already exist under this email. The code was just emailed by the server; once it's right the email
 * counts as confirmed and the switch never asks again.
 */
export function ConfirmEmailSheet({ email, devCode, onClose, onConfirmed }: { email: string; devCode?: string; onClose: () => void; onConfirmed: () => void }) {
  const titleId = useId();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await playerTokenFromOrganiser(code);
      if (res.needsCode) setError('That didn’t go through. Try the code again.');
      else onConfirmed();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'That didn’t go through. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <button type="submit" form="confirm-email" disabled={code.length !== 6 || busy} className={`${btnPrimary} w-full`}>
          {busy ? <BallSpinner className="w-5 h-5" /> : 'Confirm & switch to Playing'}
        </button>
      }
    >
      <SheetTitle id={titleId} title="Confirm it’s your email" sub="One time only. This email already has a player profile, so we check it’s you before opening it." onClose={onClose} />
      <form id="confirm-email" onSubmit={submit} className="mt-4 space-y-3">
        <p className="text-sm text-gray-700">
          We sent a 6-digit code to
          <b className="block text-ink [overflow-wrap:anywhere]">{email}</b>
        </p>
        {devCode && (
          <Callout tone="info" title="Test mode: no email was sent">
            Your code is <span className="font-mono font-bold">{devCode}</span>
          </Callout>
        )}
        <input
          id="confirm-email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          placeholder="••••••"
          aria-label="6-digit code"
          aria-invalid={!!error}
          aria-describedby={error ? 'confirm-email-error' : undefined}
        />
        {error && (
          <div id="confirm-email-error">
            <Callout tone="warn" live>
              {error}
            </Callout>
          </div>
        )}
        <Callout tone="info" title="Not in your inbox?">
          Check spam, or close this and tap Playing again in a minute for a new code.
        </Callout>
      </form>
    </Sheet>
  );
}
