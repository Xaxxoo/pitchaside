import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsBoolean, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushSubscriptionDto, UnsubscribeDto } from '../notifications/notifications.controller';
import { CurrentPerson, Person, PlayerAuthGuard, PlayerAuthService } from './player-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AllowTreasurer } from '../auth/decorators/allow-treasurer.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { PlayerPortalService } from './player-portal.service';
import { PhotosService } from '../players/photos.service';
import { PhotoDto } from '../players/dto/photo.dto';
import { setAuthCookies, setPlayerAuthCookies, clearPlayerAuthCookies, COOKIE_NAMES } from '../auth/cookie.util';
import { UsersService } from '../users/users.service';
import { emailKey } from '../common/format.util';
import { AwayDto, EventDto, GameDto, GoalDto } from '../ratings/ratings.controller';
import { KEEPER_PREFS } from '../ratings/plan';
import { tableRange } from '../ratings/ratings.service';
import type { KeeperPref } from '@pitchaside/shared';

const PHONE = /^[+\d][\d\s\-().]{6,}$/;

export class RequestCodeDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;
}

export class RsvpDto {
  @IsIn(['in', 'out'])
  status: 'in' | 'out';
}

export class ClaimPaymentDto {
  @IsNumber({}, { message: 'Enter the amount you sent' })
  @Min(1, { message: 'Enter the amount you sent' })
  @Max(10_000_000)
  amount: number;
}

export class PickTeamDto {
  /** The bib colour's side, A–F; null to clear it. */
  @IsIn(['A', 'B', 'C', 'D', 'E', 'F', null])
  team: string | null;
}

export class VoteDto {
  @IsObject()
  picks: Record<string, string>;
}

export class SignupDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  /** Optional contact number — not used to sign in. */
  @IsOptional()
  @Matches(PHONE, { message: 'Phone number format is invalid' })
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;
}

/** "Playing" switch: the code from their email, when the server asked for one. */
export class FromOrganiserDto {
  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{6}\s*$/, { message: 'The code is the 6 numbers in the email' })
  code?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  password: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class UpdateNameDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  /** What they're called on the pitch; blank clears it, left out keeps it. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  nickname?: string;
}

/** Whether they're happy to go in goal when the plan swaps players round; null: don't mind. */
export class NoticesDto {
  @IsBoolean()
  email: boolean;
}

export class KeeperDto {
  @IsOptional()
  @IsIn(KEEPER_PREFS)
  keeper?: KeeperPref;
}

export class StartGroupDto {
  @IsString()
  @MinLength(2)
  clubName: string;

  @IsString()
  @MinLength(8)
  password: string;
}

/**
 * Player sign-up and sign-in: email + password, with an emailed code to set or reset the password.
 *
 * Sign-up and sign-in allow 30 a minute per address: a whole squad often joins
 * from one network (pitch Wi-Fi, or a mobile carrier's shared address). Password
 * guessing is held back by the per-account limit instead (see rate-limit.ts).
 */
