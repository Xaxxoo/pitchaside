import { DEFAULT_GAME_MINUTES, clockRunning, timerChange, timerOf } from './timer';

describe('game timer', () => {
  it("uses the day's length, else the group's, else 7 minutes", () => {
    expect(timerOf({ timerMinutes: 10, group: { gameMinutes: 8 } }).minutes).toBe(10);
    expect(timerOf({ timerMinutes: null, group: { gameMinutes: 8 } }).minutes).toBe(8);
    expect(timerOf({ group: { gameMinutes: null } }).minutes).toBe(DEFAULT_GAME_MINUTES);
  });

  it('says when the clock started, or null when it is not running', () => {
    const at = new Date('2026-10-24T08:05:00Z');
    expect(timerOf({ timerStartedAt: at }).startedAt).toBe('2026-10-24T08:05:00.000Z');
    expect(timerOf({ timerStartedAt: null }).startedAt).toBeNull();
  });

  it('starts from now (also over a running clock), stops, and sets a length', () => {
    const now = new Date('2026-10-24T08:00:00Z');
    expect(timerChange({ start: true }, {}, now)).toEqual({ timerStartedAt: now, timerPausedAt: null });
    expect(timerChange({ start: false }, {}, now)).toEqual({ timerStartedAt: null, timerPausedAt: null });
    expect(timerChange({ minutes: 9.6 }, {}, now)).toEqual({ timerMinutes: 10 });
    expect(timerChange({}, {}, now)).toEqual({});
  });

  it('turns down a length outside 1 to 60 minutes', () => {
    expect(() => timerChange({ minutes: 0 })).toThrow('A game lasts 1 to 60 minutes');
    expect(() => timerChange({ minutes: 70 })).toThrow('A game lasts 1 to 60 minutes');
  });
});

describe('timer switch', () => {
  it('is on unless the group turned it off', () => {
    expect(timerOf({ group: { gameMinutes: 8 } }).on).toBe(true);
    expect(timerOf({ group: { gameMinutes: 8, timerOn: true } }).on).toBe(true);
    expect(timerOf({ group: { gameMinutes: 8, timerOn: false } }).on).toBe(false);
  });
});

describe('timer pause, resume and restart', () => {
  const t = (s: string) => new Date(`2026-10-24T${s}Z`);
  const running = { timerStartedAt: t('08:00:00'), timerPausedAt: null, timerMinutes: 7 };

  it('pauses a running clock where it is', () => {
    expect(timerChange({ pause: true }, running, t('08:03:00'))).toEqual({ timerPausedAt: t('08:03:00') });
    expect(timerOf({ ...running, timerPausedAt: t('08:03:00') }).pausedAt).toBe('2026-10-24T08:03:00.000Z');
  });

  it('resumes with the same time left: the start moves on by the pause', () => {
    const paused = { ...running, timerPausedAt: t('08:03:00') };
    // Paused 2 minutes: 4 minutes were left, still 4 left on resuming at 08:05.
    expect(timerChange({ pause: false }, paused, t('08:05:00'))).toEqual({ timerStartedAt: t('08:02:00'), timerPausedAt: null });
  });

  it('a paused game still counts as on (the plan and the shuffle lock see it), even past its length', () => {
    expect(clockRunning({ ...running, timerPausedAt: t('08:03:00') }, t('09:00:00').getTime())).toBe(true);
    expect(clockRunning(running, t('08:06:59').getTime())).toBe(true);
    expect(clockRunning(running, t('08:07:01').getTime())).toBe(false);
  });

  it('restart starts from the top, also from paused', () => {
    expect(timerChange({ start: true }, { ...running, timerPausedAt: t('08:03:00') }, t('08:04:00'))).toEqual({ timerStartedAt: t('08:04:00'), timerPausedAt: null });
  });

  it('pausing twice or resuming a running clock changes nothing; nothing to pause when it isn’t running', () => {
    expect(timerChange({ pause: true }, { ...running, timerPausedAt: t('08:03:00') }, t('08:04:00'))).toEqual({});
    expect(timerChange({ pause: false }, running, t('08:04:00'))).toEqual({});
    // A second phone pausing long after the first did, past the game's length: still nothing to do.
    expect(timerChange({ pause: true }, { ...running, timerPausedAt: t('08:03:00') }, t('08:30:00'))).toEqual({});
    // Resuming after a long pause still leaves the 4 minutes that were left.
    expect(timerChange({ pause: false }, { ...running, timerPausedAt: t('08:03:00') }, t('08:30:00'))).toEqual({ timerStartedAt: t('08:27:00'), timerPausedAt: null });
    expect(() => timerChange({ pause: true }, {}, t('08:04:00'))).toThrow('The clock isn’t running');
    expect(() => timerChange({ pause: true }, running, t('08:09:00'))).toThrow('The clock isn’t running');
    expect(() => timerChange({ pause: false }, {}, t('08:04:00'))).toThrow('The clock isn’t running');
  });

  it('stopping clears a pause too', () => {
    expect(timerChange({ start: false }, { ...running, timerPausedAt: t('08:03:00') }, t('08:04:00'))).toEqual({ timerStartedAt: null, timerPausedAt: null });
  });
});
