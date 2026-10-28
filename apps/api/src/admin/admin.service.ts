import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { localDate } from '../common/time.util';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';
import { PlayersService } from '../players/players.service';
import { SessionsService } from '../sessions/sessions.service';
import { BillingService } from '../billing/billing.service';

/** Players who haven't played for this many days count as gone quiet. */
export const QUIET_DAYS = 28;

/** A club's own admin page. Cross-club reporting is in PlatformService. */
@Injectable()
export class AdminService {
  constructor(
    private usersService: UsersService,
    private groupsService: GroupsService,
    private playersService: PlayersService,
    private sessionsService: SessionsService,
    private billingService: BillingService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /**
   * The Club office at a glance (Matt, 27 Oct: "offer more"): this season's money and match days,
   * what's owed now and what's waiting to be sorted, players who've gone quiet, and each group side
   * by side. Games count once their day has come (Lagos time); called-off games never count.
   */
  async getOrgOverview(organizationId: string, quietDays = QUIET_DAYS) {
    const today = localDate(0);
    const season = today.slice(0, 4);
    const since = localDate(-quietDays);
    const q = <T>(sql: string, params: unknown[]) => this.db.query(sql, params) as Promise<T[]>;
    // Games in this club up to today, not called off
    const played = `
      FROM payments p
      JOIN sessions s ON s.id = p.session_id
      JOIN groups g ON g.id = s.group_id
      WHERE g.organization_id = $1 AND s.kind = 'game' AND s.status <> 'cancelled' AND s.date <= $2::date`;
    const [money, days, owed, toSort, quiet, groups] = await Promise.all([
      q<{ paid: string; due: string }>(
        `SELECT COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount END), 0) AS paid,
                COALESCE(SUM(CASE WHEN p.status IN ('paid', 'pending') THEN p.amount END), 0) AS due
         ${played} AND to_char(s.date, 'YYYY') = $3 AND COALESCE(p.attendance, '') <> 'no_show'`,
        [organizationId, today, season],
      ),
      q<{ days: string; players: string }>(
        `SELECT COUNT(DISTINCT s.id) AS days, COUNT(DISTINCT p.player_id) AS players
         ${played} AND to_char(s.date, 'YYYY') = $3 AND COALESCE(p.attendance, '') <> 'no_show'`,
        [organizationId, today, season],
      ),
      q<{ amount: string; players: string }>(
        `SELECT COALESCE(SUM(p.amount), 0) AS amount, COUNT(DISTINCT p.player_id) AS players
         ${played} AND p.status = 'pending' AND COALESCE(p.attendance, '') <> 'no_show'`,
        [organizationId, today],
      ),
      q<{ amount: string; count: string }>(
        `SELECT COALESCE(SUM(t.amount), 0) AS amount, COUNT(*) AS count
         FROM bank_transfers t JOIN groups g ON g.id = t.group_id
         WHERE g.organization_id = $1 AND t.status = 'unmatched'`,
        [organizationId],
      ),
      // Played at least twice, but not since `since`: newest gone first
      q<{ id: string; first_name: string; last_name: string; nickname: string | null; last_played: string; games: string; group_name: string }>(
        `SELECT pl.id, pl."firstName" AS first_name, pl."lastName" AS last_name, pl.nickname,
                to_char(MAX(s.date), 'YYYY-MM-DD') AS last_played, COUNT(DISTINCT s.id) AS games,
                (ARRAY_AGG(g.name ORDER BY s.date DESC))[1] AS group_name
         ${played.replace('FROM payments p', 'FROM payments p JOIN players pl ON pl.id = p.player_id')} AND COALESCE(p.attendance, '') <> 'no_show'
         GROUP BY pl.id
         HAVING COUNT(DISTINCT s.id) >= 2 AND MAX(s.date) < $3::date
         ORDER BY MAX(s.date) DESC
         LIMIT 8`,
        [organizationId, today, since],
      ),
      q<{ id: string; name: string; days: string; turnout: string; paid: string; due: string; owed: string; to_sort: string }>(
        `SELECT g.id, g.name,
                (SELECT COUNT(*) FROM bank_transfers t WHERE t.group_id = g.id AND t.status = 'unmatched') AS to_sort,
                COUNT(DISTINCT s.id) FILTER (WHERE s.date <= $2::date AND to_char(s.date, 'YYYY') = $3 AND p.id IS NOT NULL AND COALESCE(p.attendance, '') <> 'no_show') AS days,
                COUNT(p.id) FILTER (WHERE s.date <= $2::date AND to_char(s.date, 'YYYY') = $3 AND COALESCE(p.attendance, '') <> 'no_show') AS turnout,
                COALESCE(SUM(p.amount) FILTER (WHERE s.date <= $2::date AND to_char(s.date, 'YYYY') = $3 AND p.status = 'paid' AND COALESCE(p.attendance, '') <> 'no_show'), 0) AS paid,
                COALESCE(SUM(p.amount) FILTER (WHERE s.date <= $2::date AND to_char(s.date, 'YYYY') = $3 AND p.status IN ('paid', 'pending') AND COALESCE(p.attendance, '') <> 'no_show'), 0) AS due,
                COALESCE(SUM(p.amount) FILTER (WHERE s.date <= $2::date AND p.status = 'pending' AND COALESCE(p.attendance, '') <> 'no_show'), 0) AS owed
         FROM groups g
         LEFT JOIN sessions s ON s.group_id = g.id AND s.kind = 'game' AND s.status <> 'cancelled'
         LEFT JOIN payments p ON p.session_id = s.id
         WHERE g.organization_id = $1
         GROUP BY g.id, g.name
         ORDER BY COUNT(DISTINCT s.id) FILTER (WHERE s.date <= $2::date AND to_char(s.date, 'YYYY') = $3 AND p.id IS NOT NULL AND COALESCE(p.attendance, '') <> 'no_show') DESC, g.name`,
        [organizationId, today, season],
      ),
    ]);
    const n = (v: string | number | null | undefined) => Number(v ?? 0);
    return {
      season,
      quietDays,
      paid: n(money[0]?.paid),
      due: n(money[0]?.due),
      matchDays: n(days[0]?.days),
      players: n(days[0]?.players),
      received: await this.billingService.totalReceivedByOrganization(organizationId),
      owed: { amount: n(owed[0]?.amount), players: n(owed[0]?.players) },
      toSort: { amount: n(toSort[0]?.amount), count: n(toSort[0]?.count) },
      quiet: quiet.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), nickname: r.nickname, lastPlayed: r.last_played, games: n(r.games), group: r.group_name })),
      groups: groups.map((r) => {
        const d = n(r.days);
        return { id: r.id, name: r.name, matchDays: d, turnout: d ? Math.round((n(r.turnout) / d) * 10) / 10 : 0, paid: n(r.paid), due: n(r.due), owed: n(r.owed), toSort: n(r.to_sort) };
      }),
    };
  }

  async getOrgStats(organizationId: string) {
    const [totalGroups, totalPlayers, totalSessions, totalCollected, totalReceived] =
      await Promise.all([
        this.groupsService.countByOrganization(organizationId),
        this.playersService.countByOrganization(organizationId),
        this.sessionsService.countByOrganization(organizationId),
        this.sessionsService.totalCollectedByOrganization(organizationId),
        this.billingService.totalReceivedByOrganization(organizationId),
      ]);
    // Collected is dues marked paid; received is every transfer into the club's accounts,
    // including money not yet matched to a player or sitting as credit.
    return { totalGroups, totalPlayers, totalSessions, totalCollected, totalReceived };
  }

  getOrgMembers(organizationId: string) {
    return this.usersService.findByOrganization(organizationId);
  }
}
