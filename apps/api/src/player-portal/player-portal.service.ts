import type { MatchEventKind } from '../ratings/entities/match-event.entity';
import { GroupKeptMoney } from '../billing/entities/group-kept-money.entity';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Player } from '../players/entities/player.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Session, SessionKind, SessionStatus, kickoffFor } from '../sessions/entities/session.entity';
import { PaymentType } from '../groups/entities/group.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { RsvpService } from '../rsvp/rsvp.service';
import { type TableRange, RatingsService, PlayerRatings } from '../ratings/ratings.service';
import { DEFAULT_START } from '../ratings/skill';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { localDate } from '../common/time.util';
import { owedSplit } from '../payments/credit';
import { pitchName, sheetName } from '../players/player-name';
import { Person, PlayerAuthService } from './player-auth.service';
import type { GoalInput } from '../ratings/ratings.service';
import { blankRatings } from '../ratings/ratings.service';

/** The player app: everything is scoped to a person (phone), across every club they play for. */
@Injectable()
export class PlayerPortalService {
  private readonly logger = new Logger(PlayerPortalService.name);

  constructor(
    @InjectRepository(GroupMembership) private membershipsRepo: Repository<GroupMembership>,
    @InjectRepository(Session) private sessionsRepo: Repository<Session>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(Player) private playersRepo: Repository<Player>,
    private rsvp: RsvpService,
    private ratings: RatingsService,
    private billing: BillingService,
    private auth: AuthService,
    private playerAuth: PlayerAuthService,
  ) {}

  private ids(person: Person) {
    return person.players.map((p) => p.id);
  }

  private async memberships(person: Person) {
    const ids = this.ids(person);
    if (!ids.length) return [];
    return this.membershipsRepo.find({ where: { playerId: In(ids) }, relations: ['group', 'group.organization'] });
  }

  private async organiser(person: Person) {
    const users = await this.playerAuth.findOrganisersByKey(person.key);
    return users.length ? { clubName: users[0].organization?.name ?? 'Your club', email: users[0].email } : null;
  }

  /** Ratings per club, and the one to show on the card (the club they've played most for). */
  private async ratingsByClub(person: Person) {
    const clubs = await Promise.all(
      person.players.map(async (p) => ({
        playerId: p.id,
        organizationId: p.organizationId,
        clubName: p.organization?.name ?? 'Club',
        ratings: await this.ratings.getPlayerRatings(p.id, p.organizationId),
      })),
    );
    const primary = [...clubs].sort((a, b) => b.ratings.games - a.ratings.games)[0];
    return { clubs, primary: primary?.ratings ?? (null as PlayerRatings | null), primaryId: primary?.playerId ?? null };
  }

  private async upcoming(person: Person, memberships: GroupMembership[]) {
    const groupIds = memberships.map((m) => m.groupId);
    if (!groupIds.length) return [];
    const games = await this.sessionsRepo.find({
      where: {
        groupId: In(groupIds),
        kind: SessionKind.GAME,
        status: SessionStatus.UPCOMING,
        date: MoreThanOrEqual(localDate(0)),
      },
      relations: ['group'],
      order: { date: 'ASC' },
      take: 10,
    });
    const ids = this.ids(person);
    const statuses = await this.rsvp.statusesForMany(ids, games.map((g) => g.id));
    // Every game's squad at once: the card shows the faces of who's playing.
    const squads = games.length ? await this.paymentsRepo.find({ where: { sessionId: In(games.map((g) => g.id)) }, relations: ['player'] }) : [];

    const result = [];
    for (const g of games) {
      const board = await this.rsvp.board(g);
      const squad = squads.filter((p) => p.sessionId === g.id);
      const payment = squad.find((p) => ids.includes(p.playerId));
      result.push(this.gameCard(g, ids, statuses.get(g.id) ?? null, board, payment, squad));
    }
    return result;
  }

