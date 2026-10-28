import { cardAttributes } from './card-attributes';

const row = (games: number, goals: number, assists: number, saves = 0, awardLift = {}) => ({ games, goals, assists, saves, awardLift });
const club = [row(10, 10, 2), row(10, 2, 8), row(10, 0, 0, 40), row(10, 4, 4), row(10, 1, 1)];

describe('cardAttributes', () => {
  it('a scorer has shooting above the card, a non-scorer below', () => {
    expect(cardAttributes(60, club[0], club).SHO!).toBeGreaterThan(60);
    expect(cardAttributes(60, club[4], club).SHO!).toBeLessThan(60);
  });

  it('a passer has passing above the card', () => {
    expect(cardAttributes(60, club[1], club).PAS!).toBeGreaterThan(cardAttributes(60, club[0], club).PAS!);
  });

  it('only someone who made saves gets a GK number', () => {
    expect(cardAttributes(60, club[2], club).GK).not.toBeNull();
    expect(cardAttributes(60, club[0], club).GK).toBeNull();
  });

  it('no evidence: left out, never a made-up number', () => {
    const a = cardAttributes(60, club[3], club);
    expect([a.TEC, a.DEF, a.IQ, a.PHY, a.MOV]).toEqual([null, null, null, null, null]);
  });

  it('award votes lift the ability they are for', () => {
    const voted = row(10, 4, 4, 0, { DEF: 9 });
    expect(cardAttributes(60, voted, [...club, voted]).DEF).toBe(69);
  });

  it('one game says nothing yet; nobody scoring says nothing', () => {
    expect(cardAttributes(60, row(1, 3, 0), club).SHO).toBeNull();
    const quiet = [row(5, 0, 0), row(5, 0, 0)];
    expect(cardAttributes(60, quiet[0], quiet).SHO).toBeNull();
  });

  it('stays on the card scale and never runs away', () => {
    const star = row(30, 300, 0);
    const a = cardAttributes(95, star, [...club, star]);
    expect(a.SHO!).toBeLessThanOrEqual(99);
    expect(cardAttributes(32, row(30, 0, 0), club).SHO!).toBeGreaterThanOrEqual(30);
  });
});
