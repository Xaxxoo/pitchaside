'use client';

import { useState, type ReactNode } from 'react';
import { phoneAdvice } from '@pitchaside/shared';

/**
 * The line under a phone box: how WhatsApp will read the number ("WhatsApp: +234 803 123 4567"),
 * or what's wrong with it and how to type it. A problem only shows once they've typed most of a
 * number or left the box, so nobody is told off for their first few digits. Never blocks saving:
 * the number is kept as typed. Without anything to say, `children` (the box's usual help) shows.
 */
export function PhoneHint({ value, touched, children }: { value: string; touched?: boolean; children?: ReactNode }) {
  const advice = phoneAdvice(value);
  const digits = (value.match(/\d/g) ?? []).length;
  const show = advice && (advice.ok || touched || digits >= 11);
  return (
    <p className="mt-1 min-h-[1.25rem] text-[12px] leading-snug" aria-live="polite">
      {show ? (
        <span key={advice.text} className={`inline-flex items-start gap-1 animate-pop-in ${advice.ok ? 'text-pitch-700 font-semibold' : 'text-kit-600 font-semibold'}`}>
          <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.6} stroke="currentColor" aria-hidden>
            {advice.ok ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3.5h.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            )}
          </svg>
          {advice.text}
        </span>
      ) : (
        <span className="text-gray-500">{children}</span>
      )}
    </p>
  );
}

/** Whether the box has been left once: problems show from then on. */
export function useTouched() {
  const [touched, setTouched] = useState(false);
  return { touched, onBlur: () => setTouched(true) };
}
