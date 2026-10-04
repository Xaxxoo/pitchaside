import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { createHash, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Player } from '../players/entities/player.entity';
import { User } from '../users/entities/user.entity';
import { emailKey } from '../common/format.util';
import { MailService } from '../mail/mail.service';
import { clubPlayerFor } from '../players/club-player';
import { PhoneOtp } from './entities/phone-otp.entity';
import { PlayerAccount } from './entities/player-account.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { COOKIE_NAMES } from '../auth/cookie.util';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

/** A person = an email address. They may play for several clubs and/or organise one. */
interface PersonClaims {
  typ: 'person';
  key: string;
}

/** Tokens issued before person accounts (one player record). Still accepted. */
interface LegacyPlayerClaims {
  typ: 'player';
  sub: string;
}

export interface Person {
  /** Their identity: lower-cased email. */
  key: string;
  email: string;
  /** Optional contact number. */
  phone: string | null;
  /** Their player record in each club they play for. */
  players: Player[];
  firstName: string;
  lastName: string;
}

@Injectable()
export class PlayerAuthService {
  constructor(
    @InjectRepository(PhoneOtp) private otpRepo: Repository<PhoneOtp>,
    @InjectRepository(Player) private playersRepo: Repository<Player>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(PlayerAccount) private accountsRepo: Repository<PlayerAccount>,
    @InjectRepository(Organization) private orgsRepo: Repository<Organization>,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  /** Player tokens use their own secret so they can never pass as organiser tokens. */
  private get secret() {
    return `${this.config.get('JWT_SECRET', 'pitchaside-dev-secret')}:player`;
  }

  private hash(code: string, key: string) {
    return createHash('sha256').update(`${code}:${key}:${this.secret}`).digest('hex');
  }

  /** Every player record (one per club) with this email, oldest first. */
  findPlayersByKey(key: string) {
    return this.playersRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.organization', 'org')
      .where('lower(p.email) = :key', { key })
      .orderBy('p.createdAt', 'ASC')
      .getMany();
  }

  /** Organiser accounts with this email — the same person, running a club. */
  findOrganisersByKey(key: string) {
    return this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.organization', 'org')
      .where('lower(u.email) = :key', { key })
      .getMany();
  }

  // ── Accounts & passwords ──

  /**
   * The person's account. Found by email; if they signed up back when the
   * phone number was the login, that account is moved over to their email.
   * Otherwise created on the fly (no password yet) from the player record an
   * organiser made for them.
   */
  async accountFor(key: string): Promise<PlayerAccount | null> {
    const existing = await this.accountsRepo.findOne({ where: { personKey: key } });
    if (existing) return existing;

    const withThisEmail = await this.accountsRepo
      .createQueryBuilder('a')
      .where('lower(a.email) = :key', { key })
      .orderBy('a.createdAt', 'ASC')
      .getMany();
    // Prefer one they've already set a password on.
    const fromPhoneDays = withThisEmail.find((a) => a.passwordHash) ?? withThisEmail[0];
    if (fromPhoneDays) {
      fromPhoneDays.personKey = key;
      return this.accountsRepo.save(fromPhoneDays);
    }

    const players = await this.findPlayersByKey(key);
    const organisers = players.length ? [] : await this.findOrganisersByKey(key);
    const source = players[players.length - 1] ?? organisers[0];
    if (!source) return null;
    return this.accountsRepo.save(
      this.accountsRepo.create({
        personKey: key,
        email: key,
        phone: source.phone ?? null,
        firstName: source.firstName,
        lastName: source.lastName,
        passwordHash: null,
      }),
    );
  }

  private validatePassword(password: string) {
    if (!password || password.length < 6) throw new BadRequestException('Password must be at least 6 characters');
  }

  /** Brand-new person signing up through a group or club link. */
  async createAccount(input: { email: string; firstName: string; lastName: string; phone?: string; password: string }) {
    const key = emailKey(input.email);
    this.validatePassword(input.password);
    const existing = await this.accountFor(key);
    if (existing) {
      throw new ConflictException(
        existing.passwordHash
          ? 'You already have a PitchAside account — sign in instead.'
          : 'This email is already registered — sign in to set your password.',
      );
    }
    return this.accountsRepo.save(
      this.accountsRepo.create({
        personKey: key,
        email: key,
        phone: input.phone?.trim() || null,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        passwordHash: await bcrypt.hash(input.password, 10),
      }),
    );
  }

  /** Club invite link (/join/:code): the club behind it, or a 404. */
  async clubByInviteCode(code: string) {
    const org = await this.orgsRepo.findOne({ where: { inviteCode: code } });
    if (!org) throw new NotFoundException('This invite link is invalid. Ask your organiser for the latest link.');
    return org;
  }

  /** This person's player record in a club, created from their account if they're new there. */
  async ensurePlayerInClub(organizationId: string, key: string) {
    const account = await this.accountFor(key);
    if (!account) throw new NotFoundException('Account not found');
    return clubPlayerFor(this.playersRepo, organizationId, {
      email: key,
      phone: account.phone,
      firstName: account.firstName,
      lastName: account.lastName,
    });
  }

  /**
   * Email + password. Accounts without a password yet (an organiser added the
   * player) get `needsPassword`: the app then emails them a code to set one.
   */
  async login(email: string, password: string) {
    const key = emailKey(email);
    const account = await this.accountFor(key);
    if (!account) {
      throw new NotFoundException("There's no PitchAside account with that email. Ask your organiser for your group link.");
    }
    if (!account.passwordHash) return { needsPassword: true as const, firstName: account.firstName };
    if (!(await bcrypt.compare(password ?? '', account.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    return { token: this.issuePersonToken(key), firstName: account.firstName };
  }

  /**
   * Emails a one-time code that proves the person owns the address. Used for
   * "Forgot password" and for a first password on an organiser-created account.
   */
  async requestCode(email: string) {
    const key = emailKey(email);
    const account = await this.accountFor(key);
    if (!account) {
      throw new NotFoundException("There's no PitchAside account with that email. Ask your organiser for your group link.");
    }

    const recent = await this.otpRepo.find({
      where: { personKey: key, createdAt: MoreThan(new Date(Date.now() - 60 * 60 * 1000)) },
      order: { createdAt: 'DESC' },
    });
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_AFTER_MS) {
      throw new HttpException('Please wait a few seconds before asking for another code', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (recent.length >= MAX_CODES_PER_HOUR) {
      throw new HttpException('Too many codes requested — try again in an hour', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(100000, 1000000));
    await this.otpRepo.save(
      this.otpRepo.create({ personKey: key, codeHash: this.hash(code, key), expiresAt: new Date(Date.now() + CODE_TTL_MS) }),
    );
    await this.mail.sendPlayerCode(account.email ?? key, account.firstName, code);

    return {
      sent: true,
      // Local development only, when no mail server is configured: show the code so the flow can be tested.
      devCode: this.mail.mode === 'mock' && this.config.get('NODE_ENV') !== 'production' ? code : undefined,
    };
  }

  private async verifyCode(key: string, code: string) {
    const otp = await this.otpRepo.findOne({
      where: { personKey: key, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    if (!otp || otp.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException('That code has expired — request a new one');
    if (otp.codeHash !== this.hash(code.trim(), key)) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      throw new UnauthorizedException('Wrong code — check the email and try again');
    }
    otp.usedAt = new Date();
    await this.otpRepo.save(otp);
  }

  /** Set a first password or replace a forgotten one, with the code from requestCode. */
  async resetPassword(email: string, code: string, password: string) {
    this.validatePassword(password);
    const key = emailKey(email);
    await this.verifyCode(key, code);
    const account = await this.accountFor(key);
    if (!account) throw new NotFoundException("There's no PitchAside account with that email.");
    account.passwordHash = await bcrypt.hash(password, 10);
    await this.accountsRepo.save(account);
    return { token: this.issuePersonToken(key), firstName: account.firstName };
  }

  async changePassword(person: Person, current: string, next: string) {
    this.validatePassword(next);
    const account = await this.accountFor(person.key);
    if (!account) throw new NotFoundException('Account not found');
    if (account.passwordHash && !(await bcrypt.compare(current ?? '', account.passwordHash))) {
      throw new UnauthorizedException('Your current password is wrong');
    }
    account.passwordHash = await bcrypt.hash(next, 10);
    await this.accountsRepo.save(account);
    return { ok: true };
  }

  /** Renames the person everywhere: their account and their player record in every club. */
  async updateName(person: Person, firstName: string, lastName: string) {
    const account = await this.accountFor(person.key);
    if (account) {
      account.firstName = firstName.trim();
      account.lastName = lastName.trim();
      await this.accountsRepo.save(account);
    }
    for (const p of person.players) {
      p.firstName = firstName.trim();
      p.lastName = lastName.trim();
    }
    if (person.players.length) await this.playersRepo.save(person.players);
    return { firstName: firstName.trim(), lastName: lastName.trim() };
  }

  /** An organiser switching to Playing gets a player record in their own club (so they can join their own games). */
  ensureOrganiserPlayer(user: User) {
    return clubPlayerFor(this.playersRepo, user.organizationId, {
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  issuePersonToken(email: string) {
    return this.jwt.sign({ typ: 'person', key: emailKey(email) } satisfies PersonClaims, {
      secret: this.secret,
      expiresIn: '15m',
    });
  }

  async personFromToken(token: string): Promise<Person> {
    let claims: PersonClaims | LegacyPlayerClaims;
    try {
      claims = this.jwt.verify<PersonClaims | LegacyPlayerClaims>(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('Please sign in again');
    }
    let key: string;
    if (claims.typ === 'person') {
      key = claims.key;
    } else if (claims.typ === 'player') {
      const legacy = await this.playersRepo.findOne({ where: { id: claims.sub } });
      if (!legacy?.email) throw new UnauthorizedException('Please sign in again');
      key = emailKey(legacy.email);
    } else {
      throw new UnauthorizedException('Please sign in again');
    }
    // Sessions from when the phone number was the login carry phone digits here — they sign in again with email.
    if (!key.includes('@')) throw new UnauthorizedException('Please sign in again');

    const players = await this.findPlayersByKey(key);
    const account = await this.accountsRepo.findOne({ where: { personKey: key } });
    const organisers = players.length ? [] : await this.findOrganisersByKey(key);
    const named = account ?? players[players.length - 1] ?? organisers[0];
    if (!named) throw new UnauthorizedException('Please sign in again');
    return {
      key,
      email: account?.email ?? key,
      phone: account?.phone ?? players.find((p) => p.phone)?.phone ?? null,
      players,
      firstName: named.firstName,
      lastName: named.lastName,
    };
  }
}

/** Requires a player token (cookie or Authorization header); puts the person on request.person. */
@Injectable()
export class PlayerAuthGuard implements CanActivate {
  constructor(private auth: PlayerAuthService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    // Try HttpOnly cookie first, fall back to Bearer header
    let token = req.cookies?.[COOKIE_NAMES.PLAYER_ACCESS];
    if (!token) {
      const header: string | undefined = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Please sign in');
      token = header.slice(7);
    }
    req.person = await this.auth.personFromToken(token);
    return true;
  }
}

export const CurrentPerson = createParamDecorator((_: unknown, ctx: ExecutionContext): Person => {
  return ctx.switchToHttp().getRequest().person;
});
