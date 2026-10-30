import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { PitchesService } from './pitches.service';

@Controller('public/pitches')
export class PitchesPublicController {
  constructor(private readonly pitchesService: PitchesService) {}

  @SkipCsrf()
  @Get(':code')
  findByShareCode(@Param('code') code: string) {
    return this.pitchesService.publicPitch(code);
  }

  @SkipCsrf()
  @Get(':code/availability')
  availability(
    @Param('code') code: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.pitchesService.getPublicAvailability(code, from, to);
  }
}