  /** One upcoming game as the player's game card shows it. */
  private gameCard(
    g: Session,
    ids: string[],
    myStatus: string | null,
    board: Awaited<ReturnType<RsvpService['board']>>,
    payment: Payment | undefined,
    squad: Payment[],
  ) {
    const playing = this.playingOf(g, board, squad);
    return {
      id: g.id,
      date: g.date,
      groupId: g.groupId,
      groupName: g.group.name,
      schedule: g.group.schedule,
      kickoffTime: kickoffFor(g),
      requireRsvp: g.group.requireRsvp,
      myStatus,
      waitlistPosition: board.waitlist.findIndex((p) => ids.includes(p.id)) + 1 || null,
      confirmed: board.in.length,
      capacity: board.capacity,
      waitlist: board.waitlist.length,
      payment: payment ? { status: payment.status, amount: Number(payment.amount) } : null,
      // Match day: players pick the bib they're handed.
      bibsOpen: !!payment && g.date.slice(0, 10) <= localDate(0),
      myTeam: payment?.team ?? null,
      teamCount: g.teamCount,
      /** Who's playing, as faces on the card: them first, then up to 7 more. */
      playingCount: playing.length,
      faces: [...playing.filter((p) => ids.includes(p.id)), ...playing.filter((p) => !ids.includes(p.id))]
        .slice(0, 8)
        .map((p) => ({ id: p.id, name: sheetName(p), short: pitchName(p), photoKey: p.photoKey ?? null, me: ids.includes(p.id) })),
    };
  }

  /** Who's playing: with RSVPs, who said they're in; otherwise the squad, less anyone who said they can't make it. */
  private playingOf(g: Session, board: Awaited<ReturnType<RsvpService['board']>>, squad: Payment[]) {
    const out = new Set(board.out.map((p) => p.id));
    return g.group.requireRsvp ? board.in : squad.filter((p) => p.player && !out.has(p.playerId)).map((p) => p.player);
  }

  /**
   * A game's own page for a player: their game card plus where it is and who's playing.
   * With RSVPs on, "playing" is who said they're in; otherwise it's the game's squad.
   */
  async game(person: Person, sessionId: string) {
    const ids = this.ids(person);
    const g = await this.sessionsRepo.findOne({ where: { id: sessionId, kind: SessionKind.GAME }, relations: ['group'] });
    if (!g) throw new NotFoundException('Game not found');
    const member = ids.length
      ? await this.membershipsRepo.findOne({ where: { groupId: g.groupId, playerId: In(ids) } })
      : null;
    if (!member) throw new ForbiddenException("You're not in this group");

    const [board, statuses, squad] = await Promise.all([
      this.rsvp.board(g),
      this.rsvp.statusesForMany(ids, [g.id]),
      this.paymentsRepo.find({ where: { sessionId: g.id }, relations: ['player'] }),
    ]);
    const payment = squad.find((p) => ids.includes(p.playerId));
    const named = (p: { id: string; firstName: string; lastName: string; nickname?: string | null; photoKey?: string | null }) => ({
      name: sheetName(p),
      photoKey: p.photoKey ?? null,
      me: ids.includes(p.id),
    });
    // Without RSVPs everyone in the squad plays, except anyone who's said they can't make it.
    const playing = this.playingOf(g, board, squad);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

    return {
      ...this.gameCard(g, ids, statuses.get(g.id) ?? null, board, payment, squad),
      status: g.status,
      location: g.group.location ?? null,
      playing: playing.map(named).sort(byName),
      // Waitlist stays in the order people joined it: that's who gets the next spot.
      waitlistNames: board.waitlist.map(named),
    };
  }

