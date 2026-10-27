import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { UsersModule } from '../users/users.module';
import { GroupsModule } from '../groups/groups.module';
import { PlayersModule } from '../players/players.module';
import { SessionsModule } from '../sessions/sessions.module';
import { BillingModule } from '../billing/billing.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    UsersModule,
    GroupsModule,
    PlayersModule,
    SessionsModule,
    BillingModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [AdminController, PlatformController],
  providers: [AdminService, PlatformService],
})
export class AdminModule {}
