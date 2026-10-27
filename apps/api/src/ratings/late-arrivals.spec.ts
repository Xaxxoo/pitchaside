import { lateArrivals, playedIn } from './late-arrivals';

describe('late arrivals once scores are in', () => {
  const session = (status = 'upcoming') => ({
    status,
    teamCount: 2,
    payments: [
      { playerId: 'ada', team: 'A' },
      { playerId: 'bisi', team: 'B' },
      { playerId: 'late', team: null },
      { playerId: 'later', team: null },
    ],
  });

  it('puts someone not on a side yet onto one (several at once too)', () => {
    expect(lateArrivals(session(), { teams: { late: 'B' } })).toEqual({ late: 'B' });
    expect(lateArrivals(session(), { teams: { late: 'A', later: 'B' } })).toEqual({ late: 'A', later: 'B' });
  });

  it('keeps everyone already on a side where they played', () => {
    expect(lateArrivals(session(), { teams: { ada: 'B' } })).toBe('locked');
    expect(lateArrivals(session(), { teams: { ada: null } })).toBe('locked');
    // One bad move in the batch stops the lot: nothing half-saved.
    expect(lateArrivals(session(), { teams: { late: 'A', ada: 'B' } })).toBe('locked');
  });

  it('turns down a side that isn’t in the game, or leaving them off', () => {
    expect(lateArrivals(session(), { teams: { late: 'C' } })).toBe('locked');
    expect(lateArrivals(session(), { teams: { late: 'Z' } })).toBe('locked');
    expect(lateArrivals(session(), { teams: { late: null } })).toEqual({});
  });

  it('no new team count, captains or vices once scores are in', () => {
    expect(lateArrivals(session(), { teamCount: 3 })).toBe('locked');
    expect(lateArrivals(session(), { teamCount: 2 })).toEqual({});
    expect(lateArrivals(session(), { captains: { A: 'ada' } })).toBe('locked');
    expect(lateArrivals(session(), { vices: { B: 'bisi' } })).toBe('locked');
  });

  it('a repeat of the same tap, or someone not on the game, changes nothing', () => {
    expect(lateArrivals(session(), { teams: { ada: 'A' } })).toEqual({});
    expect(lateArrivals(session(), { teams: { stranger: 'A' } })).toEqual({});
  });

  it('after full time no one joins a side', () => {
    expect(lateArrivals(session('completed'), { teams: { late: 'A' } })).toBe('ended');
    expect(lateArrivals(session('cancelled'), { teams: { late: 'A' } })).toBe('ended');
  });
});

describe('which games count for a late arrival', () => {
  const at = (t: string) => new Date(`2026-10-24T${t}Z`);
  it('only the games saved after they joined their side', () => {
    const late = { joinedSideAt: at('19:06:00') };
    expect(playedIn(late, { createdAt: at('19:05:00') })).toBe(false);
    expect(playedIn(late, { createdAt: at('19:12:00') })).toBe(true);
  });
  it('every game for everyone on a side from the start', () => {
    expect(playedIn({ joinedSideAt: null }, { createdAt: at('19:05:00') })).toBe(true);
    expect(playedIn(undefined, { createdAt: at('19:05:00') })).toBe(true);
  });
});
