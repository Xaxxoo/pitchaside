import { Controller, Post, Get, Patch, Body, UseGuards, Req, Res, Query, BadRequestException } from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TwoFactorVerifyDto, TwoFactorValidateDto } from './dto/two-factor.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AllowTreasurer } from './decorators/allow-treasurer.decorator';
import { SkipCsrf } from './decorators/skip-csrf.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { setAuthCookies, clearAuthCookies, COOKIE_NAMES } from './cookie.util';

@UseGuards(ThrottlerGuard)
@AllowTreasurer()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    setAuthCookies(res, this.configService, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    if ('requires2FA' in result) return result;
    setAuthCookies(res, this.configService, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  // The app asks this on every page load; a rate limit here signs people out mid-session.
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.authService.getProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: any) {
    return this.authService.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: any) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setup2FA(@CurrentUser() user: any) {
    return this.authService.setup2FA(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  verify2FA(@Body() dto: TwoFactorVerifyDto, @CurrentUser() user: any) {
    return this.authService.verify2FA(user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disable2FA(@Body() dto: TwoFactorVerifyDto, @CurrentUser() user: any) {
    return this.authService.disable2FA(user.id, dto.code);
  }

  @SkipCsrf()
  @Post('2fa/validate')
  async validate2FA(@Body() dto: TwoFactorValidateDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.validate2FALogin(dto.userId, dto.code);
    setAuthCookies(res, this.configService, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @SkipCsrf()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ── Refresh & Logout ──

  @SkipCsrf()
  @Post('refresh')
  async refresh(@Req() req: Request, @Body() body: any, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH] || body?.refreshToken;
    if (!rawRefreshToken) throw new BadRequestException('No refresh token');
    const result = await this.authService.refresh(rawRefreshToken);
    setAuthCookies(res, this.configService, result.accessToken, result.refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH];
    await this.authService.logout(rawRefreshToken);
    clearAuthCookies(res, this.configService);
    return { message: 'Logged out' };
  }

  // ── Email Verification ──

  @SkipCsrf()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Token required');
    const user = await this.authService.verifyEmailToken(token);
    if (!user) throw new BadRequestException('Invalid or expired verification token');
    return { message: 'Email verified successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: any) {
    await this.authService.resendVerification(user.id);
    return { message: 'Verification email sent' };
  }
}
