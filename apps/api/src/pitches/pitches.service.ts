import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Pitch } from './entities/pitch.entity';
import { PitchSchedule } from './entities/pitch-schedule.entity';
import { PitchSlotOverride } from './entities/pitch-slot-override.entity';
import { PitchBooking } from './entities/pitch-booking.entity';
import { CreatePitchDto } from './dto/create-pitch.dto';
import { UpdatePitchDto } from './dto/update-pitch.dto';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { CreateOverrideDto } from './dto/create-override.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { PitchAvailabilityService, PENDING_HOURS, pendingLiveSql } from './pitch-availability.service';
import { APP_TZ, zonedInstant } from '../common/time.util';
import { BillingService } from '../billing/billing.service';

const EXPIRED_MESSAGE = `This request waited ${PENDING_HOURS} hours without an answer, so the time is free again.`;

@Injectable()
export class PitchesService {
  constructor(
    @InjectRepository(Pitch) private pitchRepo: Repository<Pitch>,
    @InjectRepository(PitchSchedule) private schedRepo: Repository<PitchSchedule>,
    @InjectRepository(PitchSlotOverride) private overrideRepo: Repository<PitchSlotOverride>,
    @InjectRepository(PitchBooking) private bookingRepo: Repository<PitchBooking>,
    private availability: PitchAvailabilityService,
    private billing: BillingService,
    private dataSource: DataSource,
  ) {}

  // ── Pitch CRUD ──

  async create(dto: CreatePitchDto, ownerId: string) {
    const shareCode = randomBytes(4).toString('hex');
    const pitch = this.pitchRepo.create({
      ...dto,
      ownerId,
      shareCode,
      address: dto.address ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      description: dto.description ?? null,
    });
    return this.pitchRepo.save(pitch);
  }

