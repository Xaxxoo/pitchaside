import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RatingsService, blankRatings, compareStats, trialRatings } from './ratings.service';
import { SessionKind, SessionStatus } from '../sessions/entities/session.entity';
import { VoteCategory } from './entities/vote.entity';
import { localDate } from '../common/time.util';
import { DEFAULT_START, cardRating } from './skill';

const HOUR = 3_600_000;

const player = (id: string) => ({ id, firstName: id, lastName: 'X', nickname: null });
const pay = (id: string, extra: Record<string, unknown> = {}) => ({ playerId: id, player: player(id), team: null, captain: false, attendance: null, ...extra });

function game(over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    groupId: 'grp',
    date: localDate(0),
    kind: SessionKind.GAME,
    status: SessionStatus.COMPLETED,
    teamCount: 2,
    voteOpensAt: new Date(Date.now() - HOUR),
    voteClosedAt: null as Date | null,
    votingToken: 'tok',
    group: { id: 'grp', name: 'Saturday Ballers', contributionsVisibility: 'names' },
    payments: [pay('ada', { team: 'A' }), pay('bisi', { team: 'B' }), pay('lanre', { attendance: 'no_show' })],
    ...over,
  };
}

/** The service with in-memory repos: one game, its votes and its scores. */
function setup(
  session: ReturnType<typeof game>,
  opts: {
    votes?: { voterId: string; nomineeId: string; category: VoteCategory }[];
    scores?: number;
    games?: { teamA: string; teamB: string; scoreA: number; scoreB: number; keeperA?: string | null; keeperB?: string | null }[];
    goals?: { scorerId: string; assistId: string | null; ownGoal: boolean }[];
    events?: { playerId: string; kind: string }[];
  } = {},
) {
  const votes = (opts.votes ?? []).map((v) => ({ sessionId: session.id, ...v }));
  const qb = {
    innerJoin: () => qb,
    innerJoinAndSelect: () => qb,
    leftJoinAndSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    addOrderBy: () => qb,
    getOne: async () => session,
    getMany: async () => [session],
  };
  const games = (opts.games ?? []).map((g) => ({ sessionId: session.id, ...g }));
  const saved: unknown[] = [];
  const manager = {
    transaction: async (fn: (m: unknown) => Promise<void>) =>
      fn({ delete: async () => undefined, save: async (_e: unknown, rows: unknown) => saved.push(rows), create: (_e: unknown, r: unknown) => r }),
    save: async (rows: unknown) => saved.push(rows),
    find: async () => [],
  };
  const sessionsRepo = { findOne: async () => session, findOneOrFail: async () => session, createQueryBuilder: () => qb, update: async () => undefined, manager };
  const votesRepo = { find: async () => votes, count: async () => votes.length, manager };
  const gamesRepo = { count: async () => opts.scores ?? games.length, find: async () => games, save: async (g: unknown) => g, create: (g: unknown) => g };
  const groupsRepo = { findOne: async () => session.group };
  const goalsRepo = { find: async () => opts.goals ?? [], save: async (g: unknown) => g, create: (g: unknown) => g, delete: async () => undefined };
  const service = new RatingsService(votesRepo as never, gamesRepo as never, goalsRepo as never, sessionsRepo as never, groupsRepo as never, { find: async () => opts.events ?? [] } as never);
  return { service, saved };
}

