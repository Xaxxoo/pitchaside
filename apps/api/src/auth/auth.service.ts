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
import { UserRole } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private orgsService: OrganizationsService,
    private jwtService: JwtService,
    private mailService: MailService,
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
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.twoFactorEnabled) {
      return { requires2FA: true, userId: user.id };
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
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    try {
      const token = await this.usersService.createResetToken(user.id);
      await this.mailService.sendPasswordReset(
        user.email,
        user.firstName,
        token,
      );
    } catch (err: any) {
      this.logger.error(`Password reset email failed for ${email}: ${err.message}`);
      throw new ServiceUnavailableException(
        "We couldn't send the reset email right now. Please try again in a minute.",
      );
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async updateProfile(userId: string, data: { firstName: string; lastName: string; phone?: string; bvn?: string }) {
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

  async validate2FALogin(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.twoFactorSecret) {
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

    return { message: 'Password changed successfully.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const reset = await this.usersService.findValidResetToken(token);
    if (!reset) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(reset.userId, passwordHash);
    await this.usersService.markResetTokenUsed(reset.id);

    return { message: 'Password has been reset successfully.' };
  }

  // ── Refresh & Logout ──

  async refresh(rawRefreshToken: string) {
    const result = await this.usersService.rotateRefreshToken(rawRefreshToken);
    if (!result) throw new UnauthorizedException('Session expired, please sign in again');

    if (result.userId) {
      const user = await this.usersService.findById(result.userId);
      if (!user) throw new UnauthorizedException('User not found');
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
      bvn: user.bvn ?? null,
      role: user.role,
      organizationId: user.organizationId,
      organization: organization
        ? { id: organization.id, name: organization.name, createdAt: organization.createdAt }
        : undefined,
      twoFactorEnabled: user.twoFactorEnabled || false,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt,
    };
  }
}
