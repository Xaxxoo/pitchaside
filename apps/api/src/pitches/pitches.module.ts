import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pitch } from './entities/pitch.entity';
import { PitchSchedule } from './entities/pitch-schedule.entity';
import { PitchSlotOverride } from './entities/pitch-slot-override.entity';
import { PitchBooking } from './entities/pitch-booking.entity';
import { PitchPhoto } from './entities/pitch-photo.entity';
import { PitchPhotosService } from './pitch-photos.service';
import { PitchesService } from './pitches.service';
import { PitchAvailabilityService } from './pitch-availability.service';
import { PitchesController } from './pitches.controller';
import { PitchesPublicController, PitchPhotosPublicController } from './pitches-public.controller';
import { PitchesBookingController } from './pitches-booking.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pitch, PitchSchedule, PitchSlotOverride, PitchBooking, PitchPhoto]),
    BillingModule,
  ],
  controllers: [PitchesController, PitchesPublicController, PitchPhotosPublicController, PitchesBookingController],
  providers: [PitchesService, PitchAvailabilityService, PitchPhotosService],
  exports: [PitchesService],
})
export class PitchesModule {}
