'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameTimer as Timer } from '@pitchaside/shared';
import { buzz, LiveDot } from '@/components/motion';
import { BallSpinner } from '@/components/skeleton';

export interface TimerApi {
  load: (sessionId: string) => Promise<Timer>;
  /** Left out for players who only watch the clock. */
  save?: (sessionId: string, change: TimerChange) => Promise<Timer>;
}

/** Start (also from the top over a running clock), stop, pause or resume, or set the length. */
export type TimerChange = { start?: boolean; minutes?: number; pause?: boolean };

/** Lengths most 5-a-side games use, one tap each; − and + cover the rest. */
const QUICK = [5, 7, 10, 12, 15];
const POLL_MS = 15_000;
/** Watchers stop showing "Time's up" this long after the whistle, so an old clock doesn't linger. */
const WATCH_UP_MS = 5 * 60_000;

// This phone started the clock: it's the one that buzzes and beeps at time.
const mineKey = (sessionId: string) => `pitchaside.timer.${sessionId}`;
const readMine = (sessionId: string) => {
  try {
    return localStorage.getItem(mineKey(sessionId));
  } catch {
    return null;
  }
};
const writeMine = (sessionId: string, startedAt: string | null) => {
  try {
    if (startedAt) localStorage.setItem(mineKey(sessionId), startedAt);
    else localStorage.removeItem(mineKey(sessionId));
  } catch {
    // Private mode: it still counts down, it just won't know it's this phone after a reload.
  }
};

// Phones only play sound after a tap, so the sound is set up on the Start tap and reused at time.
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    void audio.resume();
  } catch {
    audio = null;
  }
}
/** Three short, loud beeps: a whistle you can hear over a pitch. */
function beep() {
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = 1320;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + i * 0.45 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.45 + 0.32);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + i * 0.45);
      osc.stop(t0 + i * 0.45 + 0.34);
    }
  } catch {
    // No sound; the buzz and the screen still say it.
  }
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The match-day clock: the organiser picks today's length
 * and taps Start; every phone in the game then counts down from the same moment. The phone that
 * started it buzzes and beeps at time and stays awake while it runs. It can be paused (an injury,
 * a ball over the fence) and picks up with the same time left, or restarted from the top. Scores
 * are still added by hand. `watch` is the players' view: nothing until a clock is running.
 */
