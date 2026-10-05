import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsEmail, IsIn, IsObject, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
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
import { setAuthCookies, setPlayerAuthCookies, clearPlayerAuthCookies, COOKIE_NAMES } from '../auth/cookie.util';
import { UsersService } from '../users/users.service';
import { emailKey } from '../common/format.util';

const PHONE = /^[+\d][\d\s\-().]{6,}$/;

export class RequestCodeDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;
}

export class RsvpDto {
  @IsIn(['in', 'out'])
  status: 'in' | 'out';
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
    await this.startSession(res, dto.email);
    return result;
  }

  /** New player signing up from a group link: email, name, password, optional phone. */
  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('public/groups/:code/signup')
  async signup(@Param('code') code: string, @Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    // Check the link before creating anything, so a bad link doesn't leave an account behind.
    await this.billing.getPublicGroup(code);
    await this.auth.createAccount(dto);
    const joined = await this.billing.joinGroup(code, dto);
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
  async fromOrganiser(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
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
  ) {}

  @Get()
  home(@CurrentPerson() person: Person) {
    return this.portal.home(person);
  }

  @Get('games')
  games(@CurrentPerson() person: Person) {
    return this.portal.games(person);
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

  /** The bib the player was handed on the day. */
  @Post('games/:id/team')
  pickTeam(@Param('id') id: string, @Body() dto: PickTeamDto, @CurrentPerson() person: Person) {
    return this.portal.pickTeam(person, id, dto.team);
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

  @Post('groups/:code/join')
  join(@Param('code') code: string, @CurrentPerson() person: Person) {
    return this.portal.joinGroup(person, code);
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
    return this.playerAuth.updateName(person, dto.firstName, dto.lastName);
  }

  @Post('password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentPerson() person: Person) {
    return this.playerAuth.changePassword(person, dto.currentPassword ?? '', dto.newPassword);
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
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.notifications.unsubscribe(dto.endpoint);
  }
}
