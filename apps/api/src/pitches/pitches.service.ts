import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { PitchAvailabilityService } from './pitch-availability.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class PitchesService {
  constructor(
    @InjectRepository(Pitch) private pitchRepo: Repository<Pitch>,
    @InjectRepository(PitchSchedule) private schedRepo: Repository<PitchSchedule>,
    @InjectRepository(PitchSlotOverride) private overrideRepo: Repository<PitchSlotOverride>,
    @InjectRepository(PitchBooking) private bookingRepo: Repository<PitchBooking>,
    private availability: PitchAvailabilityService,
    private billing: BillingService,
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
    return this.bookingRepo.find({
      where: { pitchId },
      order: { date: 'DESC', startTime: 'ASC' },
    });
  }

  async confirmBooking(pitchId: string, bookingId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'pending') throw new BadRequestException('Only pending bookings can be confirmed');
    booking.status = 'confirmed';
    booking.confirmedAt = new Date();
    return this.bookingRepo.save(booking);
  }

  async rejectBooking(pitchId: string, bookingId: string, ownerId: string, reason?: string) {
    await this.findOne(pitchId, ownerId);
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'pending') throw new BadRequestException('Only pending bookings can be rejected');
    booking.status = 'rejected';
    booking.rejectionReason = reason ?? null;
    return this.bookingRepo.save(booking);
  }

  async cancelBookingOwner(pitchId: string, bookingId: string, ownerId: string) {
    await this.findOne(pitchId, ownerId);
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, pitchId } });
    if (!booking) throw new NotFoundException('Booking not found');
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

    // Check slot availability
    const slots = await this.availability.getAvailableSlots(pitch.id, dto.date);
    const slot = slots.find((s) => s.startTime === dto.startTime && s.endTime === dto.endTime);
    if (!slot) throw new BadRequestException('This slot does not exist');
    if (!slot.available) throw new BadRequestException('This slot is already booked');

    // Prevent booking in the past
    const now = new Date();
    const bookingDate = new Date(dto.date + 'T' + dto.startTime + ':00');
    if (bookingDate < now) throw new BadRequestException('Cannot book a slot in the past');

    const booking = this.bookingRepo.create({
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

    return this.bookingRepo.save(booking);
  }

  async myBookings(userId: string) {
    return this.bookingRepo.find({
      where: { bookedById: userId },
      relations: ['pitch'],
      order: { date: 'DESC', startTime: 'ASC' },
    });
  }

  async cancelBookingOrganiser(bookingId: string, userId: string) {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId, bookedById: userId } });
    if (!booking) throw new NotFoundException('Booking not found');
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
    };
  }

  private dateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const current = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    // Cap at 14 days
    const maxDays = 14;
    let i = 0;
    while (current <= end && i < maxDays) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
      i++;
    }
    return dates;
  }
}
