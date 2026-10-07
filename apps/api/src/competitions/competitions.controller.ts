import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { RegisterTeamDto } from './dto/register-team.dto';
import { RecordResultDto } from './dto/record-result.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CompetitionStatus, CompetitionScope } from './entities/competition.entity';
import { UsersService } from '../users/users.service';
import { BadRequestException } from '@nestjs/common';

/** Organiser endpoints — auth-guarded. */
@UseGuards(JwtAuthGuard)
@Controller('competitions')
export class CompetitionsController {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly users: UsersService,
  ) {}

  @Post()
  create(@Body() dto: CreateCompetitionDto, @CurrentUser() user: User) {
    return this.competitions.create(dto, user.id, user.organizationId);
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.competitions.findAll(user.organizationId, Number(page) || 1, Number(limit) || 10);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    const comp = await this.competitions.findOne(id, user.organizationId);
    const teamCount = await this.competitions.getConfirmedTeamCount(id);
    return { ...comp, teamCount };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompetitionDto, @CurrentUser() user: User) {
    return this.competitions.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.competitions.remove(id, user.organizationId);
  }

  @Post(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: CompetitionStatus,
    @CurrentUser() user: User,
  ) {
    return this.competitions.updateStatus(id, user.organizationId, status);
  }

  @Post(':id/account')
  async provisionAccount(@Param('id') id: string, @CurrentUser() user: User) {
    const fresh = await this.users.findById(user.id);
    if (!fresh?.bvn) {
      throw new BadRequestException('A BVN is required before creating a collection account. Please add your BVN in settings first.');
    }
    return this.competitions.provisionAccount(id, user.organizationId, fresh.bvn);
  }

  @Post(':id/generate-fixtures')
  generateFixtures(@Param('id') id: string, @CurrentUser() user: User) {
    return this.competitions.generateFixtures(id, user.organizationId);
  }

  @Get(':id/teams')
  getTeams(@Param('id') id: string, @CurrentUser() user: User) {
    // Verify ownership by loading with orgId
    this.competitions.findOne(id, user.organizationId);
    return this.competitions.getTeams(id);
  }

  @Patch(':id/teams/:teamId')
  updateTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() data: any,
    @CurrentUser() user: User,
  ) {
    return this.competitions.updateTeam(id, teamId, user.organizationId, data);
  }

  @Delete(':id/teams/:teamId')
  removeTeam(@Param('id') id: string, @Param('teamId') teamId: string, @CurrentUser() user: User) {
    return this.competitions.removeTeam(id, teamId, user.organizationId);
  }

  @Post(':id/teams/:teamId/confirm')
  confirmPayment(@Param('id') id: string, @Param('teamId') teamId: string, @CurrentUser() user: User) {
    return this.competitions.confirmPayment(id, teamId, user.organizationId);
  }

  @Get(':id/matches')
  getMatches(@Param('id') id: string, @CurrentUser() user: User) {
    this.competitions.findOne(id, user.organizationId);
    return this.competitions.getMatches(id);
  }

  @Patch(':id/matches/:matchId')
  updateMatchSchedule(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() dto: ScheduleMatchDto,
    @CurrentUser() user: User,
  ) {
    return this.competitions.updateMatchSchedule(id, matchId, user.organizationId, dto);
  }

  @Post(':id/matches/:matchId/result')
  recordResult(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() dto: RecordResultDto,
    @CurrentUser() user: User,
  ) {
    return this.competitions.recordResult(id, matchId, user.organizationId, dto);
  }

  @Get(':id/standings')
  getStandings(@Param('id') id: string, @CurrentUser() user: User) {
    this.competitions.findOne(id, user.organizationId);
    return this.competitions.getStandings(id);
  }

  @Get(':id/bracket')
  getBracket(@Param('id') id: string, @CurrentUser() user: User) {
    this.competitions.findOne(id, user.organizationId);
    return this.competitions.getBracket(id);
  }
}

/** Public endpoints — no auth required. */
@Controller('public')
export class PublicCompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Get('competitions')
  browse(
    @Query('scope') scope?: CompetitionScope,
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.competitions.browse({ scope, state, city }, Number(page) || 1, Number(limit) || 10);
  }

  @Get('competitions/:id')
  async findOne(@Param('id') id: string) {
    const comp = await this.competitions.findOne(id);
    const teamCount = await this.competitions.getConfirmedTeamCount(id);
    return { ...comp, teamCount };
  }

  @Get('competitions/invite/:code')
  findByInviteCode(@Param('code') code: string) {
    return this.competitions.findByInviteCode(code);
  }

  @Post('competitions/:id/register')
  register(@Param('id') id: string, @Body() dto: RegisterTeamDto) {
    return this.competitions.registerTeam(id, dto);
  }

  @Get('competitions/:id/teams')
  getTeams(@Param('id') id: string) {
    return this.competitions.getTeams(id);
  }

  @Get('competitions/:id/matches')
  getMatches(@Param('id') id: string) {
    return this.competitions.getMatches(id);
  }

  @Get('competitions/:id/standings')
  getStandings(@Param('id') id: string) {
    return this.competitions.getStandings(id);
  }

  @Get('competitions/:id/bracket')
  getBracket(@Param('id') id: string) {
    return this.competitions.getBracket(id);
  }

  @Get('nigerian-states')
  getNigerianStates() {
    return this.competitions.getNigerianStates();
  }
}
