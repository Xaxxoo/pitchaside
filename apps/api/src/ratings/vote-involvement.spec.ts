import { canBePicked, emptyInvolvement, pickable, voteWorth } from './vote-involvement';

describe('who teammates can pick, from how much of the day they were on the pitch', () => {
  const x = (played: number, of: number, more: Partial<ReturnType<typeof emptyInvolvement>> = {}) => ({ ...emptyInvolvement(), played, of, ...more });

  it('takes anyone who played half their team’s games or more', () => {
    expect(canBePicked(x(6, 6))).toBe(true);
    expect(canBePicked(x(3, 6))).toBe(true);
    expect(canBePicked(x(2, 4))).toBe(true);
  });

  it('leaves out a sub who played under half, with nothing to show for it', () => {
    expect(canBePicked(x(2, 6))).toBe(false);
    expect(canBePicked(x(1, 6))).toBe(false);
    expect(canBePicked(x(0, 6))).toBe(false);
  });

  it('takes a sub the day shows on the pitch: a goal, an assist, a save or a game in goal', () => {
    expect(canBePicked(x(1, 6, { goals: 1 }))).toBe(true);
    expect(canBePicked(x(1, 6, { assists: 1 }))).toBe(true);
    expect(canBePicked(x(1, 6, { saves: 2 }))).toBe(true);
    expect(canBePicked(x(1, 6, { inGoal: 1 }))).toBe(true);
  });

  it('takes a keeper borrowed by another team (those games count as played)', () => {
    // Sat out 3 of their own 4, kept goal twice for another team: 3 of 6, and in goal anyway
    expect(canBePicked(x(3, 6, { inGoal: 2 }))).toBe(true);
  });

  it('counts when there is nothing to go on yet', () => {
    expect(canBePicked(undefined)).toBe(true);
    expect(canBePicked(x(0, 0))).toBe(true);
  });

  it('is worth all of a vote or none of it', () => {
    expect(voteWorth(x(3, 6))).toBe(1);
    expect(voteWorth(x(1, 6))).toBe(0);
  });

  it('turns down a pick who can’t be picked, unless nobody in the list could be', () => {
    const inv = new Map([
      ['ada', x(6, 6)],
      ['sub', x(1, 6)],
      ['sub2', x(0, 6)],
    ]);
    expect(pickable('ada', ['ada', 'sub'], inv)).toBe(true);
    expect(pickable('sub', ['ada', 'sub'], inv)).toBe(false);
    expect(pickable('sub', ['sub', 'sub2'], inv)).toBe(true);
  });
});
