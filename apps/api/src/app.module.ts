import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { CsrfGuard } from './auth/guards/csrf.guard';
import { rateLimits } from './common/rate-limit';
import { GroupsModule } from './groups/groups.module';
import { PlayersModule } from './players/players.module';
import { SessionsModule } from './sessions/sessions.module';
import { PaymentsModule } from './payments/payments.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { StatsModule } from './stats/stats.module';
import { BillingModule } from './billing/billing.module';
import { RatingsModule } from './ratings/ratings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RsvpModule } from './rsvp/rsvp.module';
import { PlayerPortalModule } from './player-portal/player-portal.module';
import { RemindersModule } from './reminders/reminders.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(rateLimits),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'pitchaside'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV', 'development') !== 'production',
      }),
    }),
    MailModule,
    OrganizationsModule,
    UsersModule,
    AuthModule,
    GroupsModule,
    PlayersModule,
    SessionsModule,
    PaymentsModule,
    AdminModule,
    AuditModule,
    StatsModule,
    BillingModule,
    RatingsModule,
    NotificationsModule,
    RsvpModule,
    PlayerPortalModule,
    RemindersModule,
    CompetitionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
