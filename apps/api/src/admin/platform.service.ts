import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { ClubsQueryDto, ClubSort, StatusQueryDto } from './dto/platform-query.dto';
import { PulseClient } from '../billing/pulse/pulse.client';

/**
 * The PitchAside team's own organisation (whoever holds a super-admin login)
 * isn't a club — keep it out of every club count and list.
 */
const IS_CLUB = `NOT EXISTS (SELECT 1 FROM users su WHERE su.organization_id = o.id AND su.role = 'super_admin')`;

/**
 * One person across every club they play for: their lower-cased email. Players an
 * organiser added without one fall back to their phone digits, then to the row itself.
 */
const personKeySql = (alias: string) =>
  `COALESCE(
    NULLIF(lower(trim(${alias}.email)), ''),
    NULLIF(right(regexp_replace(COALESCE(${alias}.phone, ''), '\\D', '', 'g'), 10), ''),
    ${alias}.id::text
  )`;

/** What a club has taken in and is still owed (cancelled games don't count as owed). */
const CLUB_MONEY = `
  SELECT
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::float8 AS collected,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending' AND s.status <> 'cancelled'), 0)::float8 AS outstanding
  FROM payments p
  JOIN sessions s ON s.id = p.session_id
  JOIN groups g ON g.id = s.group_id`;

const CLUB_ORDER: Record<ClubSort, string> = {
  newest: 'o."createdAt" DESC',
  collected: 'pay.collected DESC, o."createdAt" DESC',
  outstanding: 'pay.outstanding DESC, o."createdAt" DESC',
  players: 'players DESC, o."createdAt" DESC',
};

type Row = Record<string, unknown>;

/**
 * Read-only, cross-club reporting for the PitchAside team ("HQ").
 * Everything here ignores organisation scoping on purpose — only super admins reach it.
 */
