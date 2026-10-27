import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Session, SessionKind, SessionStatus, kickoffFor } from '../sessions/entities/session.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Vote } from '../ratings/entities/vote.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RsvpService } from '../rsvp/rsvp.service';
import { RatingsService } from '../ratings/ratings.service';
import { naira } from '../common/format.util';
import { APP_TZ, localDate, prettyTime, zonedInstant } from '../common/time.util';
import { ReminderLog } from './entities/reminder-log.entity';
import { partPaidAmounts } from '../payments/part-paid';

const EVERY_MS = 10 * 60 * 1000;
const DUES_REMINDER_DAYS = [3, 7];

/**
 * Crafted push reminders around each game and each dues period.
 * Idempotent: every reminder has a key recorded in reminder_logs.
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(ReminderLog) private logRepo: Repository<ReminderLog>,
    @InjectRepository(Session) private sessionsRepo: Repository<Session>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(GroupMembership) private membershipsRepo: Repository<GroupMembership>,
    @InjectRepository(Vote) private votesRepo: Repository<Vote>,
    private notifications: NotificationsService,
    private rsvp: RsvpService,
    private ratings: RatingsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Reminder tick failed: ${err.message}`));
    }, EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns true the first time a key is claimed. */
  private async claim(key: string) {
    const res = await this.logRepo
      .createQueryBuilder()
      .insert()
      .values({ key })
      .orIgnore()
      .execute();
    // ON CONFLICT DO NOTHING returns no row when the key already exists.
    return (res.raw as unknown[]).length > 0;
  }

  async tick(now = new Date()) {
    await this.shareInGroup(now);
    await this.dayBefore(now);
    await this.matchMorning(now);
    await this.kickOff(now);
    await this.morningAfter(now);
    await this.voteClosing(now);
    await this.duesChasers(now);
  }

  private games(date: string) {
    return this.sessionsRepo.find({
      where: { date, kind: SessionKind.GAME, status: In([SessionStatus.UPCOMING, SessionStatus.COMPLETED]) },
      relations: ['group', 'payments', 'payments.player'],
    });
  }

  /** Squad for reminders: confirmed players for RSVP groups, everyone billed otherwise. */
  private async squad(game: Session) {
    if (game.group.requireRsvp) return (await this.rsvp.board(game)).in.map((p) => p.id);
    return (game.payments ?? []).map((p) => p.playerId);
  }

  private async refs(groupId: string, playerIds: string[]) {
    if (!playerIds.length) return new Map<string, string>();
    const rows = await this.membershipsRepo.find({ where: { groupId, playerId: In(playerIds) } });
    return new Map(rows.map((m) => [m.playerId, m.paymentRef]));
  }

  // ── 5pm the day before, and 6:30am on match day: the organiser sends the link to the group chat ──
  // An app can't post in a WhatsApp group, so the organiser gets the message ready to send: the
  // notice opens the game with it written, one tap to WhatsApp, pick the group, send.
  private async shareInGroup(now: Date) {
    const today = localDate(0, undefined, now);
    // Friday 5pm (the day before): the first call.
    if (now >= zonedInstant(today, '17:00')) {
      for (const game of await this.games(localDate(1, undefined, now))) await this.shareCall(game, 'first', now);
    }
    // Saturday 6:30am (match day): the last call, while there's still time before kick-off.
    if (now >= zonedInstant(today, '06:30')) {
      for (const game of await this.games(today)) {
        const time = kickoffFor(game);
        if (now >= (time ? zonedInstant(game.date, time) : zonedInstant(today, '12:00'))) continue;
        await this.shareCall(game, 'last', now);
      }
    }
  }

  private async shareCall(game: Session, call: 'first' | 'last', now: Date) {
    if (game.status !== SessionStatus.UPCOMING) return;
    const g = game.group;
    const ko = kickoffFor(game);
    const board = await this.rsvp.board(game);
    const left = board.capacity - board.in.length;
    // Full: nothing to ask the group for.
    if (g.requireRsvp && board.capacity > 0 && left <= 0) return;
    // A game set up after the first call's time only gets the last one.
    if (!(await this.claim(`share-${call}:${game.id}`))) return;
    const day = new Date(`${game.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    const when = game.date.slice(0, 10) === localDate(0, undefined, now) ? 'today’s' : `${day}’s`;
    const count = board.capacity > 0 ? `${board.in.length} of ${board.capacity} in, ${left} place${left === 1 ? '' : 's'} left.` : `${board.in.length} in so far.`;
    await this.notifications.notifyOrganisers(
      g.organizationId,
      {
        kind: 'share_invite',
        title: call === 'last' ? `Last call: send ${when} link to the group` : `Send ${when} link to the group`,
        body: `${g.name}${ko ? ` · ${prettyTime(ko)}` : ''}. ${count} Tap to send it on WhatsApp.`,
        url: `/sessions/${game.id}?send=${call === 'last' ? 'lastcall' : 'invite'}`,
      },
      { email: true },
    );
  }

  // ── 6pm the day before ──
  private async dayBefore(now: Date) {
    if (now < zonedInstant(localDate(0, undefined, now), '18:00')) return;
    for (const game of await this.games(localDate(1, undefined, now))) {
      if (game.status !== SessionStatus.UPCOMING || !(await this.claim(`eve:${game.id}`))) continue;
      const g = game.group;
      const ko = kickoffFor(game);
      const when = ko ? `Kick-off ${prettyTime(ko)}. ` : '';
      const squad = await this.squad(game);
      const board = await this.rsvp.board(game);
      const confirmed = g.requireRsvp ? `${board.in.length}/${board.capacity} confirmed.` : `${squad.length} in the squad.`;
      const unpaid = owing(game);
      const refs = await this.refs(g.id, [...unpaid.keys()]);

      for (const playerId of squad) {
        const owes = unpaid.get(playerId);
        await this.notifications.notifyPlayers([playerId], {
          kind: 'reminder_eve',
          title: `Tomorrow: ${g.name} ⚽`,
          body: `${when}You're in — ${confirmed}${owes ? ` ${naira(owes)} to pay, ref ${refs.get(playerId) ?? ''}.` : ''}`.trim(),
          url: '/me',
        });
      }

      const spots = board.capacity - board.in.length;
      if (g.requireRsvp && spots > 0 && board.noReply.length) {
        await this.notifications.notifyPlayers(
          board.noReply.map((p) => p.id),
          {
            kind: 'rsvp_nudge',
            title: `${spots} place${spots === 1 ? '' : 's'} left for tomorrow`,
            body: `${g.name}${ko ? ` at ${prettyTime(ko)}` : ''}. Tap “I'm in” before they're gone.`,
            url: '/me',
          },
        );
      }
    }
  }

  // ── 6:30am on match day: the squad ──
  private async matchMorning(now: Date) {
    const today = localDate(0, undefined, now);
    if (now < zonedInstant(today, '06:30')) return;
    for (const game of await this.games(today)) {
      if (game.status !== SessionStatus.UPCOMING) continue;
      const time = kickoffFor(game);
      // Too late once the game's on (or past noon without a time).
      if (now >= (time ? zonedInstant(game.date, time) : zonedInstant(today, '12:00'))) continue;
      if (!(await this.claim(`md:${game.id}`))) continue;
      const g = game.group;
      const squad = await this.squad(game);
      const unpaid = owing(game);
      const refs = await this.refs(g.id, [...unpaid.keys()]);
      for (const playerId of squad) {
        const owes = unpaid.get(playerId);
        await this.notifications.notifyPlayers([playerId], {
          kind: 'reminder_matchday',
          title: `Match day: ${g.name} ⚽`,
          body: `${time ? `Kick-off ${prettyTime(time)}` : 'Today'}${g.location ? ` at ${g.location}` : ''}. ${squad.length} playing.${
            owes ? ` ${naira(owes)} to pay, ref ${refs.get(playerId) ?? ''}.` : ''
          }`,
          url: '/me',
        });
      }
    }
  }

  // ── 2 hours before kick-off ──
  private async kickOff(now: Date) {
    for (const game of await this.games(localDate(0, undefined, now))) {
      const g = game.group;
      const time = kickoffFor(game);
      if (!time || game.status !== SessionStatus.UPCOMING) continue;
      const ko = zonedInstant(game.date, time);
      if (now < new Date(ko.getTime() - 2 * 3600_000) || now >= ko) continue;
      // An early kick-off already had the 6:30am message under 3 hours ago: one is enough.
      if (ko.getTime() - zonedInstant(game.date, '06:30').getTime() <= 3 * 3600_000) continue;
      if (!(await this.claim(`ko:${game.id}`))) continue;

      const squad = await this.squad(game);
      const unpaid = owing(game);
      const refs = await this.refs(g.id, [...unpaid.keys()]);
      for (const playerId of squad) {
        const owes = unpaid.get(playerId);
        await this.notifications.notifyPlayers([playerId], {
          kind: 'reminder_kickoff',
          title: 'Kick-off in 2 hours ⏱',
          body: `${g.name} · ${prettyTime(time)}. ${squad.length} playing — lace up.${
            owes ? ` Still ${naira(owes)} to pay (ref ${refs.get(playerId) ?? ''}).` : ''
          }`,
          url: '/me',
        });
      }
    }
  }

  // ── The morning after: settle up, then vote ──
  private async morningAfter(now: Date) {
    const today = localDate(0, undefined, now);
    const nineAm = zonedInstant(today, '09:00');
    const noon = zonedInstant(today, '12:00');
    if (now < nineAm) return;

    for (const game of await this.games(localDate(-1, undefined, now))) {
      const g = game.group;
      const pending = (game.payments ?? []).filter((p) => p.status === PaymentStatus.PENDING);
      const refs = await this.refs(g.id, pending.map((p) => p.playerId));
      // Part paid: ask for what's left.
      const paidSoFar = await partPaidAmounts(this.paymentsRepo.manager, pending.map((p) => ({ ...p, groupId: g.id })));
      for (const p of pending) {
        if (!(await this.claim(`owe:${p.id}`))) continue;
        await this.notifications.notifyPlayers([p.playerId], {
          kind: 'payment_reminder',
          title: `${naira(Number(p.amount) - (paidSoFar.get(p.id) ?? 0))} for last night 🙏`,
          body: `${g.name} — tap for the account details. Your payment code is ${refs.get(p.playerId) ?? ''}.`,
          url: '/me/pay',
        });
      }

      // Only while the vote is open, and only to the players who came.
      if (now < noon || !this.ratings.isVoteOpen(game)) continue;
      const squad = (game.payments ?? []).filter((p) => p.attendance !== 'no_show').map((p) => p.playerId);
      if (squad.length < 2) continue;
      const voted = new Set(
        (await this.votesRepo.find({ where: { sessionId: game.id } })).map((v) => v.voterId),
      );
      const waiting = squad.filter((id) => !voted.has(id));
      if (!waiting.length || !(await this.claim(`votenudge:${game.id}`))) continue;
      const token = await this.ratings.ensureVotingToken(game.id);
      await this.notifications.notifyPlayers(waiting, {
        kind: 'vote_nudge',
        title: 'Voting closes soon ⏳',
        body: `${g.name}: ${voted.size} of ${squad.length} have voted. Have your say before it closes.`,
        url: `/v/${token}`,
      });
    }
  }

  // ── 3 hours before the vote closes: the players still to vote, and the group ──
  private async voteClosing(now: Date) {
    for (const days of [-2, -1, 0]) {
      for (const game of await this.games(localDate(days, undefined, now))) {
        if (!this.ratings.isVoteOpen(game)) continue;
        const closes = this.ratings.voteClosesAt(game);
        if (!closes || now < new Date(closes.getTime() - 3 * 3600_000) || now >= closes) continue;
        const squad = (game.payments ?? []).filter((p) => p.attendance !== 'no_show').map((p) => p.playerId);
        if (squad.length < 2) continue;
        const voted = new Set((await this.votesRepo.find({ where: { sessionId: game.id } })).map((v) => v.voterId));
        const waiting = squad.filter((id) => !voted.has(id));
        if (!waiting.length || !(await this.claim(`voteclose:${game.id}`))) continue;
        const g = game.group;
        const at = closes.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: APP_TZ }).replace(':00', '').replace(' ', '');
        const token = await this.ratings.ensureVotingToken(game.id);
        await this.notifications.notifyPlayers(waiting, {
          kind: 'vote_closing',
          title: `Voting closes at ${at} ⏳`,
          body: `${g.name}: ${voted.size}/${squad.length} have voted. Last chance to pick Player of the Match.`,
          url: `/v/${token}`,
        });
        await this.notifications.notifyOrganisers(
          g.organizationId,
          {
            kind: 'share_vote',
            title: `Voting closes at ${at}: send the last call`,
            body: `${g.name}: ${waiting.length} still to vote. Tap to send the link to the group on WhatsApp.`,
            url: `/sessions/${game.id}?send=voteclosing`,
          },
          { email: true },
        );
      }
    }
  }

  // ── Dues: nudge on day 3 and day 7 of the period ──
  private async duesChasers(now: Date) {
    const today = localDate(0, undefined, now);
    if (now < zonedInstant(today, '10:00')) return;
    const pending = await this.paymentsRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.session', 's')
      .innerJoinAndSelect('s.group', 'g')
      .where('s.kind = :kind', { kind: SessionKind.DUES })
      .andWhere('p.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('s.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
      .getMany();

    const paidSoFar = await partPaidAmounts(this.paymentsRepo.manager, pending.map((p) => ({ ...p, groupId: p.session.groupId })));
    for (const p of pending) {
      const start = new Date(`${p.session.date.slice(0, 10)}T00:00:00Z`).getTime();
      const age = Math.floor((new Date(`${today}T00:00:00Z`).getTime() - start) / 86_400_000);
      // Only the reminder that's due now (with a 2-day grace), never a backlog blast.
      const day = DUES_REMINDER_DAYS.find((d) => age >= d && age <= d + 2);
      if (!day || !(await this.claim(`dues${day}:${p.id}`))) continue;
      const ref = (await this.refs(p.session.groupId, [p.playerId])).get(p.playerId);
      const g = p.session.group;
      await this.notifications.notifyPlayers([p.playerId], {
        kind: 'dues_reminder',
        title: `${p.session.label ?? 'Dues'}: ${naira(Number(p.amount) - (paidSoFar.get(p.id) ?? 0))} outstanding`,
        body: g.accountNumber
          ? `${g.name} — pay ${g.bankName} ${g.accountNumber}, ref ${ref ?? ''}.`
          : `${g.name} — tap to see how to pay.`,
        url: '/me/pay',
      });
    }
  }
}

/** What each player still owes for a game: their own due, which may differ from today's fee. */
function owing(game: Session) {
  return new Map(
    (game.payments ?? []).filter((p) => p.status === PaymentStatus.PENDING).map((p) => [p.playerId, Number(p.amount)]),
  );
}
