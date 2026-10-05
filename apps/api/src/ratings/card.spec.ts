import { playerCard } from './ratings.service';
import type { VoteCategory } from './entities/vote.entity';

const votes = (v: Partial<Record<VoteCategory, number>> = {}) => ({ potm: 0, pace: 0, shooting: 0, passing: 0, defending: 0, keeper: 0, ...v });
const skill = (rating: number, games = 10) => ({ rating, games });

describe('player card', () => {
  it('starts from the skill rating before anyone has voted', () => {
    const c = playerCard(skill(1700), votes(), 0, 0);
    expect(c.attributes).toEqual({ PAC: 80, SHO: 80, PAS: 80, DEF: 80, GK: 80 });
    expect(c.ovr).toBe(80);
  });

  it("doesn't sink a player nobody happened to vote for to the floor", () => {
    // 3 games, 13 teammates voting each time: about 3 votes per category expected.
    const c = playerCard(skill(1500), votes(), 3, 39);
    expect(Math.min(...Object.values(c.attributes))).toBeGreaterThanOrEqual(70 - 6);
    expect(c.ovr).toBeGreaterThan(55);
  });

  it('lifts what teammates keep voting for, and Player of the Match lifts OVR', () => {
    const quiet = playerCard(skill(1500), votes(), 3, 39);
    const star = playerCard(skill(1500), votes({ shooting: 20, potm: 15 }), 3, 39);
    expect(star.attributes.SHO).toBeGreaterThan(quiet.attributes.SHO!);
    expect(star.ovr).toBeGreaterThan(quiet.ovr);
  });

  it('barely moves on a low-turnout week', () => {
    const c = playerCard(skill(1500), votes({ pace: 1 }), 0.2, 2);
    expect(Math.abs(c.attributes.PAC! - 70)).toBeLessThanOrEqual(1);
  });

  it('is provisional until three scored games', () => {
    expect(playerCard(skill(1500, 2), votes(), 0, 0).provisional).toBe(true);
    expect(playerCard(skill(1500, 3), votes(), 0, 0).provisional).toBe(false);
    expect(playerCard(undefined, votes(), 0, 0)).toMatchObject({ provisional: true, skill: 1500, ovr: 70 });
  });
});