@UseGuards(ThrottlerGuard)
@Controller()
export class PlayerAuthController {
  constructor(
    private readonly auth: PlayerAuthService,
    private readonly billing: BillingService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /** Signs the browser in as this person (access + refresh cookies) and returns the access token. */
  private async startSession(res: Response, email: string) {
    const token = this.auth.issuePersonToken(email);
    const refreshToken = await this.usersService.createRefreshToken(null, emailKey(email));
    setPlayerAuthCookies(res, this.configService, token, refreshToken);
    return token;
  }

  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('player-auth/login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    if ('needsPassword' in result) return result;
    await this.startSession(res, dto.email);
    return result;
  }

  /** Emails a 6-digit code — for "Forgot password" and for a first password. */
  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 6 } })
  @Post('player-auth/request-code')
  requestCode(@Body() dto: RequestCodeDto) {
    return this.auth.requestCode(dto.email);
  }

  /** The code from /player-auth/request-code, then a new password. Signs them in. */
  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('player-auth/reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.resetPassword(dto.email, dto.code, dto.password);
    await this.usersService.revokeAllPlayerRefreshTokens(emailKey(dto.email));
    await this.startSession(res, dto.email);
    return result;
  }

  /** New player signing up from a group link: email, name, password, optional phone. */
  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('public/groups/:code/signup')
  async signup(
    @Param('code') code: string,
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
    @Query('game', new ParseUUIDPipe({ optional: true })) game?: string,
  ) {
    // Check the link before creating anything, so a bad link doesn't leave an account behind.
    await this.billing.getPublicGroup(code);
    await this.auth.createAccount(dto);
    const joined = await this.billing.joinGroup(code, dto, game);
    const token = await this.startSession(res, dto.email);
    return { ...joined, token };
  }

  /** Club invite link: the club and its groups, so new players can pick where they play. */
  @Get('public/clubs/:code')
  async club(@Param('code') code: string) {
    const club = await this.auth.clubByInviteCode(code);
    return { clubName: club.name, groups: await this.billing.publicGroupsForClub(club.id) };
  }

  /** Club invite link (no specific group): create the account and join the club. */
  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('public/clubs/:code/signup')
  async clubSignup(@Param('code') code: string, @Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const club = await this.auth.clubByInviteCode(code);
    const account = await this.auth.createAccount(dto);
    await this.auth.ensurePlayerInClub(club.id, account.personKey);
    const token = await this.startSession(res, dto.email);
    return { clubName: club.name, firstName: account.firstName, token };
  }

  /** Organiser → "Playing": swap a signed-in organiser for a player session under the same email. */
  @UseGuards(JwtAuthGuard)
  @AllowTreasurer()
  @Post('player-auth/from-organiser')
  async fromOrganiser(@CurrentUser() user: User, @Body() dto: FromOrganiserDto, @Res({ passthrough: true }) res: Response) {
    if (await this.auth.organiserNeedsProof(user)) {
      if (!dto?.code) {
        const sent = await this.auth.requestCode(user.email);
        return { needsCode: true as const, email: user.email, devCode: sent.devCode };
      }
      await this.auth.proveOrganiserEmail(user, dto.code);
    }
    await this.auth.ensureOrganiserPlayer(user);
    const token = await this.startSession(res, user.email);
    return { token };
  }

  // ── Player Refresh & Logout ──

  @SkipCsrf()
  @Post('player-auth/refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[COOKIE_NAMES.PLAYER_REFRESH];
    if (!rawRefreshToken) throw new BadRequestException('No refresh token');
    const result = await this.usersService.rotateRefreshToken(rawRefreshToken);
    // Sessions from before email sign-in are keyed by phone digits: they sign in again.
    if (!result?.personKey?.includes('@')) throw new BadRequestException('Session expired');
    const accessToken = this.auth.issuePersonToken(result.personKey);
    setPlayerAuthCookies(res, this.configService, accessToken, result.newRawToken);
    return { ok: true };
  }

  @Post('player-auth/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[COOKIE_NAMES.PLAYER_REFRESH];
    if (rawRefreshToken) {
      await this.usersService.revokeRefreshToken(rawRefreshToken);
    }
    clearPlayerAuthCookies(res, this.configService);
    return { message: 'Logged out' };
  }
}

/** The player app — everything behind a person sign-in. */
@UseGuards(PlayerAuthGuard)
@Controller('me')
export class PlayerPortalController {
  constructor(
    private readonly portal: PlayerPortalService,
    private readonly notifications: NotificationsService,
    private readonly playerAuth: PlayerAuthService,
    private readonly configService: ConfigService,
    private readonly photos: PhotosService,
    private readonly usersService: UsersService,
  ) {}

  /** Their own photo, on their record in every club they play for. */
  @Post('photo')
  setPhoto(@Body() dto: PhotoDto, @CurrentPerson() person: Person) {
    return this.photos.set(person.players.map((p) => p.id), dto.image);
  }

