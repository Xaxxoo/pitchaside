import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

import { Competition, CompetitionFormat, CompetitionScope, CompetitionStatus, CompetitionVisibility } from './entities/competition.entity';
import { CompetitionTeam, TeamRegistrationStatus } from './entities/competition-team.entity';
import { CompetitionMatch, MatchStatus } from './entities/competition-match.entity';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { RegisterTeamDto } from './dto/register-team.dto';
import { RecordResultDto } from './dto/record-result.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';
import { NIGERIAN_STATES, isValidState, isValidCity } from './data/nigerian-locations';
import { PULSE_CLIENT, PulseClient } from '../billing/pulse/pulse.client';
import { accountNameFor } from '../billing/billing.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

/** Status transitions allowed for a competition. */
const ALLOWED_TRANSITIONS: Record<CompetitionStatus, CompetitionStatus[]> = {
  [CompetitionStatus.DRAFT]: [CompetitionStatus.REGISTRATION_OPEN, CompetitionStatus.CANCELLED],
  [CompetitionStatus.REGISTRATION_OPEN]: [CompetitionStatus.REGISTRATION_CLOSED, CompetitionStatus.CANCELLED],
  [CompetitionStatus.REGISTRATION_CLOSED]: [CompetitionStatus.IN_PROGRESS, CompetitionStatus.REGISTRATION_OPEN, CompetitionStatus.CANCELLED],
  [CompetitionStatus.IN_PROGRESS]: [CompetitionStatus.COMPLETED, CompetitionStatus.CANCELLED],
  [CompetitionStatus.COMPLETED]: [],
  [CompetitionStatus.CANCELLED]: [],
};

@Injectable()
export class CompetitionsService {
  private readonly logger = new Logger(CompetitionsService.name);

  constructor(
    @InjectRepository(Competition) private competitionsRepo: Repository<Competition>,
    @InjectRepository(CompetitionTeam) private teamsRepo: Repository<CompetitionTeam>,
    @InjectRepository(CompetitionMatch) private matchesRepo: Repository<CompetitionMatch>,
    @Inject(PULSE_CLIENT) private pulse: PulseClient,
    private usersService: UsersService,
  ) {}

  // ── CRUD ──

  async create(dto: CreateCompetitionDto, userId: string, organizationId: string): Promise<Competition> {
    this.validateLocation(dto);

    const competition = this.competitionsRepo.create({
      ...dto,
      inviteCode: randomBytes(6).toString('hex').toUpperCase(),
      createdByUserId: userId,
      organizationId,
    });
    return this.competitionsRepo.save(competition);
  }

  async findAll(organizationId: string, page = 1, limit = 10) {
    const [data, total] = await this.competitionsRepo.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId?: string): Promise<Competition> {
    const where: any = { id };
    if (organizationId) where.organizationId = organizationId;
    const comp = await this.competitionsRepo.findOne({ where });
    if (!comp) throw new NotFoundException('Competition not found');
    return comp;
  }

  async update(id: string, organizationId: string, dto: UpdateCompetitionDto): Promise<Competition> {
    const comp = await this.findOne(id, organizationId);
    if (comp.status !== CompetitionStatus.DRAFT && comp.status !== CompetitionStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Can only update competitions in draft or registration-open status');
    }
    if (dto.scope || dto.state || dto.city) {
      this.validateLocation({ ...comp, ...dto } as any);
    }
    Object.assign(comp, dto);
    return this.competitionsRepo.save(comp);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const comp = await this.findOne(id, organizationId);
    if (comp.status !== CompetitionStatus.DRAFT) {
      throw new BadRequestException('Can only delete competitions in draft status');
    }
    await this.competitionsRepo.remove(comp);
  }

  // ── Status transitions ──

