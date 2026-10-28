'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Collapse } from '@/components/collapse';

/**
 * A group's settings as a few short sections (Money, When and where, Match day), the same when
 * making a group and editing it. Each row says what's set in one line and opens to change it.
 * The rows run edge to edge across their card or sheet, so there's no box around the boxes.
 */

type Inset = 'card' | 'sheet';
const BLEED: Record<Inset, string> = { card: '-mx-5 sm:-mx-7', sheet: '-mx-6' };
const PAD: Record<Inset, string> = { card: 'px-5 sm:px-7', sheet: 'px-6' };
const InsetContext = createContext<Inset>('card');

export const SECTION_ICONS = {
  // A banknote
  money:
    'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  // A calendar
  when: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  // A stopwatch
  day: 'M12 6v6l3.5 2M12 2.25h-2m2 0h2M12 21a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z',
};

/** Who sees the kitty, in a few words for the Money summary. */
export const SEEN: Record<string, string> = { private: 'kitty private', totals: 'totals shown', names: 'names shown' };

/** The sections' frame: lines between them, out to the edges of the card or sheet they sit in. */
export function SettingsSections({ inset, children }: { inset: Inset; children: ReactNode }) {
  return (
    <InsetContext.Provider value={inset}>
      <div className={`${BLEED[inset]} border-y border-gray-200 divide-y divide-gray-200`}>{children}</div>
    </InsetContext.Provider>
  );
}

/** One section: a row saying what's set, that opens to change it. */
export function SettingsSection({
  id,
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const pad = PAD[useContext(InsetContext)];
  return (
    <div className={open ? 'bg-chalk/50' : undefined}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className={`press w-full min-h-16 flex items-center gap-3 ${pad} py-3 text-left`}>
        <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${open ? 'bg-ink text-volt-300' : 'bg-chalk text-pitch-700'}`} aria-hidden>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink">{title}</span>
          <span className="block text-[12px] text-gray-500 truncate">{summary}</span>
        </span>
        <svg className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <Collapse open={open} id={id}>
        <div className={`${pad} pb-5 pt-1 space-y-4`}>{children}</div>
      </Collapse>
    </div>
  );
}
