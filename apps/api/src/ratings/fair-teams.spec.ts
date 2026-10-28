import { fairSplit, FAIR_SLACK, type FairPlayer } from './fair-teams';

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296), seed / 4294967296);
const squad = (n: number, sides: string[] = []): FairPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, strength: 40 + ((i * 37) % 50), side: sides[i] ?? null, fixed: false }));
const sizes = (teams: Record<string, string>, sides: string[]) => sides.map((s) => Object.values(teams).filter((t) => t === s).length);
const shape = (teams: Record<string, string>) =>
  [...new Set(Object.values(teams))].map((s) => Object.keys(teams).filter((id) => teams[id] === s).sort().join(',')).sort().join('|');

describe('fairSplit', () => {
  it('puts everyone on a side, sizes within one', () => {
    const { teams } = fairSplit(squad(17), ['A', 'B', 'C'], seeded(1));
    expect(Object.keys(teams)).toHaveLength(17);
    const s = sizes(teams, ['A', 'B', 'C']);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
  });

  it('gives a different fair split on the next tap', () => {
    const players = squad(12);
    const first = fairSplit(players, ['A', 'B'], seeded(2));
    const again = fairSplit(players.map((p) => ({ ...p, side: first.teams[p.id] })), ['A', 'B'], seeded(3));
    expect(shape(again.teams)).not.toBe(shape(first.teams));
    expect(again.onlyOne).toBe(false);
  });

  it('ten taps in a row: never the same as the one before, always fair', () => {
    let players = squad(15);
    let last = '';
    for (let i = 0; i < 10; i++) {
      const r = fairSplit(players, ['A', 'B', 'C'], seeded(10 + i));
      expect(shape(r.teams)).not.toBe(last);
      expect(r.gap).toBeLessThanOrEqual(FAIR_SLACK + 3);
      last = shape(r.teams);
      players = players.map((p) => ({ ...p, side: r.teams[p.id] }));
    }
  });

  it('captains and vices stay on their side', () => {
    const players = squad(10);
    players[0] = { ...players[0], side: 'B', fixed: true };
    players[1] = { ...players[1], side: 'B', fixed: true };
    players[2] = { ...players[2], side: 'A', fixed: true };
    for (let i = 0; i < 5; i++) {
      const { teams } = fairSplit(players, ['A', 'B'], seeded(20 + i));
      expect([teams.p0, teams.p1, teams.p2]).toEqual(['B', 'B', 'A']);
    }
  });

  it('says so when there is only one fair split', () => {
    const players: FairPlayer[] = [
      { id: 'a', strength: 50, side: 'A', fixed: false },
      { id: 'b', strength: 50, side: 'B', fixed: false },
    ];
    const r = fairSplit(players, ['A', 'B'], seeded(4));
    expect(r.onlyOne).toBe(true);
  });

  it('copes with fewer players than sides, and with nobody', () => {
    expect(Object.keys(fairSplit(squad(2), ['A', 'B', 'C'], seeded(5)).teams)).toHaveLength(2);
    expect(fairSplit([], ['A', 'B'], seeded(6))).toMatchObject({ teams: {}, gap: 0 });
  });

  it('everyone level (no ratings yet): still a new split each time', () => {
    const players = squad(10).map((p) => ({ ...p, strength: 50 }));
    const a = fairSplit(players, ['A', 'B'], seeded(7));
    const b = fairSplit(players.map((p) => ({ ...p, side: a.teams[p.id] })), ['A', 'B'], seeded(8));
    expect(shape(b.teams)).not.toBe(shape(a.teams));
    expect(b.gap).toBe(0);
  });

  it('shares keepers out: one per side when there are enough, never two on one side while another has none', () => {
    const players = squad(15).map((p, i) => ({ ...p, keeper: i < 3 }));
    for (let i = 0; i < 8; i++) {
      const { teams } = fairSplit(players, ['A', 'B', 'C'], seeded(40 + i));
      const per = ['A', 'B', 'C'].map((t) => players.filter((p) => p.keeper && teams[p.id] === t).length);
      expect(per.sort()).toEqual([1, 1, 1]);
    }
    const two = squad(15).map((p, i) => ({ ...p, keeper: i < 2 }));
    const { teams } = fairSplit(two, ['A', 'B', 'C'], seeded(50));
    expect(Math.max(...['A', 'B', 'C'].map((t) => two.filter((p) => p.keeper && teams[p.id] === t).length))).toBe(1);
  });
});
