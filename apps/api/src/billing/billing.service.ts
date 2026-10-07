import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Group, PaymentType } from '../groups/entities/group.entity';
import { GroupMembership, MemberRole } from '../groups/entities/group-membership.entity';
import { Session, SessionKind, SessionStatus } from '../sessions/entities/session.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { Player } from '../players/entities/player.entity';
import { ConfigService } from '@nestjs/config';
import { normaliseWebhookUrl, webhookUrlsFor } from './webhook-url';
import { PaymentsService } from '../payments/payments.service';
import { BankTransfer, TransferStatus } from './entities/bank-transfer.entity';
import { OutgoingTransfer, PayoutStatus } from './entities/outgoing-transfer.entity';
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
import { paidByTransfer, refundToCredit } from '../payments/credit';
import { PERIODIC_TYPES, periodFor } from './periods';
import { COVERED_BY_DUES, gameTarget, squadEntry } from '../payments/game-dues';
import { Competition } from '../competitions/entities/competition.entity';
import { CompetitionTeam, TeamRegistrationStatus } from '../competitions/entities/competition-team.entity';

export { periodFor };

/**
 * Pulse MFB charges 2.5% per incoming transfer, min ₦2, max ₦25.
 * The webhook reports the net amount (after their fee). This reverses
 * the fee so we store what the player actually sent.
 *
 *   fee(gross) = clamp(gross × 0.025, 2, 25)
 *   net = gross − fee
 *
 * Reversed:
 *   net > 975  → gross = net + 25   (fee was capped at ₦25)
 *   net ≥ 78   → gross = net / 0.975 (fee was 2.5%)
 *   net < 78   → gross = net + 2    (fee was floored at ₦2)
 */
function grossAmount(net: number): number {
  if (net > 975) return Math.round(net + 25);
  if (net >= 78) return Math.round(net / 0.975);
  return Math.round(net + 2);
}

/** PitchAside service fee per outbound payout, transferred to the platform account. */
const PLATFORM_FEE = 350;
/** Transfers an organiser records by hand get this id prefix; they never count as withdrawable. */
const MANUAL_PREFIX = 'manual_';


