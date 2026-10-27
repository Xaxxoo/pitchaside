import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MATCH_EVENT_KINDS, type MatchEventKind } from './entities/match-event.entity';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { RatingsService, tableRange } from './ratings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

export class LineupDto {
  /** 2–6 sides. */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  teamCount?: number;

  /** playerId → 'A'…'F' | null */
  @IsOptional()
  @IsObject()
  teams?: Record<string, string | null>;

  /** 'A'…'F' → playerId | null: who captains each side (they're moved onto it). */
  @IsOptional()
  @IsObject()
  captains?: Record<string, string | null>;

  /** 'A'…'F' → playerId | null: each side's vice-captain (they're moved onto it too). */
  @IsOptional()
  @IsObject()
  vices?: Record<string, string | null>;
}

export class BalanceDto {
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  teamCount?: number;
}

export class GoalDto {
  @IsIn(['A', 'B', 'C', 'D', 'E', 'F'])
  team: string;

  @IsUUID()
  scorerId: string;

  @IsOptional()
  @IsUUID()
  assistId?: string | null;

  /** Sent again unchanged when the phone retries the same tap, so it's saved once. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientKey?: string;
}

export class EventDto {
  @IsUUID()
  playerId: string;

  @IsIn(MATCH_EVENT_KINDS)
  kind: MatchEventKind;

  /** Sent again unchanged when the phone retries the same tap, so it's saved once. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientKey?: string;
}

/** Start or stop the match-day clock, and/or set today's game length. */
export class TimerDto {
  @IsOptional()
  @IsBoolean()
  start?: boolean;

  /** true pauses the running clock, false resumes it. */
  @IsOptional()
  @IsBoolean()
  pause?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  minutes?: number;
}

export class GameBibsDto {
  /** Checked by cleanBibs: sides A–F, colours from the list, names up to 20 characters. */
  @IsOptional()
  @IsObject()
  bibs?: Record<string, { colour: string; name?: string | null }> | null;
}

/** The day's plan; checked by cleanPlan (whole minutes in range). Null takes it away. */
export class PlanDto {
  @IsOptional()
  @IsObject()
  plan?: Record<string, unknown> | null;
}

/** Someone left early (`at`: minutes after kick-off), or is back (null). */
export class AwayDto {
  @IsUUID()
  playerId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  at?: number | null;
}

export class ScoreDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  scoreA?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  scoreB?: number;

  /** Who was in goal for each side (null: not recorded); left out stays as it is. */
  @IsOptional()
  @IsUUID()
  keeperA?: string | null;

  @IsOptional()
  @IsUUID()
  keeperB?: string | null;
}

export class GameDto {
  @IsIn(['A', 'B', 'C', 'D', 'E', 'F'])
  teamA: string;

  @IsIn(['A', 'B', 'C', 'D', 'E', 'F'])
  teamB: string;

  @IsInt()
  @Min(0)
  @Max(99)
  scoreA: number;

  @IsInt()
  @Min(0)
  @Max(99)
  scoreB: number;

  /** Who scored (and set up) each goal, when the organiser saw it. Fewer than the score is fine. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(198)
  @ValidateNested({ each: true })
  @Type(() => GoalDto)
  goals?: GoalDto[];

  /** Sent again unchanged when the phone retries the same tap, so it's saved once. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  clientKey?: string;

  /** How long it lasted, from the timer (winner stays shares minutes out by it). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7200)
  seconds?: number;

  /** Who was in goal for each side (null: not recorded). Anyone playing today, a borrowed keeper too. */
  @IsOptional()
  @IsUUID()
  keeperA?: string | null;

  @IsOptional()
  @IsUUID()
  keeperB?: string | null;
}

class RatingModeDto {
  @IsIn(['classic', 'steady'])
  mode: 'classic' | 'steady';
}

/** Organiser views: vote link + results per game, league table, player ratings. */
@UseGuards(JwtAuthGuard)
@Controller()
export class RatingsController {
  constructor(
    private readonly ratings: RatingsService,
    private readonly config: ConfigService,
  ) {}

  @Get('sessions/:id/voting')
  async sessionVoting(@Param('id') id: string, @CurrentUser() user: User) {
    const voting = await this.ratings.getSessionVoting(id, user.organizationId);
    return { ...voting, link: `${this.config.get('APP_URL', 'http://localhost:3000')}/v/${voting.token}` };
  }

  @Get('sessions/:id/lineup')
  lineup(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ratings.getLineup(id, user.organizationId);
  }

  @Get('sessions/:id/timer')
  timer(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ratings.getTimer(id, user.organizationId);
  }

  @Put('sessions/:id/timer')
  setTimer(@Param('id') id: string, @Body() dto: TimerDto, @CurrentUser() user: User) {
    return this.ratings.setTimer(id, user.organizationId, dto);
  }

  @Put('sessions/:id/plan')
  setPlan(@Param('id') id: string, @Body() dto: PlanDto, @CurrentUser() user: User) {
    return this.ratings.setPlan(id, user.organizationId, dto.plan ?? null);
  }

  @Put('sessions/:id/plan/away')
  setAway(@Param('id') id: string, @Body() dto: AwayDto, @CurrentUser() user: User) {
    return this.ratings.setAway(id, user.organizationId, dto.playerId, dto.at ?? null);
  }

  @Put('sessions/:id/lineup')
  setLineup(@Param('id') id: string, @Body() dto: LineupDto, @CurrentUser() user: User) {
    return this.ratings.setLineup(id, user.organizationId, dto);
  }

