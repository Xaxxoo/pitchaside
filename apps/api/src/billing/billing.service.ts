import type { ExtraSource } from './dto/transfer.dto';
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Group, PaymentType } from '../groups/entities/group.entity';
import { GroupMembership, MemberRole } from '../groups/entities/group-membership.entity';
import { Session, SessionKind, SessionStatus } from '../sessions/entities/session.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Player } from '../players/entities/player.entity';
import { ConfigService } from '@nestjs/config';
import { normaliseWebhookUrl, webhookUrlsFor } from './webhook-url';
import { PaymentsService } from '../payments/payments.service';
import { BankTransfer, TransferStatus, type MoneyInCategory } from './entities/bank-transfer.entity';
import { OutgoingTransfer, PayoutStatus, type PayoutCategory } from './entities/outgoing-transfer.entity';
import { ClaimStatus, PaymentClaim } from './entities/payment-claim.entity';
import { GroupKeptMoney, KEPT_REASONS, type KeptReason } from './entities/group-kept-money.entity';
import { PaymentReceipt } from './entities/payment-receipt.entity';
import { RECEIPT_KEEP_DAYS, RECEIPT_RECHECK_MS, parseReceipt } from './receipts';
import { CLAIM_EXPIRES_MS, CLAIM_WINDOW_MS, CONFIRM_WINDOW_MS, AMOUNT_TOLERANCE, TWIN_WINDOW_MS, claimSettledBy, couldPair } from './claims';
import { normaliseAccount, payerNameFrom, whoSent } from './payer-name';
import { IncomingTransfer, PULSE_CLIENT, PulseClient } from './pulse/pulse.client';
import { HttpPulseClient } from './pulse/http-pulse.client';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { NIGERIAN_BANKS } from './data/nigerian-banks';
import { naira } from '../common/format.util';
import { localDate } from '../common/time.util';
import { ClubPerson, clubPlayerFor } from '../players/club-player';
import { paidByTransfer, payableNow, releaseToExtra } from '../payments/credit';
import { PERIODIC_TYPES, periodFor } from './periods';
import { COVERED_BY_DUES, gameTarget, squadEntry } from '../payments/game-dues';
import { Competition } from '../competitions/entities/competition.entity';
import { CompetitionTeam, TeamRegistrationStatus } from '../competitions/entities/competition-team.entity';

export { periodFor };

/** PitchAside service fee per outbound payout, transferred to the platform account. */
const PLATFORM_FEE = 350;
/** A payout still pending this long was left by a server stop mid-call, so it can be cancelled. */
const PENDING_CANCEL_AFTER_MS = 15 * 60 * 1000;

/**
 * A transfer the bank answered with "timed out" (or that we gave up waiting on) may still go
 * through: it isn't failed until the bank says so, or has no record of it.
 */
export function unclearTransferError(message: string) {
  return /timed? ?out|timeout|aborted|ETIMEDOUT|ECONNRESET|socket hang up|\((5\d\d)\)|fetch failed/i.test(message);
}

/**
 * What a failed payout says to the organiser, in a line or two: what happened and that nothing
 * was sent. The bank's full reply stays in the server log.
 */
export function payoutFailureText(raw: string, bankName?: string | null) {
  const at = bankName ? ` at ${bankName}` : '';
  if (/insufficient|not enough/i.test(raw)) return 'Not enough in the group account. Nothing was sent.';
  if (/invalid account|account (number )?not found|beneficiary/i.test(raw)) return `Account not found${at}. Check the number. Nothing was sent.`;
  if (unclearTransferError(raw)) return `${bankName ?? 'The bank'} didn't answer. Nothing was sent. Try again shortly.`;
  const reason = raw.replace(/^Payrep MFB transfer failed \(\d+\): /, '').replace(/\.$/, '').slice(0, 60);
  return `Didn’t go through${bankName ? ` to ${bankName}` : ''}${reason ? ` (${reason})` : ''}. Nothing was sent.`;
}

/** How long a payout can sit unconfirmed before an automatic check asks the bank about it. */
const FOLLOW_UP_AFTER_MS = 2 * 60 * 1000;
/** A payout the bank still has no record of after this long never reached it. */
const NEVER_ARRIVED_AFTER_MS = 30 * 60 * 1000;
/** Transfers an organiser records by hand get this id prefix; they never count as withdrawable. */
const MANUAL_PREFIX = 'manual_';

// Unambiguous characters for human-typed references (no 0/O, 1/I/L).
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * The name we ask Pulse to put on a group's account (Pulse adds its prefix, e.g. "CAL/…").
 * Plain letters, digits and simple punctuation only: bank account names travel through
 * NIBSS, and characters like "–" or emoji can get the request rejected.
 */
