import { RemindersService } from './reminders.service';
import { SessionKind, SessionStatus } from '../sessions/entities/session.entity';
import { PaymentStatus } from '../payments/entities/payment.entity';

// Lagos is UTC+1 all year. Friday 30 Oct, the game is Saturday 31 Oct at 8am.
const at = (iso: string) => new Date(`${iso}+01:00`);

function game(over: Record<string, any> = {}) {
  return {
    id: 'sat',
    kind: SessionKind.GAME,
    status: SessionStatus.UPCOMING,
    date: '2026-10-31',
    kickoffTime: '08:00',
    groupId: 'grp',
    group: { id: 'grp', name: 'Saturday Ballers', organizationId: 'org', requireRsvp: true, kickoffTime: null, location: 'Campos' },
    payments: [
      { id: 'p1', playerId: 'ada', status: PaymentStatus.PENDING, amount: '1500', attendance: null },
      { id: 'p2', playerId: 'bisi', status: PaymentStatus.PAID, amount: '1500', attendance: null },
    ],
    ...over,
  };
}

function setup(games: any[], opts: { inCount?: number; capacity?: number; voted?: readonly string[]; voteOpen?: boolean; closesAt?: Date } = {}) {
  const svc: any = Object.create(RemindersService.prototype);
  const claimed = new Set<string>();
  svc.claim = async (k: string) => (claimed.has(k) ? false : (claimed.add(k), true));
  svc.games = async (date: string) => games.filter((g) => g.date === date);
  svc.refs = async () => new Map([['ada', 'PAK123']]);
  const players = jest.fn().mockResolvedValue({ delivered: 1, missed: 0 });
  const organisers = jest.fn().mockResolvedValue(undefined);
  svc.notifications = { notifyPlayers: players, notifyOrganisers: organisers };
  const inn = Array.from({ length: opts.inCount ?? 2 }, (_, i) => ({ id: ['ada', 'bisi', 'c', 'd'][i] ?? `x${i}` }));
  svc.rsvp = { board: async () => ({ in: inn, capacity: opts.capacity ?? 10, noReply: [] }) };
  svc.ratings = {
    isVoteOpen: () => opts.voteOpen ?? false,
    voteClosesAt: () => opts.closesAt ?? null,
    ensureVotingToken: async () => 'tok',
  };
  svc.votesRepo = { find: async () => (opts.voted ?? []).map((voterId) => ({ voterId })) };
  svc.paymentsRepo = { manager: {} };
  svc.logger = { error: jest.fn(), warn: jest.fn() };
  const kinds = () => [...players.mock.calls.map((c) => c[1].kind), ...organisers.mock.calls.map((c) => c[1].kind)];
  return { svc, players, organisers, kinds, claimed };
}

const run = (svc: any, fn: string, now: Date) => svc[fn](now);

