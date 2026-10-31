import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SkipCsrf } from '../auth/decorators/skip-csrf.decorator';
import { PitchesService } from './pitches.service';
import { PitchPhotosService } from './pitch-photos.service';

@Controller('public/pitches')
export class PitchesPublicController {
  constructor(private readonly pitchesService: PitchesService) {}

  /** Pitches ready to book, for anyone browsing; by state and city. */
  @SkipCsrf()
  @Get()
  directory(@Query('state') state?: string, @Query('city') city?: string) {
    return this.pitchesService.directory({ state: state?.trim() || undefined, city: city?.trim() || undefined });
  }

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

/**
 * Serves pitch photos. The address is a random key that changes with every upload, so it's hard
 * to guess and phones can cache it for good.
 */
@Controller('pitch-photos')
export class PitchPhotosPublicController {
  constructor(private readonly photos: PitchPhotosService) {}

  @SkipCsrf()
  @Get(':key')
  async get(@Param('key') key: string, @Res() res: Response) {
    const photo = await this.photos.get(key);
    res.setHeader('Content-Type', photo.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(photo.data);
  }
}