export function accountNameFor(groupName: string): string {
  const clean = groupName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents split off by NFKD: "ú" → "u"
    .replace(/[^A-Za-z0-9 &'.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `PitchAside ${clean}`.trim().slice(0, 60);
}

function bankNameFor(code: string) {
  return NIGERIAN_BANKS.find((b) => b.code === code)?.name ?? 'Unknown Bank';
}

/** What the app sees of a group's saved payee; null when there isn't one. */
function payeeView(group: Group) {
  if (!group.payeeAccount) return null;
  return {
    label: group.payeeLabel ?? 'Pitch owner',
    name: group.payeeName ?? '',
    accountNumber: group.payeeAccount,
    bankCode: group.payeeBankCode,
    bankName: group.payeeBankName,
    amount: group.payeeAmount != null ? Number(group.payeeAmount) : null,
  };
}

type WebhookOutcome = 'recorded' | 'rejected';

/** Account numbers as we store them: the last 10 digits, whatever formatting the bank sends. */
function accountKey(accountNumber: string) {
  return accountNumber.replace(/\D/g, '').slice(-10);
}


@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private timer?: NodeJS.Timeout;
  private resendTimer?: NodeJS.Timeout;
  private followUpTimer?: NodeJS.Timeout;
  /**
   * The last notification Payrep sent about each account, kept in memory since the last restart.
   * Lets the app say "Payrep never told us" apart from "we rejected it" without reading the logs.
   */
  private readonly notices = new Map<string, { at: Date; outcome: WebhookOutcome }>();
  private readonly noticesSince = new Date();

  constructor(
    @InjectRepository(Group) private groupsRepo: Repository<Group>,
    @InjectRepository(GroupMembership) private membershipsRepo: Repository<GroupMembership>,
    @InjectRepository(Session) private sessionsRepo: Repository<Session>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(Player) private playersRepo: Repository<Player>,
    @InjectRepository(BankTransfer) private transfersRepo: Repository<BankTransfer>,
    @InjectRepository(OutgoingTransfer) private payoutsRepo: Repository<OutgoingTransfer>,
    @InjectRepository(Competition) private competitionsRepo: Repository<Competition>,
    @InjectRepository(CompetitionTeam) private competitionTeamsRepo: Repository<CompetitionTeam>,
    @Inject(PULSE_CLIENT) private pulse: PulseClient,
    private paymentsService: PaymentsService,
    private notifications: NotificationsService,
    private usersService: UsersService,
    private config: ConfigService,
    @InjectRepository(PaymentClaim) private claimsRepo: Repository<PaymentClaim>,
    @InjectRepository(PaymentReceipt) private receiptsRepo?: Repository<PaymentReceipt>,
  ) {}

  // ── Lifecycle: open new dues periods as time rolls over ──

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.pulse.refreshWebhookSecret?.().catch(() => undefined);
    // Webhooks Pulse couldn't deliver (or that we rejected) come back on their own: shortly
    // after startup, then every 15 minutes.
    const catchUp = () => this.resendFailedWebhooks().catch((err) => this.logger.error(`Resending failed webhooks failed: ${err.message}`));
    setTimeout(catchUp, 30_000).unref();
    this.resendTimer = setInterval(catchUp, 15 * 60 * 1000);
    this.resendTimer.unref();
    // Payouts the bank hasn't confirmed get asked about every 5 minutes.
    this.followUpTimer = setInterval(() => this.followUpPayouts().catch((err) => this.logger.error(`Payout follow-up failed: ${err.message}`)), 5 * 60 * 1000);
    this.followUpTimer.unref();
    this.timer = setInterval(() => {
      this.ensureAllCurrentPeriods()
        .catch((err) => this.logger.error(`Dues rollover failed: ${err.message}`))
        // Dues created outside billing (games, RSVPs) get paid from credit here at the latest.
        .then(() => this.applyAllCredits())
        .catch((err) => this.logger.error(`Applying credit failed: ${err.message}`));
    }, 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.resendTimer) clearInterval(this.resendTimer);
    if (this.followUpTimer) clearInterval(this.followUpTimer);
  }

  /** Asks Pulse to deliver again the webhooks that didn't get through, so their money gets recorded. */
  async resendFailedWebhooks() {
    if (!this.pulse.resendFailedWebhooks) return;
    const { resent, failed } = await this.pulse.resendFailedWebhooks();
    if (resent || failed) this.logger.log(`Asked Pulse to resend ${resent} undelivered webhook(s)${failed ? `; ${failed} couldn't be resent` : ''}`);
  }

  async ensureAllCurrentPeriods() {
    const groups = await this.groupsRepo.find({ where: { paymentType: In(PERIODIC_TYPES) } });
    for (const group of groups) await this.ensureCurrentPeriod(group);
  }

  // ── Group setup: invite code + collection account + first dues period ──

  /** Idempotent: fills in whatever the group is missing. Account failures are non-fatal. */
  async setupGroup(group: Group): Promise<Group> {
    if (!group.inviteCode) {
      group.inviteCode = randomBytes(6).toString('base64url');
      await this.groupsRepo.save(group);
    }
    // Account is NOT auto-provisioned here — the admin must provide
    // their BVN first via the "Create account" flow (createGroupAccount).
    await this.ensureCurrentPeriod(group);
    return group;
  }

  async provisionAccount(group: Group, ids: { bvn?: string; nin?: string } = {}): Promise<Group> {
    const contact = await this.organiserContact(group.organizationId);
    const account = await this.pulse.createAccount({
      reference: group.id,
      accountName: accountNameFor(group.name),
      email: contact?.email,
      phone: contact?.phone ?? undefined,
      bvn: ids.bvn,
      nin: ids.nin,
    });
    group.accountNumber = account.accountNumber;
    group.accountName = account.accountName;
    group.bankName = account.bankName;
    group.accountReference = account.providerReference;
    return this.groupsRepo.save(group);
  }

  /** The club's first admin, whose email and phone go on the account as its contact. */
  private async organiserContact(organizationId: string) {
    const users = await this.usersService.findByOrganization(organizationId);
    const admins = users.filter((u) => u.role === UserRole.ORG_ADMIN);
    return (admins.length ? admins : users).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  }

  /**
   * The organiser's "Create account" button. Unlike setupGroup, a failure comes back to
   * them with Pulse's reason, so it can be fixed instead of silently retried.
   */
  async createGroupAccount(groupId: string, organizationId: string, ids: { bvn?: string; nin?: string } = {}) {
    const group = await this.findGroup(groupId, organizationId);
    if (!group.accountNumber) {
      try {
        await this.provisionAccount(group, ids);
      } catch (err: any) {
        this.logger.warn(`Account provisioning failed for group ${group.id}: ${err.message}`);
        throw new BadGatewayException(`Couldn't create the account. ${err.message}`);
      }
    }
    return this.getBilling(groupId, organizationId);
  }

  async regenerateInviteCode(groupId: string, organizationId: string) {
    const group = await this.findGroup(groupId, organizationId);
    group.inviteCode = randomBytes(6).toString('base64url');
    return this.groupsRepo.save(group);
  }

  async getBilling(groupId: string, organizationId: string) {
    const group = await this.findGroup(groupId, organizationId);
    await this.setupGroup(group);
    const current = PERIODIC_TYPES.includes(group.paymentType)
      ? await this.sessionsRepo.findOne({
          where: { groupId: group.id, kind: SessionKind.DUES, date: periodFor(group.paymentType).start },
        })
      : null;
    const unmatched = await this.transfersRepo.count({
      where: { groupId: group.id, status: TransferStatus.UNMATCHED },
    });
    return {
      inviteCode: group.inviteCode,
      paymentType: group.paymentType,
      account: group.accountNumber
        ? { accountNumber: group.accountNumber, accountName: group.accountName, bankName: group.bankName }
        : null,
      currentPeriod: current ? { id: current.id, label: current.label, date: current.date } : null,
      unmatchedTransfers: unmatched,
      providerMode: this.pulse.mode,
    };
  }

  // ── Dues periods ──

  async ensureCurrentPeriod(group: Group, now = new Date()): Promise<Session | null> {
    if (!PERIODIC_TYPES.includes(group.paymentType)) return null;
    const period = periodFor(group.paymentType, now);

    const existing = await this.sessionsRepo.findOne({
      where: { groupId: group.id, kind: SessionKind.DUES, date: period.start },
    });
    if (existing) return existing;

    const memberships = await this.membershipsRepo.find({ where: { groupId: group.id } });
    const fee = Number(group.feePerPlayer);
    const session = await this.sessionsRepo.save(
      this.sessionsRepo.create({
        groupId: group.id,
        date: period.start,
        kind: SessionKind.DUES,
        label: period.label,
        targetAmount: fee * (memberships.length || group.targetPlayers),
      }),
    );
    if (memberships.length) {
      await this.paymentsRepo.save(
        memberships.map((m) =>
          this.paymentsRepo.create({ sessionId: session.id, playerId: m.playerId, amount: fee }),
        ),
      );
      await this.applyCredits(group.id, memberships.map((m) => m.playerId));
      this.notifications.later(() =>
        this.notifications.notifyPlayers(
          memberships.map((m) => m.playerId),
          {
            kind: 'dues_open',
            title: `${group.name}: ${period.label} dues are open`,
            body: `${naira(fee)} — tap for the account details and your payment code.`,
            url: '/me',
            message: group.accountNumber
              ? `⚽ ${group.name} — ${period.label} dues: ${naira(fee)}\nPay to ${group.bankName} ${group.accountNumber} (${group.accountName}) with your PitchAside reference in the narration.\n${this.notifications.appUrl('/me')}`
              : undefined,
          },
        ),
      );
    }
    return session;
  }

  /**
   * Brings what's still unpaid in line with the group's fee and how it collects. For games
   * still to come: a due at the current fee in pay-per-game groups, or a ₦0 entry covered by
   * dues in monthly-type groups (so switching type doesn't double-charge). The current dues
   * period moves to the current fee. Paid dues and past games keep what they were. Then any
   * credit members hold pays what it now covers.
   */
  async repriceOpenDues(group: Group, now = new Date()) {
    const fee = Number(group.feePerPlayer);
    const periodic = PERIODIC_TYPES.includes(group.paymentType);
    const today = localDate(0, undefined, now);
    const qb = this.sessionsRepo
      .createQueryBuilder('s')
      .where('s.groupId = :groupId', { groupId: group.id })
      .andWhere('s.status = :upcoming', { upcoming: SessionStatus.UPCOMING });
    if (periodic) {
      qb.andWhere('((s.kind = :game AND s.date >= :today) OR (s.kind = :dues AND s.date = :period))', {
        game: SessionKind.GAME,
        dues: SessionKind.DUES,
        today,
        period: periodFor(group.paymentType, now).start,
      });
    } else {
      qb.andWhere('s.kind = :game AND s.date >= :today', { game: SessionKind.GAME, today });
    }
    const sessions = await qb.getMany();
    if (!sessions.length) return;

    const kindOf = new Map(sessions.map((s) => [s.id, s.kind]));
    const open = await this.paymentsRepo.find({
      where: [
        { sessionId: In(sessions.map((s) => s.id)), status: PaymentStatus.PENDING },
        { sessionId: In(sessions.map((s) => s.id)), source: COVERED_BY_DUES },
      ],
    });
    const changed: Payment[] = [];
    for (const p of open) {
      const isGame = kindOf.get(p.sessionId) === SessionKind.GAME;
      const want = isGame ? squadEntry(group, p.sessionId, p.playerId) : { amount: fee, status: PaymentStatus.PENDING, source: undefined };
      const wantSource = want.source ?? null;
      if (Number(p.amount) === Number(want.amount) && p.status === (want.status ?? PaymentStatus.PENDING) && (p.source ?? null) === wantSource) continue;
      p.amount = Number(want.amount);
      p.status = want.status ?? PaymentStatus.PENDING;
      p.source = wantSource as unknown as string;
      p.markedBy = null as unknown as string;
      changed.push(p);
    }
    if (changed.length) await this.paymentsRepo.save(changed);

    const members = await this.membershipsRepo.count({ where: { groupId: group.id } });
    for (const s of sessions) {
      const target = s.kind === SessionKind.DUES ? fee * Math.max(members, 1) : gameTarget(group);
      await this.sessionsRepo.update(s.id, { targetAmount: target });
      await this.paymentsService.recalculateSessionTotal(s.id);
    }
    const owing = open.filter((p) => p.status === PaymentStatus.PENDING).map((p) => p.playerId);
    await this.applyCredits(group.id, [...new Set(owing)]);
  }


  /** Called whenever someone joins a group: give them a reference and this period's due. */
  async onMemberAdded(membership: GroupMembership) {
    if (!membership.paymentRef) {
      membership.paymentRef = await this.newPaymentRef();
      await this.membershipsRepo.save(membership);
    }
    const group = await this.groupsRepo.findOneOrFail({ where: { id: membership.groupId } });
    const period = await this.ensureCurrentPeriod(group);
    if (!period) return;

    const hasDue = await this.paymentsRepo.findOne({
      where: { sessionId: period.id, playerId: membership.playerId },
    });
    if (!hasDue) {
      await this.paymentsRepo.save(
        this.paymentsRepo.create({
          sessionId: period.id,
          playerId: membership.playerId,
          amount: Number(group.feePerPlayer),
        }),
      );
      const members = await this.membershipsRepo.count({ where: { groupId: group.id } });
      await this.sessionsRepo.update(period.id, {
        targetAmount: Number(group.feePerPlayer) * Math.max(members, 1),
      });
    }
  }

  private async newPaymentRef(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = randomBytes(5);
      const code = Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
      const ref = `PA${code}`;
      const clash = await this.membershipsRepo.findOne({ where: { paymentRef: ref } });
      if (!clash) return ref;
    }
    throw new Error('Could not allocate a unique payment reference');
  }

  // ── Public join / pay link ──

  async getPublicGroup(code: string) {
    const group = await this.groupsRepo.findOne({
      where: { inviteCode: code },
      relations: ['organization', 'memberships'],
    });
    if (!group) throw new NotFoundException('This group link is not valid. Ask your organiser for the latest link.');
    if (!group.accountNumber) await this.setupGroup(group);
    // The person who invites: the account's first admin ("Matthew invites you"), not the club's name.
    const owner = await this.groupsRepo.manager.findOne(User, {
      where: { organizationId: group.organizationId, role: UserRole.ORG_ADMIN },
      order: { createdAt: 'ASC' },
    });
    return {
      /** So a signed-in player's phone can tell they're already in it, and skip joining. */
      groupId: group.id,
      groupName: group.name,
      organizationName: group.organization?.name,
      organiserName: owner?.firstName?.trim() || null,
      description: group.description,
      schedule: group.schedule,
      feePerPlayer: Number(group.feePerPlayer),
      paymentType: group.paymentType,
      memberCount: group.memberships?.length ?? 0,
      targetPlayers: group.targetPlayers,
      account: group.accountNumber
        ? { accountNumber: group.accountNumber, accountName: group.accountName, bankName: group.bankName }
        : null,
    };
  }

  /** A club's groups for the club invite link's "which groups do you play in?" step. */
  async publicGroupsForClub(organizationId: string) {
    const groups = await this.groupsRepo.find({
      where: { organizationId },
      relations: ['memberships'],
      order: { createdAt: 'ASC' },
    });
    for (const g of groups) if (!g.inviteCode) await this.setupGroup(g);
    return groups.map((g) => ({
      id: g.id,
      code: g.inviteCode,
      name: g.name,
      schedule: g.schedule,
      kickoffTime: g.kickoffTime,
      feePerPlayer: Number(g.feePerPlayer),
      paymentType: g.paymentType,
      memberCount: g.memberships?.length ?? 0,
      targetPlayers: g.targetPlayers,
    }));
  }

  /** New player who has just created their account from this group's link. */
  async joinGroup(code: string, input: ClubPerson, gameId?: string) {
    const group = await this.groupsRepo.findOne({ where: { inviteCode: code } });
    if (!group) throw new NotFoundException('This group link is not valid. Ask your organiser for the latest link.');
    const player = await clubPlayerFor(this.playersRepo, group.organizationId, input);
    return { playerId: player.id, ...(await this.addToGroup(group, player, gameId)) };
  }

  /**
   * "I'm playing too": the organiser's own player record in their club (matched by email,
   * created if needed) added to this group. Safe to tap twice.
   */
  async addOrganiserToGroup(groupId: string, user: User) {
    const group = await this.findGroup(groupId, user.organizationId);
    const player = await clubPlayerFor(this.playersRepo, group.organizationId, {
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    let membership = await this.membershipsRepo.findOne({ where: { groupId: group.id, playerId: player.id } });
    if (!membership) {
      membership = await this.membershipsRepo.save(
        this.membershipsRepo.create({ groupId: group.id, playerId: player.id, role: MemberRole.PLAYER }),
      );
    }
    await this.onMemberAdded(membership);
    return membership;
  }

  /** Signed-in person tapping a group link — even one from a club they've never played for. */
  async joinGroupAsPerson(code: string, person: ClubPerson, gameId?: string) {
    const group = await this.groupsRepo.findOne({ where: { inviteCode: code } });
    if (!group) throw new NotFoundException('This group link is not valid. Ask your organiser for the latest link.');
    const player = await clubPlayerFor(this.playersRepo, group.organizationId, person);
    return this.addToGroup(group, player, gameId);
  }

  /**
   * Joined from a game's QR code: in a group without replies (where everyone is on every game,
   * but only games made after they joined), they're put on that game too. In groups that take
   * replies they say "I'm in" on the game like everyone else. Only this group's games that
   * haven't finished. Returns whether they're on it.
   */
  private async putOnGame(group: Group, playerId: string, gameId: string) {
    const game = await this.sessionsRepo.findOne({ where: { id: gameId, groupId: group.id, kind: SessionKind.GAME, status: SessionStatus.UPCOMING } });
    if (!game || String(game.date).slice(0, 10) < localDate(0)) return false;
    const on = await this.paymentsRepo.findOne({ where: { sessionId: game.id, playerId } });
    if (on) return true;
    if (group.requireRsvp) return false;
    await this.paymentsRepo.save(this.paymentsRepo.create(squadEntry(group, game.id, playerId)));
    await this.applyCredits(group.id, [playerId]);
    await this.paymentsService.recalculateSessionTotal(game.id);
    return true;
  }

  private async addToGroup(group: Group, player: Player, gameId?: string) {
    let membership = await this.membershipsRepo.findOne({
      where: { groupId: group.id, playerId: player.id },
    });
    const alreadyMember = !!membership;
    if (!membership) {
      membership = await this.membershipsRepo.save(
        this.membershipsRepo.create({ groupId: group.id, playerId: player.id, role: MemberRole.PLAYER }),
      );
      this.notifications.later(() =>
        this.notifications.notifyOrganisers(group.organizationId, {
          kind: 'member_joined',
          title: `${player.firstName} ${player.lastName} joined ${group.name}`,
          body: 'Joined with the group link.',
          url: `/squad?group=${group.id}`,
        }),
      );
    }
    await this.onMemberAdded(membership);
    const onGame = gameId ? await this.putOnGame(group, player.id, gameId) : undefined;

    return {
      alreadyMember,
      ...(gameId ? { gameId, onGame } : {}),
      firstName: player.firstName,
      paymentRef: membership.paymentRef,
      // Carries groupId too
      ...(await this.getPublicGroup(group.inviteCode)),
    };
  }

  // ── Webhook diagnostics ──

  async checkWebhookSetup(): Promise<{
    ok: boolean;
    pulseUrl: string;
    expectedUrl: string;
    events: string[];
    secretMatch: boolean;
    problems: string[];
  }> {
    if (!(this.pulse instanceof HttpPulseClient)) {
      return { ok: true, pulseUrl: '(mock)', expectedUrl: '(mock)', events: [], secretMatch: true, problems: [] };
    }

    const info = await this.pulse.getWebhookInfo();
    const accepted = webhookUrlsFor({
      appUrl: this.config.get<string>('APP_URL'),
      apiPublicUrl: this.config.get<string>('API_PUBLIC_URL'),
      railwayDomain: this.config.get<string>('RAILWAY_PUBLIC_DOMAIN'),
    });
    const urlOk = accepted.includes(normaliseWebhookUrl(info.url));
    // Prefer showing the address Pulse already uses when it's a valid one.
    const expectedUrl = urlOk ? normaliseWebhookUrl(info.url) : accepted[0];
    const ourSecretTail = (this.config.get('PULSE_WEBHOOK_SECRET', '') as string).slice(-4);
    // Webhooks are also checked against the secret Pulse just reported, so a stale
    // PULSE_WEBHOOK_SECRET no longer stops them.
    const secretMatch = (!!ourSecretTail && info.secretTail === ourSecretTail) || this.pulse.knowsPulseWebhookSecret;
    const hasTransferEvents = info.events.some((e) => e.startsWith('transfer'));

    const problems: string[] = [];
    if (!urlOk) {
      problems.push(`Webhook URL mismatch: Pulse sends to "${info.url || '(none)'}", which doesn't reach this API. Use one of: ${accepted.join(', ')}`);
    }
    if (!hasTransferEvents) problems.push(`Pulse is not sending transfer events (events: ${info.events.join(', ') || 'none'})`);
    if (!secretMatch) problems.push(`Webhook secret mismatch (Pulse ends with "${info.secretTail}", ours ends with "${ourSecretTail || '(unset)'}")`);

    return {
      ok: problems.length === 0,
      pulseUrl: info.url,
      expectedUrl,
      events: info.events,
      secretMatch,
      problems,
    };
  }

  // ── Incoming transfers ──

  async handleWebhook(rawBody: string, signature: string | undefined, payload: unknown) {
    const p = payload as Record<string, any>;
    const event = String(p?.event ?? p?.event_type ?? p?.type ?? 'unknown');
    // Every webhook is logged with what we did about it: without this, a missing or
    // mismatched setup at Pulse looks exactly like "no one paid".
    const log = (outcome: string) => this.logger.log(`Pulse webhook ${event}: ${outcome} — ${rawBody.slice(0, 500)}`);

    // Parsed before verifying only to know which account to note the outcome against.
    const credit = this.pulse.parseWebhook(payload);
    if (credit) credit.accountNumber = accountKey(credit.accountNumber);
    const note = (outcome: WebhookOutcome) => credit && this.notices.set(credit.accountNumber, { at: new Date(), outcome });

    // A miss may mean Pulse's secret changed since we last read it: re-read it once and retry.
    if (
      !this.pulse.verifyWebhook(rawBody, signature) &&
      !((await this.pulse.refreshWebhookSecret?.()) && this.pulse.verifyWebhook(rawBody, signature))
    ) {
      note('rejected');
      this.logger.warn(`Pulse webhook ${event}: rejected, signature doesn't match PULSE_WEBHOOK_SECRET or Pulse's webhook secret — ${rawBody.slice(0, 500)}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Money into one of our group accounts.
    // Compare the last 10 digits: Pulse may format the account number differently in webhooks vs account creation.
    if (credit && (await this.groupsRepo.createQueryBuilder('g')
        .where('RIGHT(g.account_number, 10) = :acct', { acct: credit.accountNumber })
        .getExists())) {
      const result = await this.recordTransfer(credit);
      note('recorded');
      log(`credit of ${credit.amount} to ${credit.accountNumber} → ${result.status}${'duplicate' in result ? ' (duplicate)' : ''}`);
      return result;
    }

    // Money into a competition collection account.
    if (credit) {
      const comp = await this.competitionsRepo.createQueryBuilder('c')
        .where('RIGHT(c.account_number, 10) = :acct', { acct: credit.accountNumber })
        .getOne();
      if (comp) {
        // Recorded first, so a retried webhook is a duplicate and can't count twice towards the fee.
        const result = await this.recordTransfer(credit);
        note('recorded');
        if (!('duplicate' in result)) await this.confirmTeamIfPaid(comp, credit, log);
        log(`competition credit of ${credit.amount} to ${credit.accountNumber} → ${result.status}`);
        return result;
      }
    }

    // Otherwise it may be news about one of our payouts, matched by reference.
    const ref = p?.data?.reference as string | undefined;
    if (ref && /completed|failed|success/.test(event) && (await this.payoutsRepo.exists({ where: { providerReference: ref } }))) {
      const status = /fail/.test(event) ? ('failed' as const) : ('completed' as const);
      await this.handlePayoutWebhook(ref, status, p.data?.error_message ?? p.data?.errorMessage);
      log(`payout ${ref} → ${status}`);
      return { received: true, payout: true };
    }

    // A credit to an account that isn't a group's: keep it as unmatched so it isn't lost.
    if (credit) {
      const result = await this.recordTransfer(credit);
      log(`credit to unknown account ${credit.accountNumber}, kept as ${result.status}`);
      return result;
    }

    log('ignored');
    return { received: true, ignored: true };
  }

  /**
   * A team's registration is confirmed once everything sent with its CP code covers the entry fee:
   * a part payment waits for the rest, and money set aside doesn't count.
   */
  private async confirmTeamIfPaid(comp: Competition, credit: IncomingTransfer, log: (outcome: string) => void) {
    const refMatch = credit.narration?.toUpperCase().match(/CP([A-F0-9]{8})/);
    if (!refMatch) return;
    const paymentRef = `CP${refMatch[1]}`;
    const team = await this.competitionTeamsRepo.findOne({ where: { competitionId: comp.id, paymentRef } });
    if (!team || team.registrationStatus === TeamRegistrationStatus.CONFIRMED) return;
    const { total } = await this.transfersRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.accountNumber = :acct', { acct: credit.accountNumber })
      .andWhere('UPPER(t.narration) LIKE :ref', { ref: `%${paymentRef}%` })
      .andWhere('t.status != :ignored', { ignored: TransferStatus.IGNORED })
      .getRawOne();
    const fee = Number(comp.entryFee);
    if (Number(total) + 0.001 < fee) {
      log(`competition payment: ${paymentRef} has ${total} of ${fee} for ${comp.name}, not confirmed yet`);
      return;
    }
    team.registrationStatus = TeamRegistrationStatus.CONFIRMED;
    team.paidAt = new Date();
    await this.competitionTeamsRepo.save(team);
    log(`competition payment: ${paymentRef} confirmed for ${comp.name}`);
  }

  async recordTransfer(incoming: IncomingTransfer) {
    // Idempotent: providers retry webhooks.
    const seen = await this.transfersRepo.findOne({
      where: { providerTransactionId: incoming.providerTransactionId },
    });
    if (seen) return { received: true, duplicate: true, status: seen.status };

    // Saved exactly as the bank reports it: that is what the player sent and what the account
    // holds. (A ₦25 "fee" used to be added back on top, which gave every payer a ₦25 credit
    // nobody paid and put the balance above the real account; see migration NoFeeAddBack.)

    const group = await this.groupsRepo.createQueryBuilder('g')
      .where('RIGHT(g.account_number, 10) = :acct', { acct: incoming.accountNumber })
      .getOne();
    // The bank's own report of a transfer the organiser already added by hand: it confirms that
    // one instead of being counted again.
    if (group) {
      const twin = await this.handTypedTwin(group.id, incoming);
      if (twin) return { received: true, status: twin.status, confirmed: twin.id };
    }
    const transfer = await this.transfersRepo.save(
      this.transfersRepo.create({
        providerTransactionId: incoming.providerTransactionId,
        groupId: group?.id,
        accountNumber: incoming.accountNumber,
        amount: incoming.amount,
        senderName: incoming.senderName,
        senderAccount: normaliseAccount(incoming.senderAccount),
        narration: incoming.narration,
        receivedAt: incoming.receivedAt,
        raw: incoming.raw as object,
        status: TransferStatus.UNMATCHED,
      }),
    );
    if (!group) {
      this.logger.warn(`Transfer ${incoming.providerTransactionId} to unknown account ${incoming.accountNumber}`);
      return { received: true, status: transfer.status };
    }
    const sender = payerNameFrom(incoming.senderName, incoming.narration);
    const notifyUnmatched = () =>
      this.notifications.later(() =>
        this.notifications.notifyOrganisers(group.organizationId, {
          kind: 'transfer_unmatched',
          title: `${naira(incoming.amount)} came in with no name`,
          body: `Into ${group.name}${sender ? `, from ${sender}` : ''}. Tap to choose who sent it.`,
          url: `/money?group=${group.id}&show=unnamed`,
        }),
      );

    await this.ensureCurrentPeriod(group);
    const playerId = await this.identifyPayer(group.id, incoming);
    if (playerId) {
      // Known sender: it's theirs even if it's less than a due — it goes to their credit.
      await this.settleTransfer(transfer, playerId, TransferStatus.MATCHED);
    }
    // No reference or name: it waits for the organiser, even if a player said they'd sent this
    // amount. "I've paid" is only a word from the player, and anyone in the group could say it
    // first, so it shows as a suggestion on the transfer and never moves money by itself.
    if (transfer.status === TransferStatus.UNMATCHED) notifyUnmatched();
    return { received: true, status: transfer.status };
  }

  // ── "Yes, I've paid": pairing transfers with players' confirmations ──

  /**
   * Gives an unmatched transfer to a player, all or nothing, in one transaction: the status flips
   * (only while it's still unmatched, so callers racing can't give it twice), `pay` is paid first
   * when the organiser picked that due and the money covers it, the rest goes through their credit
   * to their oldest dues, the transfer records what it paid, and their "I've paid" for it closes
   * (`claimId`, or the one that fits). Receipts and session totals follow once it's committed.
   */
  private async settleTransfer(
    transfer: BankTransfer,
    playerId: string,
    status: TransferStatus,
    opts: { claimId?: string; pay?: Payment } = {},
  ): Promise<boolean> {
    // Typed in by the organiser, not reported by the bank: what it pays says so until the bank confirms it
    const byHand = transfer.providerTransactionId?.startsWith(MANUAL_PREFIX) ?? false;
    const paidBy = byHand ? 'hand' : 'pulse';
    const result = await this.transfersRepo.manager.transaction(async (tx) => {
      const { affected } = await tx.update(BankTransfer, { id: transfer.id, status: TransferStatus.UNMATCHED }, { status, playerId });
      if (!affected) return null;
      let amount = Number(transfer.amount);
      const settled: Payment[] = [];
      // Games marked paid by hand because they said they'd transfer: this money is that transfer,
      // so it confirms them rather than paying another game (unless the organiser picked a due).
      const confirmed = opts.pay ? [] : await this.confirmHandMarked(tx, transfer.groupId, playerId, amount, paidBy);
      amount -= confirmed.reduce((sum, p) => sum + Number(p.amount), 0);
      if (opts.pay && amount + 0.001 >= Number(opts.pay.amount)) {
        const now = new Date();
        const done = await tx.update(
          Payment,
          { id: opts.pay.id, status: PaymentStatus.PENDING },
          { status: PaymentStatus.PAID, paidAt: now, source: 'transfer', markedBy: paidBy },
        );
        if (done.affected) {
          settled.push(Object.assign(opts.pay, { status: PaymentStatus.PAID, paidAt: now, source: 'transfer', markedBy: paidBy }));
          amount -= Number(opts.pay.amount);
        }
      }
      settled.push(...(await this.creditIn(tx, transfer.groupId, playerId, amount, paidBy)).settled);

      transfer.status = status;
      transfer.playerId = playerId;
      transfer.paymentId = confirmed[0]?.id ?? settled[0]?.id ?? (null as unknown as string);
      // Prepend the player's PA reference so admins always see it in the narration.
      const ref = (await tx.findOne(GroupMembership, { where: { groupId: transfer.groupId, playerId } }))?.paymentRef;
      if (ref && !transfer.narration?.includes(ref)) {
        transfer.narration = ref + (transfer.narration ? ` ${transfer.narration}` : '');
      }
      await tx.save(transfer);
      await this.closeClaimIn(tx, transfer, playerId, opts.claimId);
      return { settled, confirmed };
    });
    if (!result) return false;
    // Games it paid get a receipt. Ones it confirmed were told "marked as paid" before: the bank's
    // money arriving is news ("We got your ₦1,500"); another hand-typed entry isn't.
    await this.afterPaid(byHand ? result.settled : [...result.confirmed, ...result.settled], byHand ? 'manual' : 'transfer');
    if (byHand) for (const sessionId of new Set(result.confirmed.map((p) => p.sessionId))) await this.paymentsService.recalculateSessionTotal(sessionId);
    return true;
  }

  /**
   * A player's games marked paid by hand (source 'manual': they said they'd paid, not cash) in the
   * last CONFIRM_WINDOW_MS, oldest first, while this money covers each whole one: they become paid
   * by this transfer. What's left of the money goes on as usual.
   */
  private async confirmHandMarked(tx: EntityManager, groupId: string, playerId: string, amount: number, paidBy: string): Promise<Payment[]> {
    const marked = await tx
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .where('session.groupId = :groupId', { groupId })
      .andWhere('payment.playerId = :playerId', { playerId })
      .andWhere('payment.status = :paid', { paid: PaymentStatus.PAID })
      // Marked paid by hand, or on a receipt: both wait for this money
      .andWhere("payment.source IN ('manual', 'receipt')")
      .andWhere('payment.paidAt >= :since', { since: new Date(Date.now() - CONFIRM_WINDOW_MS) })
      .orderBy('session.date', 'ASC')
      .getMany();
    const confirmed: Payment[] = [];
    let left = amount;
    for (const p of marked) {
      if (left + 0.001 < Number(p.amount)) break;
      // Only while it's still waiting: two transfers arriving together can't both confirm it
      const { affected } = await tx.update(Payment, { id: p.id, status: PaymentStatus.PAID, source: p.source as string }, { source: 'transfer', markedBy: paidBy });
      if (!affected) continue;
      left -= Number(p.amount);
      confirmed.push(Object.assign(p, { source: 'transfer', markedBy: paidBy }));
    }
    return confirmed;
  }

  /**
   * A transfer the organiser typed in ("Transfer missing? Add it") that this bank report is: same
   * group, same amount, within TWIN_WINDOW_MS, and the bank report names the same player (their
   * code or name). It takes the bank's details and stops being "by hand"; what it paid is now
   * paid by the bank. A bank report that names nobody is never assumed to be the same money:
   * two people send ₦5,000 all the time, so it waits for the organiser like any other.
   */
  private async handTypedTwin(groupId: string, incoming: IncomingTransfer): Promise<BankTransfer | null> {
    const payer = await this.identifyPayer(groupId, incoming);
    if (!payer) return null;
    const twins = await this.transfersRepo
      .createQueryBuilder('t')
      .where('t.groupId = :groupId', { groupId })
      .andWhere('LEFT(t.providerTransactionId, :n) = :manual', { n: MANUAL_PREFIX.length, manual: MANUAL_PREFIX })
      .andWhere('t.playerId = :payer', { payer })
      .andWhere('ABS(t.amount - :amount) < 0.01', { amount: incoming.amount })
      .andWhere('t.receivedAt >= :since', { since: new Date(new Date(incoming.receivedAt).getTime() - TWIN_WINDOW_MS) })
      .andWhere('t.status IN (:...placed)', { placed: [TransferStatus.MATCHED, TransferStatus.ASSIGNED] })
      .orderBy('t.receivedAt', 'ASC')
      .getMany();
    const twin = twins[0];
    if (!twin) return null;
    await this.transfersRepo.manager.transaction(async (tx) => {
      await tx.update(BankTransfer, { id: twin.id }, {
        providerTransactionId: incoming.providerTransactionId,
        senderName: incoming.senderName ?? twin.senderName,
        senderAccount: normaliseAccount(incoming.senderAccount) ?? twin.senderAccount,
        raw: { ...(incoming.raw as object), confirmedHandTyped: twin.providerTransactionId } as object,
      });
      // What it paid was "added by hand": now the bank has confirmed it
      const byHand = await tx
        .getRepository(Payment)
        .createQueryBuilder('payment')
        .innerJoin('payment.session', 'session')
        .where('session.groupId = :groupId', { groupId })
        .andWhere('payment.playerId = :payer', { payer })
        .andWhere("payment.markedBy = 'hand'")
        .andWhere("payment.source = 'transfer'")
        // Only what this hand-typed transfer paid: saved when it was typed in
        .andWhere('payment.paidAt BETWEEN :from AND :to', {
          from: new Date(new Date(twin.receivedAt).getTime() - 10 * 60_000),
          to: new Date(new Date(twin.receivedAt).getTime() + 10 * 60_000),
        })
        .getMany();
      if (byHand.length) await tx.save(byHand.map((x) => Object.assign(x, { markedBy: 'pulse' })));
    });
    this.logger.log(`Transfer ${incoming.providerTransactionId} confirmed hand-typed ${twin.providerTransactionId}`);
    return twin;
  }

  /**
   * A transfer went to a player (their reference, their name, their account, or the organiser's
   * pick): their "I've paid" for it is answered, so it stops showing as a suggestion elsewhere.
   * `claimId` when a particular one was paired; otherwise their earliest that fits.
   */
  private async closeClaimIn(tx: EntityManager, transfer: BankTransfer, playerId: string, claimId?: string) {
    let id = claimId;
    if (!id) {
      const pending = await tx.find(PaymentClaim, { where: { groupId: transfer.groupId, playerId, status: ClaimStatus.PENDING } });
      id = claimSettledBy(transfer, playerId, pending)?.id;
    }
    if (id) await tx.update(PaymentClaim, { id, status: ClaimStatus.PENDING }, { status: ClaimStatus.MATCHED, transferId: transfer.id });
  }


  /**
   * A player tapped "Yes, I've paid". If a transfer already came in and was matched to them (their
   * reference, name or account), the claim is answered by it. Otherwise it waits: their reference or
   * name will match it when it lands, or the organiser sees "said they've paid" on the transfer and
   * confirms. A claim alone never takes an unmatched transfer, since anyone could tap it first.
   */
  async claimPayment(groupId: string, playerId: string, amount: number, receipt?: string): Promise<{ status: 'matched' | 'waiting'; owes: number }> {
    if (!(amount > 0)) throw new BadRequestException('Enter the amount you sent');
    // Checked before anything is saved: a bad picture doesn't leave a claim behind
    const picture = receipt ? parseReceipt(receipt) : null;
    // A second tap for the same payment reuses the first rather than looking like two.
    const recent = await this.claimsRepo.findOne({
      where: { groupId, playerId, status: ClaimStatus.PENDING, createdAt: MoreThanOrEqual(new Date(Date.now() - CLAIM_WINDOW_MS)) },
      order: { createdAt: 'DESC' },
    });
    const again = !!recent && Math.abs(Number(recent.amount) - amount) <= AMOUNT_TOLERANCE;
    const claim = again ? recent! : await this.claimsRepo.save(this.claimsRepo.create({ groupId, playerId, amount }));
    // The screenshot, kept privately with the claim (a second one replaces the first)
    if (picture && this.receiptsRepo) {
      const saved = await this.receiptsRepo.save(this.receiptsRepo.create({ groupId, playerId, data: picture.data, mime: picture.mime }));
      if (claim.receiptId) await this.receiptsRepo.delete({ id: claim.receiptId });
      claim.receiptId = saved.id;
      await this.claimsRepo.update({ id: claim.id }, { receiptId: saved.id });
      // Old receipts go after RECEIPT_KEEP_DAYS: the money has long been sorted
      await this.receiptsRepo.delete({ createdAt: LessThan(new Date(Date.now() - RECEIPT_KEEP_DAYS * 86_400_000)) });
    }

    const theirs = await this.transfersRepo.find({
      where: {
        groupId,
        playerId,
        status: In([TransferStatus.MATCHED, TransferStatus.ASSIGNED]),
        receivedAt: MoreThanOrEqual(new Date(claim.createdAt.getTime() - CLAIM_WINDOW_MS)),
      },
    });
    const answered = await this.claimsRepo.find({ where: { groupId, playerId, status: ClaimStatus.MATCHED } });
    const used = new Set(answered.map((c) => c.transferId));
    const transfer = theirs.find((t) => !used.has(t.id) && couldPair(claim, t));
    if (transfer) {
      const { affected } = await this.claimsRepo.update(
        { id: claim.id, status: ClaimStatus.PENDING },
        { status: ClaimStatus.MATCHED, transferId: transfer.id },
      );
      // Matched isn't "all paid": a part payment still leaves something to pay, and the player is told so
      if (affected) return { status: 'matched', owes: await this.owesNow(groupId, playerId) };
    }
    // Waiting: the organiser gets it on "To check" (once per claim, and again when a receipt is added)
    if (!again || picture) this.notifications.later(() => this.tellOrganisersToCheck(groupId, playerId, amount, !!claim.receiptId));
    return { status: 'waiting', owes: await this.owesNow(groupId, playerId) };
  }

  private async tellOrganisersToCheck(groupId: string, playerId: string, amount: number, receipt: boolean) {
    const [group, player] = await Promise.all([this.groupsRepo.findOne({ where: { id: groupId } }), this.playersRepo.findOne({ where: { id: playerId } })]);
    if (!group || !player) return;
    await this.notifications.notifyOrganisers(group.organizationId, {
      kind: 'claim_to_check',
      title: `${player.firstName} says they sent ${naira(amount)}`,
      body: `${group.name}${receipt ? ' · receipt attached' : ''}. Tap to check.`,
      url: `/money?group=${group.id}`,
    });
  }

  // ── "To check": players who say they've paid, for the organiser to confirm or turn down ──

  /**
   * What the organiser has to check in a group: each "I've paid" still waiting (newest first), with
   * its receipt and the one unnamed transfer that fits it, if there is exactly one; and games
   * confirmed on a receipt more than RECEIPT_RECHECK_MS ago that the bank still hasn't confirmed.
   */
  async toCheck(groupId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    const [claims, unmatched, onReceipt] = await Promise.all([
      this.claimsRepo.find({
        where: { groupId, status: ClaimStatus.PENDING, createdAt: MoreThanOrEqual(new Date(Date.now() - CLAIM_EXPIRES_MS)) },
        relations: ['player'],
        order: { createdAt: 'DESC' },
      }),
      this.transfersRepo.find({ where: { groupId, status: TransferStatus.UNMATCHED }, order: { receivedAt: 'DESC' }, take: 200 }),
      this.paymentsRepo
        .createQueryBuilder('payment')
        .innerJoinAndSelect('payment.session', 'session')
        .innerJoinAndSelect('payment.player', 'player')
        .where('session.groupId = :groupId', { groupId })
        .andWhere('payment.status = :paid', { paid: PaymentStatus.PAID })
        .andWhere("payment.source = 'receipt'")
        .andWhere('payment.paidAt < :before', { before: new Date(Date.now() - RECEIPT_RECHECK_MS) })
        .orderBy('payment.paidAt', 'ASC')
        .getMany(),
    ]);
    const who = (p: Player) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, nickname: p.nickname ?? null, photoKey: p.photoKey ?? null });
    return {
      claims: claims.map((c) => {
        const fits = unmatched.filter((t) => couldPair(c, t));
        const t = fits.length === 1 ? fits[0] : null;
        return {
          id: c.id,
          player: who(c.player),
          amount: Number(c.amount),
          createdAt: c.createdAt,
          hasReceipt: !!c.receiptId,
          // The bank transfer it's probably about: Confirm gives it to them
          transfer: t ? { id: t.id, amount: Number(t.amount), senderName: payerNameFrom(t.senderName, t.narration), receivedAt: t.receivedAt } : null,
        };
      }),
      onReceipt: onReceipt.map((p) => ({
        paymentId: p.id,
        player: who(p.player),
        amount: Number(p.amount),
        date: p.session.date,
        label: p.session.label ?? null,
        paidAt: p.paidAt,
        markedBy: p.markedBy,
      })),
    };
  }

  /** A claim in one of the organiser's groups, still waiting. */
  private async ownClaim(claimId: string, organizationId: string) {
    const claim = await this.claimsRepo.findOne({ where: { id: claimId }, relations: ['player'] });
    if (!claim) throw new NotFoundException('That payment isn’t waiting any more');
    await this.findGroup(claim.groupId, organizationId);
    return claim;
  }

  /**
   * Confirm a player's "I've paid". With exactly one unnamed transfer that fits, that transfer is
   * theirs (the bank has the money). Otherwise it's paid on the receipt: their oldest games the
   * amount covers are marked paid ('receipt'), and the bank's transfer confirms them when it lands
   * (confirmHandMarked); if it hasn't in RECEIPT_RECHECK_MS, it's back on "To check".
   */
  async confirmClaim(claimId: string, organizationId: string, decidedBy: string) {
    const claim = await this.ownClaim(claimId, organizationId);
    if (claim.status !== ClaimStatus.PENDING) throw new BadRequestException('Someone already answered this one');
    const fits = (await this.transfersRepo.find({ where: { groupId: claim.groupId, status: TransferStatus.UNMATCHED } })).filter((t) => couldPair(claim, t));
    if (fits.length === 1) {
      await this.acceptClaim(fits[0].id, claim.id, organizationId);
      return { how: 'transfer' as const, paid: 1 };
    }
    const paid = await this.paymentsRepo.manager.transaction(async (tx) => {
      const { affected } = await tx.update(PaymentClaim, { id: claim.id, status: ClaimStatus.PENDING }, { status: ClaimStatus.CONFIRMED, decidedBy, decidedAt: new Date() });
      if (!affected) return null;
      const dues = await this.payableDues(tx, claim.groupId, claim.playerId);
      let left = Number(claim.amount) + AMOUNT_TOLERANCE;
      const marked: Payment[] = [];
      for (const p of dues) {
        if (left + 0.001 < Number(p.amount)) break;
        const done = await tx.update(Payment, { id: p.id, status: PaymentStatus.PENDING }, { status: PaymentStatus.PAID, paidAt: new Date(), source: 'receipt', markedBy: decidedBy });
        if (!done.affected) continue;
        left -= Number(p.amount);
        marked.push(p);
      }
      if (dues.length && !marked.length) {
        throw new BadRequestException(`${naira(Number(claim.amount))} doesn’t cover a whole game (${naira(Number(dues[0].amount))}). Wait for the transfer, or mark the game paid on its page.`);
      }
      return marked;
    });
    if (!paid) throw new BadRequestException('Someone already answered this one');
    await this.afterPaid(paid, 'manual');
    return { how: 'receipt' as const, paid: paid.length };
  }

  /** "Not received": the organiser couldn't find the money. The player is told, with what they said. */
  async rejectClaim(claimId: string, organizationId: string, decidedBy: string, note?: string) {
    const claim = await this.ownClaim(claimId, organizationId);
    const { affected } = await this.claimsRepo.update(
      { id: claim.id, status: ClaimStatus.PENDING },
      { status: ClaimStatus.REJECTED, decidedBy, decidedAt: new Date(), note: note?.trim().slice(0, 200) || null },
    );
    if (!affected) throw new BadRequestException('Someone already answered this one');
    const group = await this.groupsRepo.findOne({ where: { id: claim.groupId } });
    await this.notifications.notifyPlayers([claim.playerId], {
      kind: 'claim_rejected',
      title: `Your ${naira(Number(claim.amount))} hasn’t been found yet`,
      body: `${group?.name ?? 'Your group'}: ${note?.trim() || 'check the account number and send it again, or talk to your organiser.'}`,
      url: '/me/pay',
      critical: true,
    });
    return { status: 'rejected' as const };
  }

  /** A receipt, for an organiser of its group or (playerIds) the player who sent it. */
  async receiptImage(claimId: string, access: { organizationId?: string; playerIds?: string[] }) {
    const claim = await this.claimsRepo.findOne({ where: { id: claimId } });
    if (!claim?.receiptId || !this.receiptsRepo) throw new NotFoundException('No receipt');
    if (access.organizationId) await this.findGroup(claim.groupId, access.organizationId);
    else if (!access.playerIds?.includes(claim.playerId)) throw new NotFoundException('No receipt');
    const r = await this.receiptsRepo.createQueryBuilder('r').addSelect('r.data').where('r.id = :id', { id: claim.receiptId }).getOne();
    if (!r) throw new NotFoundException('No receipt');
    return r;
  }

  /** Their latest "I've paid" in a group, while it's news: waiting, or answered in the last 3 days. */
  async latestClaim(groupId: string, playerId: string) {
    const c = await this.claimsRepo.findOne({ where: { groupId, playerId }, order: { createdAt: 'DESC' } });
    if (!c) return null;
    const fresh = c.status === ClaimStatus.PENDING ? Date.now() - c.createdAt.getTime() < CLAIM_EXPIRES_MS : !!c.decidedAt && Date.now() - c.decidedAt.getTime() < RECEIPT_RECHECK_MS;
    if (!fresh || c.status === ClaimStatus.MATCHED) return null;
    return { id: c.id, amount: Number(c.amount), status: c.status, createdAt: c.createdAt, hasReceipt: !!c.receiptId, note: c.note, decidedBy: c.decidedBy };
  }

  /** "Still no transfer" on a game confirmed on a receipt: back to owed, or the organiser vouches for it. */
  async recheckReceiptPaid(paymentId: string, organizationId: string, keep: boolean) {
    const p = await this.paymentsRepo.findOne({ where: { id: paymentId }, relations: ['session'] });
    if (!p || p.source !== 'receipt') throw new NotFoundException('That payment isn’t waiting any more');
    await this.findGroup(p.session.groupId, organizationId);
    if (keep) await this.paymentsRepo.update({ id: p.id, source: 'receipt' }, { source: 'manual' });
    else await this.paymentsRepo.update({ id: p.id, source: 'receipt' }, { status: PaymentStatus.PENDING, paidAt: null, source: null, markedBy: null });
    await this.paymentsService.recalculateSessionTotal(p.sessionId);
    return { ok: true };
  }

  /** What a member still has to pay now (played games and their next one), less what they've already sent towards it. */
  private async owesNow(groupId: string, playerId: string) {
    const dues = await this.payableDues(this.paymentsRepo.manager, groupId, playerId);
    const credit = Number((await this.membershipsRepo.findOne({ where: { groupId, playerId } }))?.credit ?? 0);
    return Math.max(0, Math.round((dues.reduce((sum, p) => sum + Number(p.amount), 0) - credit) * 100) / 100);
  }

  /**
   * The organiser gives an unmatched transfer to a member, whether or not they owe anything.
   * Same rule as everywhere else: it pays their oldest unpaid games while it covers a whole one,
   * and the rest is kept for their next game (credit).
   */
  async giveTransfer(transferId: string, playerId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    if (transfer.status !== TransferStatus.UNMATCHED) {
      throw new BadRequestException('Someone else already sorted this payment.');
    }
    const member = await this.membershipsRepo.findOne({ where: { groupId: transfer.groupId, playerId } });
    if (!member) throw new NotFoundException("That player isn't in this group");
    if (!(await this.settleTransfer(transfer, playerId, TransferStatus.ASSIGNED))) {
      throw new BadRequestException('Someone else already sorted this payment.');
    }
    return transfer;
  }

  /** What every member still owes in a group, oldest game first (cancelled games and ₦0 entries left out). */
  async listOwed(groupId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    const owed = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .where('session.groupId = :groupId', { groupId })
      .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
      .andWhere('payment.amount > 0')
      .orderBy('session.date', 'ASC')
      .getMany();
    return owed.map((p) => ({
      paymentId: p.id,
      playerId: p.playerId,
      amount: Number(p.amount),
      sessionId: p.sessionId,
      date: p.session.date,
      label: p.session.label ?? null,
      kind: p.session.kind,
    }));
  }

  /** The organiser picks which player's "I've paid" an unmatched transfer belongs to. */
  async acceptClaim(transferId: string, claimId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    if (transfer.status !== TransferStatus.UNMATCHED) {
      throw new BadRequestException('This transfer has already been handled');
    }
    const claim = await this.claimsRepo.findOne({
      where: { id: claimId, groupId: transfer.groupId, status: ClaimStatus.PENDING },
    });
    if (!claim) throw new NotFoundException('That confirmation has already been used');
    if (!(await this.settleTransfer(transfer, claim.playerId, TransferStatus.ASSIGNED, { claimId: claim.id }))) {
      throw new BadRequestException('Someone else already sorted this payment.');
    }
    return { status: transfer.status };
  }



  /** Reference in the narration wins; otherwise a unique full-name match on the sender. */
  private async identifyPayer(groupId: string, t: IncomingTransfer): Promise<string | null> {
    const memberships = await this.membershipsRepo.find({ where: { groupId }, relations: ['player'] });
    return whoSent(
      memberships.map((m) => ({ playerId: m.playerId, paymentRef: m.paymentRef, firstName: m.player.firstName, lastName: m.player.lastName })),
      t.senderName,
      t.narration,
      await this.accountOwner(groupId, normaliseAccount(t.senderAccount)),
    );
  }

  /** The one player an account has paid for in this group before, if it has only ever paid for one. */
  private async accountOwner(groupId: string, account: string | null): Promise<string | null> {
    if (!account) return null;
    const rows: { playerId: string }[] = await this.transfersRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.playerId', 'playerId')
      .where('t.groupId = :groupId', { groupId })
      .andWhere('t.senderAccount = :account', { account })
      .andWhere('t.playerId IS NOT NULL')
      .andWhere('t.status IN (:...placed)', { placed: [TransferStatus.MATCHED, TransferStatus.ASSIGNED] })
      .getRawMany();
    return rows.length === 1 ? rows[0].playerId : null;
  }



  /**
   * Money that's come in for a member (`amount`, 0 to just use what they have kept): it pays
   * their oldest unpaid dues while it covers a whole one. Only games already played (or today)
   * and their one next game, never games further ahead. What's left:
   * - while one of those dues is still unpaid, it's a part payment towards it and stays as
   *   credit (₦198 toward ₦1,000 waits; a later ₦802 completes it);
   * - otherwise the new money is more than they owed (for a friend, a wrong amount, or ahead)
   *   and goes to `extra`, which is never used until the organiser sorts it.
   *
   * The member's row is locked for the duration, so two transfers arriving together can't
   * spend the same money twice.
   */
  async applyCredit(groupId: string, playerId: string, amount = 0): Promise<{ settled: Payment[]; credit: number }> {
    const result = await this.membershipsRepo.manager.transaction((tx) => this.creditIn(tx, groupId, playerId, amount));
    await this.afterPaid(result.settled);
    return result;
  }

  /** A member's unpaid dues that money can pay now: played games (or today's), and their one next game. */
  private async payableDues(tx: EntityManager, groupId: string, playerId: string) {
    const pending = await tx
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.session', 'session')
      .where('session.groupId = :groupId', { groupId })
      .andWhere('payment.playerId = :playerId', { playerId })
      .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
      .orderBy('session.date', 'ASC')
      .getMany();
    return payableNow(pending, localDate());
  }

  /** applyCredit's work inside a caller's transaction; the caller runs afterPaid once it commits. */
  private async creditIn(tx: EntityManager, groupId: string, playerId: string, amount: number, paidBy = 'pulse'): Promise<{ settled: Payment[]; credit: number; extra: number }> {
    const membership = await tx.findOne(GroupMembership, {
      where: { groupId, playerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!membership) return { settled: [] as Payment[], credit: 0, extra: 0 };

    let pool = Number(membership.credit) + amount;
    const payable = await this.payableDues(tx, groupId, playerId);

    const settled: Payment[] = [];
    // Money sent earlier is used first. A due paid wholly from it was paid ahead ('credit'), not
    // by the transfer that just came in ('pulse'): the game page says so, so nobody looks like
    // they paid for this game when they paid weeks ago.
    let earlier = Number(membership.credit);
    const ahead = new Set<Payment>();
    for (const p of payable) {
      if (pool + 0.001 < Number(p.amount)) break;
      pool -= Number(p.amount);
      const fromEarlier = Math.min(earlier, Number(p.amount));
      earlier -= fromEarlier;
      if (fromEarlier + 0.001 >= Number(p.amount)) ahead.add(p);
      settled.push(p);
    }
    const now = new Date();
    for (const p of settled) {
      p.status = PaymentStatus.PAID;
      p.paidAt = now;
      p.source = 'transfer';
      p.markedBy = ahead.has(p) ? 'credit' : paidBy;
    }
    if (settled.length) await tx.save(settled);
    // Nothing left that this money can pay now: the new money left over is extra, to sort.
    const owesNow = settled.length < payable.length;
    const extra = owesNow ? 0 : Math.min(amount, Math.max(0, pool));
    membership.credit = (pool - extra).toFixed(2);
    if (extra > 0.001) membership.extra = (Number(membership.extra ?? 0) + extra).toFixed(2);
    await tx.save(membership);
    return { settled, credit: Number(membership.credit), extra };
  }

  /**
   * A game being cancelled or deleted (call after the change is saved): what members paid for
   * it by transfer goes back to them as extra to sort; it never pays another game by itself.
   * With `reopen` the game's dues go back to pending, so un-cancelling it can pay them again
   * (see repayCalledOff).
   */
  async releaseTransferDues(session: Pick<Session, 'groupId' | 'payments'>, { reopen }: { reopen: boolean }) {
    const payments = session.payments ?? [];
    // Marked paid by hand on top of a part payment: the transfer part goes back too, and the due
    // reopens with the others, so bringing the game back asks for it again from what they've sent.
    const partFromTransfers = new Set(payments.filter((p) => p.status === PaymentStatus.PAID && !paidByTransfer(p) && Number(p.fromCredit ?? 0) > 0).map((p) => p.id));
    const credited = await releaseToExtra(this.paymentsRepo.manager, session.groupId, payments);
    if (!credited.length) return;
    if (reopen) {
      const reopened = payments.filter((p) => (paidByTransfer(p) || partFromTransfers.has(p.id)) && credited.includes(p.playerId));
      for (const p of reopened) {
        p.status = PaymentStatus.PENDING;
        p.paidAt = null as unknown as Date;
        p.source = null as unknown as string;
        p.markedBy = null as unknown as string;
      }
      if (reopened.length) {
        await this.paymentsRepo.save(reopened);
        await this.paymentsService.recalculateSessionTotal(reopened[0].sessionId);
      }
    }
    await this.applyCredits(session.groupId, credited);
  }

  /**
   * A called-off game back on: each player's due is paid again from the extra its money went
   * to when it was called off, if that money is still there (not sorted since). Nothing else.
   */
  async repayCalledOff(session: Pick<Session, 'groupId' | 'payments'>) {
    const open = (session.payments ?? []).filter((p) => p.status === PaymentStatus.PENDING && Number(p.amount) > 0);
    if (!open.length) return;
    const settled = await this.membershipsRepo.manager.transaction(async (tx) => {
      const paid: Payment[] = [];
      for (const p of open) {
        const m = await tx.findOne(GroupMembership, { where: { groupId: session.groupId, playerId: p.playerId }, lock: { mode: 'pessimistic_write' } });
        if (!m || Number(m.extra ?? 0) + 0.001 < Number(p.amount)) continue;
        m.extra = (Number(m.extra) - Number(p.amount)).toFixed(2);
        await tx.save(m);
        p.status = PaymentStatus.PAID;
        p.paidAt = new Date();
        p.source = 'transfer';
        p.markedBy = 'pulse';
        paid.push(p);
      }
      if (paid.length) await tx.save(paid);
      return paid;
    });
    if (settled.length) await this.paymentsService.recalculateSessionTotal(settled[0].sessionId);
  }

  /** Money that has come into the club's group accounts, whether or not it has paid a due yet. */
  async totalReceivedByOrganization(organizationId: string): Promise<number> {
    const { total } = await this.transfersRepo
      .createQueryBuilder('t')
      .innerJoin('t.group', 'g')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('g.organizationId = :organizationId', { organizationId })
      .andWhere('t.status != :ignored', { ignored: TransferStatus.IGNORED })
      .getRawOne();
    return Number(total);
  }

  /** Dues just created for these members: pay them from any credit they already have. */
  async applyCredits(groupId: string, playerIds: string[]) {
    const withCredit = await this.membershipsRepo
      .createQueryBuilder('m')
      .where('m.groupId = :groupId', { groupId })
      .andWhere('m.playerId IN (:...playerIds)', { playerIds: playerIds.length ? playerIds : [null] })
      .andWhere('m.credit > 0')
      .getMany();
    for (const m of withCredit) await this.applyCredit(groupId, m.playerId);
  }

  /** Every member with credit, in every group: catches dues created anywhere (hourly). */
  async applyAllCredits() {
    const withCredit = await this.membershipsRepo.createQueryBuilder('m').where('m.credit > 0').getMany();
    for (const m of withCredit) await this.applyCredit(m.groupId, m.playerId);
  }

  /** Session totals and receipts for dues just paid from a transfer. */
  private async afterPaid(payments: Payment[], source: 'manual' | 'transfer' = 'transfer') {
    if (!payments.length) return;
    for (const sessionId of new Set(payments.map((p) => p.sessionId))) {
      await this.paymentsService.recalculateSessionTotal(sessionId);
    }
    this.notifications.later(() => this.paymentsService.sendReceipts(payments.map((p) => p.id), source));
  }

  async listTransfers(groupId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    const relations = ['payment', 'payment.player', 'payment.session', 'player'];
    const latest = await this.transfersRepo.find({ where: { groupId }, relations, order: { receivedAt: 'DESC' }, take: 200 });
    // Every payment still waiting for a name, however old: those are the ones the organiser has to act on.
    const shown = new Set(latest.map((t) => t.id));
    const olderWaiting = (
      await this.transfersRepo.find({ where: { groupId, status: TransferStatus.UNMATCHED }, relations, order: { receivedAt: 'DESC' } })
    ).filter((t) => !shown.has(t.id));
    const transfers = [...latest, ...olderWaiting];
    if (!transfers.some((t) => t.status === TransferStatus.UNMATCHED)) return transfers;

    // Players who said "I've paid" around the time of an unmatched transfer, for the organiser to pick from.
    // Claims nobody could pair run out after a week (CLAIM_EXPIRES_MS)
    const claims = await this.claimsRepo.find({
      where: { groupId, status: ClaimStatus.PENDING, createdAt: MoreThanOrEqual(new Date(Date.now() - CLAIM_EXPIRES_MS)) },
      relations: ['player'],
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return transfers.map((t) =>
      t.status === TransferStatus.UNMATCHED
        ? {
            ...t,
            claims: claims
              .filter((c) => couldPair(c, t))
              .map((c) => ({
                id: c.id,
                amount: Number(c.amount),
                createdAt: c.createdAt,
                player: { id: c.player.id, firstName: c.player.firstName, lastName: c.player.lastName },
              })),
          }
        : t,
    );
  }

  async assignTransfer(transferId: string, paymentId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    if (transfer.status !== TransferStatus.UNMATCHED) {
      throw new BadRequestException('Someone else already sorted this payment.');
    }
    const payment = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.session', 'session')
      .where('payment.id = :paymentId', { paymentId })
      .andWhere('session.groupId = :groupId', { groupId: transfer.groupId })
      .getOne();
    if (!payment) throw new NotFoundException('Payment not found in this group');
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('That payment is not pending');
    }
    // The picked due first when the money covers it; anything over (or a shortfall) goes through their credit.
    if (!(await this.settleTransfer(transfer, payment.playerId, TransferStatus.ASSIGNED, { pay: payment }))) {
      throw new BadRequestException('Someone else already sorted this payment.');
    }
    return transfer;
  }

  async ignoreTransfer(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    const { affected } = await this.transfersRepo.update(
      { id: transfer.id, status: TransferStatus.UNMATCHED },
      { status: TransferStatus.IGNORED },
    );
    if (!affected) throw new BadRequestException('Someone else already sorted this payment.');
    transfer.status = TransferStatus.IGNORED;
    return transfer;
  }

  /**
   * Undoes "Set aside": the payment goes back to the ones with no name yet. Setting aside never
   * touched anyone's payments or credit, so nothing else changes.
   */
  async restoreTransfer(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    const { affected } = await this.transfersRepo.update(
      { id: transfer.id, status: TransferStatus.IGNORED },
      { status: TransferStatus.UNMATCHED },
    );
    if (!affected) throw new BadRequestException('This payment isn’t set aside any more.');
    transfer.status = TransferStatus.UNMATCHED;
    return transfer;
  }

  // ── Money in that isn't a player's ──

  /**
   * What marking a transfer as not a player's would undo. Money placed on a player first comes
   * off what they have kept (paid ahead); if they've already spent it, their latest games paid by
   * transfer go back to unpaid, newest first, until the amount is covered, and anything over goes
   * back to what they've kept. `tx` locks the member's row when applying.
   */
  private async notPlayerPlan(tx: EntityManager, transfer: BankTransfer, lock = false) {
    const amount = Number(transfer.amount);
    const plan = { playerId: transfer.playerId, fromExtra: 0, fromKept: 0, reopen: [] as Payment[], backToKept: 0, membership: null as GroupMembership | null };
    const placed = transfer.status === TransferStatus.MATCHED || transfer.status === TransferStatus.ASSIGNED;
    if (!placed || !transfer.playerId || !transfer.groupId) return plan;
    plan.membership = await tx.findOne(GroupMembership, {
      where: { groupId: transfer.groupId, playerId: transfer.playerId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    // Extra not sorted yet goes first, then money kept for them, then the games it paid.
    plan.fromExtra = Math.min(Number(plan.membership?.extra ?? 0), amount);
    plan.fromKept = Math.min(Number(plan.membership?.credit ?? 0), amount - plan.fromExtra);
    let rest = amount - plan.fromExtra - plan.fromKept;
    if (rest > 0.001) {
      const paid = await tx
        .getRepository(Payment)
        .createQueryBuilder('payment')
        .innerJoinAndSelect('payment.session', 'session')
        .where('session.groupId = :groupId', { groupId: transfer.groupId })
        .andWhere('payment.playerId = :playerId', { playerId: transfer.playerId })
        .andWhere('payment.status = :paid', { paid: PaymentStatus.PAID })
        .andWhere('payment.source = :transfer', { transfer: 'transfer' })
        .orderBy('session.date', 'DESC')
        .getMany();
      // The game this transfer itself paid goes back first, then the newest.
      paid.sort((a, b) => Number(b.id === transfer.paymentId) - Number(a.id === transfer.paymentId));
      for (const p of paid) {
        if (rest <= 0.001) break;
        plan.reopen.push(p);
        rest -= Number(p.amount);
      }
      // Reopening a whole game can take back more than this transfer gave: the extra stays theirs.
      if (rest < -0.001) plan.backToKept = -rest;
    }
    return plan;
  }

  /** What "Not a player payment" would change, said before the organiser confirms. */
  async notPlayerPreview(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    const plan = await this.notPlayerPlan(this.transfersRepo.manager, transfer);
    return {
      amount: Number(transfer.amount),
      playerId: plan.playerId,
      fromExtra: plan.fromExtra,
      fromKept: plan.fromKept,
      backToKept: plan.backToKept,
      reopen: plan.reopen.map((p) => ({ paymentId: p.id, sessionId: p.sessionId, date: p.session.date, label: p.session.label ?? null, kind: p.session.kind, amount: Number(p.amount) })),
    };
  }

  /**
   * Marks money in as not a player's payment: the organiser's own top-up, a sponsor, a refund or
   * other, with a note. It stays in the account and the balance, but is never anyone's dues. If
   * it had been placed on a player, that's undone as notPlayerPlan says, in one transaction.
   */
  async classifyTransfer(transferId: string, organizationId: string, input: { category: MoneyInCategory; note?: string }) {
    const transfer = await this.findTransfer(transferId, organizationId);
    const note = input.note?.trim() || null;
    if (transfer.status === TransferStatus.OTHER) {
      await this.transfersRepo.update(transfer.id, { category: input.category, note });
      return { ...transfer, category: input.category, note };
    }
    const reopened = await this.transfersRepo.manager.transaction(async (tx) => {
      const plan = await this.notPlayerPlan(tx, transfer, true);
      const { affected } = await tx.update(BankTransfer, { id: transfer.id, status: transfer.status }, {
        status: TransferStatus.OTHER,
        category: input.category,
        note,
        playerId: null,
        paymentId: null as unknown as string,
      });
      if (!affected) throw new BadRequestException('Someone else just changed this payment. Try again.');
      if (plan.membership) {
        plan.membership.extra = Math.max(0, Number(plan.membership.extra ?? 0) - plan.fromExtra).toFixed(2);
        plan.membership.credit = Math.max(0, Number(plan.membership.credit) - plan.fromKept + plan.backToKept).toFixed(2);
        await tx.save(plan.membership);
      }
      for (const p of plan.reopen) {
        await tx.update(Payment, { id: p.id, status: PaymentStatus.PAID }, {
          status: PaymentStatus.PENDING,
          paidAt: null as unknown as Date,
          source: null as unknown as string,
          markedBy: null as unknown as string,
        });
      }
      return plan.reopen;
    });
    for (const sessionId of new Set(reopened.map((p) => p.sessionId))) await this.paymentsService.recalculateSessionTotal(sessionId);
    return { ...transfer, status: TransferStatus.OTHER, category: input.category, note, playerId: null };
  }

  /** Undoes "Not a player payment": it goes back to the payments with no name yet, to match again. */
  async unclassifyTransfer(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    const { affected } = await this.transfersRepo.update(
      { id: transfer.id, status: TransferStatus.OTHER },
      { status: TransferStatus.UNMATCHED, category: null, note: null },
    );
    if (!affected) throw new BadRequestException('This payment isn’t marked as not a player’s any more.');
    return { ...transfer, status: TransferStatus.UNMATCHED, category: null, note: null };
  }

  // ── Extra money: more than a member owed, waiting for the organiser ──

  /** Members whose extra isn't sorted yet, with the transfer it last came from. */
  async listExtra(groupId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    const members = await this.membershipsRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.player', 'player')
      .where('m.groupId = :groupId', { groupId })
      .andWhere('(m.extra > 0 OR m.waiting > 0)')
      .getMany();
    return Promise.all(
      members.map(async (m) => {
        const last = await this.transfersRepo.findOne({
          where: { groupId, playerId: m.playerId, status: In([TransferStatus.MATCHED, TransferStatus.ASSIGNED]) },
          order: { receivedAt: 'DESC' },
        });
        return {
          playerId: m.playerId,
          name: `${m.player.firstName} ${m.player.lastName}`.trim(),
          nickname: m.player.nickname ?? null,
          photoKey: m.player.photoKey ?? null,
          extra: Number(m.extra),
          waiting: Number(m.waiting ?? 0),
          waitingNote: m.waitingNote ?? null,
          lastTransfer: last ? { id: last.id, amount: Number(last.amount), receivedAt: last.receivedAt } : null,
        };
      }),
    );
  }

  /**
   * What giving `fromId`'s extra to `toId` would do: as much as `toId` owes on games money can
   * pay now (played, and their next one), whole games first, any rest a part payment towards
   * the next. What isn't needed stays with `fromId`, still to sort.
   */
  private async giveExtraPlan(tx: EntityManager, groupId: string, fromId: string, toId: string, source: ExtraSource, lock = false) {
    const lockOpt = lock ? { lock: { mode: 'pessimistic_write' as const } } : {};
    // Always lock in the same order, so two sorts at once can't deadlock.
    const [first, second] = [fromId, toId].sort();
    const a = await tx.findOne(GroupMembership, { where: { groupId, playerId: first }, ...lockOpt });
    const b = await tx.findOne(GroupMembership, { where: { groupId, playerId: second }, ...lockOpt });
    const from = first === fromId ? a : b;
    const to = first === fromId ? b : a;
    if (!from || !to) throw new NotFoundException("That player isn't in this group");
    const extra = Number(from[source] ?? 0);
    const payable = await this.payableDues(tx, groupId, toId);
    const kept = Number(to.credit);
    const owed = Math.max(0, payable.reduce((n, p) => n + Number(p.amount), 0) - kept);
    const move = Math.min(extra, owed);
    let pool = kept + move;
    const pays: Payment[] = [];
    for (const p of payable) {
      if (pool + 0.001 < Number(p.amount)) break;
      pool -= Number(p.amount);
      pays.push(p);
    }
    const next = payable[pays.length];
    return {
      from,
      move,
      pays,
      towards: next && pool > 0.001 ? { payment: next, paidSoFar: pool } : null,
      left: extra - move,
    };
  }

  async giveExtraPreview(groupId: string, fromId: string, toId: string, organizationId: string, source: ExtraSource = 'extra') {
    await this.findGroup(groupId, organizationId);
    const plan = await this.giveExtraPlan(this.membershipsRepo.manager, groupId, fromId, toId, source);
    const due = (p: Payment) => ({ paymentId: p.id, date: p.session.date, label: p.session.label ?? null, kind: p.session.kind, amount: Number(p.amount) });
    return {
      move: plan.move,
      pays: plan.pays.map(due),
      towards: plan.towards ? { ...due(plan.towards.payment), paidSoFar: plan.towards.paidSoFar } : null,
      left: plan.left,
    };
  }

  /**
   * The extra (or money waiting for a player) was for someone else: it pays what they owe now;
   * anything not needed stays where it was.
   */
  async giveExtra(groupId: string, fromId: string, toId: string, organizationId: string, source: ExtraSource = 'extra') {
    await this.findGroup(groupId, organizationId);
    if (fromId === toId && source === 'extra') throw new BadRequestException('To keep it for them, choose "Keep it for their next game".');
    const settled = await this.membershipsRepo.manager.transaction(async (tx) => {
      const plan = await this.giveExtraPlan(tx, groupId, fromId, toId, source, true);
      if (Number(plan.from[source] ?? 0) <= 0.001) throw new BadRequestException(source === 'waiting' ? 'Nothing is waiting here any more.' : 'There’s no extra left to sort.');
      if (plan.move <= 0.001) throw new BadRequestException('They don’t owe anything that can be paid now.');
      plan.from[source] = (Number(plan.from[source]) - plan.move).toFixed(2);
      if (source === 'waiting' && Number(plan.from.waiting) <= 0.001) plan.from.waitingNote = null;
      await tx.save(plan.from);
      return (await this.creditIn(tx, groupId, toId, plan.move)).settled;
    });
    await this.afterPaid(settled);
    return { settled: settled.length };
  }

  /**
   * The extra was for someone the organiser can't place yet: not in the group, or no one knows
   * who. It moves apart from the sender's money and waits, with what's known about who it's for.
   */
  async holdExtra(groupId: string, playerId: string, organizationId: string, note?: string) {
    await this.findGroup(groupId, organizationId);
    return this.membershipsRepo.manager.transaction(async (tx) => {
      const m = await tx.findOne(GroupMembership, { where: { groupId, playerId }, lock: { mode: 'pessimistic_write' } });
      if (!m) throw new NotFoundException("That player isn't in this group");
      const extra = Number(m.extra ?? 0);
      if (extra <= 0.001) throw new BadRequestException('There’s no extra left to sort.');
      m.waiting = (Number(m.waiting ?? 0) + extra).toFixed(2);
      m.extra = '0.00';
      const said = note?.trim();
      if (said) m.waitingNote = [m.waitingNote, said].filter(Boolean).join(' · ').slice(0, 120);
      await tx.save(m);
      return { waiting: Number(m.waiting) };
    });
  }

  /** Money waiting for a player goes back with the sender's extra, still to sort. */
  async releaseWaiting(groupId: string, playerId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    return this.membershipsRepo.manager.transaction(async (tx) => {
      const m = await tx.findOne(GroupMembership, { where: { groupId, playerId }, lock: { mode: 'pessimistic_write' } });
      if (!m) throw new NotFoundException("That player isn't in this group");
      const waiting = Number(m.waiting ?? 0);
      if (waiting <= 0.001) throw new BadRequestException('Nothing is waiting here any more.');
      m.extra = (Number(m.extra ?? 0) + waiting).toFixed(2);
      m.waiting = '0.00';
      m.waitingNote = null;
      await tx.save(m);
      return { extra: Number(m.extra) };
    });
  }

  /** The extra really was paid ahead: kept for their next game (and paid towards it once it's next). */
  async keepExtra(groupId: string, playerId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    const kept = await this.membershipsRepo.manager.transaction(async (tx) => {
      const m = await tx.findOne(GroupMembership, { where: { groupId, playerId }, lock: { mode: 'pessimistic_write' } });
      if (!m) throw new NotFoundException("That player isn't in this group");
      const extra = Number(m.extra ?? 0);
      if (extra <= 0.001) throw new BadRequestException('There’s no extra left to sort.');
      m.credit = (Number(m.credit) + extra).toFixed(2);
      m.extra = '0.00';
      await tx.save(m);
      return extra;
    });
    await this.applyCredit(groupId, playerId);
    return { kept };
  }

  /**
   * Nobody can sort it, or the player said keep it: the group keeps the member's extra. They're
   * no longer owed it (it stops showing as theirs, and refunds can't take it), and a record says
   * how much, when and why, for their history. The balance doesn't change: the money was already
   * in the account. Never touches credit, money waiting for a player, or anyone's games.
   */
  async keepForGroup(
    groupId: string,
    playerId: string,
    organizationId: string,
    input: { reason: KeptReason; note?: string; recordedBy?: string },
  ) {
    await this.findGroup(groupId, organizationId);
    const note = input.note?.trim().replace(/\s+/g, ' ').slice(0, 120) || null;
    if (!KEPT_REASONS.includes(input.reason)) throw new BadRequestException('Pick why the group is keeping it');
    if (input.reason === 'other' && !note) throw new BadRequestException('Say in a few words why the group is keeping it');
    return this.membershipsRepo.manager.transaction(async (tx) => {
      const m = await tx.findOne(GroupMembership, { where: { groupId, playerId }, lock: { mode: 'pessimistic_write' } });
      if (!m) throw new NotFoundException("That player isn't in this group");
      const extra = Number(m.extra ?? 0);
      if (extra <= 0.001) throw new BadRequestException('There’s no extra left to sort.');
      m.extra = '0.00';
      await tx.save(m);
      await tx.save(
        tx.create(GroupKeptMoney, { groupId, playerId, amount: extra.toFixed(2), reason: input.reason, note, recordedBy: input.recordedBy ?? null }),
      );
      return { kept: extra };
    });
  }

  /** What a withdrawal was for, set or changed afterwards. */
  async setPayoutCategory(payoutId: string, organizationId: string, category: PayoutCategory) {
    const payout = await this.payoutsRepo
      .createQueryBuilder('p')
      .innerJoin('p.group', 'g')
      .where('p.id = :payoutId', { payoutId })
      .andWhere('g.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payout) throw new NotFoundException('Withdrawal not found');
    if (payout.refundPlayerId && category !== 'refund') throw new BadRequestException('A refund to a player stays a refund');
    await this.payoutsRepo.update(payout.id, { category });
    return { ...payout, category };
  }

  /** Admin manually records an incoming transfer that the webhook missed. */
  async recordManualTransfer(
    groupId: string,
    organizationId: string,
    input: { amount: number; senderName?: string; narration?: string },
  ) {
    const group = await this.findGroup(groupId, organizationId);
    const incoming: IncomingTransfer = {
      providerTransactionId: `${MANUAL_PREFIX}${randomBytes(8).toString('hex')}`,
      accountNumber: group.accountNumber ?? '',
      amount: input.amount,
      senderName: input.senderName,
      narration: input.narration,
      receivedAt: new Date(),
      raw: { manual: true },
    };

    const transfer = await this.transfersRepo.save(
      this.transfersRepo.create({
        providerTransactionId: incoming.providerTransactionId,
        groupId: group.id,
        accountNumber: incoming.accountNumber,
        amount: incoming.amount,
        senderName: incoming.senderName,
        senderAccount: normaliseAccount(incoming.senderAccount),
        narration: incoming.narration,
        receivedAt: incoming.receivedAt,
        raw: incoming.raw as object,
        status: TransferStatus.UNMATCHED,
      }),
    );

    await this.ensureCurrentPeriod(group);
    const playerId = await this.identifyPayer(group.id, incoming);
    if (playerId) await this.settleTransfer(transfer, playerId, TransferStatus.MATCHED);
    return transfer;
  }

  /** Dev/demo only: pretend PulseMFB sent us a credit for this group. */
  async simulateTransfer(
    groupId: string,
    organizationId: string,
    input: { amount: number; senderName?: string; senderAccount?: string; narration?: string },
  ) {
    const client = this.pulse;
    if (!(client instanceof MockPulseClient)) {
      throw new BadRequestException('Simulated transfers are only available in mock mode');
    }
    const group = await this.findGroup(groupId, organizationId);
    if (!group.accountNumber) await this.provisionAccount(group);
    const payload = {
      event: 'transfer.received',
      data: {
        transactionId: `sim_${randomBytes(8).toString('hex')}`,
        accountNumber: group.accountNumber,
        amount: input.amount,
        senderName: input.senderName,
        senderAccount: input.senderAccount,
        narration: input.narration,
        receivedAt: new Date().toISOString(),
      },
    };
    const raw = JSON.stringify(payload);
    return this.handleWebhook(raw, client.sign(raw), payload);
  }

  // ── Payouts (transfer out) ──

  /**
   * What's come in, gone out, and can be paid out. Transfers an organiser records by hand
   * (recordManualTransfer) are bookkeeping — they show in `totalIn` but aren't withdrawable,
   * since nothing proves that money reached the account. Only bank-reported credits are.
   */
  async getGroupBalance(groupId: string, organizationId: string) {
    const group = await this.findGroup(groupId, organizationId);

    const { totalIn, manualIn } = await this.transfersRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'totalIn')
      .addSelect(`COALESCE(SUM(CASE WHEN LEFT(t.providerTransactionId, ${MANUAL_PREFIX.length}) = :manual THEN t.amount ELSE 0 END), 0)`, 'manualIn')
      .where('t.groupId = :groupId', { groupId })
      // Money that isn't a player's is still in the account; only money set aside isn't counted.
      .andWhere('t.status IN (:...statuses)', { statuses: [TransferStatus.MATCHED, TransferStatus.ASSIGNED, TransferStatus.UNMATCHED, TransferStatus.OTHER] })
      .setParameter('manual', MANUAL_PREFIX)
      .getRawOne();

    const { totalOut } = await this.payoutsRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount + p.fee), 0)', 'totalOut')
      .where('p.groupId = :groupId', { groupId })
      .andWhere('p.status NOT IN (:...excluded)', { excluded: [PayoutStatus.FAILED, PayoutStatus.CANCELLED] })
      .getRawOne();

    const available = Number(totalIn) - Number(manualIn) - Number(totalOut);
    return {
      totalIn: Number(totalIn),
      manualIn: Number(manualIn),
      totalOut: Number(totalOut),
      available,
    };
  }

  async nameEnquiry(groupId: string, organizationId: string, bankCode: string, accountNumber: string) {
    await this.findGroup(groupId, organizationId);
    return { accountName: await this.lookUpName(bankCode, accountNumber) };
  }

  /**
   * Who owns an account, from the bank. Says plainly what went wrong instead of failing the
   * request: the bank has no such account, or the bank didn't answer (worth another try).
   */
  private async lookUpName(bankCode: string, accountNumber: string) {
    const known = bankNameFor(bankCode);
    const bank = known === 'Unknown Bank' ? 'that bank' : known;
    let name = '';
    try {
      name = (await this.pulse.nameEnquiry(bankCode, accountNumber)).accountName.trim();
    } catch (err: any) {
      const raw = String(err?.message ?? err);
      this.logger.warn(`Name enquiry for ${bankCode}/${accountNumber} failed: ${raw}`);
      if (/timed? ?out|timeout|aborted|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed|\((5\d\d)\)/i.test(raw)) {
        throw new ServiceUnavailableException(`${bank} didn't answer. Try again in a moment.`);
      }
    }
    if (!name) throw new BadRequestException(`No account ${accountNumber} at ${bank}. Check the number and the bank.`);
    return name;
  }

  async initiateTransferOut(
    groupId: string,
    organizationId: string,
    userId: string,
    dto: {
      amount: number;
      toPayee?: boolean;
      beneficiaryAccount?: string;
      beneficiaryBankCode?: string;
      narration?: string;
      refundPlayerId?: string;
      category?: PayoutCategory;
      pin: string;
    },
  ) {
    // Verify PIN
    const pinValid = await this.usersService.verifyTransferPin(userId, dto.pin);
    if (!pinValid) throw new BadRequestException('Incorrect transfer PIN');

    const group = await this.findGroup(groupId, organizationId);
    if (!group.accountNumber) throw new BadRequestException('Group has no collection account');
    if (dto.refundPlayerId && dto.toPayee) throw new BadRequestException("A refund goes to the member's account, not the payee");
    const to = await this.payoutRecipient(group, dto);

    // What the bank says is in the account, when Pulse can tell us: a second check that
    // doesn't depend on our own ledger being right.
    const held = await this.pulse.getBalance(group.accountNumber).catch(() => null);
    if (held !== null && dto.amount + PLATFORM_FEE > held) {
      throw new BadRequestException(`The group account holds ${naira(held)}, not enough for ${naira(dto.amount)} plus the ${naira(PLATFORM_FEE)} service fee`);
    }

    const reference = `PA-${randomBytes(8).toString('hex').toUpperCase()}`;
    const draft = this.payoutsRepo.create({
      groupId,
      amount: dto.amount,
      fee: PLATFORM_FEE,
      beneficiaryAccount: to.account,
      beneficiaryName: to.name,
      beneficiaryBankCode: to.bankCode,
      beneficiaryBankName: to.bankName,
      narration: dto.narration,
      providerReference: reference,
      initiatedById: userId,
      refundPlayerId: dto.refundPlayerId ?? null,
      // A refund to a player is always 'refund'; otherwise what the organiser picked.
      category: dto.refundPlayerId ? 'refund' : (dto.category ?? null),
    });

    // Checking the balance and recording the payout happen under a lock on the group row, so
    // payouts sent at the same moment queue up: each one sees the ones before it (they count
    // as soon as they're recorded) and two can't both spend the same money. A refund also
    // comes off the member's credit inside the same transaction.
    const payout = await this.payoutsRepo.manager.transaction(async (tx) => {
      await tx.findOne(Group, { where: { id: groupId }, lock: { mode: 'pessimistic_write' } });

      const balance = await this.getGroupBalance(groupId, organizationId);
      if (dto.amount + PLATFORM_FEE > balance.available) {
        throw new BadRequestException(`Insufficient balance. Available: ${naira(balance.available)} (includes ${naira(PLATFORM_FEE)} service fee)`);
      }

      // Platform daily limit: ₦10M per group
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { dailyTotal } = await this.payoutsRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'dailyTotal')
        .where('p.groupId = :groupId', { groupId })
        .andWhere('p.status != :cancelled', { cancelled: PayoutStatus.CANCELLED })
        .andWhere('p.createdAt >= :todayStart', { todayStart })
        .getRawOne();
      if (Number(dailyTotal) + dto.amount > 10_000_000) {
        throw new BadRequestException('Daily transfer limit (₦10,000,000) exceeded for this group');
      }

      if (dto.refundPlayerId) {
        const membership = await tx.findOne(GroupMembership, {
          where: { groupId, playerId: dto.refundPlayerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!membership) throw new BadRequestException("That player isn't in this group");
        // Extra they sent that isn't sorted yet goes back first, then money kept for them.
        const extra = Number(membership.extra ?? 0);
        const credit = Number(membership.credit);
        if (dto.amount > extra + credit + 0.001) {
          throw new BadRequestException(`They only have ${naira(extra + credit)} to send back`);
        }
        const fromExtra = Math.min(extra, dto.amount);
        membership.extra = (extra - fromExtra).toFixed(2);
        membership.credit = (credit - (dto.amount - fromExtra)).toFixed(2);
        await tx.save(membership);
      }
      return tx.save(draft);
    });

    try {
      const result = await this.pulse.transferOut({
        debitAccountNumber: group.accountNumber,
        beneficiaryAccountNumber: to.account,
        beneficiaryBankCode: to.bankCode,
        beneficiaryBankName: to.bankName,
        beneficiaryName: to.name,
        amount: dto.amount,
        narration: dto.narration ?? `PitchAside payout – ${group.name}`,
        reference,
      });

      // Only from pending: if the bank's own status message already moved it, that wins.
      await this.movePayout(payout, PayoutStatus.PENDING, result.status === 'completed' ? PayoutStatus.COMPLETED : PayoutStatus.PROCESSING);

      await this.sendFee(payout, group);
    } catch (err: any) {
      const raw = String(err?.message ?? err);
      this.logger.error(`Payout ${payout.id} (${reference}) failed: ${raw}`);
      if (unclearTransferError(raw)) {
        // "Timed out" doesn't mean the money stayed: ask the bank before letting it be sent again.
        await this.settleUnclearPayout(payout, raw);
      } else if (await this.movePayout(payout, PayoutStatus.PENDING, PayoutStatus.FAILED, payoutFailureText(raw, to.bankName).slice(0, 200))) {
        // A refund's credit goes back once, whichever of this and the bank's message gets here first.
        await this.moveRefundCredit(payout, Number(payout.amount));
      }
    }

    return this.payoutsRepo.findOneOrFail({ where: { id: payout.id } });
  }

  /**
   * Moves a payout from one status to another only if it's still in `from`, so two callers (the
   * bank's message twice, or the bank racing a cancel) can't both act on the same change. Returns
   * whether this caller made the change.
   */
  private async movePayout(payout: OutgoingTransfer, from: PayoutStatus, to: PayoutStatus, errorMessage?: string) {
    const changes: Partial<OutgoingTransfer> = { status: to };
    if (to === PayoutStatus.COMPLETED) changes.completedAt = new Date();
    if (errorMessage) changes.errorMessage = errorMessage;
    const { affected } = await this.payoutsRepo.update({ id: payout.id, status: from }, changes);
    if (affected) Object.assign(payout, changes);
    return !!affected;
  }

  /**
   * Gives `delta` back to (or, negative, takes it from) the member a refund payout is for. Used
   * when a refund fails or is cancelled, and if a failed one later completes. Money given back
   * is extra to sort, not kept for their next game: nobody chose to keep it.
   */
  private async moveRefundCredit(payout: OutgoingTransfer, delta: number) {
    if (!payout.refundPlayerId) return;
    await this.membershipsRepo.manager.transaction(async (tx) => {
      const membership = await tx.findOne(GroupMembership, {
        where: { groupId: payout.groupId, playerId: payout.refundPlayerId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) {
        this.logger.warn(`Refund ${payout.id}: ${payout.refundPlayerId} is no longer in the group, so ${naira(delta)} wasn't moved`);
        return;
      }
      if (delta >= 0) membership.extra = (Number(membership.extra ?? 0) + delta).toFixed(2);
      else {
        const take = -delta;
        const fromExtra = Math.min(Number(membership.extra ?? 0), take);
        membership.extra = (Number(membership.extra ?? 0) - fromExtra).toFixed(2);
        membership.credit = (Number(membership.credit) - (take - fromExtra)).toFixed(2);
      }
      await tx.save(membership);
    });
  }

  async listPayouts(groupId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    return this.payoutsRepo.find({
      where: { groupId },
      relations: ['initiatedBy', 'refundPlayer'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async cancelPayout(payoutId: string, organizationId: string) {
    const payout = await this.payoutsRepo
      .createQueryBuilder('p')
      .innerJoin('p.group', 'group')
      .where('p.id = :payoutId', { payoutId })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!payout) throw new NotFoundException('Payout not found');
    // A payout is pending while the bank call is in flight; only one left pending (the server
    // stopped mid-call) can be cancelled, never one that may be on its way.
    const stuck = Date.now() - new Date(payout.createdAt).getTime() > PENDING_CANCEL_AFTER_MS;
    if (payout.status !== PayoutStatus.PENDING || !stuck) {
      throw new BadRequestException('Only a payout stuck pending for 15 minutes can be cancelled');
    }
    if (!(await this.movePayout(payout, PayoutStatus.PENDING, PayoutStatus.CANCELLED))) {
      throw new BadRequestException('This payout has already moved on');
    }
    await this.moveRefundCredit(payout, Number(payout.amount));
    return payout;
  }

  /** Called when PulseMFB notifies us about an outbound transfer status change. */
  /**
   * Where a payout goes: the group's saved payee, or the account typed in. Either way the
   * name comes from the bank, so the history shows who was actually paid.
   */
  private async payoutRecipient(group: Group, dto: { toPayee?: boolean; beneficiaryAccount?: string; beneficiaryBankCode?: string }) {
    if (dto.toPayee) {
      if (!group.payeeAccount || !group.payeeBankCode) throw new BadRequestException('This group has no saved payee yet');
      return {
        account: group.payeeAccount,
        bankCode: group.payeeBankCode,
        bankName: group.payeeBankName ?? bankNameFor(group.payeeBankCode),
        name: group.payeeName ?? '',
      };
    }
    if (!dto.beneficiaryAccount || !dto.beneficiaryBankCode) throw new BadRequestException('Choose a bank and account number');
    return {
      account: dto.beneficiaryAccount,
      bankCode: dto.beneficiaryBankCode,
      bankName: bankNameFor(dto.beneficiaryBankCode),
      name: await this.verifiedName(dto.beneficiaryBankCode, dto.beneficiaryAccount),
    };
  }

  private async verifiedName(bankCode: string, accountNumber: string) {
    return this.lookUpName(bankCode, accountNumber);
  }

  // ── Saved payee (pitch owner / facility manager) ──

  async getPayee(groupId: string, organizationId: string) {
    return payeeView(await this.findGroup(groupId, organizationId));
  }

  async savePayee(groupId: string, organizationId: string, dto: { bankCode: string; accountNumber: string; label?: string; amount?: number }) {
    const group = await this.findGroup(groupId, organizationId);
    group.payeeName = await this.verifiedName(dto.bankCode, dto.accountNumber);
    group.payeeAccount = dto.accountNumber;
    group.payeeBankCode = dto.bankCode;
    group.payeeBankName = bankNameFor(dto.bankCode);
    group.payeeLabel = dto.label?.trim() || 'Pitch owner';
    group.payeeAmount = dto.amount != null ? String(dto.amount) : null;
    return payeeView(await this.groupsRepo.save(group));
  }

  async clearPayee(groupId: string, organizationId: string) {
    const group = await this.findGroup(groupId, organizationId);
    group.payeeName = group.payeeAccount = group.payeeBankCode = group.payeeBankName = group.payeeLabel = group.payeeAmount = null;
    await this.groupsRepo.save(group);
    return null;
  }

  async handlePayoutWebhook(reference: string, status: 'completed' | 'failed', errorMessage?: string) {
    const payout = await this.payoutsRepo.findOne({ where: { providerReference: reference } });
    if (!payout) return;
    if (payout.status === PayoutStatus.COMPLETED || payout.status === PayoutStatus.CANCELLED) return;

    const from = payout.status;
    const to = status === 'completed' ? PayoutStatus.COMPLETED : PayoutStatus.FAILED;
    if (from === to) return;
    // The same message can arrive twice at once: only the one that changes the status moves money.
    if (!(await this.movePayout(payout, from, to, errorMessage))) return;

    // A refund's credit is given back when it fails, and taken again if it completes after all.
    if (to === PayoutStatus.FAILED) await this.moveRefundCredit(payout, Number(payout.amount));
    if (from === PayoutStatus.FAILED && to === PayoutStatus.COMPLETED) await this.moveRefundCredit(payout, -Number(payout.amount));
  }

  getNigerianBanks() {
    return NIGERIAN_BANKS;
  }

  /**
   * The service fee to PitchAside's account, once a payout has gone. Its reference is the payout's
   * with -FEE, so the bank refuses a second one for the same payout.
   */
  private async sendFee(payout: OutgoingTransfer, group: Pick<Group, 'accountNumber' | 'name'>) {
    const feeAccount = this.config.get<string>('PLATFORM_FEE_ACCOUNT');
    const feeBankCode = this.config.get('PLATFORM_FEE_BANK_CODE', '090713');
    const reference = `${payout.providerReference}-FEE`;
    this.logger.log(`Fee transfer: account=${feeAccount ?? '(not set)'} bankCode=${feeBankCode} from=${group.accountNumber} ref=${reference}`);
    if (!feeAccount) {
      this.logger.warn('PLATFORM_FEE_ACCOUNT not set — fee transfer skipped');
      return;
    }
    try {
      const feeResult = await this.pulse.transferOut({
        debitAccountNumber: group.accountNumber!,
        beneficiaryAccountNumber: feeAccount,
        beneficiaryBankCode: feeBankCode,
        beneficiaryBankName: 'Payrep Microfinance Bank',
        beneficiaryName: 'PitchAside',
        amount: PLATFORM_FEE,
        narration: `PitchAside service fee – ${group.name}`,
        reference,
      });
      this.logger.log(`Fee transfer for payout ${payout.id} succeeded: ${feeResult.status}`);
    } catch (feeErr: any) {
      this.logger.error(`Fee transfer for payout ${payout.id} failed: ${feeErr.message}`);
    }
  }

  /** The group a payout came from, for its fee. */
  private async groupOf(payout: OutgoingTransfer) {
    return this.groupsRepo.findOne({ where: { id: payout.groupId }, select: ['id', 'accountNumber', 'name'] });
  }

  /**
   * After an unclear answer ("timed out"): what does the bank say about this transfer? Sent or
   * failed, it's settled now. No record of it: it never left, so it's failed and the money is
   * free again. Still going, or the bank can't be asked: it stays held (processing) and the
   * follow-up checks again, so nothing can be sent twice.
   */
  private async settleUnclearPayout(payout: OutgoingTransfer, raw: string) {
    let status = 'unknown';
    let reason: string | undefined;
    try {
      const bank = await this.pulse.getTransfer(payout.providerReference!);
      status = bank.status;
      reason = bank.errorMessage;
    } catch (err: any) {
      this.logger.warn(`Couldn't check payout ${payout.id} with the bank: ${err.message}`);
    }
    if (/complet|success/i.test(status)) {
      if (await this.movePayout(payout, PayoutStatus.PENDING, PayoutStatus.COMPLETED)) {
        const group = await this.groupOf(payout);
        if (group) await this.sendFee(payout, group);
      }
    } else if (/fail|revers/i.test(status) || status === 'not_found') {
      if (await this.movePayout(payout, PayoutStatus.PENDING, PayoutStatus.FAILED, payoutFailureText(reason ?? raw, payout.beneficiaryBankName).slice(0, 200))) {
        await this.moveRefundCredit(payout, Number(payout.amount));
      }
    } else {
      await this.movePayout(payout, PayoutStatus.PENDING, PayoutStatus.PROCESSING, 'The bank is slow to confirm this one. The money is held until it does: we check every few minutes.');
    }
  }

  /** Every few minutes: payouts still waiting on the bank get asked about, so none sit unclear for long. */
  async followUpPayouts(now = Date.now()) {
    const waiting = await this.payoutsRepo.find({ where: { status: PayoutStatus.PROCESSING }, order: { createdAt: 'ASC' }, take: 50 });
    for (const payout of waiting) {
      const age = now - new Date(payout.createdAt).getTime();
      if (age < FOLLOW_UP_AFTER_MS || !payout.providerReference) continue;
      try {
        const bank = await this.pulse.getTransfer(payout.providerReference);
        if (/complet|success/i.test(bank.status)) {
          await this.handlePayoutWebhook(payout.providerReference, 'completed');
          // One the bank was slow to confirm hasn't had its fee sent yet (the -FEE reference stops a second).
          if (payout.errorMessage?.startsWith('The bank is slow to confirm')) {
            const group = await this.groupOf(payout);
            if (group) await this.sendFee(payout, group);
          }
        }
        else if (/fail|revers/i.test(bank.status)) await this.handlePayoutWebhook(payout.providerReference, 'failed', payoutFailureText(bank.errorMessage ?? bank.status, payout.beneficiaryBankName));
        else if (bank.status === 'not_found' && age > NEVER_ARRIVED_AFTER_MS)
          await this.handlePayoutWebhook(payout.providerReference, 'failed', payoutFailureText('timed out', payout.beneficiaryBankName));
      } catch (err: any) {
        this.logger.warn(`Follow-up on payout ${payout.id} failed: ${err.message}`);
      }
    }
  }

  /** Query Payrep for the real status of every `processing` payout and reconcile. */
  async reconcilePayouts(groupId?: string): Promise<ReconcileResult[]> {
    const where: FindOptionsWhere<OutgoingTransfer> = { status: PayoutStatus.PROCESSING };
    if (groupId) where.groupId = groupId;
    const stuck = await this.payoutsRepo.find({ where, order: { createdAt: 'ASC' } });

    const results: ReconcileResult[] = [];
    for (const payout of stuck) {
      if (!payout.providerReference) {
        results.push({ id: payout.id, reference: null, before: 'processing', after: null, error: 'no provider reference' });
        continue;
      }
      try {
        const bank = await this.pulse.getTransfer(payout.providerReference);
        const bankStatus = /complet|success/.test(bank.status) ? 'completed' as const
                         : /fail|reverse/.test(bank.status) ? 'failed' as const
                         : null;
        if (bankStatus) {
          await this.handlePayoutWebhook(payout.providerReference, bankStatus, bank.errorMessage);
          results.push({ id: payout.id, reference: payout.providerReference, before: 'processing', after: bankStatus });
        } else {
          results.push({ id: payout.id, reference: payout.providerReference, before: 'processing', after: null, bankStatus: bank.status });
        }
      } catch (err: any) {
        results.push({ id: payout.id, reference: payout.providerReference, before: 'processing', after: null, error: err.message });
      }
    }
    return results;
  }

  // ── helpers ──

  private async findGroup(id: string, organizationId: string) {
    const group = await this.groupsRepo.findOne({ where: { id, organizationId } });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  private async findTransfer(id: string, organizationId: string) {
    const transfer = await this.transfersRepo
      .createQueryBuilder('t')
      .innerJoin('t.group', 'group')
      .where('t.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }
}

export interface ReconcileResult {
  id: string;
  reference: string | null;
  before: string;
  after: 'completed' | 'failed' | null;
  /** The raw bank status when it didn't map to completed/failed. */
  bankStatus?: string;
  error?: string;
}

/** The billing period containing `now`. Weeks start on Monday. */
