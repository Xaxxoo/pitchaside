import { dayLines, matchRating, replaySteady, stepOvr, voteWeight, MOVE_NEW, MOVE_SETTLED, NEW_FOR, VOTE_MOVE_MAX, VOTE_WEIGHT, type DayInput } from './match-rating';

const A = ['a1', 'a2', 'a3'];
const B = ['b1', 'b2', 'b3'];
const day = (over: Partial<DayInput> = {}): DayInput => ({
  games: [
    { sideA: A, sideB: B, scoreA: 2, scoreB: 0, keeperA: 'a1', keeperB: 'b1' },
    { sideA: A, sideB: B, scoreA: 1, scoreB: 1, keeperA: 'a1', keeperB: 'b1' },
    { sideA: A, sideB: B, scoreA: 0, scoreB: 1, keeperA: 'a1', keeperB: 'b1' },
  ],
  goals: [],
  ...over,
});

describe('dayLines', () => {
  it('counts results, clean sheets and keeper games per player', () => {
    const l = dayLines(day());
    expect(l.get('a2')).toMatchObject({ games: 3, w: 1, d: 1, l: 1, cleanSheets: 1, inGoal: 0 });
    expect(l.get('a1')).toMatchObject({ games: 3, inGoal: 3, keeperCleanSheets: 1, conceded: 2, cleanSheets: 0 });
  });

  it('a borrowed keeper gets keeper credit but no result, and is off their own side for that game', () => {
    const l = dayLines({ games: [{ sideA: A, sideB: B, scoreA: 0, scoreB: 3, keeperA: 'b3', keeperB: 'b1' }], goals: [] });
    expect(l.get('b3')).toMatchObject({ games: 1, inGoal: 1, w: 0, d: 0, l: 0, conceded: 3 });
    // b3 was not on B's side: B's winners are b1 and b2 only
    expect(l.get('b2')).toMatchObject({ w: 1 });
    expect(l.get('a2')).toMatchObject({ l: 1 });
  });
});

describe('matchRating', () => {
  it('an ordinary day with nothing special sits at 6', () => {
    const l = dayLines(day()).get('a2')!;
    expect(matchRating({ ...l, cleanSheets: 0, cleanSheetCredit: 0 }, 1)!.rating).toBe(6);
  });

  it('goals lift it, capped', () => {
    const l = dayLines(day({ goals: Array.from({ length: 30 }, () => ({ scorerId: 'a2' })) })).get('a2')!;
    expect(matchRating(l, 1)!.parts.goals).toBe(2.4);
  });

  it('a clean sheet gives everyone something, defenders more, the keeper most', () => {
    const l = dayLines(day(), new Map([['a2', 'DEF'], ['a3', 'ATT']]));
    const cs = (id: string) => matchRating(l.get(id)!, 1)!;
    expect(l.get('a3')!.cleanSheetCredit).toBeGreaterThan(0);
    expect(l.get('a2')!.cleanSheetCredit).toBeGreaterThan(l.get('a3')!.cleanSheetCredit);
    expect(cs('a1').parts.keeping).toBeGreaterThan(cs('a2').parts.cleanSheets);
  });

  it('the position played in that game counts, not the usual one', () => {
    const games = day().games.map((g, i) => (i === 0 ? { ...g, positions: { a2: 'ATT' as const } } : g));
    const moved = dayLines({ games, goals: [] }, new Map([['a2', 'DEF']])).get('a2')!;
    const stayed = dayLines(day(), new Map([['a2', 'DEF']])).get('a2')!;
    expect(moved.cleanSheetCredit).toBeLessThan(stayed.cleanSheetCredit);
  });

  it('a red card costs more than a yellow', () => {
    const l = dayLines(day({ yellow: { a2: 1 } })).get('a2')!;
    const r = dayLines(day({ red: { a2: 1 } })).get('a2')!;
    expect(matchRating(r, 1)!.rating).toBeLessThan(matchRating(l, 1)!.rating);
  });

  it('votes count the same for everyone, new or settled', () => {
    const l = dayLines(day({ potm: new Set(['a2']) })).get('a2')!;
    expect(matchRating(l, voteWeight())!.parts.votes).toBe(VOTE_WEIGHT);
  });

  it('stays between 3 and 10', () => {
    const l = dayLines(day({ red: { a2: 5 } })).get('a2')!;
    expect(matchRating(l, 1)!.rating).toBe(3);
  });
});