  @Delete('photo')
  removePhoto(@CurrentPerson() person: Person) {
    return this.photos.remove(person.players.map((p) => p.id));
  }

  @Get()
  home(@CurrentPerson() person: Person) {
    return this.portal.home(person);
  }

  @Get('games')
  games(@CurrentPerson() person: Person) {
    return this.portal.games(person);
  }

  @Get('games/:id')
  game(@Param('id') id: string, @CurrentPerson() person: Person) {
    return this.portal.game(person, id);
  }

  @Get('payments')
  payments(@CurrentPerson() person: Person) {
    return this.portal.payments(person);
  }

  @Get('profile')
  profile(@CurrentPerson() person: Person) {
    return this.portal.profile(person);
  }

  /** A game's squad with bibs, and who's paid when the group shares that. */
  @Get('games/:id/lineup')
  lineup(@Param('id') id: string, @CurrentPerson() person: Person) {
    return this.portal.gameLineup(person, id);
  }

  /** The Club tab: a group's table (all season, or the last N match days), for a group they play in. */
  @Get('groups/:groupId/table')
  groupTable(@Param('groupId') groupId: string, @Query() query: { last?: string; from?: string; to?: string }, @CurrentPerson() person: Person) {
    return this.portal.groupTable(person, groupId, tableRange(query));
  }

  /** The Club tab's Stats ranked by rating: each player's stats, votes and results parts. */
  @Get('groups/:groupId/ratings')
  groupRatings(@Param('groupId') groupId: string, @CurrentPerson() person: Person) {
    return this.portal.groupRatings(person, groupId);
  }

  /** How a player's card number is made: their own, or any player's in a club they play for. */
  @Get('players/:playerId/rating-breakdown')
  ratingBreakdown(@Param('playerId') playerId: string, @CurrentPerson() person: Person) {
    return this.portal.ratingBreakdown(person, playerId);
  }

  /** Match day for the day's captains: the scoreboard, games and scorers. */
  @Get('games/:id/match-day')
  matchDay(@Param('id') id: string, @CurrentPerson() person: Person) {
    return this.portal.matchDay(person, id);
  }

  /** The match-day clock: everyone in the game sees it; only the organiser starts and stops it. */
  @Get('games/:id/timer')
  timer(@Param('id') id: string, @CurrentPerson() person: Person) {
    return this.portal.timer(person, id);
  }

  @Post('games/:id/match-day/games')
  addMatchGame(@Param('id') id: string, @Body() dto: GameDto, @CurrentPerson() person: Person) {
    return this.portal.addMatchGame(person, id, dto);
  }

  @Post('games/:id/match-day/games/:gameId/goals')
  addGoal(@Param('id') id: string, @Param('gameId') gameId: string, @Body() dto: GoalDto, @CurrentPerson() person: Person) {
    return this.portal.addGoal(person, id, gameId, dto);
  }

  @Delete('games/:id/match-day/games/:gameId')
  deleteMatchGame(@Param('id') id: string, @Param('gameId') gameId: string, @CurrentPerson() person: Person) {
    return this.portal.deleteMatchGame(person, id, gameId);
  }

  @Post('games/:id/match-day/events')
  addEvent(@Param('id') id: string, @Body() dto: EventDto, @CurrentPerson() person: Person) {
    return this.portal.addEvent(person, id, dto);
  }

  @Delete('games/:id/match-day/events/:eventId')
  deleteEvent(@Param('id') id: string, @Param('eventId') eventId: string, @CurrentPerson() person: Person) {
    return this.portal.deleteEvent(person, id, eventId);
  }

  /** A captain marks one of their players as gone early, or back. */
  @Put('games/:id/match-day/away')
  setAway(@Param('id') id: string, @Body() dto: AwayDto, @CurrentPerson() person: Person) {
    return this.portal.setAway(person, id, dto.playerId, dto.at ?? null);
  }

  @Delete('games/:id/match-day/goals/:goalId')
  deleteGoal(@Param('id') id: string, @Param('goalId') goalId: string, @CurrentPerson() person: Person) {
    return this.portal.deleteGoal(person, id, goalId);
  }