export function GameTimer({
  sessionId,
  api,
  onError,
  watch = false,
  onTimer,
}: {
  sessionId: string;
  api: TimerApi;
  onError?: (message: string) => void;
  watch?: boolean;
  /** Told about the clock whenever it changes (the plan follows it), with the server's time minus this phone's. */
  onTimer?: (timer: Timer, offset: number) => void;
}) {
  const [timer, setTimer] = useState<Timer | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Server time minus this phone's, so a phone with a wrong clock still ends with everyone else.
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const rang = useRef<string | null>(null);
  const canRun = !watch && !!api.save;

  const take = useCallback((t: Timer) => {
    setTimer(t);
    setOffset(Date.parse(t.now) - Date.now());
    // Move the clock on with each answer too: once time's up the tick stops, and this is what
    // lets a watching phone drop "Time's up" a few minutes later.
    setNow(Date.now());
    setFailed(false);
  }, []);

  const load = useCallback(() => {
    api
      .load(sessionId)
      .then(take)
      .catch(() => setFailed(true));
  }, [api, sessionId, take]);

  // Keep up with a clock started on another phone: every 15s, and on coming back to the app.
  useEffect(() => {
    load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load]);

  useEffect(() => {
    if (timer) onTimer?.(timer, offset);
  }, [timer, offset, onTimer]);

  const endsAt = timer?.startedAt ? Date.parse(timer.startedAt) + timer.minutes * 60_000 : null;
  const pausedAt = timer?.startedAt && timer.pausedAt ? Date.parse(timer.pausedAt) : null;
  // Paused, the clock stands still at the time left when it was paused.
  const paused = endsAt != null && pausedAt != null;
  const left = endsAt == null ? null : endsAt - (paused ? pausedAt : now + offset);
  const running = !paused && left != null && left > 0;
  const up = !paused && left != null && left <= 0;
  /** A game is on: counting down, or paused part way. */
  const on = running || paused;
  const mine = !!timer?.startedAt && readMine(sessionId) === timer.startedAt;

  // Tick while it runs.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // At time, on the phone that started it: buzz and beep once (not if it comes back much later).
  useEffect(() => {
    if (!up || !mine || !timer?.startedAt || rang.current === timer.startedAt) return;
    rang.current = timer.startedAt;
    if (left != null && left > -30_000) {
      buzz([500, 150, 500, 150, 900]);
      beep();
    }
  }, [up, mine, timer?.startedAt, left]);

  // Keep the starting phone's screen on while the clock runs, so it's awake to buzz at time.
  // Phones drop the lock whenever the page is hidden (a quick look at WhatsApp), so it's asked
  // for again each time the page comes back.
  useEffect(() => {
    if (!running || !mine || !('wakeLock' in navigator)) return;
    const wakeLock = (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const ask = () => {
      if (gone || document.visibilityState !== 'visible') return;
      wakeLock
        .request('screen')
        .then((l) => {
          if (gone) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release().catch(() => {});
    };
  }, [running, mine]);

  async function change(c: TimerChange) {
    if (!api.save || !timer) return;
    if (c.start || c.pause === false) {
      unlockAudio();
      buzz(12);
    } else if (c.pause) buzz(8);
    // Show it straight away; the server's answer replaces it.
    const before = timer;
    const at = Date.now() + offset;
    let { startedAt, pausedAt: pause } = timer;
    if (c.start) [startedAt, pause] = [new Date(at).toISOString(), null];
    else if (c.start === false) [startedAt, pause] = [null, null];
    else if (c.pause && startedAt && !pause) pause = new Date(at).toISOString();
    else if (c.pause === false && startedAt && pause) {
      // Same time left as when it was paused: the start moves on by however long it stood still.
      startedAt = new Date(Date.parse(startedAt) + Math.max(0, at - Date.parse(pause))).toISOString();
      pause = null;
    }
    // Resuming moves the start, so the phone that started it keeps knowing it's the one to buzz.
    const keepsMine = c.start !== undefined || (c.pause === false && mine);
    setTimer({ ...timer, minutes: c.minutes ?? timer.minutes, startedAt, pausedAt: pause });
    setNow(Date.now());
    if (keepsMine) writeMine(sessionId, startedAt);
    setBusy(true);
    try {
      const t = await api.save(sessionId, c);
      take(t);
      if (keepsMine) writeMine(sessionId, t.startedAt);
    } catch (err) {
      setTimer(before);
      if (keepsMine) writeMine(sessionId, before.startedAt);
      onError?.(err instanceof Error ? err.message : 'The timer didn’t change. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // The group turned the timer off: nothing to show, for anyone.
  if (timer?.on === false) return null;

  // Players watching: only a running clock, or one that just ran out.
  if (watch) {
    if (!timer || left == null || (!paused && left < -WATCH_UP_MS)) return null;
    return (
      <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${up ? 'bg-kit-500 text-ink' : 'bg-white/10 text-white'}`}>
        {up ? <span aria-hidden>⏱</span> : paused ? <PauseGlyph className="w-3.5 h-3.5 text-volt-300" /> : <LiveDot />}
        <span className="flex-1 min-w-0 text-[13px] font-bold">{up ? 'Time’s up on this game' : paused ? 'Game paused' : `Game on · ${timer.minutes} min`}</span>
        <span
          role="timer"
          aria-label={up ? 'Time’s up' : `${clock(left)} left${paused ? ', paused' : ''}`}
          className={`font-display text-2xl font-extrabold tabular-nums ${paused ? 'motion-safe:animate-pulse' : ''}`}
        >
          {up ? '0:00' : clock(left)}
        </span>
      </div>
    );
  }

  if (failed && !timer) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-white border border-gray-200 px-4 py-3">
        <p className="text-[13px] text-gray-600">The timer didn’t load.</p>
        <button onClick={load} className="press min-h-11 px-3 rounded-xl text-[14px] font-bold text-pitch-700 hover:bg-chalk">
          Try again
        </button>
      </div>
    );
  }
  if (!timer) {
    return <div className="h-[76px] rounded-3xl bg-white border border-gray-200 animate-pulse" aria-label="Loading the timer" />;
  }

  const pct = on && left != null ? Math.max(0, Math.min(100, (left / (timer.minutes * 60_000)) * 100)) : up ? 0 : 100;
  const small = 'press min-h-11 px-4 rounded-xl text-[14px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50';

  return (
    <section
      aria-label="Game timer"
      className={`rounded-3xl border p-4 transition-colors ${up ? 'bg-kit-500 border-kit-500 text-ink' : 'bg-white border-gray-200 text-ink'}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold ${up ? 'text-ink/80' : 'text-gray-500'}`}>
            {up ? 'Full time on this game' : paused ? 'Paused · the clock is stopped' : running ? `Game on · ${timer.minutes} min` : 'Game timer'}
          </p>
          <p
            role="timer"
            aria-label={on ? `${clock(left!)} left${paused ? ', paused' : ''}` : up ? 'Time’s up' : `${timer.minutes} minutes`}
            className={`font-display leading-none font-extrabold tabular-nums whitespace-nowrap ${up ? 'text-[32px] py-1' : 'text-[40px]'} ${paused ? 'text-gray-500 motion-safe:animate-pulse' : ''}`}
          >
            {on ? clock(left!) : up ? 'Time’s up' : `${timer.minutes}:00`}
          </p>
        </div>
        {canRun &&
          (on ? (
            paused ? (
              <button onClick={() => change({ pause: false })} disabled={busy} className={`${small} bg-ink text-volt-300 hover:bg-pitch-900`}>
                <span aria-hidden>▶</span>
                Resume
              </button>
            ) : (
              <button onClick={() => change({ pause: true })} disabled={busy} className={`${small} bg-white border border-gray-300 text-ink hover:border-ink`}>
                <PauseGlyph className="w-3.5 h-3.5" />
                Pause
              </button>
            )
          ) : (
            <button onClick={() => change({ start: true })} disabled={busy} className={`${small} bg-ink text-volt-300 hover:bg-pitch-900`}>
              {busy ? <BallSpinner className="w-4 h-4" /> : <span aria-hidden>▶</span>}
              {up ? 'Next game' : 'Start'}
            </button>
          ))}
      </div>

      {/* The clock running down, so a glance from the touchline says how long is left */}
      <div className={`mt-3 h-2 rounded-full overflow-hidden ${up ? 'bg-ink/15' : 'bg-chalk'}`} aria-hidden>
        <div className={`h-full rounded-full ${running ? 'bg-volt-400' : 'bg-pitch-600'} motion-safe:transition-[width] motion-safe:duration-300`} style={{ width: `${pct}%` }} />
      </div>

      {/* Mid-game: start this game again from the top, or stop the clock without a result */}
      {canRun && on && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={() => change({ start: true })}
            disabled={busy}
            className="press min-h-11 -ml-1 px-1 inline-flex items-center gap-1.5 text-[14px] font-bold text-pitch-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 4.5h4.5V9M20.5 4.5 17 8A7.5 7.5 0 1 0 19.5 12" />
            </svg>
            Restart from {timer.minutes}:00
          </button>
          <button onClick={() => change({ start: false })} disabled={busy} className="press min-h-11 -mr-1 px-1 text-[14px] font-bold text-gray-600 hover:text-ink disabled:opacity-50">
            Stop the clock
          </button>
        </div>
      )}

      {canRun && !on && (
        <div className="mt-3">
          <p className={`text-[12px] font-bold ${up ? 'text-ink/80' : 'text-gray-500'}`} id={`len-${sessionId}`}>
            Today’s games last
          </p>
          <div className="mt-1.5 flex items-center gap-1.5" role="group" aria-labelledby={`len-${sessionId}`}>
            <button
              type="button"
              aria-label="One minute less"
              disabled={busy || timer.minutes <= 1}
              onClick={() => change({ minutes: timer.minutes - 1 })}
              className="press shrink-0 w-11 h-11 rounded-xl border border-gray-300 bg-white text-ink text-lg font-extrabold disabled:opacity-40"
            >
              −
            </button>
            <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {QUICK.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={timer.minutes === m}
                  disabled={busy}
                  onClick={() => timer.minutes !== m && change({ minutes: m })}
                  className={`press shrink-0 h-11 min-w-11 px-2.5 rounded-xl text-[14px] font-bold tabular-nums border ${
                    timer.minutes === m ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-ink hover:border-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="One minute more"
              disabled={busy || timer.minutes >= 60}
              onClick={() => change({ minutes: timer.minutes + 1 })}
              className="press shrink-0 w-11 h-11 rounded-xl border border-gray-300 bg-white text-ink text-lg font-extrabold disabled:opacity-40"
            >
              +
            </button>
          </div>
          <p className={`mt-1.5 text-[12px] leading-snug ${up ? 'text-ink/80' : 'text-gray-500'}`}>
            Everyone in the game sees the clock. This phone buzzes and beeps at time.
          </p>
        </div>
      )}
      {canRun && up && (
        <button onClick={() => change({ start: false })} disabled={busy} className="press mt-2 min-h-11 px-1 text-[14px] font-bold text-ink underline underline-offset-2">
          Clear the clock
        </button>
      )}
      <p className="sr-only" aria-live="polite">
        {up ? 'Time’s up on this game.' : paused ? 'Clock paused.' : ''}
      </p>
    </section>
  );
}

/** Two bars: the pause sign. */
function PauseGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2" y="1.5" width="3" height="9" rx="1" />
      <rect x="7" y="1.5" width="3" height="9" rx="1" />
    </svg>
  );
}
