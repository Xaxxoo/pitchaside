import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from '../players/entities/player.entity';
import { User } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Group } from '../groups/entities/group.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';
import { Session } from '../sessions/entities/session.entity';
import { Payment } from '../payments/entities/payment.entity';
import { BillingModule } from '../billing/billing.module';
import { RatingsModule } from '../ratings/ratings.module';
import { RsvpModule } from '../rsvp/rsvp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PhoneOtp } from './entities/phone-otp.entity';
import { SignInLink } from './entities/sign-in-link.entity';
import { SignInLinksService } from './sign-in-links.service';
import { PlayerAccount } from './entities/player-account.entity';
import { PlayerAuthGuard, PlayerAuthService } from './player-auth.service';
import { PlayerPortalService } from './player-portal.service';
import { PlayersModule } from '../players/players.module';
import { PlayerAuthController, PlayerPortalController } from './player-portal.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhoneOtp, SignInLink, PlayerAccount, Player, User, Organization, Group, GroupMembership, Session, Payment]),
    AuthModule,
    UsersModule,
    JwtModule.register({}),
    BillingModule,
    RatingsModule,
    RsvpModule,
    NotificationsModule,
    PlayersModule,
  ],
  controllers: [PlayerAuthController, PlayerPortalController],
  providers: [PlayerAuthService, PlayerAuthGuard, PlayerPortalService, SignInLinksService],
})
export class PlayerPortalModule {}
