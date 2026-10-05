import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Player } from '../players/entities/player.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Session, SessionKind, SessionStatus, kickoffFor } from '../sessions/entities/session.entity';
import { PaymentType } from '../groups/entities/group.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { RsvpService } from '../rsvp/rsvp.service';
import { RatingsService, PlayerRatings } from '../ratings/ratings.service';
import { DEFAULT_START } from '../ratings/skill';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { localDate } from '../common/time.util';
import { Person, PlayerAuthService } from './player-auth.service';

/** The player app: everything is scoped to a person (phone), across every club they play for. */
@Injectable()
export class PlayerPortalService {
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
    return { clubs, primary: primary?.ratings ?? (null as PlayerRatings | null) };
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
    const myPayments = games.length
      ? await this.paymentsRepo.find({ where: { playerId: In(ids), sessionId: In(games.map((g) => g.id)) } })
      : [];

    const result = [];
    for (const g of games) {
      const board = await this.rsvp.board(g);
      const payment = myPayments.find((p) => p.sessionId === g.id);
      result.push({
        id: g.id,
        date: g.date,
        groupId: g.groupId,
        groupName: g.group.name,
        schedule: g.group.schedule,
        kickoffTime: kickoffFor(g),
        requireRsvp: g.group.requireRsvp,
        myStatus: statuses.get(g.id) ?? null,
        waitlistPosition: board.waitlist.findIndex((p) => ids.includes(p.id)) + 1 || null,
        confirmed: board.in.length,
        capacity: board.capacity,
        waitlist: board.waitlist.length,
        payment: payment ? { status: payment.status, amount: Number(payment.amount) } : null,
        // Match day: players pick the bib they're handed.
        bibsOpen: !!payment && g.date.slice(0, 10) <= localDate(0),
        myTeam: payment?.team ?? null,
        teamCount: g.teamCount,
      });
    }
    return result;
  }

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
      .orderBy('session.date', 'ASC')
      .getMany();
    // Money already paid toward a due (partial transfers) comes off their oldest due in that group.
    const credits = await this.membershipsRepo
      .createQueryBuilder('m')
      .where('m.playerId IN (:...ids)', { ids })
      .andWhere('m.credit > 0')
      .getMany();
    const creditIn = new Map(credits.map((m) => [m.groupId, Number(m.credit)]));
    return rows.map((p) => {
      const paidSoFar = Math.min(creditIn.get(p.session.groupId) ?? 0, Number(p.amount));
      creditIn.delete(p.session.groupId);
      return {
        id: p.id,
        amount: Number(p.amount) - paidSoFar,
        paidSoFar,
        groupId: p.session.groupId,
        groupName: p.session.group.name,
        label: p.session.label ? `${p.session.label} dues` : null,
        date: p.session.date,
      };
    });
  }

  private groupsOf(memberships: GroupMembership[]) {
    return memberships.map((m) => ({
      id: m.groupId,
      name: m.group.name,
      clubName: m.group.organization?.name,
      schedule: m.group.schedule,
      kickoffTime: m.group.kickoffTime,
      feePerPlayer: Number(m.group.feePerPlayer),
      paymentType: m.group.paymentType,
      paymentRef: m.paymentRef,
      account: m.group.accountNumber
        ? { accountNumber: m.group.accountNumber, accountName: m.group.accountName, bankName: m.group.bankName }
        : null,
    }));
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
                  name: `${p.player.firstName} ${p.player.lastName}`,
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
      email: person.email,
      phone: person.phone,
      id: person.players[0]?.id ?? person.key,
    };
  }

  // ── Tabs ──

  async home(person: Person) {
    const memberships = await this.memberships(person);
    const [upcoming, owed, organiser, ratings] = await Promise.all([
      this.upcoming(person, memberships),
      this.owed(person),
      this.organiser(person),
      this.ratingsByClub(person),
    ]);
    const openVotes = (
      await Promise.all(person.players.map((p) => this.ratings.openVotesFor(p.id, p.organizationId)))
    ).flat();

    const tables = [];
    for (const m of memberships) {
      const table = await this.ratings.getGroupTable(m.groupId, m.group.organizationId);
      const rank = table.rows.findIndex((r) => r.player.id === m.playerId);
      tables.push({
        groupId: m.groupId,
        groupName: m.group.name,
        games: table.games,
        myPlayerId: m.playerId,
        top: table.rows.slice(0, 5).map((r, i) => ({
          rank: i + 1,
          id: r.player.id,
          name: `${r.player.firstName} ${r.player.lastName}`,
          points: r.points,
        })),
        me: rank >= 0 ? { rank: rank + 1, points: table.rows[rank].points } : null,
      });
    }

    return {
      player: this.personInfo(person),
      organiser,
      groups: this.groupsOf(memberships),
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
        groupName: p.session.group.name,
        label: p.session.label ? `${p.session.label} dues` : null,
        date: p.session.date,
        paidAt: p.paidAt,
        viaTransfer: p.source === 'transfer',
      })),
      groups: this.groupsOf(memberships),
      contributions: await this.contributions(memberships),
    };
  }

  async profile(person: Person) {
    const memberships = await this.memberships(person);
    const [organiser, ratings] = await Promise.all([this.organiser(person), this.ratingsByClub(person)]);
    return {
      player: this.personInfo(person),
      organiser,
      ratings: ratings.primary ?? emptyRatings(),
      clubs: ratings.clubs.map((c) => ({
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

  async setRsvp(person: Person, sessionId: string, status: 'in' | 'out') {
    const player = await this.playerForSession(person, sessionId);
    return this.rsvp.setByPlayer(sessionId, player.id, status);
  }

  gameLineup(person: Person, sessionId: string) {
    return this.ratings.playerLineup(sessionId, this.ids(person));
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

  joinGroup(person: Person, code: string) {
    return this.billing.joinGroupAsPerson(code, person);
  }

  /**
   * "Start your group": the player becomes an organiser of a brand-new club.
   * The organiser account uses the same email they play under — that's what
   * links the two sides — with its own password because it handles money.
   */
  async startGroup(person: Person, input: { clubName: string; password: string }) {
    if (await this.organiser(person)) {
      throw new BadRequestException('You already run a club — switch to Organising to add more groups.');
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
  return {
    games: 0,
    ballotsSeen: 0,
    votes: { potm: 0, pace: 0, shooting: 0, passing: 0, defending: 0, keeper: 0 },
    potmWins: 0,
    record: { w: 0, d: 0, l: 0 },
    teamOfDay: 0,
    points: 0,
    skill: DEFAULT_START,
    provisional: true,
    ovr: null,
    attributes: { PAC: null, SHO: null, PAS: null, DEF: null, GK: null },
  };
}
