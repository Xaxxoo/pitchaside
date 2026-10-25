'use client';

import { useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { getPushState, keepPushOn, pushTurnedOff, turnPushOff, turnPushOn, type PushState } from '@/lib/push';
import { setOrganiserEmails, subscribeOrganiserPush, unsubscribeOrganiserPush } from '@/lib/api';
import { setMyEmailNotices, subscribePlayerPush, unsubscribePlayerPush } from '@/lib/player';
import { HowSheet, isStandalone, platformOf, type Platform } from '@/components/pwa';
import { BallSpinner } from '@/components/skeleton';
import { buzz } from '@/components/motion';
import { useToast } from '@/components/toast';

/**
 * Notifications are on by default. A phone only sends them once its owner taps "Allow" (no app can
 * skip that), so: they switch themselves on wherever the phone has already allowed them, a card
 * asks once with one tap, and each person has switches to turn them off. Emails need no "Allow":
 * they're on for everyone unless switched off.
 */
export type Side = 'player' | 'organiser';

const CLIENT = {
  player: { save: subscribePlayerPush, remove: unsubscribePlayerPush, emails: setMyEmailNotices },
  organiser: { save: subscribeOrganiserPush, remove: unsubscribeOrganiserPush, emails: setOrganiserEmails },
};

/** Keeps notifications on for whoever is signed in, on every phone that's allowed them. Renders nothing. */
export function PushKeeper({ side }: { side: Side }) {
  useEffect(() => {
    keepPushOn(CLIENT[side].save).catch(() => undefined);
  }, [side]);
  return null;
}

const LATER_KEY = 'pa_push_later';
const LATER_MS = 3 * 86_400_000;

function askedLately() {
  try {
    return Date.now() - Number(localStorage.getItem(LATER_KEY) ?? 0) < LATER_MS;
  } catch {
    return false;
  }
}

/** How to unblock notifications, for the phone in their hand. */
const UNBLOCK: Record<Platform, string[]> = {
  'ios-safari': ['Open Settings on your iPhone.', 'Tap Notifications, then PitchAside.', 'Turn on Allow Notifications.'],
  'ios-other': ['Open Settings on your iPhone.', 'Tap Notifications, then PitchAside.', 'Turn on Allow Notifications.'],
  'ios-inapp': ['Open PitchAside in Safari, from your Home Screen.', 'Then Settings › Notifications › PitchAside.', 'Turn on Allow Notifications.'],
  android: ['Tap the padlock next to the address at the top.', 'Tap Permissions (or Site settings), then Notifications.', 'Choose Allow, then come back here.'],
  other: ['Click the padlock next to the address bar.', 'Find Notifications and choose Allow.', 'Reload this page.'],
};

/**
 * The one-tap ask, near the top of Home, for anyone whose phone hasn't allowed notifications yet.
 * "Not now" hides it for 3 days; switching them off in settings hides it for good on this phone.
 * After the tap it says it's done, then gets out of the way.
 */
export function NotifyPrompt({ side }: { side: Side }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [how, setHow] = useState(false);

  useEffect(() => {
    setPlatform(platformOf(navigator.userAgent));
    getPushState().then(setState);
  }, []);

  if (!state || gone) return null;
  const iphoneFirst = state === 'unsupported' && platform.startsWith('ios') && !isStandalone();
  const asking = state === 'off' || state === 'ready';
  if (!done && (!(asking || iphoneFirst) || pushTurnedOff() || askedLately())) return null;

  async function turnOn() {
    setBusy(true);
    buzz(10);
    try {
      const next = await turnPushOn(CLIENT[side].save);
      setState(next);
      if (next === 'on') {
        setDone(true);
        window.setTimeout(() => setGone(true), 2600);
      }
    } finally {
      setBusy(false);
    }
  }

  const later = () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {
      /* hidden for this visit */
    }
    setGone(true);
  };

  return (
    <section
      aria-label="Notifications"
      className="relative overflow-hidden rounded-3xl bg-ink text-white p-4 shadow-lift animate-rise"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className={`relative w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${done ? 'bg-volt-300 text-ink' : 'bg-volt-300/15 text-volt-300'}`} aria-hidden>
          {done ? (
            <svg className="w-6 h-6 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-6 h-6 origin-top animate-[ring_2.8s_ease-in-out_0.6s_2]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[18px] leading-tight font-extrabold">
            {done ? 'Notifications are on' : iphoneFirst ? 'Get notifications on your iPhone' : 'Turn on notifications'}
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-white/70">
            {done
              ? `You can switch them off any time in ${side === 'player' ? 'the Me tab' : 'Settings'}.`
              : iphoneFirst
                ? 'iPhones only send them once PitchAside is on your Home Screen. It takes 3 taps.'
                : side === 'player'
                  ? 'Know when the game’s on, what you owe, and when to vote.'
                  : 'Know when money lands, when to send the link to the group, and when voting closes.'}
          </p>
          {state === 'denied' && <p className="mt-2 text-[12px] font-semibold text-kit-400">Your phone blocked them. Allow PitchAside in its settings to get them.</p>}
        </div>
      </div>
      {!done && (
        <div className="mt-3.5 flex items-center gap-2">
          {state === 'denied' ? (
            <button onClick={() => setHow(true)} className="press flex-1 min-h-12 rounded-2xl bg-volt-300 text-ink text-[15px] font-bold">
              Show me how
            </button>
          ) : iphoneFirst ? (
            <button onClick={() => setHow(true)} className="press flex-1 min-h-12 rounded-2xl bg-volt-300 text-ink text-[15px] font-bold">
              Show me
            </button>
          ) : (
            <button onClick={turnOn} disabled={busy} className="press flex-1 min-h-12 rounded-2xl bg-volt-300 text-ink text-[15px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-70">
              {busy && <BallSpinner className="w-4 h-4" />}
              {state === 'ready' ? 'Finish turning them on' : 'Turn on'}
            </button>
          )}
          <button onClick={later} className="press shrink-0 min-h-12 px-4 rounded-2xl text-[14px] font-bold text-white/70 hover:text-white">
            Not now
          </button>
        </div>
      )}
      {how && (iphoneFirst ? <HowSheet platform={platform} onClose={() => setHow(false)} /> : <UnblockSheet platform={platform} onClose={() => setHow(false)} />)}
    </section>
  );
}

function UnblockSheet({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet titleId={titleId} onClose={onClose} align="left" footer={<button onClick={onClose} className={`${btnPrimary} w-full`}>Got it</button>}>
      <SheetTitle id={titleId} title="Allow notifications" sub="Your phone is blocking them for PitchAside. Only you can change that:" onClose={onClose} />
      <ol className="mt-5 space-y-3">
        {UNBLOCK[platform].map((step, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="w-9 h-9 shrink-0 rounded-2xl bg-chalk text-ink flex items-center justify-center text-[14px] font-extrabold">{i + 1}</span>
            <span className="text-[15px] leading-snug text-gray-700">{step}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** A switch that says what it does, for screen readers and thumbs. */
function Switch({ on, busy, disabled, label, onChange }: { on: boolean; busy?: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange(!on)}
      className="press relative shrink-0 w-[3.25rem] h-11 flex items-center justify-center disabled:opacity-50"
    >
      <span className={`relative w-[3.25rem] h-8 rounded-full transition-colors duration-200 ${on ? 'bg-pitch-600' : 'bg-gray-300'}`}>
        <span
          className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow-card flex items-center justify-center transition-transform duration-200 ease-[cubic-bezier(0.2,0.9,0.3,1.2)] ${on ? 'translate-x-5' : ''}`}
        >
          {busy && <BallSpinner className="w-3.5 h-3.5" />}
        </span>
      </span>
    </button>
  );
}

/**
 * The on/off switches, on the Me tab (players) and in Settings (organisers): this phone's
 * notifications, and emails. Both on unless they've switched them off.
 */
export function NotificationSettings({ side, emailOn, email, onEmailChanged }: { side: Side; emailOn: boolean; email?: string | null; onEmailChanged?: (on: boolean) => void }) {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState(emailOn);
  const [mailBusy, setMailBusy] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [how, setHow] = useState<'unblock' | 'install' | null>(null);

  useEffect(() => setMail(emailOn), [emailOn]);
  useEffect(() => {
    setPlatform(platformOf(navigator.userAgent));
    getPushState().then(setState);
  }, []);
  if (!state) return null;

  const iphoneFirst = state === 'unsupported' && platform.startsWith('ios') && !isStandalone();
  const pushOn = state === 'on';
  const pushSays: Record<PushState, string> = {
    on: 'On for this phone.',
    off: 'Off on this phone.',
    ready: 'Allowed. Switch on to finish.',
    denied: 'Blocked in your phone’s settings.',
    unsupported: iphoneFirst ? 'On iPhone, add PitchAside to your Home Screen first.' : 'This browser can’t show notifications.',
    insecure: 'Not available on this connection.',
    unconfigured: 'Not available yet.',
  };

  async function flipPush(on: boolean) {
    setBusy(true);
    try {
      const next = on ? await turnPushOn(CLIENT[side].save) : await turnPushOff(CLIENT[side].remove);
      setState(next);
      if (on && next === 'on') toast.success('Notifications are on for this phone');
      if (!on) toast.success('Notifications are off for this phone');
    } catch {
      toast.error('That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function flipMail(on: boolean) {
    setMail(on);
    setMailBusy(true);
    try {
      await CLIENT[side].emails(on);
      onEmailChanged?.(on);
      toast.success(on ? 'Emails are on' : 'Emails are off');
    } catch {
      setMail(!on);
      toast.error('That didn’t save. Try again.');
    } finally {
      setMailBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-card divide-y divide-gray-100">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">Notifications</p>
          <p className={`text-[13px] leading-snug ${state === 'denied' ? 'text-kit-600' : 'text-gray-600'}`}>{pushSays[state]}</p>
          {(state === 'denied' || iphoneFirst) && (
            <button onClick={() => setHow(state === 'denied' ? 'unblock' : 'install')} className="mt-0.5 min-h-9 text-[13px] font-bold text-pitch-700 hover:text-ink">
              Show me how ›
            </button>
          )}
        </div>
        <Switch
          on={pushOn}
          busy={busy}
          disabled={!(pushOn || state === 'off' || state === 'ready')}
          label="Notifications on this phone"
          onChange={flipPush}
        />
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">Emails</p>
          <p className="text-[13px] leading-snug text-gray-600">
            {!email ? 'Add an email to get them.' : mail ? `When a notification can’t reach you, we email ${email}.` : 'Off. No emails about games, payments or votes.'}
          </p>
        </div>
        <Switch on={!!email && mail} busy={mailBusy} disabled={!email} label="Emails" onChange={flipMail} />
      </div>
      {how === 'unblock' && <UnblockSheet platform={platform} onClose={() => setHow(null)} />}
      {how === 'install' && <HowSheet platform={platform} onClose={() => setHow(null)} />}
    </div>
  );
}