describe('steady OVR', () => {
  it('moves at most MOVE_NEW while new and MOVE_SETTLED after', () => {
    expect(stepOvr({ ovr: 50, days: 0, last: null, form: null }, 10, 5).ovr).toBe(50 + MOVE_NEW);
    expect(stepOvr({ ovr: 50, days: NEW_FOR, last: null, form: null }, 10, 5).ovr).toBe(50 + MOVE_SETTLED);
    expect(stepOvr({ ovr: 50, days: NEW_FOR, last: null, form: null }, 3, 5).ovr).toBe(50 - MOVE_SETTLED);
  });

  it('a short day (one game) moves it less', () => {
    expect(stepOvr({ ovr: 50, days: 0, last: null, form: null }, 10, 1).ovr - 50).toBeCloseTo(MOVE_NEW / 3, 0);
  });

  it('missing a match day leaves it alone', () => {
    const out = replaySteady([day(), { games: [{ sideA: ['a2'], sideB: ['b2'], scoreA: 1, scoreB: 0 }], goals: [] }], new Map([['a3', 60]]));
    expect(out.get('a3')!.days).toBe(1);
    expect(out.get('a2')!.days).toBe(2);
  });
});

describe('position fairness', () => {
  it('an attacker is not rated above a defender just for playing up front', () => {
    // Every day the attacker's side wins 1–0 with his goal; the defender's side keeps clean sheets and wins too
    const days: DayInput[] = Array.from({ length: 12 }, () => ({
      games: [
        { sideA: ['att', 'x1'], sideB: ['y1', 'y2'], scoreA: 1, scoreB: 0 },
        { sideA: ['def', 'x2'], sideB: ['y3', 'y4'], scoreA: 1, scoreB: 0 },
      ],
      goals: [{ scorerId: 'att' }, { scorerId: 'x2' }],
    }));
    const pos = new Map<string, 'ATT' | 'DEF'>([['att', 'ATT'], ['def', 'DEF'], ['x1', 'ATT'], ['x2', 'ATT'], ['y1', 'DEF'], ['y2', 'ATT'], ['y3', 'DEF'], ['y4', 'ATT']]);
    const out = replaySteady(days, new Map(), pos);
    // Both did the job for their position on winning sides: the gap stays small
    expect(Math.abs(out.get('att')!.ovr - out.get('def')!.ovr)).toBeLessThan(15);
  });
});