  @Post('sessions/:id/lineup/balance')
  balance(@Param('id') id: string, @Body() dto: BalanceDto, @CurrentUser() user: User) {
    return this.ratings.balanceTeams(id, user.organizationId, dto.teamCount);
  }

  /** This game's bibs for the day; `bibs: null` goes back to the group's. */
  @Patch('sessions/:id/bibs')
  setGameBibs(@Param('id') id: string, @Body() dto: GameBibsDto, @CurrentUser() user: User) {
    return this.ratings.setGameBibs(id, user.organizationId, dto.bibs ?? null);
  }

  @Post('sessions/:id/games')
  addGame(@Param('id') id: string, @Body() dto: GameDto, @CurrentUser() user: User) {
    return this.ratings.addGame(id, user.organizationId, dto, `${user.firstName} (organiser)`);
  }

  @Post('sessions/:id/games/:gameId/goals')
  addGoal(@Param('id') id: string, @Param('gameId') gameId: string, @Body() dto: GoalDto, @CurrentUser() user: User) {
    return this.ratings.addGoal(id, gameId, user.organizationId, dto, `${user.firstName} (organiser)`);
  }

  @Delete('sessions/:id/goals/:goalId')
  deleteGoal(@Param('id') id: string, @Param('goalId') goalId: string, @CurrentUser() user: User) {
    return this.ratings.deleteGoal(id, goalId, user.organizationId);
  }

  /** A yellow card, red card or save on match day. */
  @Post('sessions/:id/events')
  addEvent(@Param('id') id: string, @Body() dto: EventDto, @CurrentUser() user: User) {
    return this.ratings.addEvent(id, user.organizationId, dto, `${user.firstName} (organiser)`);
  }

  @Delete('sessions/:id/events/:eventId')
  deleteEvent(@Param('id') id: string, @Param('eventId') eventId: string, @CurrentUser() user: User) {
    return this.ratings.deleteEvent(id, eventId, user.organizationId);
  }

  /** Correct a saved game's score (organiser only). */
  @Patch('sessions/:id/games/:gameId')
  updateGame(@Param('id') id: string, @Param('gameId') gameId: string, @Body() dto: ScoreDto, @CurrentUser() user: User) {
    return this.ratings.updateGame(id, gameId, user.organizationId, dto);
  }

  @Delete('sessions/:id/games/:gameId')
  deleteGame(@Param('id') id: string, @Param('gameId') gameId: string, @CurrentUser() user: User) {
    return this.ratings.deleteGame(id, gameId, user.organizationId);
  }

  /** The trial 40/40/20 rating beside the card's, for the organiser to compare. */
  @Get('groups/:id/rating-trial')
  ratingTrial(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ratings.getRatingTrial(id, user.organizationId);
  }

  /** How the club's player cards are worked out: classic or steady. */
  @Get('ratings/mode')
  async ratingMode(@CurrentUser() user: User) {
    return { mode: await this.ratings.ratingMode(user.organizationId) };
  }

  @Put('ratings/mode')
  setRatingMode(@Body() body: RatingModeDto, @CurrentUser() user: User) {
    return this.ratings.setRatingMode(user.organizationId, body.mode);
  }

  /** How a player's card number is made, part by part. */
  @Get('players/:id/rating-breakdown')
  ratingBreakdown(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ratings.ratingBreakdown(id, user.organizationId);
  }

  @Get('groups/:id/table')
  groupTable(@Param('id') id: string, @Query() query: { last?: string; from?: string; to?: string }, @CurrentUser() user: User) {
    // "Last 5 match days" (1–52) and/or a date range; anything else means the whole season.
    return this.ratings.getGroupTable(id, user.organizationId, tableRange(query));
  }

  @Get('players/:id/ratings')
  playerRatings(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ratings.getPlayerRatings(id, user.organizationId);
  }
}

/** The post-match ballot players open from WhatsApp — no account needed. */
@UseGuards(ThrottlerGuard)
@Controller('public/votes')
export class PublicRatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get(':token')
  ballot(@Param('token') token: string) {
    return this.ratings.getBallot(token);
  }

  @Get(':token/results')
  results(@Param('token') token: string) {
    return this.ratings.getPublicResults(token);
  }

  /**
   * Match-day summary for the shareable card image. The web server fetches it (the page, its
   * preview and the image), so every viewer arrives from the same few addresses: the usual
   * 10 a minute would be 10 for the whole app. Read-only, behind an unguessable token, and
   * cached for a minute on the web side.
   */
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get(':token/card')
  card(@Param('token') token: string) {
    return this.ratings.getMatchCard(token);
  }
}

/** A group's table behind its share link (the join link's code): no account needed. */
@UseGuards(ThrottlerGuard)
@Controller('public/groups')
export class PublicTableController {
  constructor(private readonly ratings: RatingsService) {}

  /** Fetched by the web server for every viewer of the shared table, like the match card. */
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get(':code/table')
  table(@Param('code') code: string, @Query() query: { last?: string; from?: string; to?: string }) {
    return this.ratings.getPublicTable(code, tableRange(query));
  }
}

/** A player's card behind its share link (their id): no account needed. */
@UseGuards(ThrottlerGuard)
@Controller('public/players')
export class PublicPlayerCardController {
  constructor(private readonly ratings: RatingsService) {}

  /** Fetched by the web server for every viewer of the shared card, like the match card. */
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get(':id/card')
  card(@Param('id', ParseUUIDPipe) id: string) {
    return this.ratings.getPublicPlayerCard(id);
  }
}