// Unambiguous characters for human-typed references (no 0/O, 1/I/L).
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REF_PATTERN = /\bPA[- ]?([A-HJ-NP-Z2-9]{5})\b/i;

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

  async provisionAccount(group: Group, bvn?: string): Promise<Group> {
    const contact = await this.organiserContact(group.organizationId);
    const account = await this.pulse.createAccount({
      reference: group.id,
      accountName: accountNameFor(group.name),
      email: contact?.email,
      phone: contact?.phone ?? undefined,
      bvn,
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
  async createGroupAccount(groupId: string, organizationId: string, bvn?: string) {
    const group = await this.findGroup(groupId, organizationId);
    if (!group.accountNumber) {
      try {
        await this.provisionAccount(group, bvn);
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
            body: `${naira(fee)} — tap for the account details and your reference.`,
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
    return {
      groupName: group.name,
      organizationName: group.organization?.name,
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
  async joinGroup(code: string, input: ClubPerson) {
    const group = await this.groupsRepo.findOne({ where: { inviteCode: code } });
    if (!group) throw new NotFoundException('This group link is not valid. Ask your organiser for the latest link.');
    const player = await clubPlayerFor(this.playersRepo, group.organizationId, input);
    return { playerId: player.id, ...(await this.addToGroup(group, player)) };
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
  async joinGroupAsPerson(code: string, person: ClubPerson) {
    const group = await this.groupsRepo.findOne({ where: { inviteCode: code } });
    if (!group) throw new NotFoundException('This group link is not valid. Ask your organiser for the latest link.');
    const player = await clubPlayerFor(this.playersRepo, group.organizationId, person);
    return this.addToGroup(group, player);
  }

  private async addToGroup(group: Group, player: Player) {
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
          url: `/groups/${group.id}`,
        }),
      );
    }
    await this.onMemberAdded(membership);

    return {
      alreadyMember,
      firstName: player.firstName,
      paymentRef: membership.paymentRef,
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
        const refMatch = credit.narration?.toUpperCase().match(/CP([A-F0-9]{8})/);
        if (refMatch) {
          const paymentRef = `CP${refMatch[1]}`;
          const team = await this.competitionTeamsRepo.findOne({ where: { competitionId: comp.id, paymentRef } });
          if (team && team.registrationStatus !== TeamRegistrationStatus.CONFIRMED) {
            team.registrationStatus = TeamRegistrationStatus.CONFIRMED;
            team.paidAt = new Date();
            await this.competitionTeamsRepo.save(team);
            log(`competition payment: ${paymentRef} confirmed for ${comp.name}`);
          }
        }
        const result = await this.recordTransfer(credit);
        note('recorded');
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

  async recordTransfer(incoming: IncomingTransfer) {
    // Idempotent: providers retry webhooks.
    const seen = await this.transfersRepo.findOne({
      where: { providerTransactionId: incoming.providerTransactionId },
    });
    if (seen) return { received: true, duplicate: true, status: seen.status };

    // Pulse takes 2.5% (min ₦2, max ₦25); reverse it so we store what the player sent.
    incoming.amount = grossAmount(incoming.amount);

    const group = await this.groupsRepo.createQueryBuilder('g')
      .where('RIGHT(g.account_number, 10) = :acct', { acct: incoming.accountNumber })
      .getOne();
    const transfer = await this.transfersRepo.save(
      this.transfersRepo.create({
        providerTransactionId: incoming.providerTransactionId,
        groupId: group?.id,
        accountNumber: incoming.accountNumber,
        amount: incoming.amount,
        senderName: incoming.senderName,
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
    const notifyUnmatched = () =>
      this.notifications.later(() =>
        this.notifications.notifyOrganisers(group.organizationId, {
          kind: 'transfer_unmatched',
          title: `${naira(incoming.amount)} needs matching`,
          body: `From ${incoming.senderName ?? 'unknown sender'} into ${group.name}. Tap to assign it.`,
          url: `/groups/${group.id}?tab=transfers`,
        }),
      );

    await this.ensureCurrentPeriod(group);
    const playerId = await this.identifyPayer(group.id, incoming);
    if (playerId) {
      // Known sender: it's theirs even if it's less than a due — it goes to their credit.
      const { settled } = await this.applyCredit(group.id, playerId, incoming.amount);
      transfer.status = TransferStatus.MATCHED;
      transfer.playerId = playerId;
      transfer.paymentId = settled[0]?.id ?? (null as unknown as string);
      // Prepend the player's PA reference so admins always see it in the narration.
      const ref = await this.getPlayerRef(group.id, playerId);
      if (ref && !transfer.narration?.includes(ref)) {
        transfer.narration = ref + (transfer.narration ? ` ${transfer.narration}` : '');
      }
      await this.transfersRepo.save(transfer);
    }
    if (transfer.status === TransferStatus.UNMATCHED) notifyUnmatched();
    return { received: true, status: transfer.status };
  }

  /** Look up a player's PA reference for a given group membership. */
  private async getPlayerRef(groupId: string, playerId: string): Promise<string | null> {
    const m = await this.membershipsRepo.findOne({ where: { groupId, playerId } });
    return m?.paymentRef ?? null;
  }

  /** Reference in the narration wins; otherwise a unique full-name match on the sender. */
  private async identifyPayer(groupId: string, t: IncomingTransfer): Promise<string | null> {
    const memberships = await this.membershipsRepo.find({
      where: { groupId },
      relations: ['player'],
    });

    const refMatch = t.narration?.toUpperCase().match(REF_PATTERN);
    if (refMatch) {
      const ref = `PA${refMatch[1].toUpperCase()}`;
      const m = memberships.find((x) => x.paymentRef === ref);
      if (m) return m.playerId;
    }

    if (t.senderName) {
      const words = new Set(normaliseName(t.senderName));
      const candidates = memberships.filter((m) => {
        const first = normaliseName(m.player.firstName);
        const last = normaliseName(m.player.lastName);
        return [...first, ...last].every((w) => words.has(w));
      });
      if (candidates.length === 1) return candidates[0].playerId;
    }
    return null;
  }

  /**
   * Adds `amount` to the member's credit, then pays their oldest pending dues in this group
   * from it while it covers them. What's left stays as credit for the next due — so ₦198
   * toward a ₦1,000 due waits, and a later ₦802 completes it.
   *
   * The member's row is locked for the duration, so two transfers arriving together can't
   * spend the same credit twice.
   */
  async applyCredit(groupId: string, playerId: string, amount = 0): Promise<{ settled: Payment[]; credit: number }> {
    const result = await this.membershipsRepo.manager.transaction(async (tx) => {
      const membership = await tx.findOne(GroupMembership, {
        where: { groupId, playerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) return { settled: [] as Payment[], credit: 0 };

      let pool = Number(membership.credit) + amount;
      const pending = await tx
        .getRepository(Payment)
        .createQueryBuilder('payment')
        .innerJoin('payment.session', 'session')
        .where('session.groupId = :groupId', { groupId })
        .andWhere('payment.playerId = :playerId', { playerId })
        .andWhere('payment.status = :status', { status: PaymentStatus.PENDING })
        .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
        .orderBy('session.date', 'ASC')
        .getMany();

      const settled: Payment[] = [];
      for (const p of pending) {
        if (pool + 0.001 < Number(p.amount)) break;
        pool -= Number(p.amount);
        settled.push(p);
      }
      const now = new Date();
      for (const p of settled) {
        p.status = PaymentStatus.PAID;
        p.paidAt = now;
        p.source = 'transfer';
        p.markedBy = 'pulse';
      }
      if (settled.length) await tx.save(settled);
      membership.credit = pool.toFixed(2);
      await tx.save(membership);
      return { settled, credit: Number(membership.credit) };
    });

    await this.afterPaid(result.settled);
    return result;
  }

  /**
   * A game being cancelled or deleted (call after the change is saved): what members paid for
   * it by transfer goes back to their credit, then on to their next due. With `reopen` the
   * game's dues go back to pending, so un-cancelling it settles them from credit again.
   */
  async releaseTransferDues(session: Pick<Session, 'groupId' | 'payments'>, { reopen }: { reopen: boolean }) {
    const payments = session.payments ?? [];
    const credited = await refundToCredit(this.paymentsRepo.manager, session.groupId, payments);
    if (!credited.length) return;
    if (reopen) {
      const reopened = payments.filter((p) => paidByTransfer(p) && credited.includes(p.playerId));
      for (const p of reopened) {
        p.status = PaymentStatus.PENDING;
        p.paidAt = null as unknown as Date;
        p.source = null as unknown as string;
        p.markedBy = null as unknown as string;
      }
      await this.paymentsRepo.save(reopened);
      await this.paymentsService.recalculateSessionTotal(reopened[0].sessionId);
    }
    await this.applyCredits(session.groupId, credited);
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

  private async markPaidFromTransfer(payments: Payment[]) {
    if (!payments.length) return;
    const now = new Date();
    for (const p of payments) {
      p.status = PaymentStatus.PAID;
      p.paidAt = now;
      p.source = 'transfer';
      p.markedBy = 'pulse';
    }
    await this.paymentsRepo.save(payments);
    await this.afterPaid(payments);
  }

  /** Session totals and receipts for dues just paid from a transfer. */
  private async afterPaid(payments: Payment[]) {
    if (!payments.length) return;
    for (const sessionId of new Set(payments.map((p) => p.sessionId))) {
      await this.paymentsService.recalculateSessionTotal(sessionId);
    }
    this.notifications.later(() => this.paymentsService.sendReceipts(payments.map((p) => p.id), 'transfer'));
  }

  async listTransfers(groupId: string, organizationId: string) {
    await this.findGroup(groupId, organizationId);
    return this.transfersRepo.find({
      where: { groupId },
      relations: ['payment', 'payment.player', 'payment.session', 'player'],
      order: { receivedAt: 'DESC' },
      take: 50,
    });
  }

  async assignTransfer(transferId: string, paymentId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    if (transfer.status !== TransferStatus.UNMATCHED) {
      throw new BadRequestException('This transfer has already been handled');
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
    const amount = Number(transfer.amount);
    transfer.status = TransferStatus.ASSIGNED;
    transfer.playerId = payment.playerId;
    if (amount + 0.001 >= Number(payment.amount)) {
      // Covers the chosen due; anything over goes to the player's credit.
      await this.markPaidFromTransfer([payment]);
      transfer.paymentId = payment.id;
      const extra = amount - Number(payment.amount);
      if (extra > 0.001) await this.applyCredit(transfer.groupId, payment.playerId, extra);
    } else {
      // Less than the due: it's credit toward it, not a full payment.
      const { settled } = await this.applyCredit(transfer.groupId, payment.playerId, amount);
      transfer.paymentId = settled[0]?.id ?? (null as unknown as string);
    }
    return this.transfersRepo.save(transfer);
  }

  async ignoreTransfer(transferId: string, organizationId: string) {
    const transfer = await this.findTransfer(transferId, organizationId);
    transfer.status = TransferStatus.IGNORED;
    return this.transfersRepo.save(transfer);
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
        narration: incoming.narration,
        receivedAt: incoming.receivedAt,
        raw: incoming.raw as object,
        status: TransferStatus.UNMATCHED,
      }),
    );

    await this.ensureCurrentPeriod(group);
    const playerId = await this.identifyPayer(group.id, incoming);
    if (playerId) {
      const { settled } = await this.applyCredit(group.id, playerId, incoming.amount);
      transfer.status = TransferStatus.MATCHED;
      transfer.playerId = playerId;
      transfer.paymentId = settled[0]?.id ?? (null as unknown as string);
      const ref = await this.getPlayerRef(group.id, playerId);
      if (ref && !transfer.narration?.includes(ref)) {
        transfer.narration = ref + (transfer.narration ? ` ${transfer.narration}` : '');
      }
      await this.transfersRepo.save(transfer);
    }
    return transfer;
  }

  /** Dev/demo only: pretend PulseMFB sent us a credit for this group. */
  async simulateTransfer(
    groupId: string,
    organizationId: string,
    input: { amount: number; senderName?: string; narration?: string },
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
      .andWhere('t.status IN (:...statuses)', { statuses: [TransferStatus.MATCHED, TransferStatus.ASSIGNED, TransferStatus.UNMATCHED] })
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
    return this.pulse.nameEnquiry(bankCode, accountNumber);
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
        const credit = Number(membership.credit);
        if (dto.amount > credit + 0.001) {
          throw new BadRequestException(`They only have ${naira(credit)} credit to refund`);
        }
        membership.credit = (credit - dto.amount).toFixed(2);
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

      payout.status = result.status === 'completed' ? PayoutStatus.COMPLETED : PayoutStatus.PROCESSING;
      if (result.status === 'completed') payout.completedAt = new Date();

      // Transfer the platform fee to PitchAside's account
      const feeAccount = this.config.get<string>('PLATFORM_FEE_ACCOUNT');
      const feeBankCode = this.config.get('PLATFORM_FEE_BANK_CODE', '090713');
      this.logger.log(`Fee transfer: account=${feeAccount ?? '(not set)'} bankCode=${feeBankCode} from=${group.accountNumber} ref=${reference}-FEE`);
      if (feeAccount) {
        try {
          const feeResult = await this.pulse.transferOut({
            debitAccountNumber: group.accountNumber,
            beneficiaryAccountNumber: feeAccount,
            beneficiaryBankCode: feeBankCode,
            beneficiaryBankName: 'Payrep Microfinance Bank',
            beneficiaryName: 'PitchAside',
            amount: PLATFORM_FEE,
            narration: `PitchAside service fee – ${group.name}`,
            reference: `${reference}-FEE`,
          });
          this.logger.log(`Fee transfer for payout ${payout.id} succeeded: ${feeResult.status}`);
        } catch (feeErr: any) {
          this.logger.error(`Fee transfer for payout ${payout.id} failed: ${feeErr.message}`);
        }
      } else {
        this.logger.warn('PLATFORM_FEE_ACCOUNT not set — fee transfer skipped');
      }
    } catch (err: any) {
      payout.status = PayoutStatus.FAILED;
      payout.errorMessage = err.message?.slice(0, 200);
      this.logger.error(`Payout ${payout.id} failed: ${err.message}`);
      await this.moveRefundCredit(payout, Number(payout.amount));
    }

    await this.payoutsRepo.save(payout);
    return payout;
  }

  /**
   * Adds `delta` back to (or, negative, takes it from) the credit of the member a refund
   * payout is for. Used when a refund fails or is cancelled, and if a failed one later completes.
   */
  private async moveRefundCredit(payout: OutgoingTransfer, delta: number) {
    if (!payout.refundPlayerId) return;
    await this.membershipsRepo.manager.transaction(async (tx) => {
      const membership = await tx.findOne(GroupMembership, {
        where: { groupId: payout.groupId, playerId: payout.refundPlayerId! },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) {
        this.logger.warn(`Refund ${payout.id}: ${payout.refundPlayerId} is no longer in the group, so ${naira(delta)} credit wasn't moved`);
        return;
      }
      membership.credit = (Number(membership.credit) + delta).toFixed(2);
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
    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException('Only pending payouts can be cancelled');
    }
    payout.status = PayoutStatus.CANCELLED;
    const saved = await this.payoutsRepo.save(payout);
    await this.moveRefundCredit(payout, Number(payout.amount));
    return saved;
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
    let name = '';
    try {
      name = (await this.pulse.nameEnquiry(bankCode, accountNumber)).accountName.trim();
    } catch (err: any) {
      this.logger.warn(`Name enquiry for ${bankCode}/${accountNumber} failed: ${err.message}`);
    }
    if (!name) throw new BadRequestException("Couldn't confirm who owns that account — check the bank and account number");
    return name;
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

    const wasFailed = payout.status === PayoutStatus.FAILED;
    payout.status = status === 'completed' ? PayoutStatus.COMPLETED : PayoutStatus.FAILED;
    if (status === 'completed') payout.completedAt = new Date();
    if (errorMessage) payout.errorMessage = errorMessage;
    await this.payoutsRepo.save(payout);

    // A refund's credit is given back when it fails, and taken again if it completes after all.
    if (!wasFailed && payout.status === PayoutStatus.FAILED) await this.moveRefundCredit(payout, Number(payout.amount));
    if (wasFailed && payout.status === PayoutStatus.COMPLETED) await this.moveRefundCredit(payout, -Number(payout.amount));
  }

  getNigerianBanks() {
    return NIGERIAN_BANKS;
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

function normaliseName(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1);
}

/** The billing period containing `now`. Weeks start on Monday. */