describe('Reminders: the organiser sends the link to the group (Fri 5pm, Sat 6:30am)', () => {
  it('nothing on Friday before 5pm (no early-morning one any more)', async () => {
    const { svc, organisers } = setup([game()]);
    for (const t of ['2026-10-30T06:00:00', '2026-10-30T12:00:00', '2026-10-30T16:59:00']) await run(svc, 'shareInGroup', at(t));
    expect(organisers).not.toHaveBeenCalled();
  });

  it('Friday 5pm: one notice to send the link, with how full it is, opening the ready message', async () => {
    const { svc, organisers } = setup([game()]);
    await run(svc, 'shareInGroup', at('2026-10-30T17:00:00'));
    await run(svc, 'shareInGroup', at('2026-10-30T17:10:00'));
    await run(svc, 'shareInGroup', at('2026-10-30T23:50:00'));
    expect(organisers).toHaveBeenCalledTimes(1);
    const [org, notice, opts] = organisers.mock.calls[0];
    expect(org).toBe('org');
    expect(notice.title).toBe('Send Saturday’s link to the group');
    expect(notice.body).toContain('2 of 10 in, 8 places left');
    expect(notice.url).toBe('/sessions/sat?send=invite');
    expect(opts).toEqual({ email: true });
  });

  it('Saturday 6:30am: the last call, once, before kick-off', async () => {
    const { svc, organisers } = setup([game()]);
    await run(svc, 'shareInGroup', at('2026-10-30T17:00:00'));
    await run(svc, 'shareInGroup', at('2026-10-31T06:29:00'));
    expect(organisers).toHaveBeenCalledTimes(1);
    await run(svc, 'shareInGroup', at('2026-10-31T06:30:00'));
    await run(svc, 'shareInGroup', at('2026-10-31T06:40:00'));
    expect(organisers).toHaveBeenCalledTimes(2);
    expect(organisers.mock.calls[1][1].title).toBe('Last call: send today’s link to the group');
    expect(organisers.mock.calls[1][1].url).toBe('/sessions/sat?send=lastcall');
  });

  it('a game set up on Saturday morning only gets the last call; one set up Friday night gets both', async () => {
    let s = setup([game()]);
    await run(s.svc, 'shareInGroup', at('2026-10-31T07:00:00'));
    expect(s.organisers).toHaveBeenCalledTimes(1);
    expect(s.organisers.mock.calls[0][1].url).toContain('lastcall');
    s = setup([game()]);
    await run(s.svc, 'shareInGroup', at('2026-10-30T21:00:00'));
    await run(s.svc, 'shareInGroup', at('2026-10-31T06:35:00'));
    expect(s.organisers.mock.calls.map((c) => c[1].url)).toEqual(['/sessions/sat?send=invite', '/sessions/sat?send=lastcall']);
  });

  it('no last call once the game has kicked off, or for a 6am kick-off', async () => {
    let s = setup([game()]);
    await run(s.svc, 'shareInGroup', at('2026-10-31T08:00:00'));
    expect(s.organisers).not.toHaveBeenCalled();
    s = setup([game({ kickoffTime: '06:00' })]);
    await run(s.svc, 'shareInGroup', at('2026-10-31T06:30:00'));
    expect(s.organisers).not.toHaveBeenCalled();
  });

  it('a full game, a called-off one, or one not tomorrow: nothing', async () => {
    for (const [g, o] of [
      [game(), { inCount: 4, capacity: 4 }],
      [game({ status: SessionStatus.CANCELLED }), {}],
      [game({ date: '2026-11-01' }), {}],
    ] as const) {
      const { svc, organisers } = setup([g], o);
      await run(svc, 'shareInGroup', at('2026-10-30T17:05:00'));
      expect(organisers).not.toHaveBeenCalled();
    }
  });

  it('one place left reads "1 place left"; no limit reads how many are in', async () => {
    let s = setup([game()], { inCount: 3, capacity: 4 });
    await run(s.svc, 'shareInGroup', at('2026-10-30T17:05:00'));
    expect(s.organisers.mock.calls[0][1].body).toContain('3 of 4 in, 1 place left.');
    s = setup([game({ group: { ...game().group, requireRsvp: false } })], { inCount: 3, capacity: 0 });
    await run(s.svc, 'shareInGroup', at('2026-10-30T17:05:00'));
    expect(s.organisers.mock.calls[0][1].body).toContain('3 in so far.');
  });
});

describe('Reminders: 6:30am on match day', () => {
  it('each player in the squad, with what they owe', async () => {
    const { svc, players } = setup([game()]);
    await run(svc, 'matchMorning', at('2026-10-31T06:30:00'));
    await run(svc, 'matchMorning', at('2026-10-31T06:40:00'));
    expect(players).toHaveBeenCalledTimes(2);
    const ada = players.mock.calls.find((c) => c[0][0] === 'ada')![1];
    expect(ada.title).toBe('Match day: Saturday Ballers ⚽');
    expect(ada.body).toBe('Kick-off 8am at Campos. 2 playing. ₦1,500 to pay, ref PAK123.');
    const bisi = players.mock.calls.find((c) => c[0][0] === 'bisi')![1];
    expect(bisi.body).not.toContain('to pay');
  });

  it('not before 6am, not once the game is on, not for a called-off game', async () => {
    for (const [g, now] of [
      [game(), '2026-10-31T06:29:00'],
      [game(), '2026-10-31T08:00:00'],
      [game({ status: SessionStatus.CANCELLED }), '2026-10-31T06:30:00'],
      [game({ kickoffTime: null }), '2026-10-31T12:30:00'],
    ] as const) {
      const { svc, players } = setup([g]);
      await run(svc, 'matchMorning', at(now));
      expect(players).not.toHaveBeenCalled();
    }
  });

  it('an early kick-off skips the 2-hours-before reminder (6:30am was enough); an evening one keeps it', async () => {
    let s = setup([game()]);
    await run(s.svc, 'kickOff', at('2026-10-31T06:30:00'));
    expect(s.players).not.toHaveBeenCalled();
    s = setup([game({ kickoffTime: '19:00' })]);
    await run(s.svc, 'kickOff', at('2026-10-31T17:30:00'));
    expect(s.players).toHaveBeenCalled();
    expect(s.players.mock.calls[0][1].kind).toBe('reminder_kickoff');
  });
});

