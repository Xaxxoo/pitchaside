import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pitch } from './entities/pitch.entity';
import { PitchSchedule } from './entities/pitch-schedule.entity';
import { PitchSlotOverride } from './entities/pitch-slot-override.entity';
import { PitchBooking } from './entities/pitch-booking.entity';
import { PitchesService } from './pitches.service';
import { PitchAvailabilityService } from './pitch-availability.service';
import { PitchesController } from './pitches.controller';
import { PitchesPublicController } from './pitches-public.controller';
import { PitchesBookingController } from './pitches-booking.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pitch, PitchSchedule, PitchSlotOverride, PitchBooking]),
    BillingModule,
  ],
  controllers: [PitchesController, PitchesPublicController, PitchesBookingController],
  providers: [PitchesService, PitchAvailabilityService],
  exports: [PitchesService],
})
export class PitchesModule {}
