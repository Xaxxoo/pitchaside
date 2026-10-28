'use client';

import { useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { IdentityForm } from '@/components/identity-form';

const LATER_KEY = 'pitchaside_identity_later';

/** "Add later" lasts until they next open the app (this browser session; storage may be unavailable). */
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
 * Why we ask, said plainly before the boxes. Each line is true of the code: the numbers go to
 * Payrep only when an account is opened (billing / competitions provisionAccount), and the app
 * only ever shows them back masked (auth maskId).
 */
const WHY = [
  {
    title: 'Payrep Microfinance Bank opens it',
    sub: 'Banks must check who owns accounts.',
    icon: 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z',
  },
  {
    title: 'An ID number, not a password',
    sub: 'It can’t move money from your bank.',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
  },
  {
    title: 'Only the last 4 digits show',
    sub: 'Shared only with Payrep, for your accounts.',
    icon: 'M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  },
];

/**
 * Asks a club admin with no BVN or NIN on file for them, each time they open the app, until
 * both are saved: without them no group can get the account players pay into. It says why,
 * and that it will ask again, rather than just asking.
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
        Add your BVN and NIN
      </h2>
      <p className="text-sm text-gray-500 mt-1">So your group gets its own account and players can pay you in the app.</p>

      <div className="mt-4 rounded-2xl bg-chalk px-3.5 py-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">Why we ask</p>
        <ul className="mt-2 space-y-2.5">
          {WHY.map((w) => (
            <li key={w.title} className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 shrink-0 rounded-full bg-white flex items-center justify-center text-pitch-700" aria-hidden>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={w.icon} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-ink leading-snug">{w.title}</span>
                <span className="block text-[12px] text-gray-600 leading-snug">{w.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <IdentityForm onDone={() => setOpen(false)} />
      </div>
      <button
        onClick={later}
        className="mt-2 w-full min-h-11 py-3 text-sm font-bold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
      >
        Add later
      </button>
      <p className="mt-2 text-center text-[12px] text-gray-500">We’ll ask again next time you open the app.</p>
    </Sheet>
  );
}
