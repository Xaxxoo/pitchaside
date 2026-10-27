'use client';

import { createContext, type PointerEvent, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How far (px) a sheet has to be pulled down before letting go closes it. */
const DISMISS_PX = 90;
const EXIT_MS = 200;

/** Close the sheet you're inside, with its slide-away (for close buttons inside the sheet). */
const SheetCloseContext = createContext<(() => void) | null>(null);
export const useSheetClose = () => useContext(SheetCloseContext);

/**
 * Bottom sheet on phones, centred card on larger screens. Escape, a tap outside, the close button
 * or pulling the handle down closes it, and it slides away rather than vanishing.
 * `art` is an optional illustration band on top; `footer` stays pinned to the bottom while tall
 * content scrolls. Focus moves into the sheet when it opens, Tab stays inside it, and focus goes
 * back to whatever opened it when it closes.
 */
export function Sheet({
  titleId,
  onClose,
  art,
  footer,
  align = 'center',
  children,
}: {
  titleId: string;
  onClose: () => void;
  art?: ReactNode;
  /** Actions pinned under the scrolling content: the sheet's main buttons. */
  footer?: ReactNode;
  align?: 'center' | 'left';
  children: ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef<number | null>(null);

  const close = useCallback(() => {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return closeRef.current();
    setClosing(true);
    window.setTimeout(() => closeRef.current(), EXIT_MS);
  }, [closing]);
  const closeLatest = useRef(close);
  closeLatest.current = close;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Focus the sheet itself so screen readers start at its title, not halfway down.
    panelRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      // Another dialog opened on top of this one owns the keyboard.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (!panelRef.current || dialogs[dialogs.length - 1] !== panelRef.current.parentElement) return;
      if (e.key === 'Escape') return closeLatest.current();
      if (e.key !== 'Tab') return;
      // Keep Tab inside the sheet while it's open.
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    // Stop the page scrolling behind the sheet.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      // Back to the button that opened it, if it's still on the page.
      if (opener && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, []);

  // Pull-to-close from the handle: the sheet follows the thumb, then closes or springs back.
  const onPointerDown = (e: PointerEvent) => {
    dragFrom.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragFrom.current == null) return;
    setDrag(Math.max(0, e.clientY - dragFrom.current));
  };
  const onPointerUp = () => {
    if (dragFrom.current == null) return;
    dragFrom.current = null;
    if (drag > DISMISS_PX) close();
    else setDrag(0);
  };

  // Portal to <body> so the sheet sits above the phone tab bar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/50 backdrop-blur-sm px-0 sm:px-4 ${
        closing ? 'animate-[fade-out_200ms_ease-in_both]' : 'animate-fade-in'
      }`}
      onClick={close}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        className={`relative bg-white rounded-t-[28px] sm:rounded-3xl shadow-lift w-full sm:max-w-lg max-h-sheet flex flex-col outline-none transition-transform duration-200 ${
          closing ? 'animate-[sheet-out_200ms_ease-in_both] sm:animate-[fade-out_200ms_ease-in_both]' : 'animate-slide-up sm:animate-fade-in-up'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The handle: shows it's a sheet that can be pulled away (phones only) */}
        <div
          className="sm:hidden absolute top-0 inset-x-0 h-6 z-10 flex justify-center pt-2 touch-none cursor-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden
        >
          <span className={`w-10 h-1.5 rounded-full ${art ? 'bg-ink/25' : 'bg-gray-300'}`} />
        </div>
        <SheetCloseContext.Provider value={close}>
          <div className="overflow-y-auto overscroll-contain min-h-0">
            {art && <div className="bg-volt-300 chalk-dots pt-6 flex justify-center rounded-t-[28px] sm:rounded-t-3xl">{art}</div>}
            <div className={`px-6 pt-7 sm:pt-6 ${footer ? 'pb-4' : 'pb-[max(env(safe-area-inset-bottom),1.5rem)] sm:pb-6'} ${align === 'center' ? 'text-center' : ''}`}>
              {children}
            </div>
          </div>
          {footer && (
            <div className="shrink-0 border-t border-gray-100 bg-white px-6 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:pb-5 rounded-b-3xl">
              {footer}
            </div>
          )}
        </SheetCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
