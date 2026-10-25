import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsBoolean, IsObject, IsString, IsUrl } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowTreasurer } from '../auth/decorators/allow-treasurer.decorator';
import { User } from '../users/entities/user.entity';

export class PushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint: string;

  @IsObject()
  keys: { p256dh: string; auth: string };
}

export class NoticesDto {
  @IsBoolean()
  email: boolean;
}

export class UnsubscribeDto {
  @IsString()
  endpoint: string;
}

@AllowTreasurer()
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('push/public-key')
  publicKey() {
    return this.notifications.publicKey();
  }

  /** Organiser devices: payment received, unmatched transfers, full games. */
  @UseGuards(JwtAuthGuard)
  @Post('push/subscribe')
  subscribe(@Body() dto: PushSubscriptionDto, @CurrentUser() user: User) {
    return this.notifications.subscribe(dto, { userId: user.id });
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @UseGuards(ThrottlerGuard, JwtAuthGuard)
  @Post('push/test')
  test(@CurrentUser() user: User) {
    return this.notifications.testUser(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('push/subscribe')
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.notifications.unsubscribe(dto.endpoint);
  }

  /** Emails on or off for this organiser (on unless they switch it off). */
  @UseGuards(JwtAuthGuard)
  @Patch('notifications/settings')
  settings(@Body() dto: NoticesDto, @CurrentUser() user: User) {
    return this.notifications.setOrganiserEmails(user.id, dto.email);
  }

  /** WhatsApp/SMS outbox — in mock mode this is where test messages (incl. codes) show up. */
  @UseGuards(JwtAuthGuard)
  @Get('messages')
  async messages(@CurrentUser() user: User) {
    return {
      mode: this.notifications.messagingMode,
      messages: await this.notifications.listMessages(user.organizationId),
    };
  }
}