  /** The bib the player was handed on the day. */
  @Post('games/:id/team')
  pickTeam(@Param('id') id: string, @Body() dto: PickTeamDto, @CurrentPerson() person: Person) {
    return this.portal.pickTeam(person, id, dto.team);
  }

  /** "Yes, I've paid": the player says they've transferred into this group's account. */
  @Post('groups/:id/paid')
  claimPayment(@Param('id') id: string, @Body() dto: ClaimPaymentDto, @CurrentPerson() person: Person) {
    return this.portal.claimPayment(person, id, dto.amount);
  }

  @Post('sessions/:id/rsvp')
  setRsvp(@Param('id') id: string, @Body() dto: RsvpDto, @CurrentPerson() person: Person) {
    return this.portal.setRsvp(person, id, dto.status);
  }

  /** Signed-in person opening a club invite link. */
  @Post('clubs/:code/join')
  async joinClub(@Param('code') code: string, @CurrentPerson() person: Person) {
    const club = await this.playerAuth.clubByInviteCode(code);
    await this.playerAuth.ensurePlayerInClub(club.id, person.key);
    return { clubName: club.name, firstName: person.firstName };
  }

  /** `game`: they came from that game's QR code (see BillingService.putOnGame). */
  @Post('groups/:code/join')
  join(@Param('code') code: string, @CurrentPerson() person: Person, @Query('game', new ParseUUIDPipe({ optional: true })) game?: string) {
    return this.portal.joinGroup(person, code, game);
  }

  @Get('votes/:token')
  myBallot(@Param('token') token: string, @CurrentPerson() person: Person) {
    return this.portal.myBallot(person, token);
  }

  @Post('votes/:token')
  vote(@Param('token') token: string, @Body() dto: VoteDto, @CurrentPerson() person: Person) {
    return this.portal.vote(person, token, dto.picks);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(ThrottlerGuard)
  @Post('start-group')
  async startGroup(@Body() dto: StartGroupDto, @CurrentPerson() person: Person, @Res({ passthrough: true }) res: Response) {
    const result = await this.portal.startGroup(person, dto);
    setAuthCookies(res, this.configService, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Patch('account')
  updateName(@Body() dto: UpdateNameDto, @CurrentPerson() person: Person) {
    return this.playerAuth.updateName(person, dto.firstName, dto.lastName, dto.nickname);
  }

  @Patch('notices')
  setNotices(@Body() dto: NoticesDto, @CurrentPerson() person: Person) {
    return this.playerAuth.setEmailNotices(person, dto.email);
  }

  @Patch('keeper')
  setKeeper(@Body() dto: KeeperDto, @CurrentPerson() person: Person) {
    return this.playerAuth.setKeeper(person, dto.keeper ?? null);
  }

  @Post('password')
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentPerson() person: Person, @Res({ passthrough: true }) res: Response) {
    const result = await this.playerAuth.changePassword(person, dto.currentPassword ?? '', dto.newPassword);
    // Other devices are signed out; this one gets a fresh session.
    await this.usersService.revokeAllPlayerRefreshTokens(person.key);
    const refreshToken = await this.usersService.createRefreshToken(null, person.key);
    setPlayerAuthCookies(res, this.configService, this.playerAuth.issuePersonToken(person.key), refreshToken);
    return result;
  }

  @Post('push')
  subscribe(@Body() dto: PushSubscriptionDto, @CurrentPerson() person: Person) {
    return this.notifications.subscribe(dto, { playerId: person.players[0]?.id, personKey: person.key });
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(ThrottlerGuard)
  @Post('push/test')
  testPush(@CurrentPerson() person: Person) {
    return this.notifications.testPerson({ playerId: person.players[0]?.id, personKey: person.key });
  }

  @Delete('push')
  unsubscribe(@Body() dto: UnsubscribeDto, @CurrentPerson() person: Person) {
    return this.notifications.unsubscribe(dto.endpoint, { personKey: person.key });
  }
}
