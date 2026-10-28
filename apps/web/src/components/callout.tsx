import type { ReactNode } from 'react';

export type CalloutTone = 'info' | 'note' | 'warn' | 'good';

const ICONS: Record<CalloutTone, string> = {
  // An "i" in a circle
  info: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  // An exclamation mark in a circle
  note: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z',
  // A warning triangle
  warn: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  // A tick in a circle
  good: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
};

const LIGHT: Record<CalloutTone, { box: string; icon: string; title: string }> = {
  info: { box: 'bg-sky-300/20 border-sky-300/70', icon: 'text-ink', title: 'text-ink' },
  note: { box: 'bg-sun-400/20 border-sun-400/60', icon: 'text-amber-700', title: 'text-amber-900' },
  warn: { box: 'bg-kit-400/10 border-kit-400/50', icon: 'text-kit-600', title: 'text-kit-600' },
  good: { box: 'bg-volt-300/35 border-volt-400', icon: 'text-pitch-700', title: 'text-ink' },
};

const DARK: Record<CalloutTone, { box: string; icon: string; title: string }> = {
  info: { box: 'bg-white/10 border-white/15', icon: 'text-sky-300', title: 'text-white' },
  note: { box: 'bg-sun-400/15 border-sun-400/40', icon: 'text-sun-400', title: 'text-sun-400' },
  warn: { box: 'bg-kit-500/15 border-kit-400/40', icon: 'text-kit-400', title: 'text-kit-400' },
  good: { box: 'bg-volt-300/15 border-volt-300/30', icon: 'text-volt-300', title: 'text-white' },
};

/**
 * Something to take note of, set apart from the text around it: an icon and a colour that say
 * what kind of note it is, never colour alone.
 * - info (sky, "i"): good to know, nothing wrong ("Test mode: no email was sent").
 * - note (sun, "!"): take note before you go on, nothing wrong yet ("No transfer has come in
 *   yet", "The old link stops working").
 * - warn (kit, triangle): something is wrong or will go wrong unless they act ("Their number
 *   won't open WhatsApp"); errors use it too.
 * - good (volt, tick): it worked, or it's in hand ("Matched to you automatically").
 * `title` is the one thing to read; the body says why or what to do, in a line or two.
 * `onDark` for ink cards; `live` for one that appears after an action (read out when it does).
 */
export function Callout({
  tone,
  title,
  children,
  action,
  onDark = false,
  live = false,
  className = '',
}: {
  /** It appears in answer to something they did (an error, a result): read it out. */
  live?: boolean;
  tone: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** A button or link to fix it, under the words. */
  action?: ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  const c = (onDark ? DARK : LIGHT)[tone];
  return (
    <div role={live ? (tone === 'warn' ? 'alert' : 'status') : undefined} className={`flex gap-2.5 rounded-2xl border px-3.5 py-3 text-left ${c.box} ${className}`}>
      <svg className={`w-5 h-5 shrink-0 mt-px ${c.icon}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[tone]} />
      </svg>
      <div className="min-w-0 flex-1">
        {title && <p className={`text-[13px] font-bold leading-snug ${c.title}`}>{title}</p>}
        {children && <div className={`${title ? 'mt-0.5' : ''} text-[13px] leading-snug ${onDark ? 'text-white/75' : 'text-gray-700'}`}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/** The callout's icon on its own, for a one-line note inside a row ("won't open WhatsApp"). */
export function CalloutIcon({ tone, className = 'w-4 h-4' }: { tone: CalloutTone; className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[tone]} />
    </svg>
  );
}
