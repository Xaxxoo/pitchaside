import { DEFAULT_START, LEVEL_START, cardRating, expected, replaySkill, type SkillGame } from './skill';

const game = (sideA: string[], sideB: string[], scoreA: number, scoreB: number): SkillGame => ({ sideA, sideB, scoreA, scoreB });

describe('skill ratings', () => {
  it('starts everyone at their level, or average', () => {
    const s = replaySkill([], new Map([['a', LEVEL_START.strong], ['b', LEVEL_START.beginner]]));
    expect(s.get('a')!.rating).toBe(1900);
    expect(s.get('b')!.rating).toBe(1300);
    expect(replaySkill([game(['x'], ['y'], 1, 1)]).get('x')!.rating).toBe(DEFAULT_START);
  });

  it('moves winners up and losers down by the same amount', () => {
    const s = replaySkill([game(['a', 'b'], ['c', 'd'], 3, 1)]);
    const up = s.get('a')!.rating - DEFAULT_START;
    expect(up).toBeGreaterThan(0);
    expect(s.get('b')!.rating - DEFAULT_START).toBeCloseTo(up);
    expect(s.get('c')!.rating - DEFAULT_START).toBeCloseTo(-up);
  });

  it('changes nothing for a draw between equal sides', () => {
    const s = replaySkill([game(['a'], ['b'], 2, 2)]);
    expect(s.get('a')!.rating).toBe(DEFAULT_START);
    expect(s.get('b')!.rating).toBe(DEFAULT_START);
  });

  it('rewards beating a stronger side more than beating a weaker one', () => {
    const starts = new Map([['me', 1500], ['strong', 1800], ['weak', 1200]]);
    const vsStrong = replaySkill([game(['me'], ['strong'], 1, 0)], starts).get('me')!.rating;
    const vsWeak = replaySkill([game(['me'], ['weak'], 1, 0)], starts).get('me')!.rating;
    expect(vsStrong - 1500).toBeGreaterThan(vsWeak - 1500);
  });

  it('counts a bigger win a little more, up to a cap', () => {
    const by = (gd: number) => replaySkill([game(['a'], ['b'], gd, 0)]).get('a')!.rating - DEFAULT_START;
    expect(by(3)).toBeGreaterThan(by(1));
    expect(by(50)).toBeLessThanOrEqual(2 * by(1) + 1e-9);
  });

  it('skips games with an empty side and counts games played', () => {
    const s = replaySkill([game([], ['b'], 1, 0), game(['a'], ['b'], 1, 0), game(['a'], ['b'], 0, 0)]);
    expect(s.get('a')!.games).toBe(2);
  });

  it('expected result is 50/50 for equal sides', () => {
    expect(expected(1500, 1500)).toBe(0.5);
  });

  it('maps ratings onto the card scale', () => {
    expect(cardRating(1500)).toBe(70);
    expect(cardRating(1900)).toBe(90);
    expect(cardRating(9999)).toBe(95);
    expect(cardRating(0)).toBe(45);
  });

  it('finds the real order of a group from reshuffled 5-a-side results', () => {
    // 12 players with hidden ability; each match day shuffles them into two sides of six,
    // and the side with more ability (plus some luck) wins. After a season, the ratings
    // should rank players close to their real ability.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const ability = Array.from({ length: 12 }, (_, i) => i); // player i has ability i
    const games: SkillGame[] = [];
    for (let day = 0; day < 60; day++) {
      const order = [...ability].sort(() => rand() - 0.5);
      const a = order.slice(0, 6), b = order.slice(6);
      const sum = (side: number[]) => side.reduce((s, x) => s + x, 0);
      const diff = sum(a) - sum(b) + (rand() - 0.5) * 12;
      const goals = Math.round(Math.abs(diff) / 4);
      games.push(game(a.map(String), b.map(String), diff > 0 ? goals + 1 : 1, diff > 0 ? 1 : goals + 1));
    }
    const s = replaySkill(games);
    const ranked = ability.map(String).sort((x, y) => s.get(x)!.rating - s.get(y)!.rating).map(Number);
    // Spearman rank correlation between real ability and learned rating.
    const n = ranked.length;
    const d2 = ranked.reduce((sum, player, rank) => sum + (player - rank) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));
    expect(rho).toBeGreaterThan(0.8);
  });
});