  async updateStatus(id: string, organizationId: string, newStatus: CompetitionStatus): Promise<Competition> {
    const comp = await this.findOne(id, organizationId);
    const allowed = ALLOWED_TRANSITIONS[comp.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${comp.status} to ${newStatus}`);
    }
    comp.status = newStatus;
    return this.competitionsRepo.save(comp);
  }

  // ── Account provisioning ──

  async provisionAccount(id: string, organizationId: string, bvn?: string): Promise<Competition> {
    const comp = await this.findOne(id, organizationId);
    if (comp.accountNumber) {
      throw new BadRequestException('Competition already has a collection account');
    }

    const contact = await this.organiserContact(organizationId);
    const account = await this.pulse.createAccount({
      reference: `comp-${comp.id}`,
      accountName: accountNameFor(comp.name),
      email: contact?.email,
      phone: contact?.phone ?? undefined,
      bvn,
    });

    comp.accountNumber = account.accountNumber;
    comp.accountName = account.accountName;
    comp.bankName = account.bankName;
    comp.accountReference = account.providerReference;
    return this.competitionsRepo.save(comp);
  }

  // ── Team management ──

  async registerTeam(competitionId: string, dto: RegisterTeamDto): Promise<CompetitionTeam> {
    const comp = await this.competitionsRepo.findOne({ where: { id: competitionId } });
    if (!comp) throw new NotFoundException('Competition not found');
    if (comp.status !== CompetitionStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Registration is not open');
    }

    const teamCount = await this.teamsRepo.count({
      where: { competitionId, registrationStatus: TeamRegistrationStatus.CONFIRMED },
    });
    if (teamCount >= comp.maxTeams) {
      throw new BadRequestException('Maximum number of teams reached');
    }

    const exists = await this.teamsRepo.findOne({ where: { competitionId, name: dto.name } });
    if (exists) throw new ConflictException('A team with this name is already registered');

    const paymentRef = `CP${randomBytes(4).toString('hex').toUpperCase()}`;
    const team = this.teamsRepo.create({
      ...dto,
      competitionId,
      paymentRef,
      registrationStatus: Number(comp.entryFee) > 0
        ? TeamRegistrationStatus.PENDING_PAYMENT
        : TeamRegistrationStatus.CONFIRMED,
      paidAt: Number(comp.entryFee) === 0 ? new Date() : undefined,
    });
    return this.teamsRepo.save(team);
  }

  async confirmPayment(competitionId: string, teamId: string, organizationId: string): Promise<CompetitionTeam> {
    await this.findOne(competitionId, organizationId);
    const team = await this.teamsRepo.findOne({ where: { id: teamId, competitionId } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.registrationStatus === TeamRegistrationStatus.CONFIRMED) {
      throw new BadRequestException('Payment already confirmed');
    }
    team.registrationStatus = TeamRegistrationStatus.CONFIRMED;
    team.paidAt = new Date();
    return this.teamsRepo.save(team);
  }

  async removeTeam(competitionId: string, teamId: string, organizationId: string): Promise<void> {
    await this.findOne(competitionId, organizationId);
    const team = await this.teamsRepo.findOne({ where: { id: teamId, competitionId } });
    if (!team) throw new NotFoundException('Team not found');
    await this.teamsRepo.remove(team);
  }

  async updateTeam(competitionId: string, teamId: string, organizationId: string, data: Partial<CompetitionTeam>): Promise<CompetitionTeam> {
    await this.findOne(competitionId, organizationId);
    const team = await this.teamsRepo.findOne({ where: { id: teamId, competitionId } });
    if (!team) throw new NotFoundException('Team not found');
    Object.assign(team, data);
    return this.teamsRepo.save(team);
  }

  async getTeams(competitionId: string): Promise<CompetitionTeam[]> {
    return this.teamsRepo.find({
      where: { competitionId },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Fixture generation ──

  async generateFixtures(id: string, organizationId: string): Promise<CompetitionMatch[]> {
    const comp = await this.findOne(id, organizationId);
    if (comp.status !== CompetitionStatus.REGISTRATION_CLOSED && comp.status !== CompetitionStatus.IN_PROGRESS) {
      throw new BadRequestException('Close registration before generating fixtures');
    }

    // Remove existing matches
    await this.matchesRepo.delete({ competitionId: id });

    const teams = await this.teamsRepo.find({
      where: { competitionId: id, registrationStatus: TeamRegistrationStatus.CONFIRMED },
      order: { seed: 'ASC', createdAt: 'ASC' },
    });
    if (teams.length < 2) {
      throw new BadRequestException('Need at least 2 confirmed teams to generate fixtures');
    }

    if (comp.format === CompetitionFormat.LEAGUE) {
      return this.generateLeagueFixtures(id, teams);
    }
    return this.generateKnockoutFixtures(id, teams);
  }

  /** Round-robin circle method: N-1 matchdays, N/2 matches each. */
  private async generateLeagueFixtures(competitionId: string, teams: CompetitionTeam[]): Promise<CompetitionMatch[]> {
    const n = teams.length;
    const isOdd = n % 2 !== 0;
    const teamIds = teams.map((t) => t.id);
    if (isOdd) teamIds.push(null as any); // BYE slot

    const total = teamIds.length;
    const rounds = total - 1;
    const half = total / 2;
    const matches: CompetitionMatch[] = [];
    let matchNumber = 1;

    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < half; i++) {
        const home = teamIds[i];
        const away = teamIds[total - 1 - i];
        if (home === null || away === null) continue; // skip BYE

        matches.push(
          this.matchesRepo.create({
            competitionId,
            homeTeamId: home,
            awayTeamId: away,
            round,
            matchNumber: matchNumber++,
            status: MatchStatus.SCHEDULED,
          }),
        );
      }
      // Rotate: fix first element, rotate the rest
      const last = teamIds.pop()!;
      teamIds.splice(1, 0, last);
    }

    return this.matchesRepo.save(matches);
  }

  /** Knockout bracket with BYEs for non-power-of-2 counts. */
  private async generateKnockoutFixtures(competitionId: string, teams: CompetitionTeam[]): Promise<CompetitionMatch[]> {
    const n = teams.length;
    const totalSlots = nextPowerOf2(n);
    const totalRounds = Math.log2(totalSlots);
    const matches: CompetitionMatch[] = [];
    let matchNumber = 1;

    // Round 1: seed teams into the bracket with BYEs
    const byeCount = totalSlots - n;
    const round1Matches = totalSlots / 2;

    // Map of round 1 match index → the match entity
    const round1: CompetitionMatch[] = [];

    for (let i = 0; i < round1Matches; i++) {
      const homeIdx = i;
      const awayIdx = totalSlots - 1 - i;
      const homeTeam = homeIdx < n ? teams[homeIdx] : null;
      const awayTeam = awayIdx < n ? teams[awayIdx] : null;

      const match: CompetitionMatch = this.matchesRepo.create({
        competitionId,
        homeTeamId: homeTeam?.id,
        awayTeamId: awayTeam?.id,
        round: 1,
        matchNumber: matchNumber++,
        status: MatchStatus.SCHEDULED,
      } as Partial<CompetitionMatch>) as CompetitionMatch;

      // If one side is a BYE, the other advances automatically
      if (!homeTeam && awayTeam) {
        match.winnerId = awayTeam.id;
        match.status = MatchStatus.WALKOVER;
        match.homeScore = 0;
        match.awayScore = 0;
      } else if (homeTeam && !awayTeam) {
        match.winnerId = homeTeam.id;
        match.status = MatchStatus.WALKOVER;
        match.homeScore = 0;
        match.awayScore = 0;
      }

      round1.push(match);
      matches.push(match);
    }

    // Subsequent rounds: placeholder matches
    let prevRound = round1;
    for (let r = 2; r <= totalRounds; r++) {
      const roundMatches: CompetitionMatch[] = [];
      for (let i = 0; i < prevRound.length; i += 2) {
        const match = this.matchesRepo.create({
          competitionId,
          round: r,
          matchNumber: matchNumber++,
          status: MatchStatus.SCHEDULED,
        });
        roundMatches.push(match);
        matches.push(match);
      }
      prevRound = roundMatches;
    }

    // Save all, then propagate BYE winners into round 2
    const saved = await this.matchesRepo.save(matches);

    // Advance BYE winners
    const round1Saved = saved.filter((m) => m.round === 1);
    const round2Saved = saved.filter((m) => m.round === 2);

    for (let i = 0; i < round1Saved.length; i += 2) {
      const r2Idx = i / 2;
      if (r2Idx >= round2Saved.length) break;

      const m1 = round1Saved[i];
      const m2 = round1Saved[i + 1];
      const r2 = round2Saved[r2Idx];

      if (m1.winnerId) r2.homeTeamId = m1.winnerId;
      if (m2?.winnerId) r2.awayTeamId = m2.winnerId;
    }
    await this.matchesRepo.save(round2Saved);

    return this.matchesRepo.find({
      where: { competitionId },
      relations: ['homeTeam', 'awayTeam'],
      order: { round: 'ASC', matchNumber: 'ASC' },
    });
  }

  // ── Result recording ──

  async recordResult(competitionId: string, matchId: string, organizationId: string, dto: RecordResultDto): Promise<CompetitionMatch> {
    const comp = await this.findOne(competitionId, organizationId);
    const match = await this.matchesRepo.findOne({ where: { id: matchId, competitionId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.status === MatchStatus.COMPLETED) throw new BadRequestException('Result already recorded');
    if (!match.homeTeamId || !match.awayTeamId) throw new BadRequestException('Both teams must be assigned');

    match.homeScore = dto.homeScore;
    match.awayScore = dto.awayScore;
    match.homePenalties = dto.homePenalties ?? (null as any);
    match.awayPenalties = dto.awayPenalties ?? (null as any);
    match.status = MatchStatus.COMPLETED;

    // Determine winner
    if (comp.format === CompetitionFormat.KNOCKOUT) {
      if (dto.homeScore > dto.awayScore) {
        match.winnerId = match.homeTeamId;
      } else if (dto.awayScore > dto.homeScore) {
        match.winnerId = match.awayTeamId;
      } else if (dto.homePenalties != null && dto.awayPenalties != null) {
        match.winnerId = dto.homePenalties > dto.awayPenalties ? match.homeTeamId : match.awayTeamId;
      } else {
        throw new BadRequestException('Knockout matches that end in a draw require penalty scores');
      }
    } else {
      // League: winner is whoever scored more, or null for draw
      if (dto.homeScore > dto.awayScore) match.winnerId = match.homeTeamId;
      else if (dto.awayScore > dto.homeScore) match.winnerId = match.awayTeamId;
      else match.winnerId = null as any;
    }

    await this.matchesRepo.save(match);

    // For knockout: advance winner to the next round
    if (comp.format === CompetitionFormat.KNOCKOUT && match.winnerId) {
      await this.advanceWinner(competitionId, match);
    }

    return (await this.matchesRepo.findOne({ where: { id: matchId }, relations: ['homeTeam', 'awayTeam', 'winner'] }))!;
  }

  /** Advance the winner of a knockout match to the next round's match. */
  private async advanceWinner(competitionId: string, match: CompetitionMatch) {
    const nextRound = match.round + 1;
    const allMatches = await this.matchesRepo.find({
      where: { competitionId },
      order: { round: 'ASC', matchNumber: 'ASC' },
    });
    const currentRoundMatches = allMatches.filter((m) => m.round === match.round);
    const nextRoundMatches = allMatches.filter((m) => m.round === nextRound);
    if (!nextRoundMatches.length) return; // Final was played

    const matchIdx = currentRoundMatches.findIndex((m) => m.id === match.id);
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const nextMatch = nextRoundMatches[nextMatchIdx];
    if (!nextMatch) return;

    if (matchIdx % 2 === 0) {
      nextMatch.homeTeamId = match.winnerId;
    } else {
      nextMatch.awayTeamId = match.winnerId;
    }
    await this.matchesRepo.save(nextMatch);
  }

  async updateMatchSchedule(competitionId: string, matchId: string, organizationId: string, dto: ScheduleMatchDto): Promise<CompetitionMatch> {
    await this.findOne(competitionId, organizationId);
    const match = await this.matchesRepo.findOne({ where: { id: matchId, competitionId } });
    if (!match) throw new NotFoundException('Match not found');
    Object.assign(match, dto);
    return this.matchesRepo.save(match);
  }

  // ── Matches ──

  async getMatches(competitionId: string): Promise<CompetitionMatch[]> {
    return this.matchesRepo.find({
      where: { competitionId },
      relations: ['homeTeam', 'awayTeam', 'winner'],
      order: { round: 'ASC', matchNumber: 'ASC' },
    });
  }

  // ── Standings (league) ──

  async getStandings(competitionId: string) {
    const comp = await this.competitionsRepo.findOne({ where: { id: competitionId } });
    if (!comp) throw new NotFoundException('Competition not found');
    if (comp.format !== CompetitionFormat.LEAGUE) {
      throw new BadRequestException('Standings are only available for league competitions');
    }

    const teams = await this.teamsRepo.find({
      where: { competitionId, registrationStatus: TeamRegistrationStatus.CONFIRMED },
    });
    const matches = await this.matchesRepo.find({
      where: { competitionId, status: MatchStatus.COMPLETED },
    });

    const statsMap = new Map<string, {
      teamId: string;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
    }>();

    for (const team of teams) {
      statsMap.set(team.id, { teamId: team.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
    }

    for (const m of matches) {
      const home = statsMap.get(m.homeTeamId);
      const away = statsMap.get(m.awayTeamId);
      if (!home || !away) continue;

      home.played++;
      away.played++;
      home.goalsFor += m.homeScore ?? 0;
      home.goalsAgainst += m.awayScore ?? 0;
      away.goalsFor += m.awayScore ?? 0;
      away.goalsAgainst += m.homeScore ?? 0;

      if (m.homeScore > m.awayScore) {
        home.won++;
        away.lost++;
      } else if (m.homeScore < m.awayScore) {
        away.won++;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
      }
    }

    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const standings = Array.from(statsMap.values())
      .map((s) => ({
        ...s,
        team: teamMap.get(s.teamId)!,
        goalDifference: s.goalsFor - s.goalsAgainst,
        points: s.won * 3 + s.drawn,
      }))
      .sort((a, b) =>
        b.points - a.points
        || b.goalDifference - a.goalDifference
        || b.goalsFor - a.goalsFor
        || a.team.name.localeCompare(b.team.name),
      )
      .map((s, i) => ({ position: i + 1, ...s }));

    return standings;
  }

  // ── Bracket (knockout) ──

  async getBracket(competitionId: string) {
    const comp = await this.competitionsRepo.findOne({ where: { id: competitionId } });
    if (!comp) throw new NotFoundException('Competition not found');
    if (comp.format !== CompetitionFormat.KNOCKOUT) {
      throw new BadRequestException('Bracket is only available for knockout competitions');
    }

    const matches = await this.matchesRepo.find({
      where: { competitionId },
      relations: ['homeTeam', 'awayTeam', 'winner'],
      order: { round: 'ASC', matchNumber: 'ASC' },
    });

    // Group by round
    const rounds: Record<number, CompetitionMatch[]> = {};
    for (const m of matches) {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    }

    return { rounds };
  }

  // ── Public: browse competitions ──

  async browse(filters: { scope?: CompetitionScope; state?: string; city?: string }, page = 1, limit = 10) {
    const qb = this.competitionsRepo.createQueryBuilder('c')
      .where('c.status IN (:...statuses)', {
        statuses: [CompetitionStatus.REGISTRATION_OPEN, CompetitionStatus.REGISTRATION_CLOSED, CompetitionStatus.IN_PROGRESS],
      })
      .andWhere('c.visibility = :vis', { vis: CompetitionVisibility.PUBLIC });

    if (filters.scope) qb.andWhere('c.scope = :scope', { scope: filters.scope });
    if (filters.state) qb.andWhere('c.state = :state', { state: filters.state });
    if (filters.city) qb.andWhere('c.city = :city', { city: filters.city });

    qb.orderBy('c.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByInviteCode(code: string): Promise<Competition> {
    const comp = await this.competitionsRepo.findOne({ where: { inviteCode: code } });
    if (!comp) throw new NotFoundException('Competition not found');
    return comp;
  }

  /** Get the count of confirmed teams for a competition. */
  async getConfirmedTeamCount(competitionId: string): Promise<number> {
    return this.teamsRepo.count({
      where: { competitionId, registrationStatus: TeamRegistrationStatus.CONFIRMED },
    });
  }

  // ── Webhook: confirm payment by account number ──

  async findByAccountNumber(accountNumber: string): Promise<Competition | null> {
    return this.competitionsRepo.createQueryBuilder('c')
      .where('RIGHT(c.account_number, 10) = :acct', { acct: accountNumber.replace(/\D/g, '').slice(-10) })
      .getOne();
  }

  async confirmPaymentByRef(competitionId: string, narration: string): Promise<CompetitionTeam | null> {
    const refMatch = narration?.toUpperCase().match(/CP([A-F0-9]{8})/);
    if (!refMatch) return null;

    const paymentRef = `CP${refMatch[1]}`;
    const team = await this.teamsRepo.findOne({ where: { competitionId, paymentRef } });
    if (!team || team.registrationStatus === TeamRegistrationStatus.CONFIRMED) return null;

    team.registrationStatus = TeamRegistrationStatus.CONFIRMED;
    team.paidAt = new Date();
    return this.teamsRepo.save(team);
  }

  // ── Helpers ──

  getNigerianStates() {
    return NIGERIAN_STATES;
  }

  private validateLocation(dto: { scope?: CompetitionScope; state?: string; city?: string }) {
    if (dto.scope === CompetitionScope.STATE || dto.scope === CompetitionScope.CITY) {
      if (!dto.state) throw new BadRequestException('State is required for state or city scope');
      if (!isValidState(dto.state)) throw new BadRequestException('Invalid state');
    }
    if (dto.scope === CompetitionScope.CITY) {
      if (!dto.city) throw new BadRequestException('City is required for city scope');
      if (!isValidCity(dto.state!, dto.city)) throw new BadRequestException('Invalid city for the selected state');
    }
  }

  private async organiserContact(organizationId: string) {
    const users = await this.usersService.findByOrganization(organizationId);
    const admins = users.filter((u) => u.role === UserRole.ORG_ADMIN);
    return (admins.length ? admins : users).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  }
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
