import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { assertPitchOwner } from '../auth/pitch-owner';
import { PitchesService } from './pitches.service';
import { CreatePitchDto } from './dto/create-pitch.dto';
import { UpdatePitchDto } from './dto/update-pitch.dto';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { CreateOverrideDto } from './dto/create-override.dto';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

const PIN_RATE_LIMIT = { default: { limit: 5, ttl: 60000 } };

@UseGuards(JwtAuthGuard)
@Controller('pitches')
export class PitchesController {
  constructor(private readonly pitchesService: PitchesService) {}

  @Post()
  create(@Body() dto: CreatePitchDto, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.findAllByOwner(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.findOne(id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePitchDto, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.update(id, dto, user.id);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.deactivate(id, user.id);
  }

  // ── Schedule ──

  @Put(':id/schedule')
  setSchedule(@Param('id') id: string, @Body() dto: SetScheduleDto, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.setSchedule(id, dto, user.id);
  }

  @Get(':id/schedule')
  getSchedule(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.getSchedule(id, user.id);
  }

  // ── Overrides ──

  @Post(':id/overrides')
  addOverride(@Param('id') id: string, @Body() dto: CreateOverrideDto, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.addOverride(id, dto, user.id);
  }

  @Get(':id/overrides')
  listOverrides(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: any,
  ) {
    assertPitchOwner(user);
    return this.pitchesService.listOverrides(id, user.id, from, to);
  }

  @Delete(':id/overrides/:oid')
  removeOverride(@Param('id') id: string, @Param('oid') oid: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.removeOverride(id, oid, user.id);
  }

  // ── Bookings ──

  @Get(':id/bookings')
  listBookings(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.listBookings(id, user.id);
  }

  @Post(':id/bookings/:bid/confirm')
  confirmBooking(@Param('id') id: string, @Param('bid') bid: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.confirmBooking(id, bid, user.id);
  }

  @Post(':id/bookings/:bid/reject')
  rejectBooking(
    @Param('id') id: string,
    @Param('bid') bid: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    assertPitchOwner(user);
    return this.pitchesService.rejectBooking(id, bid, user.id, reason);
  }

  @Post(':id/bookings/:bid/cancel')
  cancelBooking(@Param('id') id: string, @Param('bid') bid: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.cancelBookingOwner(id, bid, user.id);
  }

  @Post(':id/bookings/:bid/mark-paid')
  markPaid(@Param('id') id: string, @Param('bid') bid: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.markBookingPaid(id, bid, user.id);
  }

  // ── Bank ──

  @Put(':id/bank')
  saveBankDetails(
    @Param('id') id: string,
    @Body() body: { bankAccountNumber: string; bankCode: string; bankName: string; accountHolderName: string },
    @CurrentUser() user: any,
  ) {
    assertPitchOwner(user);
    return this.pitchesService.saveBankDetails(id, user.id, body);
  }

  @Post(':id/name-enquiry')
  nameEnquiry(
    @Param('id') id: string,
    @Body() body: { bankCode: string; accountNumber: string },
    @CurrentUser() user: any,
  ) {
    assertPitchOwner(user);
    return this.pitchesService.nameEnquiry(id, user.id, body.bankCode, body.accountNumber);
  }

  // ── Virtual account / billing ──

  @Post(':id/account')
  createAccount(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.createPitchAccount(id, user.id);
  }

  @Get(':id/billing')
  getBilling(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.getPitchBilling(id, user.id);
  }

  @Get(':id/balance')
  getBalance(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.getPitchBalance(id, user.id);
  }

  @Get(':id/transfers')
  listTransfers(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.listPitchTransfers(id, user.id);
  }

  @Get(':id/payouts')
  listPayouts(@Param('id') id: string, @CurrentUser() user: any) {
    assertPitchOwner(user);
    return this.pitchesService.listPitchPayouts(id, user.id);
  }

  @Post(':id/withdraw')
  @Throttle(PIN_RATE_LIMIT)
  @UseGuards(ThrottlerGuard)
  withdraw(
    @Param('id') id: string,
    @Body() body: { amount: number; pin: string; narration?: string },
    @CurrentUser() user: any,
  ) {
    assertPitchOwner(user);
    return this.pitchesService.withdraw(id, user.id, body);
  }

  @Post(':id/transfers/:tid/assign')
  assignTransfer(
    @Param('id') id: string,
    @Param('tid') tid: string,
    @Body('bookingId') bookingId: string,
    @CurrentUser() user: any,
  ) {
    assertPitchOwner(user);
    return this.pitchesService.assignTransfer(id, tid, bookingId, user.id);
  }
}
