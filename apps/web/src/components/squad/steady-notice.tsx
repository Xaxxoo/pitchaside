'use client';

import { useEffect, useState } from 'react';
import { Callout } from '@/components/callout';

const KEY = 'pa_steady_notice_seen';
/** Said for a month after the switch, then not at all. */
const SHOWN_FOR_DAYS = 30;

/**
 * Once, in both apps, for clubs moved from Classic to Steady ratings: why the cards changed. Shown
 * on this phone until "Got it", for a month at most.
 */
export function SteadyNotice({ switchedAt }: { switchedAt: string | null }) {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(KEY) === '1');
    } catch {
      setSeen(false);
    }
  }, []);
  if (!switchedAt || seen || Date.now() - Date.parse(switchedAt) > SHOWN_FOR_DAYS * 86_400_000) return null;
  return (
    <Callout
      tone="info"
      title="Ratings now use Steady"
      className="mb-2.5"
      action={
        <button
          type="button"
          onClick={() => {
            setSeen(true);
            try {
              localStorage.setItem(KEY, '1');
            } catch {
              // Hidden for now; it may show again on this phone
            }
          }}
          className="press -ml-2 -my-2 min-h-11 px-2 text-[13px] font-bold text-ink underline underline-offset-2"
        >
          Got it
        </button>
      }
    >
      Clean sheets and keepers count, and votes count less. Cards moved once.
    </Callout>
  );
}
