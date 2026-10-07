import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Competition } from './entities/competition.entity';
import { CompetitionTeam } from './entities/competition-team.entity';
import { CompetitionMatch } from './entities/competition-match.entity';
import { CompetitionsService } from './competitions.service';
import { CompetitionsController, PublicCompetitionsController } from './competitions.controller';
import { BillingModule } from '../billing/billing.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Competition, CompetitionTeam, CompetitionMatch]),
    BillingModule,
    UsersModule,
  ],
  controllers: [CompetitionsController, PublicCompetitionsController],
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
