import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { BillingService } from './billing.service';
import {
  AssignTransferDto,
  GiveTransferDto,
  GiveExtraDto,
  HoldExtraDto,
  KeepForGroupDto,
  EXTRA_SOURCES,
  type ExtraSource,
  ChangeTransferPinDto,
  ClassifyTransferDto,
  InitiatePayoutDto,
  NameEnquiryDto,
  PayoutCategoryDto,
  SavePayeeDto,
  SetTransferPinDto,
  SimulateTransferDto,
} from './dto/transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowTreasurer } from '../auth/decorators/allow-treasurer.decorator';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { User } from '../users/entities/user.entity';
import { assertClubAdmin } from '../auth/club-admin';
import { UsersService } from '../users/users.service';

/** Routes that check the transfer PIN: on top of the per-account lockout, a per-client cap. */
const PIN_RATE_LIMIT = { default: { ttl: 60_000, limit: 10 } };

/** Admin endpoints for a group's account, invite link, transfers and payouts. */
@UseGuards(JwtAuthGuard)
@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  private link(code: string) {
    return `${this.config.get('APP_URL', 'http://localhost:3000')}/g/${code}`;
  }

  private async billingWithLink(groupId: string, organizationId: string) {
    const billing = await this.billing.getBilling(groupId, organizationId);
    return { ...billing, link: this.link(billing.inviteCode) };
  }

  @Get('groups/:id/billing')
  getBilling(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billingWithLink(id, user.organizationId);
  }

  /** Retry account provisioning (e.g. if PulseMFB was down when the group was created). */
  @Post('groups/:id/account')
  async provisionAccount(@Param('id') id: string, @CurrentUser() user: User) {
    assertClubAdmin(user);
    const fresh = await this.users.findById(user.id);
    if (!fresh?.bvn || !fresh?.nin) {
      const missing = [!fresh?.bvn && 'BVN', !fresh?.nin && 'NIN'].filter(Boolean).join(' and ');
      throw new BadRequestException(`Add your ${missing} before opening a collection account (Settings \u2192 Identity).`);
    }
    const billing = await this.billing.createGroupAccount(id, user.organizationId, { bvn: fresh.bvn ?? undefined, nin: fresh.nin ?? undefined });
    return { ...billing, link: this.link(billing.inviteCode) };
  }

  @Post('groups/:id/invite/regenerate')
  async regenerateInvite(@Param('id') id: string, @CurrentUser() user: User) {
    await this.billing.regenerateInviteCode(id, user.organizationId);
    return this.billingWithLink(id, user.organizationId);
  }

  @Get('groups/:id/transfers')
  listTransfers(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.listTransfers(id, user.organizationId);
  }

  @Post('groups/:id/transfers/simulate')
  simulate(@Param('id') id: string, @Body() dto: SimulateTransferDto, @CurrentUser() user: User) {
    return this.billing.simulateTransfer(id, user.organizationId, dto);
  }

  /** Manually record an incoming transfer that the webhook missed. */
  @Post('groups/:id/transfers/record')
  recordTransfer(@Param('id') id: string, @Body() dto: SimulateTransferDto, @CurrentUser() user: User) {
    return this.billing.recordManualTransfer(id, user.organizationId, dto);
  }

  @AllowTreasurer()
  @Post('transfers/:id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTransferDto, @CurrentUser() user: User) {
    return this.billing.assignTransfer(id, dto.paymentId, user.organizationId);
  }

  /**
   * Give an unmatched transfer to any member of the group: it pays their oldest unpaid games,
   * and anything left is kept for their next game (their credit). Works when they owe nothing.
   */
  @AllowTreasurer()
  @Post('transfers/:id/give')
  give(@Param('id') id: string, @Body() dto: GiveTransferDto, @CurrentUser() user: User) {
    return this.billing.giveTransfer(id, dto.playerId, user.organizationId);
  }

  /** Everything still owed in a group, oldest game first, so the organiser can see who owes what. */
  @AllowTreasurer()
  @Get('groups/:id/owed')
  owed(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.listOwed(id, user.organizationId);
  }

  /** Give an unmatched transfer to the player whose "I've paid" it matches. */
  @AllowTreasurer()
  @Post('transfers/:id/claims/:claimId/accept')
  acceptClaim(@Param('id') id: string, @Param('claimId') claimId: string, @CurrentUser() user: User) {
    return this.billing.acceptClaim(id, claimId, user.organizationId);
  }

  @AllowTreasurer()
  @Post('transfers/:id/ignore')
  ignore(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.ignoreTransfer(id, user.organizationId);
  }

  @AllowTreasurer()
  @Post('transfers/:id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.restoreTransfer(id, user.organizationId);
  }

  /** What marking this as not a player's payment would undo, before confirming. */
  @AllowTreasurer()
  @Get('transfers/:id/not-player')
  notPlayerPreview(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.notPlayerPreview(id, user.organizationId);
  }

  /** Not a player's payment: the organiser's own top-up, a sponsor, a refund or other. */
  @AllowTreasurer()
  @Post('transfers/:id/not-player')
  classify(@Param('id') id: string, @Body() dto: ClassifyTransferDto, @CurrentUser() user: User) {
    return this.billing.classifyTransfer(id, user.organizationId, dto);
  }

  @AllowTreasurer()
  @Post('transfers/:id/player-money')
  unclassify(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.unclassifyTransfer(id, user.organizationId);
  }

  @AllowTreasurer()
  @Post('payouts/:id/category')
  payoutCategory(@Param('id') id: string, @Body() dto: PayoutCategoryDto, @CurrentUser() user: User) {
    return this.billing.setPayoutCategory(id, user.organizationId, dto.category);
  }

  // ── Extra money: more than a member owed, waiting to be sorted ──

  @AllowTreasurer()
  @Get('groups/:id/extra')
  listExtra(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.listExtra(id, user.organizationId);
  }

  /** What giving a member's extra to someone else would pay, before confirming. */
  @AllowTreasurer()
  @Get('groups/:id/extra/:playerId/give/:toPlayerId')
  giveExtraPreview(
    @Param('id') id: string,
    @Param('playerId', ParseUUIDPipe) playerId: string,
    @Param('toPlayerId', ParseUUIDPipe) to: string,
    @Query('from') from: string | undefined,
    @CurrentUser() user: User,
  ) {
    const source: ExtraSource = (EXTRA_SOURCES as readonly string[]).includes(from ?? '') ? (from as ExtraSource) : 'extra';
    return this.billing.giveExtraPreview(id, playerId, to, user.organizationId, source);
  }

  @AllowTreasurer()
  @Post('groups/:id/extra/:playerId/give')
  giveExtra(@Param('id') id: string, @Param('playerId', ParseUUIDPipe) playerId: string, @Body() dto: GiveExtraDto, @CurrentUser() user: User) {
    return this.billing.giveExtra(id, playerId, dto.playerId, user.organizationId, dto.from ?? 'extra');
  }

  /** For someone not in the group, or no one knows who: it waits apart from the sender's money. */
  @AllowTreasurer()
  @Post('groups/:id/extra/:playerId/hold')
  holdExtra(@Param('id') id: string, @Param('playerId', ParseUUIDPipe) playerId: string, @Body() dto: HoldExtraDto, @CurrentUser() user: User) {
    return this.billing.holdExtra(id, playerId, user.organizationId, dto.note);
  }

  /** Waiting money goes back with the sender's extra, to keep for them or send back. */
  @AllowTreasurer()
  @Post('groups/:id/extra/:playerId/release')
  releaseWaiting(@Param('id') id: string, @Param('playerId', ParseUUIDPipe) playerId: string, @CurrentUser() user: User) {
    return this.billing.releaseWaiting(id, playerId, user.organizationId);
  }

  /** The group keeps it: nobody is owed it any more. Organisers only, with a reason the player sees. */
  @Post('groups/:id/extra/:playerId/keep-for-group')
  keepForGroup(@Param('id') id: string, @Param('playerId', ParseUUIDPipe) playerId: string, @Body() dto: KeepForGroupDto, @CurrentUser() user: User) {
    return this.billing.keepForGroup(id, playerId, user.organizationId, { reason: dto.reason, note: dto.note, recordedBy: user.id });
  }

  @AllowTreasurer()
  @Post('groups/:id/extra/:playerId/keep')
  keepExtra(@Param('id') id: string, @Param('playerId', ParseUUIDPipe) playerId: string, @CurrentUser() user: User) {
    return this.billing.keepExtra(id, playerId, user.organizationId);
  }

  // ── Payouts (transfer out) ──

  @Get('groups/:id/balance')
  getBalance(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.getGroupBalance(id, user.organizationId);
  }

  @Post('groups/:id/name-enquiry')
  nameEnquiry(@Param('id') id: string, @Body() dto: NameEnquiryDto, @CurrentUser() user: User) {
    return this.billing.nameEnquiry(id, user.organizationId, dto.bankCode, dto.accountNumber);
  }

  @Get('groups/:id/payouts')
  listPayouts(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.listPayouts(id, user.organizationId);
  }

  @Post('groups/:id/payouts')
  @Throttle(PIN_RATE_LIMIT)
  @UseGuards(ThrottlerGuard)
  initiatePayout(@Param('id') id: string, @Body() dto: InitiatePayoutDto, @CurrentUser() user: User) {
    return this.billing.initiateTransferOut(id, user.organizationId, user.id, dto);
  }

  /** The group's saved payee — the pitch owner or facility manager it usually pays. */
  @Get('groups/:id/payee')
  getPayee(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.getPayee(id, user.organizationId);
  }

  @Put('groups/:id/payee')
  savePayee(@Param('id') id: string, @Body() dto: SavePayeeDto, @CurrentUser() user: User) {
    return this.billing.savePayee(id, user.organizationId, dto);
  }

  @Delete('groups/:id/payee')
  clearPayee(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.clearPayee(id, user.organizationId);
  }

  @Post('payouts/:id/cancel')
  cancelPayout(@Param('id') id: string, @CurrentUser() user: User) {
    return this.billing.cancelPayout(id, user.organizationId);
  }

  @Get('banks')
  getBanks() {
    return this.billing.getNigerianBanks();
  }

  /** Check whether Pulse's webhook is pointed at us with the right secret and events. */
  @Get('webhook-status')
  webhookStatus() {
    return this.billing.checkWebhookSetup();
  }

  // ── Transfer PIN ──

  @Get('me/transfer-pin')
  async hasPin(@CurrentUser() user: User) {
    return { hasPin: await this.users.hasTransferPin(user.id) };
  }

  @Post('me/transfer-pin')
  @Throttle(PIN_RATE_LIMIT)
  @UseGuards(ThrottlerGuard)
  async setPin(@Body() dto: SetTransferPinDto, @CurrentUser() user: User) {
    await this.users.setTransferPin(user.id, dto.pin, dto.currentPin);
    return { success: true };
  }

  @Put('me/transfer-pin')
  @Throttle(PIN_RATE_LIMIT)
  @UseGuards(ThrottlerGuard)
  async changePin(@Body() dto: ChangeTransferPinDto, @CurrentUser() user: User) {
    await this.users.setTransferPin(user.id, dto.newPin, dto.currentPin);
    return { success: true };
  }
}

/** Unauthenticated endpoints: the shareable group link and the PulseMFB webhook. (Joining lives in player-portal.) */
@Controller()
export class PublicBillingController {
  constructor(
    private readonly billing: BillingService,
  ) {}

  @Get('public/groups/:code')
  getGroup(@Param('code') code: string) {
    return this.billing.getPublicGroup(code);
  }

  @SkipCsrf()
  @Post('pulse/webhook')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    return this.billing.handleWebhook(raw, signature, body);
  }
}
