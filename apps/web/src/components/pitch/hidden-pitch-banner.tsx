'use client';

import { useState } from 'react';
import { Callout } from '@/components/callout';
import { useToast } from '@/components/toast';
import { updatePitch } from '@/lib/pitch';

/**
 * A hidden pitch, said at the top of its pages: its link says it isn't taking bookings, and one
 * tap shows it again. Bookings already made stay as they were.
 */
export function HiddenPitchBanner({ pitchId, onShown }: { pitchId: string; onShown: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function show() {
    setBusy(true);
    try {
      await updatePitch(pitchId, { status: 'active' });
      toast.success('Pitch is taking bookings again');
      onShown();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Callout
      tone="note"
      title="Hidden · not taking bookings"
      className="mb-4"
      action={
        <button type="button" onClick={show} disabled={busy} className="press min-h-11 px-4 rounded-xl bg-ink text-volt-300 text-[14px] font-bold disabled:opacity-50">
          {busy ? 'Showing…' : 'Show it again'}
        </button>
      }
    >
      Its link says so. Bookings already made stay.
    </Callout>
  );
}
