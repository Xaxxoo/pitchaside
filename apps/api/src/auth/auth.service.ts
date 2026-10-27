import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  generateSecret,
  generateURI,
  verifySync,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} from 'otplib';
import * as QRCode from 'qrcode';

const otpCrypto = new NobleCryptoPlugin();
const otpBase32 = new ScureBase32Plugin();
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { MailService } from '../mail/mail.service';
import { CryptoService } from '../crypto/crypto.service';
import { UserRole } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/** An identity number as the browser sees it: `•••••••4521`, or null. */
function maskId(value?: string | null) {
  return value ? `${'•'.repeat(value.length - 4)}${value.slice(-4)}` : null;
}

/** `typ` of the token login hands out between the password and the 2FA code. */
export const TWO_FACTOR_CHALLENGE = '2fa';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private orgsService: OrganizationsService,
    private jwtService: JwtService,
    private mailService: MailService,
    private cryptoService: CryptoService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const organization = await this.orgsService.create(dto.organizationName, dto.country, dto.state);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      role: UserRole.ORG_ADMIN,
      organizationId: organization.id,
      phone: dto.phone?.trim() || null,
    });

    // Provision crypto wallets for the new user (non-fatal)
    try {
      await this.cryptoService.provisionUserWallets(user);
    } catch (err) {
      this.logger.warn(`Failed to provision crypto wallets for user ${user.id}: ${err}`);
    }

    // Send verification email (non-blocking)
    const verifyToken = await this.usersService.createEmailVerificationToken(user.id);
    this.mailService.sendEmailVerification(user.email, user.firstName, verifyToken).catch((err) => {
      console.error('[MAIL ERROR]', err?.message || err);
    });

    const accessToken = this.jwtService.sign({ sub: user.id });
    const refreshToken = await this.usersService.createRefreshToken(user.id, null);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user, organization),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.removedAt) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.twoFactorEnabled) {
      // Proof the password was right, for the code step only: short-lived, and marked so the JWT
      // strategy never accepts it as a session.
      const challenge = this.jwtService.sign({ sub: user.id, typ: TWO_FACTOR_CHALLENGE }, { expiresIn: '5m' });
      return { requires2FA: true, challenge };
    }

    const accessToken = this.jwtService.sign({ sub: user.id });
    const refreshToken = await this.usersService.createRefreshToken(user.id, null);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user, user.organization),
    };
  }

  getProfile(user: any) {
    return this.sanitizeUser(user, user.organization);
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    // Always return success to avoid email enumeration
    if (!user) {
      this.logger.warn(`Password reset requested for unknown email: ${email}`);
      return { message: 'If that email exists, a reset link has been sent.' };
    }

    this.logger.log(`Password reset: found user ${user.id} (${user.email})`);

    try {
      const token = await this.usersService.createResetToken(user.id);
      this.logger.log(`Password reset: token created for user ${user.id}`);

      await this.mailService.sendPasswordReset(
        user.email,
        user.firstName,
        token,
      );
      this.logger.log(`Password reset: email sent to ${user.email}`);
    } catch (err: any) {
      this.logger.error(`Password reset failed for ${email}: ${err.message}`, err.stack);
      throw new ServiceUnavailableException(
        "We couldn't send the reset email right now. Please try again in a minute.",
      );
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async setIdentity(userId: string, ids: { bvn?: string; nin?: string }) {
    if (!ids.bvn && !ids.nin) throw new BadRequestException('Enter your BVN and NIN');
    const user = await this.usersService.setIdentity(userId, ids);
    if (!user) throw new UnauthorizedException('User not found');
    return this.sanitizeUser(user, user.organization);
  }

  async updateProfile(userId: string, data: { firstName: string; lastName: string; phone?: string }) {
    const user = await this.usersService.updateProfile(userId, data);
    if (!user) throw new UnauthorizedException('User not found');
    return this.sanitizeUser(user, user.organization);
  }

  async setup2FA(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const secret = generateSecret({ crypto: otpCrypto, base32: otpBase32 });
    await this.usersService.update2FASecret(userId, secret);

    const otpauthUrl = generateURI({ label: user.email, issuer: 'PitchAside', secret });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { qrCodeUrl, secret };
  }

  async verify2FA(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA not set up');
    }

    const result = verifySync({ token: code, secret: user.twoFactorSecret, crypto: otpCrypto, base32: otpBase32 });
    if (!result.valid) throw new BadRequestException('Invalid code');

    await this.usersService.enable2FA(userId);
    return { message: '2FA enabled successfully' };
  }

  async disable2FA(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA not enabled');
    }

    const result = verifySync({ token: code, secret: user.twoFactorSecret, crypto: otpCrypto, base32: otpBase32 });
    if (!result.valid) throw new BadRequestException('Invalid code');

    await this.usersService.disable2FA(userId);
    return { message: '2FA disabled successfully' };
  }

  /** The code step of sign-in: only after the password step, which issued `challenge`. */
  async validate2FALogin(challenge: string, code: string) {
    let userId: string;
    try {
      const claims = this.jwtService.verify<{ sub: string; typ?: string }>(challenge);
      if (claims.typ !== TWO_FACTOR_CHALLENGE) throw new Error('not a 2FA challenge');
      userId = claims.sub;
    } catch {
      throw new UnauthorizedException('Sign in again — that took too long');
    }
    const user = await this.usersService.findById(userId);
    if (!user || !user.twoFactorSecret || user.removedAt) {
      throw new UnauthorizedException('Invalid request');
    }

    const result = verifySync({ token: code, secret: user.twoFactorSecret, crypto: otpCrypto, base32: otpBase32 });
    if (!result.valid) throw new UnauthorizedException('Invalid 2FA code');

    const accessToken = this.jwtService.sign({ sub: user.id });
    const refreshToken = await this.usersService.createRefreshToken(user.id, null);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user, user.organization),
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(userId, passwordHash);
    // Anyone holding an old session (a stolen cookie, a shared laptop) is signed out; this device
    // gets a fresh session.
    await this.usersService.revokeAllRefreshTokens(userId);
    const accessToken = this.jwtService.sign({ sub: userId });
    const refreshToken = await this.usersService.createRefreshToken(userId, null);

    return { message: 'Password changed successfully.', accessToken, refreshToken };
  }

  async resetPassword(token: string, newPassword: string) {
    const reset = await this.usersService.findValidResetToken(token);
    if (!reset) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(reset.userId, passwordHash);
    await this.usersService.markResetTokenUsed(reset.id);
    await this.usersService.revokeAllRefreshTokens(reset.userId);

    return { message: 'Password has been reset successfully.' };
  }

  // ── Refresh & Logout ──

  async refresh(rawRefreshToken: string) {
    const result = await this.usersService.rotateRefreshToken(rawRefreshToken);
    if (!result) throw new UnauthorizedException('Session expired, please sign in again');

    if (result.userId) {
      const user = await this.usersService.findById(result.userId);
      if (!user || user.removedAt) throw new UnauthorizedException('User not found');
      const accessToken = this.jwtService.sign({ sub: user.id });
      return { accessToken, refreshToken: result.newRawToken, user: this.sanitizeUser(user, user.organization) };
    }

    throw new UnauthorizedException('Invalid refresh token');
  }

  async logout(rawRefreshToken: string | undefined) {
    if (rawRefreshToken) {
      await this.usersService.revokeRefreshToken(rawRefreshToken);
    }
  }

  // ── Email Verification ──

  async verifyEmailToken(token: string) {
    return this.usersService.verifyEmail(token);
  }

  async resendVerification(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email already verified');
    const token = await this.usersService.createEmailVerificationToken(userId);
    await this.mailService.sendEmailVerification(user.email, user.firstName, token);
  }

  private sanitizeUser(user: any, organization?: any) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      // Never the full number: the app only needs to know there is one, and which.
      bvn: maskId(user.bvn),
      nin: maskId(user.nin),
      role: user.role,
      organizationId: user.organizationId,
      organization: organization
        ? { id: organization.id, name: organization.name, createdAt: organization.createdAt }
        : undefined,
      twoFactorEnabled: user.twoFactorEnabled || false,
      emailVerified: user.emailVerified || false,
      emailNotices: user.emailNotices !== false,
      createdAt: user.createdAt,
    };
  }
}
