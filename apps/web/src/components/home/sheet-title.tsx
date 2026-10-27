'use client';

import { useSheetClose } from '@/components/sheet';

/** Title row for the home page's sheets: a heading, an optional line under it, and a close button. */
export function SheetTitle({ id, title, sub, onClose }: { id: string; title: string; sub?: string; onClose: () => void }) {
  // Inside a sheet, close with its slide-away rather than vanishing.
  const close = useSheetClose() ?? onClose;
  return (
    // The line under the title runs the full width of the sheet, under the close button too, so
    // it isn't squeezed into short lines beside it.
    <div>
    <div className="flex items-start justify-between gap-3">
      <h2 id={id} className="min-w-0 font-display text-xl font-extrabold text-ink leading-tight">
        {title}
      </h2>
      <button
        onClick={close}
        aria-label="Close"
        className="press group w-11 h-11 -mt-2 -mr-2.5 shrink-0 flex items-center justify-center rounded-full"
      >
        {/* A quiet 32px circle inside a full-size tap target, so it doesn't compete with the title */}
        <span className="w-8 h-8 rounded-full bg-chalk text-gray-600 flex items-center justify-center group-hover:bg-gray-200 group-hover:text-ink transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </span>
      </button>
    </div>
    {sub && <p className="-mt-2 pr-1 text-[13px] text-gray-600 leading-snug">{sub}</p>}
    </div>
  );
}
