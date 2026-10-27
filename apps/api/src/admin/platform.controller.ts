import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ClubsQueryDto, StatusQueryDto } from './dto/platform-query.dto';
import { PushBroadcastDto } from './dto/push-broadcast.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { PaymentsService } from '../payments/payments.service';
import { PULSE_CLIENT, PulseClient } from '../billing/pulse/pulse.client';

/** HQ: the PitchAside team's view across every club. Super admins only. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly notifications: NotificationsService,
    private readonly billing: BillingService,
    private readonly payments: PaymentsService,
    @Inject(PULSE_CLIENT) private readonly pulse: PulseClient,
  ) {}

  @Get('overview')
  overview() {
    return this.platform.getOverview();
  }

  @Get('clubs')
  clubs(@Query() query: ClubsQueryDto) {
    return this.platform.getClubs(query);
  }

  @Get('clubs/:id')
  club(@Param('id') id: string) {
    return this.platform.getClub(id);
  }

  @Get('organisers')
  organisers(@Query() query: PaginationDto) {
    return this.platform.getOrganisers(query);
  }

  @Get('players')
  players(@Query() query: PaginationDto) {
    return this.platform.getPlayers(query);
  }

  @Get('money')
  money(@Query() query: StatusQueryDto) {
    return this.platform.getMoney(query);
  }

  @Get('messages')
  messages(@Query() query: StatusQueryDto) {
    return this.platform.getMessages(query);
  }

  @Post('notifications/push')
  broadcastPush(@Body() dto: PushBroadcastDto) {
    return this.notifications.broadcastPush(dto);
  }

  @Get('activity')
  activity(@Query() query: PaginationDto) {
    return this.platform.getActivity(query);
  }

  /** Actively reconcile `processing` payouts against Payrep's real status. */
  @Post('payouts/reconcile')
  async reconcilePayouts(@Query('groupId') groupId?: string) {
    return this.billing.reconcilePayouts(groupId);
  }

  /** Bulk-waive all pending payments for the given sessions. */
  @Post('payments/waive')
  async waivePayments(@Body('sessionIds') sessionIds: string[]) {
    return this.payments.waiveBySession(sessionIds);
  }

  /** Diagnostic: check a group's bank balance, ledger balance, account status, and recent payouts. */
  @Get('groups/:id/diagnostics')
  async groupDiagnostics(@Param('id') groupId: string) {
    return this.platform.groupDiagnostics(groupId, this.pulse);
  }

  /** Send a push + email to every organiser who hasn't added their BVN/NIN yet. */
  @Post('notify-identity')
  async notifyIdentity() {
    const users = await this.platform.organisersWithoutIdentity();
    let sent = 0;
    for (const user of users) {
      await this.notifications.notifyOrganisers(
        user.organizationId,
        {
          kind: 'identity_required',
          title: 'Add your BVN and NIN to unlock transfers',
          body: 'The bank needs your BVN and NIN before your group can receive or send money. Open Settings to add them now.',
          url: '/settings',
        },
        { email: true },
      );
      sent++;
    }
    return { notified: sent };
  }
}
