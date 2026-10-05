'use client';

import { useEffect, useState } from 'react';
import { getPushState, registerServiceWorker, requestPushPermission, subscribePush, type PushState } from '@/lib/push';

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

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** "Add PitchAside to your home screen" — native prompt on Android, instructions on iPhone. */
export function InstallCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      const dismissed = localStorage.getItem('pa_install_dismissed');
      if (dismissed) {
        const elapsed = Date.now() - Number(dismissed);
        if (elapsed < 3 * 24 * 60 * 60 * 1000) return;
      }
    } catch {
      /* ignore */
    }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (isIos) setHidden(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem('pa_install_dismissed', Date.now().toString());
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink text-white px-4 py-3">
      <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight">Add PitchAside to your home screen</p>
        <p className="text-xs text-white/60 mt-0.5">
          {ios ? 'Tap Share, then “Add to Home Screen”.' : 'Opens like an app — no app store needed.'}
        </p>
      </div>
      {deferred && (
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setHidden(true);
          }}
          className="px-3 py-2 text-xs font-bold text-ink bg-volt-400 rounded-lg shrink-0"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} className="text-white/50 hover:text-white text-lg leading-none px-1" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

const pushCopy: Record<PushState, string> = {
  on: 'Notifications are on for this device.',
  off: 'Get a ping for new games, receipts and votes.',
  denied: 'Notifications are blocked — allow them in your browser settings.',
  unsupported: 'This browser can’t do notifications. On iPhone, add PitchAside to your home screen first.',
  insecure: 'Notifications need the secure (https) version of PitchAside.',
  ready: 'Permission allowed — tap Finish setup to complete notifications.',
  unconfigured: 'Push notifications are not configured on the server yet.',
};

/** Toggle row for push notifications. `save` stores the subscription for a player or an organiser. */
export function PushToggle({
  save,
  test,
  tone = 'light',
}: {
  save: (sub: PushSubscriptionJSON) => Promise<unknown>;
  test?: () => Promise<{ delivered: number; missed: number }>;
  tone?: 'light' | 'dark';
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  if (!state) return null;
  const dark = tone === 'dark';

  return (
    <>
      <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100 shadow-card'}`}>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${state === 'on' ? 'bg-volt-400 text-ink' : dark ? 'bg-white/10 text-white' : 'bg-chalk text-ink'}`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>Notifications</p>
        <p className={`text-xs ${dark ? 'text-white/60' : 'text-gray-500'}`}>{pushCopy[state]}</p>
      </div>
      {(state === 'off' || state === 'ready') && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              // iOS can require the permission prompt and push subscription to
              // happen in separate user gestures. Once permission is granted,
              // keep the row actionable so the next tap can subscribe.
              if (state === 'ready' || Notification.permission === 'granted') {
                setState(await subscribePush(save));
              } else {
                setState(await requestPushPermission());
              }
            } finally {
              setBusy(false);
            }
          }}
          className="px-3 py-2 text-xs font-bold text-ink bg-volt-400 rounded-lg shrink-0 disabled:opacity-50"
        >
          {busy ? '…' : state === 'ready' ? 'Finish setup' : 'Turn on'}
        </button>
      )}
      {state === 'on' && test && (
        <button
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            setTestMessage(null);
            try {
              const result = await test();
              setTestMessage(result.delivered > 0 ? 'Test sent — check your notifications.' : 'No active device subscription was reached.');
            } catch {
              setTestMessage('Could not send the test notification.');
            } finally {
              setTesting(false);
            }
          }}
          className="px-3 py-2 text-xs font-bold text-ink bg-volt-400 rounded-lg shrink-0 disabled:opacity-50"
        >
          {testing ? '…' : 'Test'}
        </button>
      )}
      </div>
      {testMessage && <p className="text-[11px] text-gray-500 mt-1.5 px-1" aria-live="polite">{testMessage}</p>}
    </>
  );
}