describe('the vote', () => {
  it('opens when the game ends, not before', async () => {
    const { service } = setup(game({ status: SessionStatus.UPCOMING, voteOpensAt: null }));
    await expect(service.submitVotes('tok', ['ada'], { potm: 'bisi' })).rejects.toThrow('Voting opens when the game ends');
    expect((await service.getBallot('tok')).notYet).toBe(true);
  });

  it('stays open for 36 hours from full time', async () => {
    expect((await setup(game({ voteOpensAt: new Date(Date.now() - 35 * HOUR) })).service.getBallot('tok')).open).toBe(true);
    expect((await setup(game({ voteOpensAt: new Date(Date.now() - 37 * HOUR) })).service.getBallot('tok')).open).toBe(false);
  });

  it('keeps the old week-long window for games ended before full-time votes', async () => {
    const { service } = setup(game({ voteOpensAt: null, date: localDate(-3) }));
    expect((await service.getBallot('tok')).open).toBe(true);
  });

  it('stops taking votes while a game is reopened', async () => {
    const { service } = setup(game({ status: SessionStatus.UPCOMING }));
    expect((await service.getBallot('tok')).open).toBe(false);
  });

  it('only lets players who came vote', async () => {
    const { service } = setup(game());
    await expect(service.submitVotes('tok', ['lanre'], { potm: 'ada' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submitVotes('tok', ['ada'], { [VoteCategory.POTM]: 'bisi' })).resolves.toBeDefined();
  });

  it('keeps the results hidden while the vote is open, and shows them after', async () => {
    const ballot = [{ voterId: 'ada', nomineeId: 'bisi', category: VoteCategory.POTM }];
    const open = await setup(game(), { votes: ballot }).service.getPublicResults('tok');
    expect(open.hidden).toBe(true);
    expect(open.ballots).toBe(1);
    expect(open.categories.every((c) => c.standings.length === 0)).toBe(true);

    const closed = await setup(game({ voteOpensAt: new Date(Date.now() - 49 * HOUR) }), { votes: ballot }).service.getPublicResults('tok');
    expect(closed.hidden).toBe(false);
    expect(closed.categories[0].standings[0]).toMatchObject({ playerId: 'bisi', count: 1 });
  });
});

describe('match day teams and scores', () => {
  it('locks the teams once a score is in', async () => {
    const { service } = setup(game(), { scores: 1 });
    await expect(service.setLineup('g1', 'org', { teams: { ada: 'B' } })).rejects.toThrow('Teams are locked');
    await expect(service.setLineup('g1', 'org', { teamCount: 3 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.pickTeam('g1', ['ada'], 'B')).rejects.toThrow('Teams are set');
  });

  it('lets teams change while no score is in', async () => {
    const { service } = setup(game({ status: SessionStatus.UPCOMING, voteOpensAt: null }));
    await expect(service.pickTeam('g1', ['ada'], 'B')).resolves.toMatchObject({ bibsOpen: true });
  });

  it("doesn't take scores before match day", async () => {
    const { service } = setup(game({ status: SessionStatus.UPCOMING, voteOpensAt: null, date: localDate(2) }));
    await expect(service.addGame('g1', 'org', { teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 0 })).rejects.toThrow('Scores open on match day');
  });
});

describe('the table', () => {
  // Ada (orange) beat Bisi (blue) 2–1, then they drew 1–1; Lanre didn't come.
  const day = [
    { teamA: 'A', teamB: 'B', scoreA: 2, scoreB: 1 },
    { teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 1 },
  ];

  it('gives 3 for a win, 1 for a draw and 2 for Team of the Day', async () => {
    const { rows } = await setup(game({ voteOpensAt: new Date(Date.now() - 49 * HOUR) }), { games: day }).service.getGroupTable('grp', 'org');
    const ada = rows.find((r) => r.player.id === 'ada')!;
    const bisi = rows.find((r) => r.player.id === 'bisi')!;
    expect(ada).toMatchObject({ record: { w: 1, d: 1, l: 0 }, teamOfDay: 1, points: 3 + 1 + 2 });
    expect(bisi).toMatchObject({ record: { w: 0, d: 1, l: 1 }, teamOfDay: 0, points: 1 });
    expect(rows.map((r) => r.player.id)).toEqual(['ada', 'bisi']);
  });

  it('adds 3 for Player of the Match once the vote closes; other votes earn no points', async () => {
    const votes = [
      { voterId: 'ada', nomineeId: 'bisi', category: VoteCategory.POTM },
      { voterId: 'bisi', nomineeId: 'ada', category: VoteCategory.PACE },
      { voterId: 'bisi', nomineeId: 'ada', category: VoteCategory.SHOOTING },
    ];
    const closed = await setup(game({ voteOpensAt: new Date(Date.now() - 49 * HOUR) }), { games: day, votes }).service.getGroupTable('grp', 'org');
    expect(closed.rows.find((r) => r.player.id === 'bisi')).toMatchObject({ potmWins: 1, points: 1 + 3 });
    expect(closed.rows.find((r) => r.player.id === 'ada')).toMatchObject({ points: 6 });

    const open = await setup(game(), { games: day, votes }).service.getGroupTable('grp', 'org');
    expect(open.rows.find((r) => r.player.id === 'bisi')).toMatchObject({ potmWins: 0, points: 1 });
  });

  it('ranks by rating, not points: winning on the day isn’t enough to top it', async () => {
    const { service } = setup(game({ voteOpensAt: new Date(Date.now() - 49 * HOUR) }), { games: day });
    // Ada's side won (more points); Bisi's card is higher (goals and votes over time).
    const clubCard = jest.spyOn(service as never as { clubCard: () => Promise<unknown> }, 'clubCard');
    clubCard.mockResolvedValue({ skills: new Map(), everyone: [], trial: new Map(), card: new Map([['ada', 64], ['bisi', 81]]) });
    const t = await service.getGroupTable('grp', 'org');
    const ada = t.rows.find((r) => r.player.id === 'ada')!;
    const bisi = t.rows.find((r) => r.player.id === 'bisi')!;
    expect(ada.points).toBeGreaterThan(bisi.points);
    expect(t.rows.map((r) => r.player.id)).toEqual(['bisi', 'ada']);
    expect([bisi.ovr, ada.ovr]).toEqual([81, 64]);
    expect(t.rankedBy).toBe('rating');
  });

  it('level on rating, points decide', async () => {
    const { service } = setup(game({ voteOpensAt: new Date(Date.now() - 49 * HOUR) }), { games: day });
    jest.spyOn(service as never as { clubCard: () => Promise<unknown> }, 'clubCard').mockResolvedValue({ skills: new Map(), everyone: [], trial: new Map(), card: new Map([['ada', 70], ['bisi', 70]]) });
    expect((await service.getGroupTable('grp', 'org')).rows.map((r) => r.player.id)).toEqual(['ada', 'bisi']);
  });

  it("leaves out players who didn't come", async () => {
    const { rows } = await setup(game(), { games: day }).service.getGroupTable('grp', 'org');
    expect(rows.some((r) => r.player.id === 'lanre')).toBe(false);
  });
});

describe('the one-question ballot', () => {
  it('asks Player of the Match, with each player\'s team', async () => {
    const b = await setup(game({ payments: [pay('ada', { team: 'A', captain: true }), pay('bisi', { team: 'B' }), pay('lanre', { attendance: 'no_show' })] })).service.getBallot('tok');
    expect(b.categories[0].key).toBe(VoteCategory.POTM);
    expect(b.squad.map((p) => [p.id, p.team])).toEqual([
      ['ada', 'A'],
      ['bisi', 'B'],
    ]);
    expect(b.captains).toEqual({ A: 'ada' });
  });

  it('closes once everyone who came has voted, and shows the result', async () => {
    const ballots = [
      { voterId: 'ada', nomineeId: 'bisi', category: VoteCategory.POTM },
      { voterId: 'bisi', nomineeId: 'ada', category: VoteCategory.POTM },
    ];
    const session = game();
    const res = await setup(session, { votes: ballots }).service.submitVotes('tok', ['ada'], { potm: 'bisi' });
    expect(session.voteClosedAt).toBeInstanceOf(Date);
    expect(res.hidden).toBe(false);
  });

  it('also closes early on a game with the older week-long window', async () => {
    const legacy = game({ voteOpensAt: null, voteClosedAt: new Date(Date.now() - 1000) });
    const r = await setup(legacy, { votes: [{ voterId: 'ada', nomineeId: 'bisi', category: VoteCategory.POTM }] }).service.getPublicResults('tok');
    expect(r.hidden).toBe(false);
  });

  it('stays open while someone who came still has to vote', async () => {
    const session = game();
    const res = await setup(session, { votes: [{ voterId: 'ada', nomineeId: 'bisi', category: VoteCategory.POTM }] }).service.submitVotes('tok', ['ada'], { potm: 'bisi' });
    expect(session.voteClosedAt ?? null).toBeNull();
    expect(res.hidden).toBe(true);
  });

  it("doesn't pull card attributes down when the ballot only asked Player of the Match", async () => {
    const votes = [
      { voterId: 'ada', nomineeId: 'bisi', category: VoteCategory.POTM },
      { voterId: 'bisi', nomineeId: 'ada', category: VoteCategory.POTM },
    ];
    const { rows } = await setup(game({ voteOpensAt: new Date(Date.now() - 49 * HOUR) }), { votes }).service.getGroupTable('grp', 'org');
    for (const r of rows) {
      // No award or stat evidence: nothing below the card, and nothing made up either
      const a = Object.values(r.attributes).filter((v) => v !== null) as number[];
      expect(a.every((v) => v >= (r.ovr ?? 0))).toBe(true);
      expect(a).toEqual([]);
    }
  });
});

describe('best on your team', () => {
  const four = () =>
    game({
      payments: [pay('ada', { team: 'A' }), pay('seyi', { team: 'A' }), pay('bisi', { team: 'B' }), pay('kemi', { team: 'B' })],
    });

  it('is asked only when teams were set', async () => {
    expect((await setup(four()).service.getBallot('tok')).categories.map((c) => c.key)).toEqual([VoteCategory.POTM, VoteCategory.TEAMMATE]);
    const noTeams = game({ payments: [pay('ada'), pay('bisi')] });
    expect((await setup(noTeams).service.getBallot('tok')).categories.map((c) => c.key)).toEqual([VoteCategory.POTM]);
  });

  it('takes a pick from your own team only', async () => {
    const { service } = setup(four());
    await expect(service.submitVotes('tok', ['ada'], { potm: 'bisi', teammate: 'kemi' })).rejects.toThrow('your own team');
    await expect(service.submitVotes('tok', ['ada'], { potm: 'bisi', teammate: 'seyi' })).resolves.toBeDefined();
  });

  it('shows a winner per team once the vote closes', async () => {
    const votes = [
      { voterId: 'ada', nomineeId: 'seyi', category: VoteCategory.TEAMMATE },
      { voterId: 'bisi', nomineeId: 'kemi', category: VoteCategory.TEAMMATE },
      { voterId: 'kemi', nomineeId: 'bisi', category: VoteCategory.TEAMMATE },
    ];
    const r = await setup(four() as never, { votes }).service.getPublicResults('tok');
    expect(r.categories.filter((c) => c.key === VoteCategory.TEAMMATE).map((c) => c.team)).toEqual(['A', 'B']);
    const closed = await setup({ ...four(), voteOpensAt: new Date(Date.now() - 49 * HOUR) } as never, { votes }).service.getPublicResults('tok');
    const best = closed.categories.filter((c) => c.key === VoteCategory.TEAMMATE);
    expect(best.find((c) => c.team === 'A')!.standings[0].playerId).toBe('seyi');
  });

  it("doesn't move cards or table points", async () => {
    const votes = [
      { voterId: 'ada', nomineeId: 'seyi', category: VoteCategory.TEAMMATE },
      { voterId: 'bisi', nomineeId: 'kemi', category: VoteCategory.TEAMMATE },
    ];
    const { rows } = await setup({ ...four(), voteOpensAt: new Date(Date.now() - 49 * HOUR) } as never, { votes }).service.getGroupTable('grp', 'org');
    for (const r of rows) {
      expect(r.points).toBe(0);
      expect(Object.values(r.attributes).every((a) => a === null || a === cardRating(DEFAULT_START))).toBe(true);
    }
  });
});

describe('who played each game', () => {
  // Ada, Seyi and Tolu on A; Bisi and Kemi on B. Four games; Tolu sat out three of them.
  const day = () => game({ payments: [pay('ada', { team: 'A' }), pay('seyi', { team: 'A' }), pay('tolu', { team: 'A' }), pay('bisi', { team: 'B' }), pay('kemi', { team: 'B' })] });
  const four = [0, 1, 2, 3].map((i) => ({ teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 0, satOut: i < 3 ? ['tolu'] : null, createdAt: new Date(Date.now() - (4 - i) * HOUR) }));

  it('the ballot says how many games each player played', async () => {
    const b = await setup(day(), { games: four as never }).service.getBallot('tok');
    expect(b.squad.find((p) => p.id === 'tolu')).toMatchObject({ played: 1, of: 4 });
    expect(b.squad.find((p) => p.id === 'ada')).toMatchObject({ played: 4, of: 4 });
  });

  // Tolu gets 3 POTM votes but played 1 of 4; Ada gets 2 and played them all
  const potmVotes = [
    ...['seyi', 'bisi', 'kemi'].map((voterId) => ({ voterId, nomineeId: 'tolu', category: VoteCategory.POTM })),
    ...['tolu', 'x'].map((voterId) => ({ voterId, nomineeId: 'ada', category: VoteCategory.POTM })),
  ];
  const closed = () => ({ ...day(), voteOpensAt: new Date(Date.now() - 100 * HOUR) });

  it('a vote for someone who played under half the games, with nothing to show, counts nothing', async () => {
    const r = await setup(closed() as never, { votes: potmVotes, games: four as never }).service.getPublicResults('tok');
    const potm = r.categories.find((c) => c.key === VoteCategory.POTM)!;
    expect(potm.standings.map((x) => x.playerId)).toEqual(['ada']);
    expect(potm.uncounted).toBe(3);
  });

  it('a goal in their one game counts them in full', async () => {
    const goals = [{ scorerId: 'tolu', assistId: null, ownGoal: false }];
    const r = await setup(closed() as never, { votes: potmVotes, games: four as never, goals: goals as never }).service.getPublicResults('tok');
    expect(r.categories.find((c) => c.key === VoteCategory.POTM)!.standings[0]).toMatchObject({ playerId: 'tolu', count: 3 });
  });

  it('an own goal doesn’t, a save does', async () => {
    const og = [{ scorerId: 'tolu', assistId: null, ownGoal: true }];
    const r1 = await setup(closed() as never, { votes: potmVotes, games: four as never, goals: og as never }).service.getPublicResults('tok');
    expect(r1.categories.find((c) => c.key === VoteCategory.POTM)!.standings[0].playerId).toBe('ada');
    const saves = [{ playerId: 'tolu', kind: 'save' }];
    const r2 = await setup(closed() as never, { votes: potmVotes, games: four as never, events: saves as never }).service.getPublicResults('tok');
    expect(r2.categories.find((c) => c.key === VoteCategory.POTM)!.standings[0].playerId).toBe('tolu');
  });

  it('a keeper borrowed for the other side’s games counts as playing them', async () => {
    // Tolu sat out A's first three games but kept goal for B in them
    const kept = four.map((g, i) => ({ ...g, keeperB: i < 3 ? 'tolu' : null }));
    const b = await setup(day(), { games: kept as never }).service.getBallot('tok');
    expect(b.squad.find((p) => p.id === 'tolu')).toMatchObject({ played: 4, of: 7, inGoal: 3, canBePicked: true });
  });

  it('the ballot says who can be picked, and a pick of someone who can’t is turned down', async () => {
    const b = await setup(day(), { games: four as never }).service.getBallot('tok');
    expect(b.squad.find((p) => p.id === 'tolu')).toMatchObject({ played: 1, of: 4, canBePicked: false });
    expect(b.squad.find((p) => p.id === 'ada')).toMatchObject({ canBePicked: true });
    const open = setup(day(), { games: four as never }).service;
    await expect(open.submitVotes('tok', ['bisi'], { potm: 'tolu', teammate: 'kemi' })).rejects.toThrow('played 1 of 4 games, too few to be picked');
    await expect(open.submitVotes('tok', ['seyi'], { potm: 'bisi', teammate: 'tolu' })).rejects.toThrow('too few to be picked');
    await expect(open.submitVotes('tok', ['seyi'], { potm: 'bisi', teammate: 'ada' })).resolves.toBeDefined();
  });

  it('Best on your team isn’t asked when nobody on the voter’s team can be picked', async () => {
    // Ada's teammates: Seyi played every game; take him out of three so only Tolu-like subs are left
    const subs = four.map((g) => ({ ...g, satOut: ['tolu', 'seyi'].slice(0, g === four[3] ? 0 : 2) }));
    const open = setup(day(), { games: subs as never }).service;
    await expect(open.submitVotes('tok', ['ada'], { potm: 'bisi' })).resolves.toBeDefined();
  });
});

describe('the new ballot', () => {
  // Ten played: Ada and four teammates on A, five on B.
  const ten = () =>
    game({
      payments: [
        pay('ada', { team: 'A' }),
        ...['a1', 'a2', 'a3', 'a4'].map((id) => pay(id, { team: 'A' })),
        ...['b1', 'b2', 'b3', 'b4', 'b5'].map((id) => pay(id, { team: 'B' })),
      ],
    });
  const full = { potm: 'b1', teammate: 'a1', vii: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], vii_sub: 'a4' };

  it('asks for Best VII and the awards when enough played', async () => {
    const ballot = await setup(ten()).service.getBallot('tok');
    expect(ballot.vii).toEqual({ starters: 6, subs: 1, minOtherTeams: 2, keepers: [], keepersFrom: null });
    expect(ballot.awards.map((a) => a.title)).toContain('The Engine');
    expect(ballot.maxAwards).toBe(9);
    const few = game({ payments: [pay('ada', { team: 'A' }), pay('bisi', { team: 'B' })] });
    expect((await setup(few).service.getBallot('tok')).vii).toBeNull();
  });

  it('takes a full ballot: six starters, a sub and awards', async () => {
    const { service, saved } = setup(ten());
    await service.submitVotes('tok', ['ada'], { ...full, passing: 'a2', engine: 'b4', keeper: 'b5' });
    const rows = (saved.flat() as { category: string }[]).map((r) => r.category);
    expect(rows.filter((c) => c === 'vii')).toHaveLength(6);
    expect(rows).toEqual(expect.arrayContaining(['potm', 'teammate', 'vii_sub', 'passing', 'engine', 'keeper']));
  });

  it('needs the best on your team when teams were set', async () => {
    const { service } = setup(ten());
    await expect(service.submitVotes('tok', ['ada'], { ...full, teammate: undefined })).rejects.toThrow('best player on your team');
  });

  it('needs a whole Best VII of seven different players', async () => {
    const { service } = setup(ten());
    await expect(service.submitVotes('tok', ['ada'], { ...full, vii: ['a1', 'a2'] })).rejects.toThrow('6 starters and a sub');
    await expect(service.submitVotes('tok', ['ada'], { ...full, vii_sub: 'a1' })).rejects.toThrow('seven different');
    await expect(service.submitVotes('tok', ['ada'], { ...full, vii: ['ada', 'a2', 'a3', 'b1', 'b2', 'b3'] })).rejects.toThrow("can't vote for yourself");
  });

  it('needs at least two Best VII picks from other teams', async () => {
    // Seven on A, three on B: a Best VII of six teammates and one from B is refused.
    const lopsided = game({
      payments: [pay('ada', { team: 'A' }), ...['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => pay(id, { team: 'A' })), ...['b1', 'b2', 'b3'].map((id) => pay(id, { team: 'B' }))],
    });
    const { service } = setup(lopsided);
    const ballot = { potm: 'b1', teammate: 'a1', vii: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], vii_sub: 'b1' };
    await expect(service.submitVotes('tok', ['ada'], ballot)).rejects.toThrow('at least 2 players from other teams');
    await expect(service.submitVotes('tok', ['ada'], { ...ballot, vii: ['a1', 'a2', 'a3', 'a4', 'a5', 'b2'] })).resolves.toBeDefined();
  });

  describe('the Best VII keeper', () => {
    const inGoal = { games: [{ teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 0, keeperA: 'a4', keeperB: 'b5' }] };
    const withKeeper = { ...full, vii_gk: 'b5', vii: ['a1', 'a2', 'a3', 'b1', 'b2'] };

    it('offers only those who were in goal today', async () => {
      const ballot = await setup(ten(), inGoal).service.getBallot('tok');
      expect(ballot.vii).toMatchObject({ keepers: ['a4', 'b5'], keepersFrom: 'goal' });
    });

    it('with nobody written down in goal, falls back to those playing in goal', async () => {
      const marked = game({ payments: ten().payments.map((p) => (p.playerId === 'b5' ? { ...p, position: 'GK' } : p)) });
      expect((await setup(marked).service.getBallot('tok')).vii).toMatchObject({ keepers: ['b5'], keepersFrom: 'position' });
    });

    it('takes a keeper and five outfield players, and stores the keeper pick', async () => {
      const { service, saved } = setup(ten(), inGoal);
      await service.submitVotes('tok', ['ada'], withKeeper);
      const rows = saved.flat() as { category: string; nomineeId: string }[];
      expect(rows.filter((r) => r.category === 'vii_gk').map((r) => r.nomineeId)).toEqual(['b5']);
      expect(rows.filter((r) => r.category === 'vii')).toHaveLength(5);
    });

    it("refuses a keeper who wasn't in goal, or no keeper", async () => {
      const { service } = setup(ten(), inGoal);
      await expect(service.submitVotes('tok', ['ada'], { ...withKeeper, vii_gk: 'b1', vii: ['a1', 'a2', 'a3', 'b5', 'b2'] })).rejects.toThrow('who were in goal today');
      await expect(service.submitVotes('tok', ['ada'], full)).rejects.toThrow('who were in goal today');
    });

    it('a keeper voting with nobody else in goal gets no keeper slot', async () => {
      const onlyAda = { games: [{ teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 0, keeperA: 'ada', keeperB: null }] };
      await expect(setup(ten(), onlyAda).service.submitVotes('tok', ['ada'], full)).resolves.toBeDefined();
    });

    it('puts the most-picked keeper first in the Best VII of the Day', async () => {
      const closed = { ...ten(), voteOpensAt: new Date(Date.now() - 100 * HOUR) };
      const votes = ['ada', 'a1', 'a2'].flatMap((voterId) => [
        { voterId, nomineeId: 'b5', category: VoteCategory.VII_GK },
        ...['a3', 'b1', 'b2', 'b3', 'b4'].map((nomineeId) => ({ voterId, nomineeId, category: VoteCategory.VII })),
        { voterId, nomineeId: 'a4', category: VoteCategory.VII_SUB },
      ]);
      const { service } = setup(closed as never, { votes, ...inGoal });
      const vii = (await service.getPublicResults('tok')).categories.find((c) => c.key === VoteCategory.VII)!;
      expect(vii.standings.map((x) => x.playerId)).toEqual(['b5', 'a3', 'b1', 'b2', 'b3', 'b4', 'a4']);
      expect('keeperId' in vii && vii.keeperId).toBe('b5');
      const card = await service.getMatchCard('tok');
      expect(card.vii?.[0]).toBe('b5');
      expect(card.viiKeeper).toBe('b5');
    });
  });

  it('takes every award, and refuses categories it does not ask', async () => {
    const { service } = setup(ten());
    await expect(
      service.submitVotes('tok', ['ada'], { ...full, shooting: 'a2', passing: 'a2', dribbling: 'a3', defending: 'b2', smartest: 'b1', engine: 'b4', playmaker: 'a4', movement: 'b3', keeper: 'b5' }),
    ).resolves.toBeDefined();
    await expect(service.submitVotes('tok', ['ada'], { ...full, pace: 'b1' })).rejects.toThrow('Unknown category');
  });

  it('names the Best VII of the Day, and an award only with enough voters', async () => {
    const closed = { ...ten(), voteOpensAt: new Date(Date.now() - 100 * HOUR) };
    const vii = (voterId: string, ids: string[], sub: string) => [
      ...ids.map((nomineeId) => ({ voterId, nomineeId, category: VoteCategory.VII })),
      { voterId, nomineeId: sub, category: VoteCategory.VII_SUB },
    ];
    const votes = [
      ...vii('a1', ['a2', 'a3', 'a4', 'b1', 'b2', 'b3'], 'b4'),
      ...vii('b1', ['a2', 'a3', 'b2', 'b3', 'b4', 'b5'], 'a4'),
      { voterId: 'a1', nomineeId: 'b1', category: VoteCategory.PASSING },
      { voterId: 'b1', nomineeId: 'a2', category: VoteCategory.PASSING },
    ];
    const r = await setup(closed, { votes }).service.getPublicResults('tok');
    const best = r.categories.find((c) => c.key === VoteCategory.VII)!;
    expect(best.standings).toHaveLength(7);
    expect(best.standings.slice(0, 2).map((s) => s.playerId).sort()).toEqual(['a2', 'a3']);
    const passing = r.categories.find((c) => c.key === VoteCategory.PASSING)!;
    expect(passing).toMatchObject({ voters: 2, inconclusive: true, standings: [] });
  });
});

describe('award evidence', () => {
  // Ten played and the vote has closed.
  const ten = () =>
    game({
      voteOpensAt: new Date(Date.now() - 100 * HOUR),
      payments: ['ada', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => pay(id, { team: id < 'f' ? 'A' : 'B' })),
    });
  const passing = (voterId: string, nomineeId = 'ada') => ({ voterId, nomineeId, category: VoteCategory.PASSING });
  const table = async (votes: { voterId: string; nomineeId: string; category: VoteCategory }[], sessions = [ten()]) => {
    // The in-memory repos hold one game: this one.
    const { service } = setup(sessions[0], { votes });
    return (await service.getGroupTable('grp', 'org')).rows;
  };

  it('lifts the abilities an award is evidence of, and counts how many people said so', async () => {
    const rows = await table([passing('b'), passing('c'), passing('d'), passing('e')]);
    const ada = rows.find((r) => r.player.id === 'ada')!;
    expect(ada.attributes.PAS!).toBeGreaterThan(ada.ovr!);
    expect(ada.attributes.SHO).toBeNull();
    expect(ada.evidence.passing).toMatchObject({ nominations: 4, voters: 4, games: 1, enough: true });
  });

  it('needs three different people before it counts as evidence', async () => {
    const rows = await table([passing('b'), passing('c')]);
    expect(rows.find((r) => r.player.id === 'ada')!.evidence.passing).toMatchObject({ voters: 2, enough: false });
  });

  it('splits a Playmaker nomination across passing and smartness, not twice', async () => {
    const pm = ['b', 'c', 'd', 'e'].map((voterId) => ({ voterId, nomineeId: 'ada', category: VoteCategory.PLAYMAKER }));
    const ps = ['b', 'c', 'd', 'e'].map((voterId) => passing(voterId));
    const playmaker = (await table(pm)).find((r) => r.player.id === 'ada')!;
    const passer = (await table(ps)).find((r) => r.player.id === 'ada')!;
    expect(playmaker.attributes.PAS!).toBeLessThan(passer.attributes.PAS!);
    expect(playmaker.attributes.IQ!).toBeGreaterThan(passer.attributes.IQ ?? passer.ovr!);
  });

  it('counts old Fastest votes as The Engine', async () => {
    const pace = ['b', 'c', 'd'].map((voterId) => ({ voterId, nomineeId: 'ada', category: VoteCategory.PACE }));
    const ada = (await table(pace)).find((r) => r.player.id === 'ada')!;
    expect(ada.evidence.engine).toMatchObject({ nominations: 3, enough: true });
    expect(ada.attributes.PHY!).toBeGreaterThan(ada.ovr!);
  });
});

describe('compareStats', () => {
  const row = (id: string, goals: number, games: number, w = 0) =>
    ({ ...blankRatings(), player: { id }, goals, games, record: { w, d: 0, l: 0 } }) as any;
  it('gives the average, per game too, and a shared rank for ties', () => {
    const c = compareStats([row('a', 6, 3, 2), row('b', 2, 2), row('c', 6, 6)], 'c');
    expect(c.goals).toEqual({ avg: 4.7, avgPerGame: 1.33, rank: 1, of: 3 });
    expect(c.wins.rank).toBe(2);
  });
  it('ranks 0 for someone who has not played', () => {
    expect(compareStats([row('a', 1, 1)], 'z').goals.rank).toBe(0);
  });
});

describe('trialRatings (40 stats / 40 votes / 20 results)', () => {
  const row = (id: string, o: Partial<{ games: number; goals: number; assists: number; potm: number; vii: number; ballots: number; skill: number }>) =>
    ({
      ...blankRatings(),
      player: { id },
      games: o.games ?? 10,
      goals: o.goals ?? 0,
      assists: o.assists ?? 0,
      viiPicks: o.vii ?? 0,
      ballotsSeen: o.ballots ?? 60,
      skill: o.skill ?? 1500,
      votes: { ...blankRatings().votes, potm: o.potm ?? 0 },
    }) as any;

  it('puts the scorer who is voted for and wins at the top, on the 1–99 scale', () => {
    const t = trialRatings([
      row('star', { goals: 20, assists: 10, potm: 20, vii: 50, skill: 1700 }),
      row('mid', { goals: 5, assists: 5, potm: 3, vii: 20, skill: 1500 }),
      row('quiet', { skill: 1300 }),
    ]);
    expect(t.get('star')!.trial).toBeGreaterThan(t.get('mid')!.trial);
    expect(t.get('mid')!.trial).toBeGreaterThan(t.get('quiet')!.trial);
    for (const r of t.values()) {
      expect(r.trial).toBeGreaterThanOrEqual(1);
      expect(r.trial).toBeLessThanOrEqual(99);
    }
  });

  it('weighs stats and votes 40 each and results 20', () => {
    const t = trialRatings([row('a', { goals: 9 }), row('b', {})]).get('a')!;
    expect(t.trial).toBe(Math.round(0.4 * t.parts.stats + 0.4 * t.parts.votes + 0.2 * t.parts.results));
  });

  it('keeps someone with little evidence near the middle, and no votes is not a penalty', () => {
    const t = trialRatings([row('new', { games: 1, goals: 3, ballots: 0 }), row('b', {}), row('c', { goals: 2 })]);
    expect(t.get('new')!.parts.votes).toBe(50);
    expect(t.get('new')!.parts.stats).toBeLessThan(85);
  });
});

describe('balanceTeams (half results, half the 40/40/20 card)', () => {
  it('counts the card as well as results when picking the best first', async () => {
    const service = new RatingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const p = (id: string, skill: number, ovr: number | null) => ({ id, firstName: id, skill, ovr, captain: false, team: null });
    // Same results rating; the scorers' cards are higher. Sorted strongest first, then snake: A, B, B, A.
    jest.spyOn(service, 'getLineup').mockResolvedValue({
      teamCount: 2,
      squad: [p('quiet1', 1500, 60), p('star', 1500, 90), p('quiet2', 1500, 62), p('good', 1500, 80)],
    } as any);
    const set = jest.spyOn(service, 'setLineup').mockResolvedValue({} as any);
    await service.balanceTeams('s1', 'org1');
    const teams = (set.mock.calls[0][2] as any).teams;
    expect(teams.star).not.toBe(teams.good);
    expect(teams.quiet1).not.toBe(teams.quiet2);
  });
});

describe('cards and saves in the rating', () => {
  const row = (id: string, o: { goals?: number; yellow?: number; red?: number; saves?: number }) =>
    ({ ...blankRatings(), player: { id }, games: 10, ballotsSeen: 60, skill: 1500, goals: o.goals ?? 2, yellowCards: o.yellow ?? 0, redCards: o.red ?? 0, saves: o.saves ?? 0 }) as any;
  it('a card costs a little: the same scorer with a red card rates lower', () => {
    const t = trialRatings([row('clean', {}), row('sentOff', { red: 2 }), row('x', { goals: 5 }), row('y', { goals: 0 })]);
    expect(t.get('sentOff')!.parts.stats).toBeLessThan(t.get('clean')!.parts.stats);
  });
  it('saves count for a keeper', () => {
    const t = trialRatings([row('keeper', { goals: 0, saves: 40 }), row('outfield', { goals: 0 }), row('x', { goals: 3 })]);
    expect(t.get('keeper')!.parts.stats).toBeGreaterThan(t.get('outfield')!.parts.stats);
  });
});

describe('recording cards and saves', () => {
  function setup(today = true) {
    const session: any = { id: 's1', status: 'completed', date: today ? new Date().toISOString().slice(0, 10) : '2099-01-01', payments: [{ playerId: 'ada', attendance: 'came' }, { playerId: 'off', attendance: 'no_show' }] };
    const events = { saved: [] as any[], create: (e: unknown) => e, save: async function (e: any) { this.saved.push(e); return e; }, findOne: async () => ({ id: 'e1', recordedBy: 'Tunde (organiser)' }) };
    const service = new RatingsService({} as never, {} as never, {} as never, {} as never, {} as never, events as never);
    jest.spyOn(service as any, 'loadSession').mockResolvedValue(session);
    jest.spyOn(service, 'getLineup').mockResolvedValue({} as never);
    return { service, events };
  }
  it('records a yellow for a player in the game', async () => {
    const { service, events } = setup();
    await service.addEvent('s1', 'org', { playerId: 'ada', kind: 'yellow' }, 'Tunde (organiser)');
    expect(events.saved[0]).toMatchObject({ playerId: 'ada', kind: 'yellow', recordedBy: 'Tunde (organiser)' });
  });
  it("refuses someone who didn't play, and before match day", async () => {
    await expect(setup().service.addEvent('s1', 'org', { playerId: 'off', kind: 'save' })).rejects.toThrow("isn't in this game");
    await expect(setup(false).service.addEvent('s1', 'org', { playerId: 'ada', kind: 'red' })).rejects.toThrow('match day');
  });
});

describe('ratingBreakdown', () => {
  it('shows each part, what went into it and where they stand; null before they have played', async () => {
    const service = new RatingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const row = (id: string, goals: number, games = 5) =>
      ({ ...blankRatings(), player: { id }, games, goals, ballotsSeen: 30, skill: 1500 + goals * 10 }) as any;
    const everyone = [row('a', 9), row('b', 3), row('c', 0), row('new', 0, 0)];
    jest.spyOn(service as any, 'clubCard').mockResolvedValue({ everyone, trial: trialRatings(everyone), steady: null, classic: new Map() });
    const b = (await service.ratingBreakdown('a', 'org'))!;
    if (b.mode !== 'classic') throw new Error('expected classic');
    expect(b.rating).toBe(Math.round(0.4 * b.stats.score + 0.4 * b.votes.score + 0.2 * b.results.score));
    expect(b).toMatchObject({ of: 3, stats: { goals: 9, games: 5, place: 1 } });
    expect(await service.ratingBreakdown('new', 'org')).toBeNull();
  });

  it('a steady club shows the latest match days, newest first, with how far the card moved', async () => {
    const service = new RatingsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const everyone = [{ ...blankRatings(), player: { id: 'a' }, games: 3 }] as any;
    const rating = (r: number) => ({ rating: r, parts: { goals: 0, assists: 0, results: 0, keeping: 0, cleanSheets: 0, cards: 0, votes: 0 } });
    const history = [
      { date: '2026-10-01', rating: rating(6.2), games: 5, before: 50, after: 49.4 },
      { date: '2026-10-08', rating: rating(8.1), games: 5, before: 49.4, after: 53.4 },
    ];
    jest.spyOn(service as any, 'clubCard').mockResolvedValue({
      everyone,
      trial: trialRatings(everyone),
      classic: new Map([['a', 71]]),
      steady: { steady: new Map([['a', { ovr: 53.4, days: 2, last: 8.1, form: 7.15 }]]), history: new Map([['a', history]]) },
    });
    const b = (await service.ratingBreakdown('a', 'org'))!;
    if (b.mode !== 'steady') throw new Error('expected steady');
    expect(b).toMatchObject({ rating: 53, classic: 71, matchDays: 2, settling: true, maxMove: 4, votesCount: 0.6, voteMove: 1 });
    expect(b.recent.map((d) => [d.date, d.move])).toEqual([['2026-10-08', 4], ['2026-10-01', -1]]);
  });
});
