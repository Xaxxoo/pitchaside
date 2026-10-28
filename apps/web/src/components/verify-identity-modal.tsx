'use client';

import { useEffect, useId, useState } from 'react';
import { Callout } from '@/components/callout';
import { Sheet } from '@/components/sheet';
import { IdentityForm } from '@/components/identity-form';

const LATER_KEY = 'pitchaside_identity_later';

/** "Add later" lasts until they next sign in (this browser session; storage may be unavailable). */
function putOff() {
  try {
    sessionStorage.setItem(LATER_KEY, '1');
  } catch {
    /* private mode: it asks again on the next page load */
  }
}

function putOffNow() {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * After sign-in, asks an organiser with no BVN or NIN on file for one. They can add it later,
 * but until they do, none of their groups can get a collection account. Goes away once saved.
 */
export function VerifyIdentityModal() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(!putOffNow()), []);

  function later() {
    putOff();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <Sheet titleId={titleId} onClose={later} align="left">
      <h2 id={titleId} className="text-xl font-extrabold text-ink">
        Verify your identity
      </h2>
      <p className="text-sm text-gray-500 mt-1.5">
        Add your BVN and NIN. The bank needs them to open a collection account for your group, the account players pay into.
      </p>
      <div className="mt-4">
        <IdentityForm onDone={() => setOpen(false)} />
      </div>
      <button
        onClick={later}
        className="mt-2 w-full min-h-11 py-3 text-sm font-bold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
      >
        Add later
      </button>
      <Callout tone="note" className="mt-3" title="Needed before players can pay by transfer">
        Without both, your groups can’t get an account. Add them any time in Settings.
      </Callout>
    </Sheet>
  );
}
