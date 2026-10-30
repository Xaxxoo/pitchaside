'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** How far down each page was last seen, by its address: where Back returns you. */
const seen = new Map<string, number>();
const here = () => window.location.pathname + window.location.search;

/**
 * A page opened from another starts at its top. Next only scrolls when the new page's top is off
 * screen, so a page opened from one scrolled a little kept that scroll, and its first line (the
 * back button) sat under the phone's status bar. Going back returns you to where you were, once
 * the page has loaded enough to get there. A change of tab on the same page (?tab=…) doesn't move it.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const back = useRef(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => seen.set(here(), window.scrollY));
    };
    const onPop = () => {
      back.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('popstate', onPop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  useEffect(() => {
    if (window.location.hash) return;
    if (!back.current) {
      window.scrollTo(0, 0);
      return;
    }
    back.current = false;
    const target = seen.get(here()) ?? 0;
    // The page fills in as its data arrives: keep trying until it's tall enough, for up to 2s,
    // and stop if the person scrolls themselves in the meantime
    const until = Date.now() + 2000;
    let frame = 0;
    const stop = () => cancelAnimationFrame(frame);
    const tryRestore = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(target, Math.max(0, room)));
      if (room < target && Date.now() < until) frame = requestAnimationFrame(tryRestore);
      else window.removeEventListener('touchstart', stop);
    };
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    tryRestore();
    return stop;
  }, [pathname]);
  return null;
}
