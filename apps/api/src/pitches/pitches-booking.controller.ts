import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PitchesService } from './pitches.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class PitchesBookingController {
  constructor(private readonly pitchesService: PitchesService) {}

  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: any) {
    return this.pitchesService.createBooking(dto, user.id);
  }

  @Get('mine')
  mine(@CurrentUser() user: any) {
    return this.pitchesService.myBookings(user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.pitchesService.cancelBookingOrganiser(id, user.id);
  }

  @Post(':id/pay')
  pay(
    @Param('id') id: string,
    @Body() body: { groupId: string; pin: string },
    @CurrentUser() user: any,
  ) {
    return this.pitchesService.payBooking(id, user.id, body.groupId, user.organizationId, body.pin);
  }
}
