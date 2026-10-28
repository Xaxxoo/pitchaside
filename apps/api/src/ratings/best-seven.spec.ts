import { bestSeven } from './best-seven';

const v = (category: string, ...ids: string[]) => ids.map((nomineeId) => ({ category, nomineeId }));

describe('bestSeven', () => {
  it('puts the most-picked keeper first, then the six most-picked outfield players', () => {
    const r = bestSeven([...v('vii_gk', 'k1', 'k1', 'k2'), ...v('vii', 'a', 'a', 'b', 'b', 'c', 'd', 'e', 'f', 'g'), ...v('vii_sub', 'h')]);
    expect(r.keeper).toBe('k1');
    expect(r.ids[0]).toBe('k1');
    expect(r.ids).toHaveLength(7);
    expect(r.ids).not.toContain('k2');
    expect(r.picks.get('k1')).toBe(2);
  });

  it('never has the keeper twice when they were also picked outfield', () => {
    const r = bestSeven([...v('vii_gk', 'k'), ...v('vii', 'k', 'k', 'k', 'a', 'b')]);
    expect(r.ids.filter((id) => id === 'k')).toHaveLength(1);
    expect(r.ids).toEqual(['k', 'a', 'b']);
  });

  it('counts a sub pick as half', () => {
    const r = bestSeven([...v('vii', 'a', 'b', 'c', 'd', 'e', 'f', 'g'), ...v('vii_sub', 'x', 'x', 'x')]);
    expect(r.ids).toContain('x');
    expect(r.ids.indexOf('x')).toBe(0);
  });

  it('days voted before the keeper slot: the seven most picked, no keeper', () => {
    const r = bestSeven([...v('vii', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')]);
    expect(r.keeper).toBeNull();
    expect(r.ids).toHaveLength(7);
    expect(r.ids[0]).toBe('a');
  });

  it('a keeper tie goes to whoever was picked more overall', () => {
    const r = bestSeven([...v('vii_gk', 'k1', 'k2'), ...v('vii', 'k2')]);
    expect(r.keeper).toBe('k2');
  });

  it('no votes: nobody', () => {
    expect(bestSeven([]).ids).toEqual([]);
  });
});
