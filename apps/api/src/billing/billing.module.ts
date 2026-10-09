import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from '../groups/entities/group.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Session } from '../sessions/entities/session.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Player } from '../players/entities/player.entity';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BankTransfer } from './entities/bank-transfer.entity';
import { OutgoingTransfer } from './entities/outgoing-transfer.entity';
import { PaymentClaim } from './entities/payment-claim.entity';
import { UsersModule } from '../users/users.module';
import { Competition } from '../competitions/entities/competition.entity';
import { CompetitionTeam } from '../competitions/entities/competition-team.entity';
import { BillingService } from './billing.service';
import { BillingController, PublicBillingController } from './billing.controller';
import { PULSE_CLIENT, PulseClient } from './pulse/pulse.client';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { HttpPulseClient } from './pulse/http-pulse.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, GroupMembership, Session, Payment, Player, BankTransfer, OutgoingTransfer, PaymentClaim, Competition, CompetitionTeam]),
    PaymentsModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [BillingController, PublicBillingController],
  providers: [
    BillingService,
    {
      provide: PULSE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PulseClient => {
        const webhookSecret = config.get('PULSE_WEBHOOK_SECRET', 'dev-webhook-secret');
        if (config.get('PULSE_MODE', 'mock') === 'live') {
          return new HttpPulseClient({
            baseUrl: config.getOrThrow('PULSE_BASE_URL'),
            publicKey: config.getOrThrow('PULSE_PUBLIC_KEY'),
            privateKey: config.getOrThrow('PULSE_PRIVATE_KEY'),
            webhookSecret: config.getOrThrow('PULSE_WEBHOOK_SECRET'),
          });
        }
        return new MockPulseClient(webhookSecret);
      },
    },
  ],
  exports: [BillingService, PULSE_CLIENT],
})
export class BillingModule {}