describe('stress: odd and extreme match days never break it', () => {
  it('random seasons stay finite and in range', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296), seed / 4294967296);
    const ids = Array.from({ length: 40 }, (_, i) => `p${i}`);
    for (let season = 0; season < 30; season++) {
      const days: DayInput[] = Array.from({ length: 20 }, () => {
        const here = ids.filter(() => rand() < 0.5);
        const half = Math.floor(here.length / 2);
        const sideA = here.slice(0, half);
        const sideB = here.slice(half);
        const games = Array.from({ length: Math.floor(rand() * 12) }, () => ({
          sideA,
          sideB,
          scoreA: Math.floor(rand() * 16),
          scoreB: Math.floor(rand() * 3),
          // sometimes a keeper from anywhere (even someone not here), sometimes none
          keeperA: rand() < 0.5 ? ids[Math.floor(rand() * ids.length)] : null,
          keeperB: rand() < 0.5 ? sideB[0] ?? null : null,
        }));
        return {
          games,
          goals: Array.from({ length: Math.floor(rand() * 30) }, () => ({ scorerId: here[Math.floor(rand() * here.length)] ?? 'p0', assistId: rand() < 0.5 ? here[0] : null })),
          saves: { p1: Math.floor(rand() * 40) },
          red: (rand() < 0.1 ? { p2: 3 } : {}) as Record<string, number>,
          potm: new Set(here.slice(0, 2)),
        };
      });
      const out = replaySteady(days, new Map([['p3', 90], ['p4', 45]]), new Map([['p5', 'DEF'], ['p6', 'GK']]), (_i, _l, ratings) => {
        for (const r of ratings.values()) expect(r.rating >= 3 && r.rating <= 10).toBe(true);
      });
      for (const s of out.values()) {
        expect(Number.isFinite(s.ovr)).toBe(true);
        expect(s.ovr).toBeGreaterThanOrEqual(30);
        expect(s.ovr).toBeLessThanOrEqual(95);
      }
    }
  });

  it('a day with no games, or one-a-side, changes nothing badly', () => {
    expect(replaySteady([{ games: [], goals: [] }]).size).toBe(0);
    const out = replaySteady([{ games: [{ sideA: ['a'], sideB: [], scoreA: 3, scoreB: 0 }], goals: [] }]);
    expect(Number.isFinite(out.get('a')!.ovr)).toBe(true);
  });
});

describe('how much of the day they played, and days missed', () => {
  // Eight games A v B; the sub on A played two of them
  const eight = (sub: boolean) => Array.from({ length: 8 }, (_, i) => ({ sideA: ['a1', 'a2', ...(sub && i < 2 ? ['sub'] : [])], sideB: ['b1', 'b2'], scoreA: 1, scoreB: 0 }));

  it('a sub who played 2 of 8 moves less than a starter with the same match rating', () => {
    const out = replaySteady([{ games: eight(true), goals: [] }]);
    const starter = out.get('a1')!.ovr - 50;
    const sub = out.get('sub')!.ovr - 50;
    expect(sub).toBeGreaterThan(0);
    expect(sub).toBeLessThan(starter / 2);
  });

  it('missing your group’s days takes a little off after two in a row, never more than 5', () => {
    const played = { groupId: 'g', games: [{ sideA: ['ada', 'x'], sideB: ['bisi', 'y'], scoreA: 0, scoreB: 0 }], goals: [] };
    const without = { groupId: 'g', games: [{ sideA: ['x'], sideB: ['y'], scoreA: 0, scoreB: 0 }], goals: [] };
    const two = replaySteady([played, without, without]).get('ada')!;
    const three = replaySteady([played, without, without, without]).get('ada')!;
    const many = replaySteady([played, ...Array.from({ length: 30 }, () => without)]).get('ada')!;
    expect(two.ovr).toBe(replaySteady([played]).get('ada')!.ovr);
    expect(three.ovr).toBeCloseTo(two.ovr - 0.5, 5);
    expect(two.ovr - many.ovr).toBeCloseTo(5, 5);
  });

  it('another group’s day, or never having played, takes nothing off', () => {
    const mine = { groupId: 'g', games: [{ sideA: ['ada', 'x'], sideB: ['y'], scoreA: 0, scoreB: 0 }], goals: [] };
    const other = { groupId: 'h', games: [{ sideA: ['x'], sideB: ['y'], scoreA: 0, scoreB: 0 }], goals: [] };
    const out = replaySteady([mine, other, other, other, other], new Map([['newbie', 50]]));
    expect(out.get('ada')!.drift).toBe(0);
    expect(out.get('newbie')!.ovr).toBe(50);
  });

  it('playing again stops it', () => {
    const played = { groupId: 'g', games: [{ sideA: ['ada', 'x'], sideB: ['y'], scoreA: 0, scoreB: 0 }], goals: [] };
    const without = { groupId: 'g', games: [{ sideA: ['x'], sideB: ['y'], scoreA: 0, scoreB: 0 }], goals: [] };
    const back = replaySteady([played, without, without, without, played]).get('ada')!;
    expect(back.missed).toBe(0);
    expect(back.drift).toBe(0);
  });
});

