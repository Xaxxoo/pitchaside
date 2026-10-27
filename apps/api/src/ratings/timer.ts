/** How long a game lasts when the group hasn't said: the usual 5-a-side game at the pitch. */
export const DEFAULT_GAME_MINUTES = 7;

/** The longest game the timer takes, so a typo (70 for 7) can't leave a clock running all day. */
export const MAX_GAME_MINUTES = 60;

export interface GameTimer {
  /** Whether the group uses the timer; off, match day doesn't show it. */
  on: boolean;
  /** Today's game length in minutes: the day's own, else the group's, else 7. */
  minutes: number;
  /** When the running game's clock started (moved on by any pauses); null while it isn't running. */
  startedAt: string | null;
  /** When it was paused; null while it runs. The time left is frozen at this moment. */
  pausedAt: string | null;
  /** The server's time, so every phone counts down from the same clock. */
  now: string;
}

export function timerOf(session: {
  timerMinutes?: number | null;
  timerStartedAt?: Date | null;
  timerPausedAt?: Date | null;
  group?: { gameMinutes?: number | null; timerOn?: boolean | null } | null;
}): GameTimer {
  return {
    on: session.group?.timerOn !== false,
    minutes: session.timerMinutes ?? session.group?.gameMinutes ?? DEFAULT_GAME_MINUTES,
    startedAt: session.timerStartedAt ? new Date(session.timerStartedAt).toISOString() : null,
    pausedAt: session.timerStartedAt && session.timerPausedAt ? new Date(session.timerPausedAt).toISOString() : null,
    now: new Date().toISOString(),
  };
}

/** Whether a game's clock is still going (paused counts: the game isn't over). */
export function clockRunning(session: { timerMinutes?: number | null; timerStartedAt?: Date | null; timerPausedAt?: Date | null; group?: { gameMinutes?: number | null } | null }, now = Date.now()) {
  if (!session.timerStartedAt) return false;
  if (session.timerPausedAt) return true;
  const minutes = session.timerMinutes ?? session.group?.gameMinutes ?? DEFAULT_GAME_MINUTES;
  return new Date(session.timerStartedAt).getTime() + minutes * 60_000 > now;
}

/**
 * What a tap on the timer changes: a new length for today; start (from the top, also over a
 * running or paused clock: a restart, or the next game); stop (clear it); pause and resume.
 * Resuming moves the start on by however long it was paused, so the time left is what it was.
 * Throws on a length outside 1–60 minutes, or a pause or resume that doesn't fit the clock.
 */
export function timerChange(
  input: { start?: boolean; minutes?: number; pause?: boolean },
  current: { timerStartedAt?: Date | null; timerPausedAt?: Date | null; timerMinutes?: number | null; group?: { gameMinutes?: number | null } | null } = {},
  now = new Date(),
) {
  const patch: { timerMinutes?: number; timerStartedAt?: Date | null; timerPausedAt?: Date | null } = {};
  if (input.minutes !== undefined) {
    const m = Math.round(Number(input.minutes));
    if (!Number.isFinite(m) || m < 1 || m > MAX_GAME_MINUTES) throw new Error(`A game lasts 1 to ${MAX_GAME_MINUTES} minutes`);
    patch.timerMinutes = m;
  }
  if (input.start === true) {
    patch.timerStartedAt = now;
    patch.timerPausedAt = null;
  }
  if (input.start === false) {
    patch.timerStartedAt = null;
    patch.timerPausedAt = null;
  }
  if (input.pause !== undefined && input.start === undefined) {
    const started = current.timerStartedAt ? new Date(current.timerStartedAt) : null;
    const paused = current.timerPausedAt ? new Date(current.timerPausedAt) : null;
    if (input.pause) {
      // Already paused (even long past its length) is fine: a second phone tapped too.
      if (!started || (!paused && !clockRunning(current, now.getTime()))) throw new Error('The clock isn’t running');
      if (!paused) patch.timerPausedAt = now;
    } else {
      if (!started) throw new Error('The clock isn’t running');
      if (paused) {
        patch.timerStartedAt = new Date(started.getTime() + (now.getTime() - paused.getTime()));
        patch.timerPausedAt = null;
      }
    }
  }
  return patch;
}
