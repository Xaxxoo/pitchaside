import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { MailService } from '../mail/mail.service';
import { CryptoService } from '../crypto/crypto.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlayerAccount } from '../player-portal/entities/player-account.entity';
import { UserRole } from '../users/entities/user.entity';

jest.mock('bcrypt');

// Mock the @nestjs/jwt module to avoid ESM issues
const mockJwtSign = jest.fn().mockReturnValue('jwt-token');
const mockJwtVerify = jest.fn();
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {
    sign = mockJwtSign;
    verify = mockJwtVerify;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JwtService } = require('@nestjs/jwt');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<string, jest.Mock>;
  let orgsService: Record<string, jest.Mock>;
  let mailService: Record<string, jest.Mock>;

  const mockOrg = { id: 'org-1', name: 'Test Org', createdAt: new Date() };
  const mockUser = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    passwordHash: 'hashed-pw',
    role: UserRole.ORG_ADMIN,
    organizationId: 'org-1',
    organization: mockOrg,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockJwtSign.mockClear().mockReturnValue('jwt-token');

    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updatePassword: jest.fn(),
      findValidResetToken: jest.fn(),
      markResetTokenUsed: jest.fn(),
      createResetToken: jest.fn(),
      createEmailVerificationToken: jest.fn().mockResolvedValue('verify-token'),
      createRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
      revokeAllRefreshTokens: jest.fn(),
    };
    orgsService = { create: jest.fn() };
    mailService = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationsService, useValue: orgsService },
        { provide: JwtService, useValue: { sign: mockJwtSign, verify: mockJwtVerify } },
        { provide: MailService, useValue: mailService },
        { provide: CryptoService, useValue: { provisionUserWallets: jest.fn().mockResolvedValue([]) } },
        // Pitch-owner sign-up looks up player accounts; none here
        { provide: getRepositoryToken(PlayerAccount), useValue: { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create org + user and return token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      orgsService.create.mockResolvedValue(mockOrg);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      usersService.create.mockResolvedValue(mockUser);

      const result = await service.register({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        password: 'password123',
        organizationName: 'Test Org',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect((result as any).user.email).toBe('john@test.com');
      expect(orgsService.create).toHaveBeenCalledWith('Test Org', undefined, undefined);
      expect(usersService.create).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate email', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          password: 'password123',
          organizationName: 'Test Org',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('upgradePitchOwnerToOrganiser', () => {
    const owner = { ...mockUser, id: 'owner-1', role: UserRole.PITCH_OWNER, organizationId: 'org-p', organization: { id: 'org-p', name: "Ada's Pitches" } };
    beforeEach(() => {
      (orgsService as any).rename = jest.fn();
      (usersService as any).setRole = jest.fn();
    });

    it('turns the pitch account into the club admin, renaming its hidden club, with its own password', async () => {
      usersService.findById.mockResolvedValueOnce(owner).mockResolvedValueOnce({ ...owner, role: UserRole.ORG_ADMIN, organization: { id: 'org-p', name: 'Surulere Ballers' } });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const res = await service.upgradePitchOwnerToOrganiser('owner-1', 'Surulere Ballers', 'pitchpass');
      expect((orgsService as any).rename).toHaveBeenCalledWith('org-p', 'Surulere Ballers');
      expect((usersService as any).setRole).toHaveBeenCalledWith('owner-1', UserRole.ORG_ADMIN);
      expect(res.accessToken).toBe('jwt-token');
    });

    it('refuses a wrong password, and anyone who is not a pitch owner', async () => {
      usersService.findById.mockResolvedValue(owner);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.upgradePitchOwnerToOrganiser('owner-1', 'X', 'nope')).rejects.toThrow(/password for your pitch account/);
      usersService.findById.mockResolvedValue(mockUser);
      await expect(service.upgradePitchOwnerToOrganiser('user-1', 'X', 'pw')).rejects.toThrow(/no pitch account/);
      expect((usersService as any).setRole).not.toHaveBeenCalled();
    });
  });

    describe('login', () => {
    it('should return token on valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'john@test.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect((result as any).user.email).toBe('john@test.com');
    });

    it('should throw UnauthorizedException on invalid email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@test.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'john@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return requires2FA when 2FA is enabled', async () => {
      const user2FA = { ...mockUser, twoFactorEnabled: true };
      usersService.findByEmail.mockResolvedValue(user2FA);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'john@test.com',
        password: 'password123',
      });

      // A short-lived challenge proves the password step; the user id itself is never handed out.
      expect(result).toEqual({ requires2FA: true, challenge: 'jwt-token' });
      expect(mockJwtSign).toHaveBeenCalledWith({ sub: 'user-1', typ: '2fa' }, { expiresIn: '5m' });
    });
  });

  describe('setIdentity', () => {
    it('needs a BVN and NIN', async () => {
      await expect(service.setIdentity('user-1', {})).rejects.toThrow('Enter your BVN and NIN');
    });

    it('saves a NIN and only ever returns the numbers masked', async () => {
      usersService.setIdentity = jest.fn().mockResolvedValue({ ...mockUser, bvn: '22212345678', nin: '12345678901', organization: mockOrg });
      const user = await service.setIdentity('user-1', { nin: '12345678901' });
      expect(usersService.setIdentity).toHaveBeenCalledWith('user-1', { nin: '12345678901' });
      expect(user).toMatchObject({ bvn: '•••••••5678', nin: '•••••••8901' });
    });
  });

  describe('validate2FALogin', () => {
    it("refuses a bare user id: the code step only follows a correct password", async () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });
      await expect(service.validate2FALogin('user-1', '123456')).rejects.toThrow(UnauthorizedException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('refuses a session token passed off as a challenge', async () => {
      mockJwtVerify.mockImplementation(() => ({ sub: 'user-1' }));
      await expect(service.validate2FALogin('session-token', '123456')).rejects.toThrow(UnauthorizedException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('checks the code for the user the challenge was issued to', async () => {
      mockJwtVerify.mockImplementation(() => ({ sub: 'user-1', typ: '2fa' }));
      usersService.findById.mockResolvedValue({ ...mockUser, twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' });
      await expect(service.validate2FALogin('challenge', '000000')).rejects.toThrow('Invalid 2FA code');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('changePassword', () => {
    it('should throw when current password is wrong', async () => {
      usersService.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', 'wrong', 'newpass'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should succeed with correct current password', async () => {
      usersService.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');

      const result = await service.changePassword('user-1', 'correct', 'newpass');

      expect(result.message).toContain('changed');
      expect(usersService.updatePassword).toHaveBeenCalledWith('user-1', 'new-hashed');
      // Other sessions end; this device gets a fresh one.
      expect(usersService.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({ accessToken: 'jwt-token', refreshToken: 'refresh-token' });
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException on invalid token', async () => {
      usersService.findValidResetToken.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'newpass'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reset password with valid token', async () => {
      const resetToken = { id: 'reset-1', userId: 'user-1', token: 'valid-token' };
      usersService.findValidResetToken.mockResolvedValue(resetToken);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');

      const result = await service.resetPassword('valid-token', 'newpass');

      expect(result.message).toContain('reset');
      expect(usersService.updatePassword).toHaveBeenCalledWith('user-1', 'new-hashed');
      expect(usersService.markResetTokenUsed).toHaveBeenCalledWith('reset-1');
      expect(usersService.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
    });
  });
});
