import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, MoreThan, Repository } from 'typeorm';
import { ReminderLog } from '../reminders/entities/reminder-log.entity';
import { markPartPaid } from '../payments/part-paid';
import { Session, SessionKind, SessionStatus, kickoffFor } from './entities/session.entity';
import { RsvpService } from '../rsvp/rsvp.service';
import { RatingsService } from '../ratings/ratings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { naira, shortDate } from '../common/format.util';
import { localDate, prettyTime } from '../common/time.util';
import { Group } from '../groups/entities/group.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { BankTransfer, TransferStatus } from '../billing/entities/bank-transfer.entity';
import { MailService } from '../mail/mail.service';
import { CreateSessionDto, RecurrenceType } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionGame } from '../ratings/entities/session-game.entity';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { BillingService } from '../billing/billing.service';
import { PaymentsService } from '../payments/payments.service';
import { gameTarget, paidForGames, squadEntry } from '../payments/game-dues';

export type GameList = 'ahead' | 'collect' | 'past';

/** Still to be played: not ended or cancelled, and today or later. */
const AHEAD = `(session.status = 'upcoming' AND session.date >= CURRENT_DATE)`;
/** The Games screens' lists, as conditions on `session`. */
const GAME_LISTS: Record<GameList, string> = {
  ahead: AHEAD,
  past: `NOT ${AHEAD}`,
  // Played (or past its day) and someone who came hasn't paid.
  collect: `NOT ${AHEAD} AND session.status <> 'cancelled' AND EXISTS (SELECT 1 FROM payments p WHERE p.session_id = session.id AND p.status = 'pending' AND (p.attendance IS NULL OR p.attendance <> 'no_show'))`,
};

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private sessionsRepo: Repository<Session>,
    @InjectRepository(Group) private groupsRepo: Repository<Group>,
    @InjectRepository(GroupMembership) private membershipsRepo: Repository<GroupMembership>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(ReminderLog) private logRepo: Repository<ReminderLog>,
    private mailService: MailService,
    private rsvp: RsvpService,
    private ratings: RatingsService,
    private notifications: NotificationsService,
    private billing: BillingService,
    private payments: PaymentsService,
  ) {}

  async create(dto: CreateSessionDto, organizationId: string) {
    const group = await this.groupsRepo.findOne({
      where: { id: dto.groupId, organizationId },
    });
    if (!group) throw new NotFoundException('Group not found');

    const memberships = await this.membershipsRepo.find({
      where: { groupId: dto.groupId },
    });

    const dates = this.generateDates(
      dto.date,
      dto.recurrenceType || RecurrenceType.NONE,
      dto.recurrenceCount || 1,
    );

    let firstSession: Session | null = null;

    for (const date of dates) {
      const session = this.sessionsRepo.create({
        groupId: dto.groupId,
        date,
        kickoffTime: dto.kickoffTime || null,
        targetAmount: gameTarget(group),
      });
      const saved = await this.sessionsRepo.save(session);
      firstSession ??= saved;

      // RSVP groups bill players as they confirm, not up front.
      if (memberships.length > 0 && !group.requireRsvp) {
        // Monthly-type groups: everyone's in the squad, but their dues cover the game.
        const payments = memberships.map((m) => this.paymentsRepo.create(squadEntry(group, saved.id, m.playerId)));
        await this.paymentsRepo.save(payments);
        await this.billing.applyCredits(dto.groupId, memberships.map((m) => m.playerId));
      }
    }

    if (group.requireRsvp) {
      const first = await this.sessionsRepo.findOne({ where: { groupId: dto.groupId, date: dates[0] } });
      if (first) this.notifications.later(() => this.rsvp.announceGame(first.id));
    } else if (memberships.length && firstSession) {
      // Everyone's billed straight away, so tell them when it is and what it costs.
      const first = firstSession;
      const ko = kickoffFor({ kickoffTime: first.kickoffTime, group });
      const more = dates.length > 1 ? ` (and ${dates.length - 1} more)` : '';
      this.notifications.later(() =>
        this.notifications.notifyPlayers(
          memberships.map((m) => m.playerId),
          {
            kind: 'game_scheduled',
            title: `New game: ${group.name} ⚽`,
            body: `${shortDate(first.date)}${ko ? `, kick-off ${prettyTime(ko)}` : ''}${more}. ${naira(group.feePerPlayer)} — tap for where to pay.`,
            url: '/me',
          },
        ),
      );
    }

    // Open the first game of a series: it's the one players hear about and pay for first.
    return this.findOne(firstSession!.id, organizationId);
  }

  private generateDates(startDate: string, recurrenceType: RecurrenceType, count: number): string[] {
    if (recurrenceType === RecurrenceType.NONE || count <= 1) {
      return [startDate];
    }

    const dates: string[] = [];
    const start = new Date(startDate);

    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      switch (recurrenceType) {
        case RecurrenceType.WEEKLY:
          d.setDate(d.getDate() + i * 7);
          break;
        case RecurrenceType.BIWEEKLY:
          d.setDate(d.getDate() + i * 14);
          break;
        case RecurrenceType.MONTHLY:
          d.setMonth(d.getMonth() + i);
          break;
      }
      dates.push(d.toISOString().split('T')[0]);
    }

    return dates;
  }

  async findAll(organizationId: string, groupId?: string) {
    const qb = this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoinAndSelect('session.group', 'group')
      .leftJoinAndSelect('session.payments', 'payment')
      .leftJoinAndSelect('payment.player', 'player')
      .where('group.organizationId = :organizationId', { organizationId })
      .orderBy('session.date', 'DESC');

    if (groupId) {
      qb.andWhere('session.groupId = :groupId', { groupId });
    }

    return this.markGamePaid(await qb.getMany());
  }

  /**
   * A page of games, newest first, optionally one group's and one of the lists the Games screens
   * show: coming up (soonest first), to collect (played, someone who came still owes), played.
   * `meta.counts` gives each list's size for the filter labels.
   */
  async findAllPaginated(
    organizationId: string,
    query: PaginationDto,
    groupId?: string,
    when?: GameList,
  ): Promise<PaginatedResult<Session> & { meta: { counts: Record<GameList, number> } }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const base = () => {
      const qb = this.sessionsRepo
        .createQueryBuilder('session')
        .innerJoin('session.group', 'group')
        .where('group.organizationId = :organizationId', { organizationId });
      if (groupId) qb.andWhere('session.groupId = :groupId', { groupId });
      return qb;
    };
    const [ahead, collect, past] = await Promise.all(
      (['ahead', 'collect', 'past'] as GameList[]).map((w) => base().andWhere(GAME_LISTS[w]).getCount()),
    );

    const qb = this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoinAndSelect('session.group', 'group')
      .leftJoinAndSelect('session.payments', 'payment')
      .leftJoinAndSelect('payment.player', 'player')
      .where('group.organizationId = :organizationId', { organizationId })
      .orderBy('session.date', when === 'ahead' ? 'ASC' : 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (groupId) {
      qb.andWhere('session.groupId = :groupId', { groupId });
    }
    if (when) qb.andWhere(GAME_LISTS[when]);

    const [data, total] = await qb.getManyAndCount();
    await this.markGamePaid(data);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), counts: { ahead, collect, past } },
    };
  }

  /**
   * Sets payment.gamePaid on each game's squad (paid for the game, or for its dues period), and
   * payment.paidSoFar on any due a player has part paid.
   */
  private async markGamePaid(sessions: Session[]) {
    await markPartPaid(this.sessionsRepo.manager, sessions);
    const games = sessions.filter((s) => s.kind !== SessionKind.DUES && s.group);
    if (!games.length) return sessions;
    const paid = await paidForGames(this.sessionsRepo.manager, games);
    for (const g of games) for (const p of g.payments ?? []) p.gamePaid = paid.get(g.id)?.get(p.playerId) ?? 'unpaid';
    await this.markTransferAmounts(sessions);
    return sessions;
  }

  /** Sets payment.transferAmount from bank_transfers for paid-by-transfer payments. */
  private async markTransferAmounts(sessions: Session[]) {
    const payments = sessions.flatMap((s) => (s.payments ?? []).filter((p) => p.source === 'transfer' && p.status === PaymentStatus.PAID));
    if (!payments.length) return;
    const ids = payments.map((p) => p.id);
    const transfers = await this.sessionsRepo.manager
      .getRepository(BankTransfer)
      .find({ where: { paymentId: In(ids), status: In([TransferStatus.MATCHED, TransferStatus.ASSIGNED]) }, select: ['paymentId', 'amount'] });
    const byPayment = new Map(transfers.map((t) => [t.paymentId, Number(t.amount)]));
    for (const p of payments) {
      const sent = byPayment.get(p.id);
      if (sent !== undefined) p.transferAmount = sent;
    }
  }

  async findOne(id: string, organizationId: string) {
    const session = await this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoinAndSelect('session.group', 'group')
      .leftJoinAndSelect('session.payments', 'payment')
      .leftJoinAndSelect('payment.player', 'player')
      .where('session.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();

    if (!session) throw new NotFoundException('Game not found');
    await this.markGamePaid([session]);
    return session;
  }

  /**
   * Move a game before it starts: a new day and/or kick-off time. Not once it has ended, been
   * called off or has a score in (the day's results belong to that date), and not into the past.
   * The reminders go again for the new time, money is re-checked against the new date (what's
   * payable now depends on it), and everyone in the game is told where it moved to.
   */
  async update(id: string, dto: UpdateSessionDto, organizationId: string) {
    const session = await this.findOne(id, organizationId);
    if (session.kind === SessionKind.DUES) throw new BadRequestException('A dues period can’t be moved.');
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game is called off. Bring it back first, then move it.');
    if (session.status !== SessionStatus.UPCOMING) throw new BadRequestException('This game has ended, so it can’t be moved.');
    if (await this.sessionsRepo.manager.count(SessionGame, { where: { sessionId: id } })) {
      throw new BadRequestException('Scores are already in for this game, so it can’t be moved.');
    }

    const date = dto.date ? dto.date.slice(0, 10) : String(session.date).slice(0, 10);
    if (dto.date && date < localDate(0)) throw new BadRequestException('Pick today or a day ahead.');
    const kickoffTime = dto.kickoffTime === undefined ? session.kickoffTime : dto.kickoffTime || null;
    if (date === String(session.date).slice(0, 10) && kickoffTime === session.kickoffTime) return session;

    await this.sessionsRepo.update(id, { date, kickoffTime });
    // The evening-before and 2-hours-before reminders are once per game: let them go again.
    await this.logRepo.delete({ key: In([`eve:${id}`, `ko:${id}`]) });
    const playerIds = (session.payments ?? []).filter((p) => p.attendance !== 'no_show').map((p) => p.playerId);
    if (playerIds.length) await this.billing.applyCredits(session.groupId, playerIds);

    const ko = kickoffFor({ kickoffTime, group: session.group });
    if (playerIds.length) {
      this.notifications.later(() =>
        this.notifications.notifyPlayers(playerIds, {
          kind: 'game_scheduled',
          title: `Game moved: ${session.group.name} ⚽`,
          body: `It's now ${shortDate(date)}${ko ? `, kick-off ${prettyTime(ko)}` : ''}.`,
          url: '/me',
        }),
      );
    }
    return this.findOne(id, organizationId);
  }

  async updateStatus(id: string, status: string, organizationId: string) {
    if (!Object.values(SessionStatus).includes(status as SessionStatus)) {
      throw new BadRequestException('Unknown game status');
    }
    const session = await this.findOne(id, organizationId);
    const wasCompleted = session.status === SessionStatus.COMPLETED;
    const wasCancelled = session.status === SessionStatus.CANCELLED;
    session.status = status as SessionStatus;
    // Full time opens the vote (once: reopening and ending again keeps the first time).
    if (session.status === SessionStatus.COMPLETED && !session.voteOpensAt) session.voteOpensAt = new Date();
    const saved = await this.sessionsRepo.save(session);

    // Called off: what members paid for it by transfer goes back to them as extra to sort. Back
    // on: their dues are paid again from that money if it's still there, and from kept money.
    if (!wasCancelled && saved.status === SessionStatus.CANCELLED) {
      await this.billing.releaseTransferDues(session, { reopen: true });
    } else if (wasCancelled && saved.status !== SessionStatus.CANCELLED) {
      await this.billing.repayCalledOff(session);
      await this.billing.applyCredits(session.groupId, (session.payments ?? []).map((p) => p.playerId));
    }

    // Full-time: invite the squad to vote.
    if (!wasCompleted && saved.status === SessionStatus.COMPLETED && saved.kind !== SessionKind.DUES) {
      this.notifications.later(async () => {
        const token = await this.ratings.ensureVotingToken(saved.id);
        await this.notifications.notifyPlayers(
          // Only the players who came; no-shows don't vote.
          (session.payments ?? []).filter((p) => p.attendance !== 'no_show').map((p) => p.playerId),
          {
            kind: 'vote_open',
            title: `Who was Player of the Match? 🏆`,
            body: `${session.group.name}: Player of the Match, your Best VII and a few awards. About a minute.`,
            url: `/v/${token}`,
          },
        );
      });
    }
    return saved;
  }

  /**
   * Full time: everyone who said they were in counts as came, except `noShows` (payment ids), who
   * owe nothing for it; then the game is completed and the players who came are invited to vote.
   */
  async endGame(id: string, noShows: string[], organizationId: string, markedBy?: string) {
    const session = await this.findOne(id, organizationId);
    const missing = new Set(noShows);
    for (const p of session.payments ?? []) {
      if (missing.has(p.id)) {
        if (p.attendance !== 'no_show') await this.payments.markNoShow(p.id, organizationId, markedBy);
      } else if (!p.attendance) {
        await this.paymentsRepo.update(p.id, { attendance: 'came' });
      }
    }
    await this.updateStatus(id, SessionStatus.COMPLETED, organizationId);
    return this.findOne(id, organizationId);
  }

  async remove(id: string, organizationId: string) {
    const session = await this.findOne(id, organizationId);
    const { groupId, payments } = session;
    await this.sessionsRepo.remove(session);
    // Its payments go with it; money members paid for it by transfer goes to their credit.
    await this.billing.releaseTransferDues({ groupId, payments }, { reopen: false });
  }

  async countByOrganization(organizationId: string) {
    return this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoin('session.group', 'group')
      .where('group.organizationId = :organizationId', { organizationId })
      .getCount();
  }

  countAll() {
    return this.sessionsRepo.count();
  }

  /** Organiser's "Remind" button: a push to everyone who still owes for this game/period. */
  async sendReminders(sessionId: string, organizationId: string) {
    const session = await this.findOne(sessionId, organizationId);
    if (session.status === SessionStatus.CANCELLED) return { sent: 0, missed: 0 };
    const unpaid = (session.payments || []).filter((p) => p.status === PaymentStatus.PENDING);
    if (!unpaid.length) return { sent: 0, missed: 0 };
    const what = session.label ? `${session.label} dues` : `the ${shortDate(session.date)} game`;
    // Each player is asked for what's left: someone who's part paid gets the rest, not the full fee.
    const byLeft = new Map<number, string[]>();
    for (const p of unpaid) {
      const left = Number(p.amount) - (p.paidSoFar ?? 0);
      byLeft.set(left, [...(byLeft.get(left) ?? []), p.playerId]);
    }
    let sent = 0;
    let missedTotal = 0;
    for (const [left, playerIds] of byLeft) {
      const { delivered, missed } = await this.notifications.notifyPlayers(playerIds, {
        kind: 'payment_reminder',
        title: `Quick one — ${naira(left)} for ${session.group?.name ?? 'your group'}`,
        body: `Still open for ${what}. Tap for the account details and your payment code.`,
        url: '/me/pay',
      });
      sent += delivered;
      missedTotal += missed;
    }
    return { sent, missed: missedTotal };
  }

  /** How long the organiser waits between reminders to vote for one game, so nobody is pestered. */
  static readonly VOTE_NUDGE_GAP_MS = 2 * 3600_000;

  /**
   * The organiser nudges the players who came and haven't voted yet. At most once every two
   * hours per game; the vote's own morning-after nudge is separate.
   */
  async remindToVote(sessionId: string, organizationId: string) {
    const session = await this.findOne(sessionId, organizationId);
    if (!this.ratings.isVoteOpen(session)) throw new BadRequestException('The vote isn’t open for this game.');
    const voted = new Set(await this.ratings.votersOf(session.id));
    const waiting = (session.payments ?? []).filter((p) => p.attendance !== 'no_show' && !voted.has(p.playerId)).map((p) => p.playerId);
    if (!waiting.length) return { sent: 0, missed: 0, waiting: 0 };
    const recent = await this.logRepo.findOne({
      where: { key: Like(`votenudge-org:${session.id}:%`), createdAt: MoreThan(new Date(Date.now() - SessionsService.VOTE_NUDGE_GAP_MS)) },
    });
    if (recent) throw new ConflictException('Players were reminded to vote in the last two hours. Try again later.');
    await this.logRepo.insert({ key: `votenudge-org:${session.id}:${Date.now()}` });
    const token = await this.ratings.ensureVotingToken(session.id);
    const squad = (session.payments ?? []).filter((p) => p.attendance !== 'no_show').length;
    const { delivered, missed } = await this.notifications.notifyPlayers(waiting, {
      kind: 'vote_nudge',
      title: 'Who was Player of the Match? 🏆',
      body: `${session.group?.name ?? 'Your group'}: ${voted.size}/${squad} have voted. About a minute.`,
      url: `/v/${token}`,
    });
    return { sent: delivered, missed, waiting: waiting.length };
  }

  async totalCollectedByOrganization(organizationId: string): Promise<number> {
    const result = await this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoin('session.group', 'group')
      .select('COALESCE(SUM(session.collectedAmount), 0)', 'total')
      .where('group.organizationId = :organizationId', { organizationId })
      .getRawOne();
    return Number(result.total);
  }
}