  async findAllByOwner(ownerId: string) {
    return this.pitchRepo.find({ where: { ownerId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, ownerId: string) {
    const pitch = await this.pitchRepo.findOne({ where: { id, ownerId } });
    if (!pitch) throw new NotFoundException('Pitch not found');
    return pitch;
  }

  async update(id: string, dto: UpdatePitchDto, ownerId: string) {
    const pitch = await this.findOne(id, ownerId);
    Object.assign(pitch, dto);
    return this.pitchRepo.save(pitch);
  }

  async deactivate(id: string, ownerId: string) {
    const pitch = await this.findOne(id, ownerId);
    pitch.status = 'inactive';
    return this.pitchRepo.save(pitch);
  }

  // ── Schedule ──

  async setSchedule(pitchId: string, dto: SetScheduleDto, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    // Replace all — delete existing then insert new
    await this.schedRepo.delete({ pitchId });
    const rows = dto.slots.map((s) =>
      this.schedRepo.create({
        pitchId,
        dayOfWeek: s.dayOfWeek,
        openTime: s.openTime,
        closeTime: s.closeTime,
        price: s.price ?? null,
      }),
    );
    return this.schedRepo.save(rows);
  }

  async getSchedule(pitchId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    return this.schedRepo.find({ where: { pitchId }, order: { dayOfWeek: 'ASC', openTime: 'ASC' } });
  }

  // ── Overrides ──

  async addOverride(pitchId: string, dto: CreateOverrideDto, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    const ovr = this.overrideRepo.create({ pitchId, ...dto, price: dto.price ?? null, reason: dto.reason ?? null });
    return this.overrideRepo.save(ovr);
  }

  async listOverrides(pitchId: string, ownerId: string, from?: string, to?: string) {
    await this.findOne(pitchId, ownerId);
    const qb = this.overrideRepo.createQueryBuilder('o').where('o.pitch_id = :pitchId', { pitchId });
    if (from) qb.andWhere('o.date >= :from', { from });
    if (to) qb.andWhere('o.date <= :to', { to });
    return qb.orderBy('o.date', 'ASC').addOrderBy('o.start_time', 'ASC').getMany();
  }

  async removeOverride(pitchId: string, overrideId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    const ovr = await this.overrideRepo.findOne({ where: { id: overrideId, pitchId } });
    if (!ovr) throw new NotFoundException('Override not found');
    await this.overrideRepo.remove(ovr);
  }

  // ── Bookings (pitch owner) ──

  async listBookings(pitchId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    await this.expireStale({ pitchId });
    return this.bookingRepo.find({
      where: { pitchId },
      order: { date: 'DESC', startTime: 'ASC' },
    });
  }

  async confirmBooking(pitchId: string, bookingId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    await this.expireStale({ pitchId });
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'expired') throw new BadRequestException(EXPIRED_MESSAGE);
    if (booking.status !== 'pending') throw new BadRequestException('Only pending bookings can be confirmed');
    booking.status = 'confirmed';
    booking.confirmedAt = new Date();
    return this.bookingRepo.save(booking);
  }

  async rejectBooking(pitchId: string, bookingId: string, ownerId: string, reason?: string) {
    await this.findOne(pitchId, ownerId);
    await this.expireStale({ pitchId });
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'expired') throw new BadRequestException(EXPIRED_MESSAGE);
    if (booking.status !== 'pending') throw new BadRequestException('Only pending bookings can be rejected');
    booking.status = 'rejected';
    booking.rejectionReason = reason ?? null;
    return this.bookingRepo.save(booking);
  }

  async cancelBookingOwner(pitchId: string, bookingId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    await this.expireStale({ pitchId });
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'expired') throw new BadRequestException(EXPIRED_MESSAGE);
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new BadRequestException('Booking is already cancelled or rejected');
    }
    booking.status = 'cancelled';
    return this.bookingRepo.save(booking);
  }

  async markBookingPaid(pitchId: string, bookingId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
    booking.paymentStatus = 'paid';
    booking.paymentMethod = 'off_platform';
    booking.paidAt = new Date();
    return this.bookingRepo.save(booking);
  }

  // ── Bank details ──

  async saveBankDetails(pitchId: string, ownerId: string, data: {
    bankAccountNumber: string;
    bankCode: string;
    bankName: string;
    accountHolderName: string;
  }) {
    const pitch = await this.findOne(pitchId, ownerId);
    pitch.bankAccountNumber = data.bankAccountNumber;
    pitch.bankCode = data.bankCode;
    pitch.bankName = data.bankName;
    pitch.accountHolderName = data.accountHolderName;
    return this.pitchRepo.save(pitch);
  }

  async nameEnquiry(pitchId: string, ownerId: string, bankCode: string, accountNumber: string) {
    await this.findOne(pitchId, ownerId);
    // Delegate to the billing service which wraps the Pulse/Payrep name lookup
    return this.billing.lookUpAccountName(bankCode, accountNumber);
  }

  // ── Public ──

  async findByShareCode(code: string) {
    const pitch = await this.pitchRepo.findOne({ where: { shareCode: code, status: 'active' } });
    if (!pitch) throw new NotFoundException('Pitch not found');
    return pitch;
  }

  async getPublicAvailability(code: string, from: string, to: string) {
    const pitch = await this.findByShareCode(code);
    const dates = this.dateRange(from, to);
    const result: { date: string; slots: Awaited<ReturnType<PitchAvailabilityService['getAvailableSlots']>> }[] = [];
    for (const date of dates) {
      const slots = await this.availability.getAvailableSlots(pitch.id, date);
      result.push({ date, slots });
    }
    return { pitch: this.sanitizePitch(pitch), days: result };
  }

  // ── Organiser bookings ──

  async createBooking(dto: CreateBookingDto, userId: string) {
    const pitch = await this.pitchRepo.findOne({ where: { id: dto.pitchId, status: 'active' } });
    if (!pitch) throw new NotFoundException('Pitch not found or inactive');

    // One booking at a time per pitch and day: two people tapping the same time together can't both
    // get it. The lock lasts until this transaction ends, so the second one sees the first booking.
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`pitch-booking:${pitch.id}:${dto.date}`]);

      // Check slot availability
      const slots = await this.availability.getAvailableSlots(pitch.id, dto.date, manager);
      const slot = slots.find((s) => s.startTime === dto.startTime && s.endTime === dto.endTime);
      if (!slot) throw new BadRequestException('This slot does not exist');
      if (!slot.available) throw new BadRequestException('This slot is already booked');

      // Prevent booking in the past (the pitch's clock, not the server's)
      if (zonedInstant(dto.date, dto.startTime) < new Date()) throw new BadRequestException('Cannot book a slot in the past');

      const booking = manager.create(PitchBooking, {
        pitchId: dto.pitchId,
        bookedById: userId,
        bookerName: dto.bookerName,
        bookerPhone: dto.bookerPhone ?? null,
        groupId: dto.groupId ?? null,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        price: slot.price,
        notes: dto.notes ?? null,
      });
      return manager.save(booking);
    });
  }

  async myBookings(userId: string) {
    await this.expireStale({ bookedById: userId });
    return this.bookingRepo.find({
      where: { bookedById: userId },
      relations: ['pitch'],
      order: { date: 'DESC', startTime: 'ASC' },
    });
  }

  async cancelBookingOrganiser(bookingId: string, userId: string) {
    await this.expireStale({ bookedById: userId });
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, bookedById: userId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'expired') throw new BadRequestException(EXPIRED_MESSAGE);
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new BadRequestException('Booking is already cancelled or rejected');
    }
    booking.status = 'cancelled';
    return this.bookingRepo.save(booking);
  }

  async payBooking(bookingId: string, userId: string, groupId: string, organizationId: string, pin: string) {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, bookedById: userId }, relations: ['pitch'] });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'confirmed') throw new BadRequestException('Booking must be confirmed before payment');
    if (booking.paymentStatus === 'paid') throw new BadRequestException('Already paid');

    const pitch = booking.pitch;
    if (!pitch.bankAccountNumber || !pitch.bankCode) {
      throw new BadRequestException('Pitch owner has not set up bank details for receiving payments');
    }

    // Initiate transfer from group account to pitch owner's bank
    const transfer = await this.billing.initiateTransferOut(groupId, organizationId, userId, {
      amount: Number(booking.price),
      beneficiaryAccount: pitch.bankAccountNumber,
      beneficiaryBankCode: pitch.bankCode,
      narration: `Pitch booking: ${pitch.name} on ${booking.date} ${booking.startTime}`,
      category: 'pitch',
      pin,
    });

    booking.paymentMethod = 'on_platform';
    booking.paymentStatus = 'paid';
    booking.outgoingTransferId = transfer.id;
    booking.paidAt = new Date();
    return this.bookingRepo.save(booking);
  }

  // ── Virtual account / billing delegation ──

  async createPitchAccount(pitchId: string, ownerId: string) {
    return this.billing.createPitchAccount(pitchId, ownerId);
  }

  async getPitchBilling(pitchId: string, ownerId: string) {
    return this.billing.getPitchBilling(pitchId, ownerId);
  }

  async getPitchBalance(pitchId: string, ownerId: string) {
    return this.billing.getPitchBalance(pitchId, ownerId);
  }

  async withdraw(pitchId: string, ownerId: string, dto: { amount: number; pin: string; narration?: string }) {
    return this.billing.initiatePitchWithdrawal(pitchId, ownerId, dto);
  }

  async listPitchTransfers(pitchId: string, ownerId: string) {
    return this.billing.listPitchTransfers(pitchId, ownerId);
  }

  async listPitchPayouts(pitchId: string, ownerId: string) {
    return this.billing.listPitchPayouts(pitchId, ownerId);
  }

  async assignTransfer(pitchId: string, transferId: string, bookingId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    return this.billing.assignPitchTransfer(transferId, bookingId, ownerId);
  }

  // ── Helpers ──

  private sanitizePitch(pitch: Pitch) {
    return {
      id: pitch.id,
      name: pitch.name,
      address: pitch.address,
      city: pitch.city,
      state: pitch.state,
      description: pitch.description,
      slotDurationMinutes: pitch.slotDurationMinutes,
      defaultPrice: Number(pitch.defaultPrice),
      currency: pitch.currency,
      shareCode: pitch.shareCode,
      status: pitch.status,
      accountNumber: pitch.accountNumber,
      accountName: pitch.accountName,
      virtualBankName: pitch.virtualBankName,
    };
  }

  private dateRange(from: string, to: string): string[] {
    // Calendar days counted in UTC so the server's time zone can't move them. Cap at 14 days.
    const dates: string[] = [];
    const current = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    if (isNaN(current.getTime()) || isNaN(end.getTime())) throw new BadRequestException('Dates must be YYYY-MM-DD');
    while (current <= end && dates.length < 14) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  /**
   * Requests the owner never answered stop holding the time: after PENDING_HOURS, or once the game
   * would have started. Run before anything reads or changes bookings, so no one sees a stale one.
   */
  private async expireStale(where: { pitchId: string } | { bookedById: string }) {
    const qb = this.bookingRepo
      .createQueryBuilder()
      .update(PitchBooking)
      .set({ status: 'expired' })
      .where(`status = 'pending'`)
      .andWhere(`NOT (${pendingLiveSql()})`, { tz: APP_TZ });
    if ('pitchId' in where) qb.andWhere('pitch_id = :pitchId', { pitchId: where.pitchId });
    else qb.andWhere('booked_by_id = :bookedById', { bookedById: where.bookedById });
    await qb.execute();
  }
}
