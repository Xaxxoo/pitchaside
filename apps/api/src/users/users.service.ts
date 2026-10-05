import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { randomBytes, createHash } from 'crypto';

/** Wrong transfer PINs in a row before the PIN locks, and for how long. */
export const TRANSFER_PIN_MAX_ATTEMPTS = 5;
export const TRANSFER_PIN_LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(PasswordReset) private resetRepo: Repository<PasswordReset>,
    @InjectRepository(RefreshToken) private refreshRepo: Repository<RefreshToken>,
  ) {}

  create(data: Partial<User>) {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  findByEmail(email: string) {
    return this.usersRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.organization', 'organization')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getOne();
  }

  findById(id: string) {
    return this.usersRepo.findOne({
      where: { id },
      relations: ['organization'],
    });
  }

  findByOrganization(organizationId: string) {
    return this.usersRepo.find({ where: { organizationId } });
  }

  findAll() {
    return this.usersRepo.find({ relations: ['organization'] });
  }

  async findAllPaginated(query: PaginationDto): Promise<PaginatedResult<User>> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.organization', 'organization');

    if (query.search) {
      qb.where(
        '(user.firstName ILIKE :s OR user.lastName ILIKE :s OR user.email ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    qb.orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  count() {
    return this.usersRepo.count();
  }

  countByOrganization(organizationId: string) {
    return this.usersRepo.count({ where: { organizationId } });
  }

  async updateProfile(userId: string, data: { firstName: string; lastName: string; phone?: string; bvn?: string }) {
    const { phone, bvn, ...names } = data;
    const update: Partial<User> = { ...names };
    if (phone !== undefined) update.phone = phone.trim() || null;
    if (bvn !== undefined) update.bvn = bvn;
    await this.usersRepo.update(userId, update);
    return this.findById(userId);
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.usersRepo.update(userId, { passwordHash });
  }

  async update2FASecret(userId: string, secret: string | null) {
    await this.usersRepo.update(userId, { twoFactorSecret: secret });
  }

  async enable2FA(userId: string) {
    await this.usersRepo.update(userId, { twoFactorEnabled: true });
  }

  async disable2FA(userId: string) {
    await this.usersRepo.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
  }

  // ── Password Reset Tokens ──

  async createResetToken(userId: string): Promise<string> {
    // Invalidate any existing tokens
    await this.resetRepo.update(
      { userId, used: false },
      { used: true },
    );

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.resetRepo.save(
      this.resetRepo.create({ userId, token, expiresAt }),
    );

    return token;
  }

  async findValidResetToken(token: string) {
    const reset = await this.resetRepo.findOne({
      where: { token, used: false },
      relations: ['user'],
    });
    if (!reset) return null;
    if (reset.expiresAt < new Date()) return null;
    return reset;
  }

  async markResetTokenUsed(id: string) {
    await this.resetRepo.update(id, { used: true });
  }

  // ── Refresh Tokens ──

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async createRefreshToken(userId: string | null, personKey: string | null): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const familyId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId,
        personKey,
        tokenHash: this.hashToken(raw),
        expiresAt,
        familyId,
      }),
    );

    return raw;
  }

  async rotateRefreshToken(rawToken: string): Promise<{ newRawToken: string; userId: string | null; personKey: string | null } | null> {
    const hash = this.hashToken(rawToken);
    const existing = await this.refreshRepo.findOne({ where: { tokenHash: hash } });

    if (!existing) return null;

    // If already revoked, this is a replay attack — revoke the whole family
    if (existing.revoked) {
      await this.refreshRepo.update({ familyId: existing.familyId }, { revoked: true });
      return null;
    }

    // Check expiry
    if (existing.expiresAt < new Date()) {
      existing.revoked = true;
      await this.refreshRepo.save(existing);
      return null;
    }

    // Revoke old token
    existing.revoked = true;
    await this.refreshRepo.save(existing);

    // Issue new token in the same family
    const newRaw = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: existing.userId,
        personKey: existing.personKey,
        tokenHash: this.hashToken(newRaw),
        expiresAt,
        familyId: existing.familyId,
      }),
    );

    return { newRawToken: newRaw, userId: existing.userId, personKey: existing.personKey };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const hash = this.hashToken(rawToken);
    await this.refreshRepo.update({ tokenHash: hash }, { revoked: true });
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshRepo.update({ userId, revoked: false }, { revoked: true });
  }

  async revokeAllPlayerRefreshTokens(personKey: string): Promise<void> {
    await this.refreshRepo.update({ personKey, revoked: false }, { revoked: true });
  }

  // ── Email Verification ──

  async createEmailVerificationToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await this.usersRepo.update(userId, {
      emailVerificationToken: token,
      emailVerificationExpiresAt: expiresAt,
    });
    return token;
  }

  async verifyEmail(token: string): Promise<User | null> {
    const user = await this.usersRepo.findOne({
      where: { emailVerificationToken: token },
      relations: ['organization'],
    });
    if (!user) return null;
    if (user.emailVerificationExpiresAt && user.emailVerificationExpiresAt < new Date()) return null;

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;
    return this.usersRepo.save(user);
  }

  // ── Transfer PIN ──

  async setTransferPin(userId: string, pin: string, currentPin?: string): Promise<void> {
    const user = await this.usersRepo.findOneOrFail({ where: { id: userId } });
    if (user.transferPin) {
      if (!currentPin) throw new BadRequestException('Current PIN is required');
      if (!(await this.checkTransferPin(user, currentPin))) throw new BadRequestException('Current PIN is incorrect');
    }
    user.transferPin = await bcrypt.hash(pin, 10);
    user.transferPinSetAt = new Date();
    user.transferPinFailedAttempts = 0;
    user.transferPinLockedUntil = null;
    await this.usersRepo.save(user);
  }

  async verifyTransferPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.usersRepo.findOneOrFail({ where: { id: userId } });
    if (!user.transferPin) throw new BadRequestException('Transfer PIN has not been set. Please set a PIN first.');
    return this.checkTransferPin(user, pin);
  }

  /**
   * Compares a PIN, counting wrong ones: after TRANSFER_PIN_MAX_ATTEMPTS in a row the PIN is
   * locked for TRANSFER_PIN_LOCK_MS, so a stolen session can't guess its way to a payout.
   */
  private async checkTransferPin(user: User, pin: string): Promise<boolean> {
    if (user.transferPinLockedUntil && user.transferPinLockedUntil > new Date()) {
      const minutes = Math.ceil((user.transferPinLockedUntil.getTime() - Date.now()) / 60_000);
      throw new BadRequestException(`Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    if (await bcrypt.compare(pin, user.transferPin!)) {
      if (user.transferPinFailedAttempts || user.transferPinLockedUntil) {
        await this.usersRepo.update(user.id, { transferPinFailedAttempts: 0, transferPinLockedUntil: null });
      }
      return true;
    }
    // Counted in the database, so guesses sent in parallel all add up.
    await this.usersRepo.increment({ id: user.id }, 'transferPinFailedAttempts', 1);
    const { transferPinFailedAttempts: failed } = await this.usersRepo.findOneOrFail({ where: { id: user.id } });
    if (failed >= TRANSFER_PIN_MAX_ATTEMPTS) {
      await this.usersRepo.update(user.id, {
        transferPinFailedAttempts: 0,
        transferPinLockedUntil: new Date(Date.now() + TRANSFER_PIN_LOCK_MS),
      });
      throw new BadRequestException(`Too many wrong PINs. Transfers are locked for ${TRANSFER_PIN_LOCK_MS / 60_000} minutes.`);
    }
    return false;
  }

  async hasTransferPin(userId: string): Promise<boolean> {
    const user = await this.usersRepo.findOneOrFail({ where: { id: userId } });
    return !!user.transferPin;
  }
}