  /**
   * What they owe in each group, split the way money is really used (owedSplit): `now` is what a
   * transfer pays today, `later` are games further ahead it can't pay yet. Cancelled games and ₦0
   * dues aren't owed.
   */
  private async owed(person: Person) {
    const ids = this.ids(person);
    if (!ids.length) return [];
    const rows = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .innerJoinAndSelect('session.group', 'group')
      .where('payment.playerId IN (:...ids)', { ids })
      .andWhere('payment.status = :pending', { pending: PaymentStatus.PENDING })
      .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
      .andWhere('payment.amount > 0')
      .orderBy('session.date', 'ASC')
      .getMany();
    const credits = await this.membershipsRepo
      .createQueryBuilder('m')
      .where('m.playerId IN (:...ids)', { ids })
      .andWhere('m.credit > 0')
      .getMany();
    const creditIn = new Map(credits.map((m) => [`${m.groupId}:${m.playerId}`, Number(m.credit)]));
    const byGroup = new Map<string, Payment[]>();
    for (const p of rows) {
      const key = `${p.session.groupId}:${p.playerId}`;
      byGroup.set(key, [...(byGroup.get(key) ?? []), p]);
    }
    const today = localDate();
    const items = [...byGroup.entries()].flatMap(([key, pending]) => {
      const { now, later } = owedSplit(pending, creditIn.get(key) ?? 0, today);
      return [...now.map((p) => ({ p, now: true })), ...later.map((p) => ({ p, now: false }))];
    });
    return items
      .sort((a, b) => String(a.p.session.date).localeCompare(String(b.p.session.date)))
      .map(({ p, now }) => ({
        id: p.id,
        amount: p.left,
        paidSoFar: p.paidSoFar,
        /** A transfer pays this today. False: a game further ahead, payable once it's their next one. */
        now,
        groupId: p.session.groupId,
        groupName: p.session.group.name,
        label: p.session.label ? `${p.session.label} dues` : null,
        date: p.session.date,
      }));
  }

  /**
   * Their groups, with the money worked out here rather than in the app: `toPay` is what to send
   * now, `later` what's owed for games further ahead, `paidAhead` what they've sent beyond any part
   * payment (it pays their next game), and `extra` money of theirs the organiser has to sort
   * (they sent more than was owed, or a game they paid for was called off or they were taken off).
   */
  private groupsOf(memberships: GroupMembership[], owed: Awaited<ReturnType<PlayerPortalService['owed']>>) {
    return memberships.map((m) => {
      const mine = owed.filter((o) => o.groupId === m.groupId);
      const sum = (list: typeof mine) => list.reduce((s, o) => s + o.amount, 0);
      const partPaid = mine.reduce((s, o) => s + o.paidSoFar, 0);
      return {
        id: m.groupId,
        name: m.group.name,
        clubName: m.group.organization?.name,
        schedule: m.group.schedule,
        kickoffTime: m.group.kickoffTime,
        feePerPlayer: Number(m.group.feePerPlayer),
        paymentType: m.group.paymentType,
        paymentRef: m.paymentRef,
        toPay: sum(mine.filter((o) => o.now)),
        later: sum(mine.filter((o) => !o.now)),
        paidAhead: Math.max(0, Number(m.credit ?? 0) - partPaid),
        extra: Number(m.extra ?? 0),
        account: m.group.accountNumber
          ? { accountNumber: m.group.accountNumber, accountName: m.group.accountName, bankName: m.group.bankName }
          : null,
      };
    });
  }

