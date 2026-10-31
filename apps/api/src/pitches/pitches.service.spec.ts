import { BadRequestException } from '@nestjs/common';
import { PitchesService } from './pitches.service';
import { PitchAvailabilityService, pendingLiveSql } from './pitch-availability.service';

/** A query builder whose every chain call returns itself, recording the SQL it was given. */
function builder(result: unknown = []) {
  const calls: string[] = [];
  const qb: any = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        if (key === 'getMany') return async () => result;
        if (key === 'execute') return async () => ({ affected: 0 });
        if (key === 'calls') return calls;
        return (sql?: unknown) => {
          if (typeof sql === 'string') calls.push(sql);
          return qb;
        };
      },
    },
  );
  return qb;
}

const pitch = { id: 'pitch-1', ownerId: 'owner-1', status: 'active', slotDurationMinutes: 60, defaultPrice: 30000, shareCode: 'abc' };

describe('pitch bookings', () => {
  let schedRepo: any, overrideRepo: any, bookingRepo: any, pitchRepo: any, manager: any, dataSource: any;
  let availability: PitchAvailabilityService;
  let service: PitchesService;
  let bookingQb: any;

  beforeEach(() => {
    bookingQb = builder();
    schedRepo = { find: jest.fn().mockResolvedValue([{ openTime: '06:00', closeTime: '23:00', price: null }]) };
    overrideRepo = { find: jest.fn().mockResolvedValue([]) };
    bookingRepo = { createQueryBuilder: jest.fn(() => bookingQb), findOne: jest.fn(), save: jest.fn(async (b) => b) };
    pitchRepo = { findOneByOrFail: jest.fn().mockResolvedValue(pitch), findOne: jest.fn().mockResolvedValue(pitch) };
    manager = { query: jest.fn(), create: jest.fn((_e, b) => b), save: jest.fn(async (b) => ({ id: 'new', ...b })), getRepository: jest.fn() };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    availability = new PitchAvailabilityService(schedRepo, overrideRepo, bookingRepo, pitchRepo);
    // Inside a booking's transaction the same repos are reached through its manager.
    const byEntity: Record<string, unknown> = { Pitch: pitchRepo, PitchSchedule: schedRepo, PitchSlotOverride: overrideRepo, PitchBooking: bookingRepo };
    manager.getRepository.mockImplementation((e: { name: string }) => byEntity[e.name]);
    service = new PitchesService(pitchRepo, schedRepo, overrideRepo, bookingRepo, availability, {} as any, dataSource);
  });

  afterEach(() => jest.useRealTimers());

  it('reads the weekday from the calendar date, whatever the server clock', async () => {
    await availability.getAvailableSlots('pitch-1', '2026-10-31');
    expect(schedRepo.find).toHaveBeenCalledWith({ where: { pitchId: 'pitch-1', dayOfWeek: 6 } });
  });

  it('only counts a request as holding the time while it is still waiting in time', async () => {
    await availability.getAvailableSlots('pitch-1', '2026-10-31');
    const where = bookingQb.calls.join(' ');
    expect(where).toContain(`b.status = 'pending' AND ${pendingLiveSql('b')}`);
    expect(pendingLiveSql()).toContain("interval '24 hours'");
    expect(pendingLiveSql()).toContain('AT TIME ZONE :tz > now()');
  });

  it('takes a lock for the pitch and day before checking the time is free', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-30T09:30:00Z') });
    await service.createBooking({ pitchId: 'pitch-1', date: '2026-10-31', startTime: '19:00', endTime: '20:00', bookerName: 'Tunde' } as any, 'u1');
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['pitch-booking:pitch-1:2026-10-31']);
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(schedRepo.find.mock.invocationCallOrder[0]);
    // Its reads go through the transaction, not a second connection from the pool.
    expect(manager.getRepository).toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalled();
  });

  it('judges "in the past" on the Lagos clock', async () => {
    // 09:30 UTC is 10:30 in Lagos: the 10am hour has started there, though not in UTC.
    jest.useFakeTimers({ now: new Date('2026-10-30T09:30:00Z') });
    const at = (startTime: string, endTime: string) =>
      service.createBooking({ pitchId: 'pitch-1', date: '2026-10-30', startTime, endTime, bookerName: 'Tunde' } as any, 'u1');
    await expect(at('10:00', '11:00')).rejects.toThrow('Cannot book a slot in the past');
    await expect(at('11:00', '12:00')).resolves.toMatchObject({ startTime: '11:00' });
  });

  it('lists 14 calendar days at most, in order, and refuses dates it cannot read', async () => {
    pitchRepo.findOne.mockResolvedValue(pitch);
    const res = await service.getPublicAvailability('abc', '2026-10-25', '2026-12-01');
    expect(res.days.map((d) => d.date)).toEqual([
      '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
    await expect(service.getPublicAvailability('abc', 'nope', '2026-12-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ends stale requests before the owner answers, and says why', async () => {
    bookingRepo.findOne.mockResolvedValue({ id: 'b1', pitchId: 'pitch-1', status: 'expired' });
    await expect(service.confirmBooking('pitch-1', 'b1', 'owner-1')).rejects.toThrow('waited 24 hours without an answer');
    expect(bookingQb.calls).toContain(`NOT (${pendingLiveSql()})`);
  });
});

describe('pitch details', () => {
  it('uses the same lists as the app', () => {
    const shared = require('@pitchaside/shared');
    const api = require('./pitch-details');
    expect(api.PITCH_A_SIDE).toEqual([...shared.PITCH_A_SIDE]);
    expect(api.PITCH_SURFACES).toEqual([...shared.PITCH_SURFACES]);
    expect(api.PITCH_FACILITIES).toEqual([...shared.PITCH_FACILITIES]);
  });

  it('takes Google and Apple Maps links only', () => {
    const { MAP_URL } = require('./pitch-details');
    for (const ok of ['https://maps.app.goo.gl/q8Ttd4kZr2bNLyEz8', 'https://www.google.com/maps/place/Surulere', 'https://goo.gl/maps/abc', 'https://maps.google.com/?q=6.5,3.3', 'https://maps.apple.com/?q=pitch']) {
      expect(MAP_URL.test(ok)).toBe(true);
    }
    for (const bad of ['http://maps.app.goo.gl/x', 'https://example.com/maps', 'https://maps.app.goo.gl.evil.com/x', 'javascript:alert(1)', 'https://google.com.evil.io/maps']) {
      expect(MAP_URL.test(bad)).toBe(false);
    }
  });

  it('never sends the owner’s own bank details on the public link', async () => {
    const pitchRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'p1', ownerId: 'owner-1', name: 'Arena', defaultPrice: '30000', status: 'active', shareCode: 'abc', slotDurationMinutes: 60, currency: 'NGN',
        bankAccountNumber: '0123456789', bankCode: '058', bankName: 'GTBank', accountHolderName: 'Bayo Adewale', accountReference: 'ref',
        aSide: 5, surface: 'astro', facilities: ['floodlights'], mapUrl: 'https://maps.app.goo.gl/x', directions: 'Green gate',
      }),
    };
    const service = new PitchesService(pitchRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const pub = await service.publicPitch('abc');
    for (const k of ['ownerId', 'bankAccountNumber', 'bankCode', 'bankName', 'accountHolderName', 'accountReference']) expect(pub).not.toHaveProperty(k);
    expect(pub).toMatchObject({ aSide: 5, surface: 'astro', facilities: ['floodlights'], directions: 'Green gate', defaultPrice: 30000 });
  });
});

describe('bookings, as the booker sees them', () => {
  const pitch = { id: 'p1', ownerId: 'o1', name: 'Arena', defaultPrice: '30000', bankAccountNumber: '0123456789', accountHolderName: 'Bayo', bankCode: '058', facilities: [], photoKeys: [] };
  const make = (bookingRepo: any) =>
    new PitchesService({} as any, {} as any, {} as any, bookingRepo, {} as any, {} as any, {} as any);
  const qb = () => { const q: any = new Proxy({}, { get: (_t, k) => (k === 'execute' ? async () => ({}) : () => q) }); return q; };

  it('never includes the owner’s own bank details', async () => {
    const repo = { createQueryBuilder: qb, find: jest.fn().mockResolvedValue([{ id: 'b1', pitch }]) };
    const [b] = await make(repo).myBookings('u1');
    for (const k of ['ownerId', 'bankAccountNumber', 'accountHolderName', 'bankCode']) expect(b.pitch).not.toHaveProperty(k);
    expect(b.pitch).toMatchObject({ name: 'Arena', defaultPrice: 30000 });
  });

  it('won’t cancel a paid booking from the booker’s side', async () => {
    const repo = { createQueryBuilder: qb, findOne: jest.fn().mockResolvedValue({ id: 'b1', status: 'confirmed', paymentStatus: 'paid' }), save: jest.fn() };
    await expect(make(repo).cancelBookingOrganiser('b1', 'u1')).rejects.toThrow('Ask the owner to cancel it');
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('the pitch directory', () => {
  function setup(rows: any[], prices: any[]) {
    const where: string[] = [];
    const qb: any = { where: (s: string) => (where.push(s), qb), andWhere: (s: string) => (where.push(s), qb), orderBy: () => qb, getMany: async () => rows };
    const sq: any = { select: () => sq, addSelect: () => sq, where: () => sq, groupBy: () => sq, getRawMany: async () => prices };
    const pitchRepo = { createQueryBuilder: () => qb };
    const schedRepo = { createQueryBuilder: () => sq };
    return { service: new PitchesService(pitchRepo as any, schedRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any), where };
  }
  const row = (id: string, extra = {}) => ({ id, name: id, shareCode: `c-${id}`, city: 'Surulere', state: 'Lagos', defaultPrice: '30000', photoKeys: ['k1'], aSide: 5, surface: 'astro', accountNumber: '99', ...extra });

  it('lists only live pitches with hours and their own account, and never the owner’s details', async () => {
    const { service, where } = setup([row('a')], [{ pitchId: 'a', min: null, usual: '7' }]);
    const list = await service.directory({});
    expect(where.join(' ')).toMatch(/status = 'active'/);
    expect(where.join(' ')).toMatch(/account_number IS NOT NULL/);
    expect(where.join(' ')).toMatch(/pitch_schedules/);
    expect(list).toEqual([{ code: 'c-a', name: 'a', city: 'Surulere', state: 'Lagos', aSide: 5, surface: 'astro', priceFrom: 30000, photoKey: 'k1' }]);
  });

  it('says the cheapest a game really costs', async () => {
    const cheaperDay = setup([row('a')], [{ pitchId: 'a', min: '25000', usual: '5' }]);
    expect((await cheaperDay.service.directory({}))[0].priceFrom).toBe(25000);
    // Every open day has its own (dearer) price: the usual one never applies
    const allDear = setup([row('a')], [{ pitchId: 'a', min: '35000', usual: '0' }]);
    expect((await allDear.service.directory({}))[0].priceFrom).toBe(35000);
  });
});

describe('open all day and night', () => {
  const availability = new PitchAvailabilityService({} as any, {} as any, {} as any, {} as any);
  const slots = (open: string, close: string, minutes: number) => (availability as any).generateSlots(open, close, minutes, 30000);

  it('a day that closes at 24:00 has its last game end at midnight', () => {
    const day = slots('00:00', '24:00', 60);
    expect(day).toHaveLength(24);
    expect(day[0]).toMatchObject({ startTime: '00:00', endTime: '01:00' });
    expect(day[23]).toMatchObject({ startTime: '23:00', endTime: '24:00' });
  });

  it('90-minute games fit the day without running past midnight', () => {
    const day = slots('00:00', '24:00', 90);
    expect(day).toHaveLength(16);
    expect(day[15].endTime).toBe('24:00');
  });
});

describe('deleting a pitch', () => {
  function setup(p: Record<string, unknown>, bookings: number) {
    const pitchRepo = { findOne: jest.fn().mockResolvedValue({ ...pitch, ...p }), delete: jest.fn() };
    const bookingRepo = { count: jest.fn().mockResolvedValue(bookings) };
    return { service: new PitchesService(pitchRepo as any, {} as any, {} as any, bookingRepo as any, {} as any, {} as any, {} as any), pitchRepo };
  }

  it('goes for good when it was never booked and has no account', async () => {
    const { service, pitchRepo } = setup({ accountNumber: null }, 0);
    expect(await service.canDelete('pitch-1', 'owner-1')).toBe(true);
    await service.deleteForGood('pitch-1', 'owner-1');
    expect(pitchRepo.delete).toHaveBeenCalledWith({ id: 'pitch-1', ownerId: 'owner-1' });
  });

  it('only hides once it has bookings or its own bank account, and says why', async () => {
    const booked = setup({ accountNumber: null }, 2);
    await expect(booked.service.deleteForGood('pitch-1', 'owner-1')).rejects.toThrow(/bookings on record/);
    expect(booked.pitchRepo.delete).not.toHaveBeenCalled();
    const banked = setup({ accountNumber: '9900000123' }, 0);
    expect(await banked.service.canDelete('pitch-1', 'owner-1')).toBe(false);
    await expect(banked.service.deleteForGood('pitch-1', 'owner-1')).rejects.toThrow(/own bank account/);
  });
});
