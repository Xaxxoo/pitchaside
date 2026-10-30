import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PitchSchedule } from './entities/pitch-schedule.entity';
import { PitchSlotOverride } from './entities/pitch-slot-override.entity';
import { PitchBooking } from './entities/pitch-booking.entity';
import { Pitch } from './entities/pitch.entity';
import { APP_TZ } from '../common/time.util';

/** How long a request holds a time before the owner must answer. */
export const PENDING_HOURS = 24;

/**
 * SQL for a request still waiting in time: made less than PENDING_HOURS ago, for a game that hasn't
 * started yet (on the pitch's clock). Pass :tz. `alias` is the pitch_bookings alias, if any.
 */
export function pendingLiveSql(alias?: string) {
  const c = alias ? `${alias}.` : '';
  return `${c}"createdAt" > now() - interval '${PENDING_HOURS} hours' AND (${c}date + ${c}start_time::time) AT TIME ZONE :tz > now()`;
}

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

  /** `manager`: read inside that transaction (booking holds a lock and must not wait on another connection). */
  async getAvailableSlots(pitchId: string, date: string, manager?: EntityManager): Promise<SlotInfo[]> {
    const [pitchRepo, schedRepo, overrideRepo, bookingRepo] = manager
      ? [manager.getRepository(Pitch), manager.getRepository(PitchSchedule), manager.getRepository(PitchSlotOverride), manager.getRepository(PitchBooking)]
      : [this.pitchRepo, this.schedRepo, this.overrideRepo, this.bookingRepo];
    const pitch = await pitchRepo.findOneByOrFail({ id: pitchId });
    // The calendar day itself, so the server's own time zone can't shift it.
    const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay();

    // 1. Load recurring schedule for this day
    const schedules = await schedRepo.find({
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
    const overrides = await overrideRepo.find({
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

    // 4. Load bookings for this date (confirmed, and requests still waiting)
    // A request the owner never answered stops holding the time after PENDING_HOURS.
    const bookings = await bookingRepo
      .createQueryBuilder('b')
      .where('b.pitch_id = :pitchId AND b.date = :date', { pitchId, date })
      .andWhere(`(b.status = 'confirmed' OR (b.status = 'pending' AND ${pendingLiveSql('b')}))`, { tz: APP_TZ })
      .getMany();

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