  /**
   * The group kitty, where the organiser allows it: the current period (or the
   * latest game) collected vs expected, plus who's paid when names are shown.
   */
  private async contributions(memberships: GroupMembership[]) {
    const result = [];
    for (const m of memberships) {
      const visibility = m.group.contributionsVisibility ?? 'private';
      if (visibility === 'private') continue;
      const kind = m.group.paymentType === PaymentType.PER_SESSION ? SessionKind.GAME : SessionKind.DUES;
      const base = { groupId: m.groupId, status: Not(SessionStatus.CANCELLED), kind };
      const session =
        (await this.sessionsRepo.findOne({ where: { ...base, date: LessThanOrEqual(localDate(0)) }, order: { date: 'DESC' } })) ??
        (await this.sessionsRepo.findOne({ where: base, order: { date: 'ASC' } }));

      const payments = session
        ? (await this.paymentsRepo.find({ where: { sessionId: session.id }, relations: ['player'] })).filter(
            (p) => p.status !== PaymentStatus.WAIVED,
          )
        : [];
      const paid = payments.filter((p) => p.status === PaymentStatus.PAID);
      const allTime = await this.paymentsRepo
        .createQueryBuilder('payment')
        .innerJoin('payment.session', 'session')
        .select('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('session.groupId = :groupId', { groupId: m.groupId })
        .andWhere('payment.status = :paid', { paid: PaymentStatus.PAID })
        .getRawOne<{ total: string }>();

      result.push({
        groupId: m.groupId,
        groupName: m.group.name,
        visibility,
        period: session
          ? { label: session.label ?? null, date: session.date, kind: session.kind }
          : null,
        collected: paid.reduce((sum, p) => sum + Number(p.amount), 0),
        expected: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        paidCount: paid.length,
        total: payments.length,
        allTime: Number(allTime?.total ?? 0),
        players:
          visibility === 'names'
            ? payments
                .map((p) => ({
                  name: sheetName(p.player),
                  photoKey: p.player.photoKey ?? null,
                  paid: p.status === PaymentStatus.PAID,
                  me: p.playerId === m.playerId,
                }))
                .sort((a, b) => Number(b.paid) - Number(a.paid) || a.name.localeCompare(b.name))
            : null,
      });
    }
    return result;
  }

  private personInfo(person: Person) {
    return {
      firstName: person.firstName,
      lastName: person.lastName,
      nickname: person.players.find((p) => p.nickname)?.nickname ?? null,
      photoKey: person.players.find((p) => p.photoKey)?.photoKey ?? null,
      keeper: person.players.find((p) => p.keeper)?.keeper ?? null,
      // Off only once they've switched it off (on every club's record of them).
      emailNotices: !person.players.some((p) => p.emailNotices === false),
      email: person.email,
      phone: person.phone,
      id: person.players[0]?.id ?? person.key,
    };
  }

  // ── Tabs ──

  async home(person: Person) {
    const memberships = await this.memberships(person);
    // Games and money are what Home is for; the card, votes and table only decorate it. If one of
    // those can't be worked out it's left out (and logged), so Home still opens.
    const decor = <T>(what: string, fallback: T) => (err: unknown) => {
      this.logger.error(`${what} for ${person.key}'s home failed: ${err instanceof Error ? err.stack : err}`);
      return fallback;
    };
    const [upcoming, owed, organiser, ratings] = await Promise.all([
      this.upcoming(person, memberships),
      this.owed(person),
      this.organiser(person),
      this.ratingsByClub(person).catch(decor('Ratings', { primary: null as PlayerRatings | null })),
    ]);
    const openVotes = (
      await Promise.all(person.players.map((p) => this.ratings.openVotesFor(p.id, p.organizationId).catch(decor('Open votes', []))))
    ).flat();

    const tables = [];
    for (const m of memberships) {
      const table = await this.ratings.getGroupTable(m.groupId, m.group.organizationId).catch(decor(`The ${m.group.name} table`, null));
      if (!table) continue;
      const rank = table.rows.findIndex((r) => r.player.id === m.playerId);
      tables.push({
        groupId: m.groupId,
        groupName: m.group.name,
        games: table.games,
        of: table.rows.length,
        myPlayerId: m.playerId,
        top: table.rows.slice(0, 5).map((r, i) => ({
          rank: i + 1,
          id: r.player.id,
          name: `${r.player.firstName} ${r.player.lastName}`,
          points: r.points,
          ovr: r.ovr ?? null,
        })),
        me: rank >= 0 ? { rank: rank + 1, points: table.rows[rank].points, ovr: table.rows[rank].ovr ?? null } : null,
      });
    }

    return {
      player: this.personInfo(person),
      organiser,
      groups: this.groupsOf(memberships, owed),
      upcoming: upcoming.slice(0, 3),
      owed,
      openVotes,
      ratings: ratings.primary ?? emptyRatings(),
      tables,
    };
  }

  async games(person: Person) {
    const memberships = await this.memberships(person);
    const upcoming = await this.upcoming(person, memberships);
    const recent = (
      await Promise.all(person.players.map((p) => this.ratings.recentForPlayer(p.id, p.organizationId, 10)))
    )
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
    return { upcoming, recent };
  }

  async payments(person: Person) {
    const memberships = await this.memberships(person);
    const ids = this.ids(person);
    const [owed, paid] = await Promise.all([
      this.owed(person),
      ids.length
        ? this.paymentsRepo
            .createQueryBuilder('payment')
            .innerJoinAndSelect('payment.session', 'session')
            .innerJoinAndSelect('session.group', 'group')
            .where('payment.playerId IN (:...ids)', { ids })
            .andWhere('payment.status = :paid', { paid: PaymentStatus.PAID })
            .orderBy('payment.paidAt', 'DESC', 'NULLS LAST')
            .take(30)
            .getMany()
        : Promise.resolve([] as Payment[]),
    ]);
    return {
      owed,
      paid: paid.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        groupId: p.session.groupId,
        groupName: p.session.group.name,
        label: p.session.label ? `${p.session.label} dues` : null,
        date: p.session.date,
        paidAt: p.paidAt,
        viaTransfer: p.source === 'transfer',
      })),
      groups: this.groupsOf(memberships, owed),
      contributions: await this.contributions(memberships),
      keptByGroup: await this.keptByGroup(ids),
    };
  }

  /** Money of theirs a group kept (nobody owes anybody for it now), newest first, with why. */
  private async keptByGroup(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.paymentsRepo.manager.find(GroupKeptMoney, {
      where: { playerId: In(ids) },
      relations: ['group'],
      order: { createdAt: 'DESC' },
      take: 30,
    });
    return rows.map((k) => ({
      id: k.id,
      groupId: k.groupId,
      groupName: k.group?.name ?? '',
      amount: Number(k.amount),
      reason: k.reason,
      note: k.note,
      date: k.createdAt,
    }));
  }

  async profile(person: Person) {
    const memberships = await this.memberships(person);
    const [organiser, ratings] = await Promise.all([
      this.organiser(person),
      // Ratings only decorate the profile: if they can't be worked out, the player app still opens.
      this.ratingsByClub(person).catch((err) => {
        this.logger.error(`Ratings for ${person.key}'s profile failed: ${err instanceof Error ? err.stack : err}`);
        return { primary: null, primaryId: null, clubs: [] as Awaited<ReturnType<PlayerPortalService['ratingsByClub']>>['clubs'] };
      }),
    ]);
    return {
      player: this.personInfo(person),
      organiser,
      ratings: ratings.primary ?? emptyRatings(),
      /** Which of their player records the card's number is for (the club they've played most for). */
      ratingsPlayerId: ratings.primaryId,
      clubs: ratings.clubs.map((c) => ({
        playerId: c.playerId,
        clubName: c.clubName,
        ratings: c.ratings,
        groups: memberships.filter((m) => m.playerId === c.playerId).map((m) => ({ id: m.groupId, name: m.group.name })),
      })),
    };
  }

  // ── Actions ──

  private async playerForSession(person: Person, sessionId: string) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId }, relations: ['group'] });
    const player = session && person.players.find((p) => p.organizationId === session.group.organizationId);
    if (!player) throw new ForbiddenException("You're not in this group");
    return player;
  }

  async claimPayment(person: Person, groupId: string, amount: number) {
    const membership = await this.membershipsRepo.findOne({ where: { groupId, playerId: In(this.ids(person)) } });
    if (!membership) throw new ForbiddenException("You're not in this group");
    return this.billing.claimPayment(groupId, membership.playerId, amount);
  }

  async setRsvp(person: Person, sessionId: string, status: 'in' | 'out') {
    const player = await this.playerForSession(person, sessionId);
    return this.rsvp.setByPlayer(sessionId, player.id, status);
  }

  gameLineup(person: Person, sessionId: string) {
    return this.ratings.playerLineup(sessionId, this.ids(person));
  }

  // Match day for the day's captains: they keep the score (see RatingsService.captainToday).
  matchDay(person: Person, sessionId: string) {
    return this.ratings.captainLineup(sessionId, this.ids(person));
  }

  timer(person: Person, sessionId: string) {
    return this.ratings.playerTimer(sessionId, this.ids(person));
  }

  addMatchGame(person: Person, sessionId: string, input: { teamA: string; teamB: string; scoreA: number; scoreB: number; goals?: GoalInput[]; clientKey?: string; keeperA?: string | null; keeperB?: string | null }) {
    return this.ratings.captainAddGame(sessionId, this.ids(person), input);
  }

  addGoal(person: Person, sessionId: string, gameId: string, input: GoalInput & { clientKey?: string }) {
    return this.ratings.captainAddGoal(sessionId, gameId, this.ids(person), input);
  }

  deleteMatchGame(person: Person, sessionId: string, gameId: string) {
    return this.ratings.captainDeleteGame(sessionId, gameId, this.ids(person));
  }

  deleteGoal(person: Person, sessionId: string, goalId: string) {
    return this.ratings.captainDeleteGoal(sessionId, goalId, this.ids(person));
  }

  /** A group this person plays in, or a 404 (never another group's table or stats). */
  private async myGroup(person: Person, groupId: string) {
    const m = (await this.memberships(person)).find((x) => x.groupId === groupId);
    if (!m) throw new NotFoundException('Group not found');
    return m.group;
  }

  /** The Club tab's table: the same table the organiser sees, for a group they play in. */
  async groupTable(person: Person, groupId: string, range?: TableRange) {
    const group = await this.myGroup(person, groupId);
    return this.ratings.getGroupTable(groupId, group.organizationId, range);
  }

  /** The Club tab's rating parts per player (stats, votes, results), for a group they play in. */
  async groupRatings(person: Person, groupId: string) {
    const group = await this.myGroup(person, groupId);
    return this.ratings.getRatingTrial(groupId, group.organizationId);
  }

  /** Any player's, as long as they're in a club this person plays for. */
  async ratingBreakdown(person: Person, playerId: string) {
    const target = await this.playersRepo.findOne({ where: { id: playerId }, select: ['id', 'organizationId'] });
    if (!target || !person.players.some((p) => p.organizationId === target.organizationId)) throw new NotFoundException('Player not found');
    return this.ratings.ratingBreakdown(playerId, target.organizationId);
  }

  addEvent(person: Person, sessionId: string, input: { playerId: string; kind: MatchEventKind; clientKey?: string }) {
    return this.ratings.captainAddEvent(sessionId, this.ids(person), input);
  }

  deleteEvent(person: Person, sessionId: string, eventId: string) {
    return this.ratings.captainDeleteEvent(sessionId, eventId, this.ids(person));
  }

  setAway(person: Person, sessionId: string, playerId: string, at: number | null) {
    return this.ratings.captainSetAway(sessionId, this.ids(person), playerId, at);
  }

  pickTeam(person: Person, sessionId: string, team: string | null) {
    return this.ratings.pickTeam(sessionId, this.ids(person), team);
  }

  myBallot(person: Person, token: string) {
    return this.ratings.myBallot(token, this.ids(person));
  }

  vote(person: Person, token: string, picks: Record<string, string>) {
    return this.ratings.submitVotes(token, this.ids(person), picks);
  }

  joinGroup(person: Person, code: string, gameId?: string) {
    return this.billing.joinGroupAsPerson(code, person, gameId);
  }

  /**
   * "Start your group": the player becomes an organiser of a brand-new club.
   * The organiser account uses the same email they play under — that's what
   * links the two sides — with its own password because it handles money.
   */
  async startGroup(person: Person, input: { clubName: string; password: string }) {
    if (await this.organiser(person)) {
      throw new BadRequestException('You already organise — switch to Organising to add another group.');
    }
    const result = await this.auth.register({
      organizationName: input.clubName.trim(),
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      password: input.password,
      phone: person.phone ?? undefined,
    });
    // They'll usually play in their own games too.
    await this.playersRepo.save(
      this.playersRepo.create({
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        email: person.key,
        organizationId: result.user.organizationId,
      }),
    );
    return result;
  }
}

function emptyRatings(): PlayerRatings {
  return blankRatings();
}
