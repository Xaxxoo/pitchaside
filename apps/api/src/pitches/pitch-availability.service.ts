import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PitchSchedule } from './entities/pitch-schedule.entity';
import { PitchSlotOverride } from './entities/pitch-slot-override.entity';
import { PitchBooking } from './entities/pitch-booking.entity';
import { Pitch } from './entities/pitch.entity';

export interface SlotInfo {
  startTime: string;
  endTime: string;
  price: number;
  available: boolean;
  bookingId?: string;
  bookerName?: string;
  bookingStatus?: string;
}

@Injectable()
export class PitchAvailabilityService {
  constructor(
    @InjectRepository(PitchSchedule) private schedRepo: Repository<PitchSchedule>,
    @InjectRepository(PitchSlotOverride) private overrideRepo: Repository<PitchSlotOverride>,
    @InjectRepository(PitchBooking) private bookingRepo: Repository<PitchBooking>,
    @InjectRepository(Pitch) private pitchRepo: Repository<Pitch>,
  ) {}

  async getAvailableSlots(pitchId: string, date: string): Promise<SlotInfo[]> {
    const pitch = await this.pitchRepo.findOneByOrFail({ id: pitchId });
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();

    // 1. Load recurring schedule for this day
    const schedules = await this.schedRepo.find({
      where: { pitchId, dayOfWeek },
    });

    // 2. Generate base slots from schedule
    const slotMap = new Map<string, SlotInfo>();

    for (const sched of schedules) {
      const generated = this.generateSlots(
        sched.openTime,
        sched.closeTime,
        pitch.slotDurationMinutes,
        sched.price != null ? Number(sched.price) : Number(pitch.defaultPrice),
      );
      for (const slot of generated) {
        slotMap.set(slot.startTime, slot);
      }
    }

    // 3. Apply overrides for this date
    const overrides = await this.overrideRepo.find({
      where: { pitchId, date },
    });

    for (const ovr of overrides) {
      if (ovr.type === 'blocked') {
        // Remove any slots that overlap with the blocked range
        for (const [key, slot] of slotMap) {
          if (this.overlaps(slot.startTime, slot.endTime, ovr.startTime, ovr.endTime)) {
            slotMap.delete(key);
          }
        }
      } else if (ovr.type === 'added') {
        // Add extra slots
        const price = ovr.price != null ? Number(ovr.price) : Number(pitch.defaultPrice);
        const generated = this.generateSlots(ovr.startTime, ovr.endTime, pitch.slotDurationMinutes, price);
        for (const slot of generated) {
          slotMap.set(slot.startTime, slot);
        }
      } else if (ovr.type === 'price_override') {
        // Change price for matching slots
        const price = Number(ovr.price);
        for (const [, slot] of slotMap) {
          if (this.overlaps(slot.startTime, slot.endTime, ovr.startTime, ovr.endTime)) {
            slot.price = price;
          }
        }
      }
    }

    // 4. Load bookings for this date (pending + confirmed)
    const bookings = await this.bookingRepo.find({
      where: [
        { pitchId, date, status: 'pending' },
        { pitchId, date, status: 'confirmed' },
      ],
    });

    for (const booking of bookings) {
      for (const [, slot] of slotMap) {
        if (this.overlaps(slot.startTime, slot.endTime, booking.startTime, booking.endTime)) {
          slot.available = false;
          slot.bookingId = booking.id;
          slot.bookerName = booking.bookerName;
          slot.bookingStatus = booking.status;
        }
      }
    }

    // Sort by start time and return
    return Array.from(slotMap.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private generateSlots(openTime: string, closeTime: string, durationMinutes: number, price: number): SlotInfo[] {
    const slots: SlotInfo[] = [];
    let current = this.timeToMinutes(openTime);
    const end = this.timeToMinutes(closeTime);

    while (current + durationMinutes <= end) {
      const startTime = this.minutesToTime(current);
      const endTime = this.minutesToTime(current + durationMinutes);
      slots.push({ startTime, endTime, price, available: true });
      current += durationMinutes;
    }

    return slots;
  }

  private overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    const a0 = this.timeToMinutes(aStart);
    const a1 = this.timeToMinutes(aEnd);
    const b0 = this.timeToMinutes(bStart);
    const b1 = this.timeToMinutes(bEnd);
    return a0 < b1 && b0 < a1;
  }

  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesToTime(m: number): string {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