@Injectable()
export class PlatformService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  // ── Overview ──

  async getOverview() {
    const [totals, money, growth, weekly, attention, topClubs, recentClubs] = await Promise.all([
      this.one(`
        SELECT
          (SELECT count(*) FROM organizations o WHERE ${IS_CLUB})::int AS clubs,
          (SELECT count(*) FROM users WHERE role <> 'super_admin')::int AS organisers,
          (SELECT count(*) FROM groups)::int AS groups,
          (SELECT count(DISTINCT ${personKeySql('p')}) FROM players p)::int AS players,
          (SELECT count(*) FROM player_accounts WHERE password_hash IS NOT NULL)::int AS "playersWithLogin",
          (SELECT count(*) FROM sessions WHERE kind = 'game' AND status = 'completed')::int AS "gamesPlayed",
          (SELECT count(*) FROM sessions WHERE kind = 'game' AND status = 'upcoming' AND date >= CURRENT_DATE)::int AS "gamesUpcoming",
          (SELECT count(*) FROM push_subscriptions)::int AS "pushDevices"`),
      this.one(`
        SELECT
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::float8 AS collected,
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending' AND s.status <> 'cancelled'), 0)::float8 AS outstanding,
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p."paidAt" >= localtimestamp - interval '30 days'), 0)::float8 AS "collected30d",
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p."paidAt" >= localtimestamp - interval '60 days'
            AND p."paidAt" < localtimestamp - interval '30 days'), 0)::float8 AS "collectedPrev30d",
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.source = 'transfer'), 0)::float8 AS "collectedByTransfer"
        FROM payments p
        JOIN sessions s ON s.id = p.session_id`),
      this.one(
        `
        SELECT
          (SELECT count(*) FROM organizations o WHERE ${IS_CLUB} AND o."createdAt" >= localtimestamp - interval '30 days')::int AS "clubs30d",
          (SELECT count(*) FROM organizations o WHERE ${IS_CLUB} AND o."createdAt" >= localtimestamp - interval '60 days'
            AND o."createdAt" < localtimestamp - interval '30 days')::int AS "clubsPrev30d",
          (SELECT count(*) FROM first_seen WHERE at >= localtimestamp - interval '30 days')::int AS "players30d",
          (SELECT count(*) FROM first_seen WHERE at >= localtimestamp - interval '60 days'
            AND at < localtimestamp - interval '30 days')::int AS "playersPrev30d",
          (SELECT count(*) FROM sessions WHERE kind = 'game' AND status <> 'cancelled'
            AND date > CURRENT_DATE - 30 AND date <= CURRENT_DATE)::int AS "games30d",
          (SELECT count(*) FROM sessions WHERE kind = 'game' AND status <> 'cancelled'
            AND date > CURRENT_DATE - 60 AND date <= CURRENT_DATE - 30)::int AS "gamesPrev30d"`,
        [],
        this.firstSeenCte(),
      ),
      this.many(
        `
        SELECT
          to_char(w.start, 'YYYY-MM-DD') AS week,
          (SELECT COALESCE(SUM(amount), 0) FROM payments
            WHERE status = 'paid' AND "paidAt" >= w.start AND "paidAt" < w.start + interval '1 week')::float8 AS collected,
          (SELECT count(*) FROM first_seen WHERE at >= w.start AND at < w.start + interval '1 week')::int AS "newPlayers",
          (SELECT count(*) FROM organizations o
            WHERE ${IS_CLUB} AND o."createdAt" >= w.start AND o."createdAt" < w.start + interval '1 week')::int AS "newClubs",
          (SELECT count(*) FROM sessions
            WHERE kind = 'game' AND status <> 'cancelled'
              AND date >= w.start::date AND date < (w.start + interval '1 week')::date)::int AS games
        FROM (
          SELECT generate_series(
            date_trunc('week', localtimestamp) - interval '11 weeks',
            date_trunc('week', localtimestamp),
            interval '1 week'
          ) AS start
        ) w
        ORDER BY w.start`,
        [],
        this.firstSeenCte(),
      ),
      this.one(`
        SELECT
          (SELECT count(*) FROM bank_transfers WHERE status = 'unmatched')::int AS "unmatchedTransfers",
          (SELECT COALESCE(SUM(amount), 0) FROM bank_transfers WHERE status = 'unmatched')::float8 AS "unmatchedAmount",
          (SELECT count(*) FROM groups WHERE account_number IS NULL)::int AS "groupsWithoutAccount",
          (SELECT count(*) FROM organizations o
            WHERE ${IS_CLUB} AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.organization_id = o.id))::int AS "clubsWithoutGroups",
          (SELECT count(*) FROM organizations o
            WHERE ${IS_CLUB}
              AND EXISTS (SELECT 1 FROM groups g WHERE g.organization_id = o.id)
              AND NOT EXISTS (
                SELECT 1 FROM sessions s JOIN groups g ON g.id = s.group_id
                WHERE g.organization_id = o.id AND s.date > CURRENT_DATE - 30
              ))::int AS "dormantClubs",
          (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN sessions s ON s.id = p.session_id
            WHERE p.status = 'pending' AND s.status <> 'cancelled' AND s.date < CURRENT_DATE - 14)::float8 AS "overdueAmount",
          (SELECT count(*) FROM outbound_messages
            WHERE status = 'failed' AND "createdAt" >= localtimestamp - interval '7 days')::int AS "failedMessages7d",
          (SELECT count(*) FROM outbound_messages
            WHERE channel = 'push' AND status = 'sent' AND "createdAt" >= localtimestamp - interval '7 days')::int AS "pushDelivered7d",
          (SELECT count(*) FROM outbound_messages
            WHERE channel = 'push' AND status <> 'sent' AND "createdAt" >= localtimestamp - interval '7 days')::int AS "pushMissed7d"`),
      this.many(`
        SELECT o.id, o.name, recent.collected
        FROM organizations o
        JOIN LATERAL (
          SELECT COALESCE(SUM(p.amount), 0)::float8 AS collected
          FROM payments p
          JOIN sessions s ON s.id = p.session_id
          JOIN groups g ON g.id = s.group_id
          WHERE g.organization_id = o.id AND p.status = 'paid' AND p."paidAt" >= localtimestamp - interval '30 days'
        ) recent ON true
        WHERE ${IS_CLUB} AND recent.collected > 0
        ORDER BY recent.collected DESC
        LIMIT 5`),
      this.clubRows({ where: 'true', params: [], order: CLUB_ORDER.newest, limit: 5, offset: 0 }),
    ]);

    return {
      totals,
      money,
      growth,
      weekly,
      attention,
      topClubs,
      recentClubs: recentClubs.map(({ total: _total, ...club }) => club),
      modes: this.modes(),
    };
  }

  // ── Clubs ──

  async getClubs(query: ClubsQueryDto) {
    const { page, limit, offset, search } = this.paging(query);
    const rows = await this.clubRows({
      where: `($1 = '' OR o.name ILIKE $1 OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.organization_id = o.id
          AND (u.email ILIKE $1 OR u."firstName" || ' ' || u."lastName" ILIKE $1)
      ))`,
      params: [search],
      order: CLUB_ORDER[query.sort ?? 'newest'],
      limit,
      offset,
    });
    return this.paginated(rows, page, limit);
  }

  async getClub(id: string) {
    const club = await this.one(
      `SELECT o.id, o.name, o.country, o.state, o."createdAt",
        (SELECT count(*) FROM players p WHERE p.organization_id = o.id)::int AS players,
        pay.collected, pay.outstanding
      FROM organizations o
      LEFT JOIN LATERAL (${CLUB_MONEY} WHERE g.organization_id = o.id) pay ON true
      WHERE o.id::text = $1`,
      [id],
    );
    if (!club) throw new NotFoundException('Club not found');

    const [organisers, groups, sessions, activity] = await Promise.all([
      this.many(
        `SELECT u.id, u."firstName", u."lastName", u.email, u.phone, u.role,
          u.two_factor_enabled AS "twoFactorEnabled", u."createdAt"
        FROM users u WHERE u.organization_id::text = $1
        ORDER BY (u.role = 'org_admin') DESC, u."createdAt"`,
        [id],
      ),
      this.many(
        `SELECT g.id, g.name, g."paymentType", g."feePerPlayer"::float8 AS "feePerPlayer", g."targetPlayers",
          g.account_number AS "accountNumber", g.bank_name AS "bankName", g."createdAt",
          (SELECT count(*) FROM group_memberships m WHERE m.group_id = g.id)::int AS members,
          (SELECT count(*) FROM bank_transfers t WHERE t.group_id = g.id AND t.status = 'unmatched')::int AS "unmatchedTransfers",
          pay.collected, pay.outstanding
        FROM groups g
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::float8 AS collected,
            COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending' AND s.status <> 'cancelled'), 0)::float8 AS outstanding
          FROM payments p JOIN sessions s ON s.id = p.session_id
          WHERE s.group_id = g.id
        ) pay ON true
        WHERE g.organization_id::text = $1
        ORDER BY g."createdAt"`,
        [id],
      ),
      this.many(
        `SELECT s.id, to_char(s.date, 'YYYY-MM-DD') AS date, s.kind, s.label, s.status, g.name AS "groupName",
          s."targetAmount"::float8 AS "targetAmount", s."collectedAmount"::float8 AS "collectedAmount",
          (SELECT count(*) FROM payments p WHERE p.session_id = s.id AND p.status = 'paid')::int AS paid,
          (SELECT count(*) FROM payments p WHERE p.session_id = s.id)::int AS billed
        FROM sessions s JOIN groups g ON g.id = s.group_id
        WHERE g.organization_id::text = $1
        ORDER BY s.date DESC, s."createdAt" DESC
        LIMIT 12`,
        [id],
      ),
      this.activityRows(`a.organization_id = $1`, [id], 15, 0),
    ]);

    return {
      ...club,
      organisers,
      groups,
      sessions,
      activity: activity.map(({ total: _total, ...entry }) => entry),
    };
  }

  // ── People ──

  async getOrganisers(query: PaginationDto) {
    const { page, limit, offset, search } = this.paging(query);
    const rows = await this.many(
      `SELECT u.id, u."firstName", u."lastName", u.email, u.phone, u.role,
        u.two_factor_enabled AS "twoFactorEnabled", u."createdAt",
        o.id AS "clubId", o.name AS "clubName",
        count(*) OVER()::int AS total
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      WHERE ($1 = '' OR u.email ILIKE $1 OR u."firstName" || ' ' || u."lastName" ILIKE $1 OR o.name ILIKE $1)
      ORDER BY u."createdAt" DESC
      LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    );
    return this.paginated(rows, page, limit);
  }

  /** One row per person (email address), however many clubs they play for. */
  async getPlayers(query: PaginationDto) {
    const { page, limit, offset, search } = this.paging(query);
    const rows = await this.many(
      `WITH people AS (
        SELECT
          ${personKeySql('p')} AS key,
          (array_agg(p."firstName" || ' ' || p."lastName" ORDER BY p."createdAt"))[1] AS name,
          (array_agg(p.email ORDER BY p."createdAt") FILTER (WHERE p.email IS NOT NULL))[1] AS email,
          (array_agg(p.phone ORDER BY p."createdAt") FILTER (WHERE p.phone IS NOT NULL))[1] AS phone,
          min(p."createdAt") AS "firstSeen",
          array_agg(DISTINCT o.name) AS clubs,
          array_agg(p.id) AS ids
        FROM players p
        JOIN organizations o ON o.id = p.organization_id
        GROUP BY 1
      )
      SELECT
        people.key AS id,
        COALESCE(a.first_name || ' ' || a.last_name, people.name) AS name,
        COALESCE(a.email, people.email) AS email, people.phone, people."firstSeen", people.clubs,
        (a.password_hash IS NOT NULL) AS "hasLogin",
        pay.paid, pay.owed,
        count(*) OVER()::int AS total
      FROM people
      LEFT JOIN player_accounts a ON a.phone_key = people.key
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(pm.amount) FILTER (WHERE pm.status = 'paid'), 0)::float8 AS paid,
          COALESCE(SUM(pm.amount) FILTER (WHERE pm.status = 'pending' AND s.status <> 'cancelled'), 0)::float8 AS owed
        FROM payments pm JOIN sessions s ON s.id = pm.session_id
        WHERE pm.player_id = ANY(people.ids)
      ) pay ON true
      WHERE ($1 = '' OR people.name ILIKE $1 OR people.email ILIKE $1 OR people.phone ILIKE $1
        OR a.first_name || ' ' || a.last_name ILIKE $1 OR array_to_string(people.clubs, ' ') ILIKE $1)
      ORDER BY people."firstSeen" DESC
      LIMIT $2 OFFSET $3`,
      [search, limit, offset],
    );
    return this.paginated(rows, page, limit);
  }

  // ── Money ──

  async getMoney(query: StatusQueryDto) {
    const { page, limit, offset } = this.paging(query);
    const [summary, byStatus, rows] = await Promise.all([
      this.one(`
        SELECT
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::float8 AS collected,
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.source = 'transfer'), 0)::float8 AS "byTransfer",
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid' AND p.source IS DISTINCT FROM 'transfer'), 0)::float8 AS "byHand",
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending' AND s.status <> 'cancelled'), 0)::float8 AS outstanding,
          COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'waived'), 0)::float8 AS waived
        FROM payments p JOIN sessions s ON s.id = p.session_id`),
      this.many(`
        SELECT status, count(*)::int AS count, COALESCE(SUM(amount), 0)::float8 AS amount
        FROM bank_transfers GROUP BY status`),
      this.many(
        `SELECT t.id, t.amount::float8 AS amount, t.sender_name AS "senderName", t.narration, t.status,
          t.received_at AS "receivedAt", t.account_number AS "accountNumber",
          g.id AS "groupId", g.name AS "groupName", o.id AS "clubId", o.name AS "clubName",
          count(*) OVER()::int AS total
        FROM bank_transfers t
        LEFT JOIN groups g ON g.id = t.group_id
        LEFT JOIN organizations o ON o.id = g.organization_id
        WHERE ($1 = '' OR t.status::text = $1)
        ORDER BY t.received_at DESC
        LIMIT $2 OFFSET $3`,
        [query.status ?? '', limit, offset],
      ),
    ]);
    return { summary, byStatus, transfers: this.paginated(rows, page, limit) };
  }

  // ── Notifications ──

  async getMessages(query: StatusQueryDto) {
    const { page, limit, offset } = this.paging(query);
    const [byStatus, rows] = await Promise.all([
      this.many(`
        SELECT channel, status, count(*)::int AS count
        FROM outbound_messages
        WHERE "createdAt" >= localtimestamp - interval '7 days'
        GROUP BY channel, status`),
      this.many(
        // Sign-in codes are never shown here, even in mock mode.
        `SELECT m.id, m.channel, m.kind, m."to", m.status, m.error, m."createdAt",
          CASE WHEN m.kind = 'otp' THEN NULL ELSE m.body END AS body,
          o.id AS "clubId", o.name AS "clubName",
          count(*) OVER()::int AS total
        FROM outbound_messages m
        LEFT JOIN organizations o ON o.id::text = m.organization_id
        WHERE ($1 = '' OR m.status = $1)
        ORDER BY m."createdAt" DESC
        LIMIT $2 OFFSET $3`,
        [query.status ?? '', limit, offset],
      ),
    ]);
    return { modes: this.modes(), byStatus, messages: this.paginated(rows, page, limit) };
  }

  // ── Activity ──

  async getActivity(query: PaginationDto) {
    const { page, limit, offset } = this.paging(query);
    const rows = await this.activityRows('true', [], limit, offset);
    return this.paginated(rows, page, limit);
  }

  // ── Diagnostics ──

  async groupDiagnostics(groupId: string, pulse: PulseClient) {
    const group = await this.one(
      `SELECT g.id, g.name, g.account_number AS "accountNumber", g.bank_name AS "bankName",
        g."paymentType", g."feePerPlayer"::float8 AS "feePerPlayer",
        o.id AS "clubId", o.name AS "clubName"
      FROM groups g
      JOIN organizations o ON o.id = g.organization_id
      WHERE g.id::text = $1`,
      [groupId],
    );
    if (!group) throw new NotFoundException('Group not found');

    // Ledger balance
    const ledger = await this.one(
      `SELECT
        COALESCE(SUM(t.amount) FILTER (WHERE t.status IN ('matched','assigned','unmatched','other')), 0)::float8 AS "totalIn",
        COALESCE(SUM(t.amount) FILTER (WHERE t.status IN ('matched','assigned','unmatched','other')
          AND LEFT(t.provider_transaction_id, 7) = 'manual_'), 0)::float8 AS "manualIn"
      FROM bank_transfers t
      WHERE t.group_id::text = $1`,
      [groupId],
    );
    const payouts = await this.one(
      `SELECT
        count(*)::int AS "payoutCount",
        count(*) FILTER (WHERE p.status = 'failed')::int AS "failedPayouts",
        count(*) FILTER (WHERE p.status = 'completed')::int AS "completedPayouts",
        count(*) FILTER (WHERE p.status = 'processing')::int AS "processingPayouts",
        count(*) FILTER (WHERE p.status = 'pending')::int AS "pendingPayouts",
        count(*) FILTER (WHERE p.status = 'cancelled')::int AS "cancelledPayouts"
      FROM outgoing_transfers p
      WHERE p.group_id::text = $1`,
      [groupId],
    );
    const totalOut = await this.one(
      `SELECT COALESCE(SUM(p.amount + p.fee), 0)::float8 AS "totalOut"
      FROM outgoing_transfers p
      WHERE p.group_id::text = $1 AND p.status NOT IN ('failed','cancelled')`,
      [groupId],
    );

    const available = Number(ledger?.totalIn ?? 0) - Number(ledger?.manualIn ?? 0) - Number(totalOut?.totalOut ?? 0);

    // Bank balance from Payrep
    let bankBalance: number | string | null = 'unavailable';
    const accountNumber = group.accountNumber as string | null;
    if (accountNumber) {
      try {
        bankBalance = await pulse.getBalance(accountNumber);
      } catch (err: any) {
        bankBalance = `error: ${err.message}`;
      }
    }

    // Recent payouts (last 10)
    const recentPayouts = await this.many(
      `SELECT p.id, p.amount::float8 AS amount, p.fee::float8 AS fee, p.status,
        p.beneficiary_name AS "beneficiaryName", p.beneficiary_account AS "beneficiaryAccount",
        p.beneficiary_bank_name AS "beneficiaryBankName",
        p.provider_reference AS "providerReference",
        p.error_message AS "errorMessage",
        p."createdAt"
      FROM outgoing_transfers p
      WHERE p.group_id::text = $1
      ORDER BY p."createdAt" DESC
      LIMIT 10`,
      [groupId],
    );

    // Recent incoming transfers (last 10)
    const recentTransfers = await this.many(
      `SELECT t.id, t.amount::float8 AS amount, t.sender_name AS "senderName",
        t.narration, t.status, t.received_at AS "receivedAt"
      FROM bank_transfers t
      WHERE t.group_id::text = $1
      ORDER BY t.received_at DESC
      LIMIT 10`,
      [groupId],
    );

    // Member balances
    const members = await this.many(
      `SELECT m.player_id AS "playerId",
        p."firstName" || ' ' || p."lastName" AS name,
        m.credit::float8 AS credit,
        m.extra::float8 AS extra,
        m.waiting::float8 AS waiting
      FROM group_memberships m
      JOIN players p ON p.id = m.player_id
      WHERE m.group_id::text = $1
      ORDER BY (m.credit + m.extra + m.waiting) DESC
      LIMIT 20`,
      [groupId],
    );

    return {
      group,
      balance: {
        bankBalance,
        ledgerIn: Number(ledger?.totalIn ?? 0),
        manualIn: Number(ledger?.manualIn ?? 0),
        ledgerOut: Number(totalOut?.totalOut ?? 0),
        available,
      },
      payoutStats: payouts,
      recentPayouts,
      recentTransfers,
      members,
    };
  }

  // ── Helpers ──

  private clubRows(opts: { where: string; params: unknown[]; order: string; limit: number; offset: number }) {
    const n = opts.params.length;
    return this.many(
      `SELECT o.id, o.name, o.country, o.state, o."createdAt",
        owner.name AS "ownerName", owner.email AS "ownerEmail",
        (SELECT count(*) FROM users u WHERE u.organization_id = o.id)::int AS organisers,
        (SELECT count(*) FROM groups g WHERE g.organization_id = o.id)::int AS groups,
        (SELECT count(*) FROM players p WHERE p.organization_id = o.id)::int AS players,
        COALESCE(played.games, 0) AS games, played."lastGame",
        pay.collected, pay.outstanding,
        count(*) OVER()::int AS total
      FROM organizations o
      LEFT JOIN LATERAL (
        SELECT u."firstName" || ' ' || u."lastName" AS name, u.email
        FROM users u WHERE u.organization_id = o.id
        ORDER BY (u.role = 'org_admin') DESC, u."createdAt"
        LIMIT 1
      ) owner ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS games, to_char(max(s.date) FILTER (WHERE s.date <= CURRENT_DATE), 'YYYY-MM-DD') AS "lastGame"
        FROM sessions s JOIN groups g ON g.id = s.group_id
        WHERE g.organization_id = o.id AND s.kind = 'game' AND s.status <> 'cancelled'
      ) played ON true
      LEFT JOIN LATERAL (${CLUB_MONEY} WHERE g.organization_id = o.id) pay ON true
      WHERE ${IS_CLUB} AND ${opts.where}
      ORDER BY ${opts.order}
      LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...opts.params, opts.limit, opts.offset],
    );
  }

  /** Audit entries with the club and the organiser who did it (ids there are stored as text). */
  private activityRows(where: string, params: unknown[], limit: number, offset: number) {
    const n = params.length;
    return this.many(
      `SELECT a.id, a.action, a."entityType", a.metadata, a."createdAt",
        o.id AS "clubId", o.name AS "clubName",
        u."firstName" || ' ' || u."lastName" AS actor,
        count(*) OVER()::int AS total
      FROM audit_logs a
      LEFT JOIN organizations o ON o.id::text = a.organization_id
      LEFT JOIN users u ON u.id::text = a."userId"
      WHERE ${where}
      ORDER BY a."createdAt" DESC
      LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...params, limit, offset],
    );
  }

  /** When each person first showed up in any club — "new players" counts people, not club rows. */
  private firstSeenCte() {
    return `WITH first_seen AS (SELECT min(p."createdAt") AS at FROM players p GROUP BY ${personKeySql('p')})`;
  }

  /** Which integrations are live vs. mocked in this environment. */
  private modes() {
    return {
      bank: this.config.get('PULSE_MODE', 'mock') === 'live' ? 'live' : 'mock',
      messaging: this.config.get('MESSAGING_MODE', 'mock') === 'live' ? 'live' : 'mock',
      push: Boolean(this.config.get('VAPID_PUBLIC_KEY') && this.config.get('VAPID_PRIVATE_KEY')),
      email: Boolean(this.config.get('RESEND_API_KEY') || this.config.get('SMTP_HOST')),
      fallback: ['email', 'whatsapp'].includes(this.config.get('NOTIFY_FALLBACK', 'none'))
        ? this.config.get<string>('NOTIFY_FALLBACK')
        : 'none',
    };
  }

  private paging(query: PaginationDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const term = query.search?.trim();
    return { page, limit, offset: (page - 1) * limit, search: term ? `%${term}%` : '' };
  }

  /** Rows carry the full match count in `total` (window function); lift it into `meta`. */
  private paginated(rows: Row[], page: number, limit: number): PaginatedResult<Row> {
    const total = rows.length ? Number(rows[0].total) : 0;
    return {
      data: rows.map(({ total: _total, ...row }) => row),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Org admins who have at least one group but are missing BVN, NIN, or both.
   * Returns each user's id, organizationId, firstName, and email.
   */
  async organisersWithoutIdentity(): Promise<{ id: string; organizationId: string; firstName: string; email: string }[]> {
    return this.db.query(`
      SELECT u.id, u.organization_id AS "organizationId", u."firstName", u.email
      FROM users u
      WHERE u.role = 'org_admin'
        AND (u.bvn IS NULL OR u.nin IS NULL)
        AND u.removed_at IS NULL
        AND EXISTS (SELECT 1 FROM groups g WHERE g.organization_id = u.organization_id)
    `);
  }

  private many(sql: string, params: unknown[] = [], cte = ''): Promise<Row[]> {
    return this.db.query(`${cte} ${sql}`, params);
  }

  private async one(sql: string, params: unknown[] = [], cte = ''): Promise<Row | undefined> {
    const rows = await this.many(sql, params, cte);
    return rows[0];
  }
}
