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
    let back: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(back);
      if (isTyping(document.activeElement)) root.dataset.typing = 'true';
      else delete root.dataset.typing;
    };
    // Tapping a button while typing moves focus away first. If the bar came straight back it would
    // slide over the button mid-tap and take the tap, so it waits until the tap is done. Moving to
    // another field cancels the wait, so the bar doesn't flicker between fields.
    const later = () => {
      clearTimeout(back);
      back = setTimeout(sync, 400);
    };
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', later);
    return () => {
      clearTimeout(back);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', later);
      delete root.dataset.typing;
    };
  }, []);
  return null;
}