describe('own goals and missed penalties', () => {
  it('cost a little, apart from cards, and never count as goals', () => {
    const day = { games: [{ sideA: ['ada'], sideB: ['bisi'], scoreA: 0, scoreB: 1 }], goals: [], ownGoals: ['ada'], penMisses: { ada: 1 } };
    const l = dayLines(day).get('ada')!;
    expect(l.goals).toBe(0);
    expect(l.ownGoals).toBe(1);
    const mr = matchRating(l, 1)!;
    expect(mr.parts.mistakes).toBe(-1);
    expect(mr.parts.cards).toBeCloseTo(0);
  });
});

describe('votes nudge the card, they don’t carry it (decided 30 Oct)', () => {
  // A 10-player club over 10 match days: teams rotate, scores vary (a small seeded random)
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  function season(potm: (d: number) => string[], seed = 7): DayInput[] {
    let x = seed;
    const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 10 }, (_, d) => ({
      games: Array.from({ length: 3 }, (_, g) => {
        const r = [...ids.slice((d * 3 + g) % 10), ...ids.slice(0, (d * 3 + g) % 10)];
        // e, l and n always play together, so only their votes differ
        const sideA = ['e', 'l', 'n', ...r.slice(0, 2)], sideB = r.slice(2, 7);
        return { sideA, sideB, scoreA: Math.floor(rand() * 3), scoreB: Math.floor(rand() * 3) };
      }),
      goals: [],
      potm: new Set(potm(d)),
    }));
  }
  const early = replaySteady(season((d) => (d < 2 ? ['e'] : d >= 8 ? ['l'] : [])));
  const card = (id: string) => early.get(id)!.ovr;

  // Measured over 40 such seasons (30 Oct): before this rule early vs late averaged 14.5 apart
  // (never under 9.5) and early vs never 15.3; now 3.1 and 3.9
  it('Player of the Match early or late ends up about the same', () => {
    expect(Math.abs(card('e') - card('l'))).toBeLessThanOrEqual(5);
  });

  it('two early Player of the Match wins don’t lift a card far above never winning it', () => {
    expect(card('e') - card('n')).toBeLessThanOrEqual(7);
  });

  it('a card never moves more than MOVE_NEW in a day, and votes alone at most VOTE_MOVE_MAX', () => {
    let last = new Map<string, number>();
    replaySteady(season((d) => (d < 2 ? ['e'] : [])), new Map(), new Map(), (_i, _l, _r, after) => {
      for (const [id, s] of after) {
        if (last.has(id)) expect(Math.abs(s.ovr - last.get(id)!)).toBeLessThanOrEqual(MOVE_NEW + 0.05);
      }
      last = new Map([...after].map(([id, s]) => [id, s.ovr]));
    });
    // A day where all of the rating above the start is votes: the card moves at most VOTE_MOVE_MAX for them
    const settled = { ovr: 50, days: NEW_FOR, last: null, form: 6.9, formNoVotes: 6.9 };
    const withVotes = stepOvr(settled, 6.9 + 1.08, 4, undefined, 4, 1.08).ovr - 50;
    expect(withVotes).toBeLessThanOrEqual(VOTE_MOVE_MAX + 0.05);
  });

  it('a card doesn’t move on a day its player doesn’t play', () => {
    const days = season(() => []);
    const before = replaySteady(days.slice(0, 5));
    const withDayOff = replaySteady([...days.slice(0, 5), { games: [{ sideA: ['p0'], sideB: ['p1'], scoreA: 3, scoreB: 0 }], goals: [], potm: new Set(['p0']) }]);
    expect(withDayOff.get('p5')!.ovr).toBe(before.get('p5')!.ovr);
  });
});

