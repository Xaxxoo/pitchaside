'use client';

import { useEffect } from 'react';

/** Kinds of input that open the phone's keyboard (not ticks, switches or buttons). */
const TYPED = /^(text|email|tel|url|search|password|number|date|time|datetime-local|month|week)$/;

function isTyping(el: Element | null) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return TYPED.test(el.type || 'text') && !el.readOnly;
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * On phones, marks the page while the keyboard is up (`data-typing` on <html>), so bars pinned to
 * the bottom of the screen (tab bars, the booking bar) slide away instead of riding up over the
 * page and sticking mid-screen as you scroll. They come back when you're done typing.
 */
export function KeyboardWatch() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    const sync = () => {
      if (isTyping(document.activeElement)) root.dataset.typing = 'true';
      else delete root.dataset.typing;
    };
    // focusout fires before focus lands on the next field, so check once it has settled.
    const later = () => setTimeout(sync, 0);
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', later);
      delete root.dataset.typing;
    };
  }, []);
  return null;
}