describe('Reminders: the vote is about to close', () => {
  const ended = () => game({ status: SessionStatus.COMPLETED, payments: [...game().payments, { id: 'p3', playerId: 'cee', status: PaymentStatus.PAID, amount: '1500', attendance: 'no_show' }] });
  const closes = at('2026-11-01T22:00:00');

  it('3 hours before: the players who came and haven’t voted, and the organiser to send the last call', async () => {
    const { svc, players, organisers } = setup([ended()], { voteOpen: true, closesAt: closes, voted: ['bisi'] });
    await run(svc, 'voteClosing', at('2026-11-01T19:05:00'));
    await run(svc, 'voteClosing', at('2026-11-01T19:20:00'));
    expect(players).toHaveBeenCalledTimes(1);
    expect(players.mock.calls[0][0]).toEqual(['ada']);
    expect(players.mock.calls[0][1].title).toBe('Voting closes at 10pm ⏳');
    expect(players.mock.calls[0][1].body).toContain('1/2 have voted');
    expect(players.mock.calls[0][1].url).toBe('/v/tok');
    expect(organisers.mock.calls[0][1]).toEqual(expect.objectContaining({ kind: 'share_vote', url: '/sessions/sat?send=voteclosing' }));
    expect(organisers.mock.calls[0][1].body).toContain('1 still to vote');
  });

  it('not earlier, not after it closes, not when everyone has voted, not when the vote is shut', async () => {
    for (const [now, o] of [
      ['2026-11-01T18:55:00', {}],
      ['2026-11-01T22:00:00', {}],
      ['2026-11-01T20:00:00', { voted: ['ada', 'bisi'] }],
      ['2026-11-01T20:00:00', { voteOpen: false }],
    ] as const) {
      const { svc, players, organisers } = setup([ended()], { voteOpen: true, closesAt: closes, ...o });
      await run(svc, 'voteClosing', at(now));
      expect(players).not.toHaveBeenCalled();
      expect(organisers).not.toHaveBeenCalled();
    }
  });

  it('a close time on the half hour reads "9:30pm"', async () => {
    const { svc, players } = setup([ended()], { voteOpen: true, closesAt: at('2026-11-01T21:30:00') });
    await run(svc, 'voteClosing', at('2026-11-01T19:00:00'));
    expect(players.mock.calls[0][1].title).toBe('Voting closes at 9:30pm ⏳');
  });
});

describe('Reminders: Friday to Saturday, as the server runs them (every 10 minutes)', () => {
  it('an 8am Saturday game gets exactly: Fri 5pm group link, Fri 6pm squad, Sat 6:30am last call + squad', async () => {
    const { svc, players, organisers } = setup([game()]);
    svc.morningAfter = async () => undefined;
    svc.duesChasers = async () => undefined;
    const log: string[] = [];
    const seen = { p: 0, o: 0 };
    for (let t = at('2026-10-30T00:00:00').getTime(); t <= at('2026-10-31T12:00:00').getTime(); t += 10 * 60_000) {
      await svc.tick(new Date(t));
      const stamp = new Date(t + 3_600_000).toISOString().slice(5, 16).replace('T', ' ');
      for (const c of organisers.mock.calls.slice(seen.o)) log.push(`${stamp} organiser ${c[1].kind} ${c[1].url}`);
      const kinds = [...new Set(players.mock.calls.slice(seen.p).map((c) => c[1].kind))];
      for (const k of kinds) log.push(`${stamp} squad ${k}`);
      seen.o = organisers.mock.calls.length;
      seen.p = players.mock.calls.length;
    }
    expect(log).toEqual([
      '10-30 17:00 organiser share_invite /sessions/sat?send=invite',
      '10-30 18:00 squad reminder_eve',
      '10-31 06:30 organiser share_invite /sessions/sat?send=lastcall',
      '10-31 06:30 squad reminder_matchday',
    ]);
  });
});
