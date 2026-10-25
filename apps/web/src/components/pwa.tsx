'use client';

import { useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { registerServiceWorker } from '@/lib/push';

/** Registers the service worker once per page load. */
export function PwaRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALLED = 'pa_installed';
const CLOSED = 'pa_install_closed';

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Which phone and browser, for the right "how to add it" steps. */
export type Platform = 'ios-safari' | 'ios-other' | 'ios-inapp' | 'android' | 'other';
export function platformOf(ua: string): Platform {
  if (/iphone|ipad|ipod/i.test(ua)) {
    // WhatsApp, Instagram, Facebook and the like open links inside themselves: no Add to Home Screen there.
    if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|Twitter/i.test(ua) || !/Safari/i.test(ua)) return 'ios-inapp';
    if (/CriOS|FxiOS|EdgiOS/i.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  return /android/i.test(ua) ? 'android' : 'other';
}

/**
 * Whether to offer adding PitchAside to the home screen, and the browser's own install prompt
 * when it gives one (Chrome on Android). Never once it's installed: opened from the home screen,
 * or installed from this browser.
 */
function useInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<{ show: boolean; platform: Platform }>({ show: false, platform: 'other' });

  useEffect(() => {
    let installed = false;
    try {
      if (isStandalone()) localStorage.setItem(INSTALLED, '1');
      installed = localStorage.getItem(INSTALLED) === '1';
    } catch {
      installed = isStandalone();
    }
    if (installed) return;
    const platform = platformOf(navigator.userAgent);
    // Phones only: a desktop browser installs from its address bar if it wants to.
    setState({ show: platform !== 'other', platform });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // Phones only, also when a desktop browser offers its own install.
      setState((x) => ({ ...x, show: x.platform !== 'other' }));
    };
    const onInstalled = () => {
      try {
        localStorage.setItem(INSTALLED, '1');
      } catch {
        /* still hidden for now */
      }
      setState((x) => ({ ...x, show: false }));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setState((x) => ({ ...x, show: false }));
    return true;
  }
  return { ...state, canPrompt: !!deferred, install };
}

const ShareIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M12 15V2.25m0 0-3 3m3-3 3 3" />
  </svg>
);
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.5" />
    <path strokeLinecap="round" d="M12 8.25v7.5M8.25 12h7.5" />
  </svg>
);
const DotsIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

const STEPS: Record<Platform, { icon: React.ReactNode; text: React.ReactNode }[]> = {
  'ios-safari': [
    { icon: <ShareIcon />, text: <>Tap <b>Share</b> at the bottom of Safari.</> },
    { icon: <PlusIcon />, text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
    { icon: <span className="text-[13px] font-extrabold">Add</span>, text: <>Tap <b>Add</b>. PitchAside is now on your home screen.</> },
  ],
  'ios-other': [
    { icon: <ShareIcon />, text: <>Tap <b>Share</b> (next to the address bar).</> },
    { icon: <PlusIcon />, text: <>Tap <b>Add to Home Screen</b>. Not there? Open this page in Safari and do it there.</> },
    { icon: <span className="text-[13px] font-extrabold">Add</span>, text: <>Tap <b>Add</b>.</> },
  ],
  'ios-inapp': [
    { icon: <DotsIcon />, text: <>You’re inside another app. Tap its <b>•••</b> or <b>Share</b> menu and choose <b>Open in Safari</b>.</> },
    { icon: <ShareIcon />, text: <>In Safari, tap <b>Share</b>.</> },
    { icon: <PlusIcon />, text: <>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</> },
  ],
  android: [
    { icon: <DotsIcon />, text: <>Tap the <b>⋮</b> menu at the top of your browser.</> },
    { icon: <PlusIcon />, text: <>Tap <b>Install app</b> or <b>Add to Home screen</b>.</> },
    { icon: <span className="text-[13px] font-extrabold">Add</span>, text: <>Tap <b>Install</b> or <b>Add</b>.</> },
  ],
  other: [],
};

export function HowSheet({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet titleId={titleId} onClose={onClose} align="left" footer={<button onClick={onClose} className={`${btnPrimary} w-full`}>Got it</button>}>
      <SheetTitle id={titleId} title="Add PitchAside to your home screen" sub="It opens like an app, straight to your games and what you owe. No app store, nothing to pay." onClose={onClose} />
      <ol className="mt-5 space-y-3">
        {STEPS[platform].map((s, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-11 h-11 shrink-0 rounded-2xl bg-chalk text-ink flex items-center justify-center">{s.icon}</span>
            <span className="text-[15px] leading-snug text-gray-700">
              <span className="font-bold text-ink">{i + 1}.</span> {s.text}
            </span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/**
 * "Add PitchAside to your home screen", floating above the tab bar on every visit until it's
 * installed. Closing it hides it until the next visit. The button installs straight away where
 * the browser allows it (Chrome on Android), else shows the steps for that phone.
 */
export function InstallNudge() {
  const { show, platform, canPrompt, install } = useInstall();
  const [closed, setClosed] = useState(true);
  const [how, setHow] = useState(false);

  useEffect(() => {
    try {
      setClosed(sessionStorage.getItem(CLOSED) === '1');
    } catch {
      setClosed(false);
    }
  }, []);

  // While the card floats over the page, the page gets that much more room at the bottom, so
  // nothing (the last "I've sent it", say) is left underneath it.
  const visible = show && !closed;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--install-nudge', visible ? '5.5rem' : '0px');
    return () => root.style.setProperty('--install-nudge', '0px');
  }, [visible]);

  if (!show) return null;

  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(CLOSED, '1');
    } catch {
      /* hidden for now */
    }
  };

  return (
    <>
      {!closed && (
      <div role="region" aria-label="Add PitchAside to your home screen" className="flex items-center gap-3 rounded-3xl bg-ink text-white pl-3 pr-1.5 py-2.5 shadow-lift animate-slide-up">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight">Add to your home screen</p>
          <p className="text-[12px] text-white/70 mt-0.5 leading-snug">Opens like an app</p>
        </div>
        <button
          onClick={async () => {
            if (!(await install())) setHow(true);
          }}
          className="press shrink-0 min-h-11 px-3.5 rounded-xl bg-volt-400 text-ink text-[13px] font-bold"
        >
          {canPrompt ? 'Add it' : 'Show me'}
        </button>
        <button onClick={close} className="press shrink-0 w-11 h-11 flex items-center justify-center rounded-full text-white/60 hover:text-white" aria-label="Not now">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      )}
      {how && <HowSheet platform={platform} onClose={() => setHow(false)} />}
    </>
  );
}

/** The same offer as a settings row that stays put (on Me): until it's installed. */
export function InstallCard() {
  const { show, platform, canPrompt, install } = useInstall();
  const [how, setHow] = useState(false);
  if (!show) return null;
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 shadow-card px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink leading-tight">Add to your home screen</p>
          <p className="text-xs text-gray-500 mt-0.5">Opens like an app. No app store.</p>
        </div>
        <button
          onClick={async () => {
            if (!(await install())) setHow(true);
          }}
          className="press shrink-0 min-h-11 px-3.5 rounded-xl bg-ink text-volt-300 text-[13px] font-bold"
        >
          {canPrompt ? 'Add it' : 'Show me'}
        </button>
      </div>
      {how && <HowSheet platform={platform} onClose={() => setHow(false)} />}
    </>
  );
}
