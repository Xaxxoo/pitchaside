import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { PaymentType } from '../groups/entities/group.entity';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { SessionKind, kickoffFor } from '../sessions/entities/session.entity';
import { COVERED_BY_DUES } from '../payments/game-dues';

/** BillingService over an in-memory set of open sessions and their dues. */
function setup(sessions: any[], payments: any[]) {
  const qb: any = { where: () => qb, andWhere: jest.fn(() => qb), getMany: async () => sessions };
  const sessionsRepo = { createQueryBuilder: () => qb, update: jest.fn() };
  const paymentsRepo = {
    find: async () => payments.filter((p) => p.status === PaymentStatus.PENDING || p.source === COVERED_BY_DUES),
    save: jest.fn(async (x: unknown) => x),
  };
  const membershipsRepo = { count: async () => 8 };
  const paymentsService = { recalculateSessionTotal: jest.fn() };
  const service = new BillingService(
    {} as any, membershipsRepo as any, sessionsRepo as any, paymentsRepo as any, {} as any, {} as any, {} as any,
    {} as any, {} as any,
    new MockPulseClient('secret'), paymentsService as any, {} as any, {} as any, {} as any,
  );
  const applyCredits = jest.spyOn(service, 'applyCredits').mockResolvedValue(undefined);
  return { service, sessionsRepo, paymentsRepo, applyCredits };
}

describe('repriceOpenDues', () => {
  const group: any = { id: 'g1', feePerPlayer: '1500.00', targetPlayers: 14, paymentType: PaymentType.PER_SESSION };

  it('moves unpaid dues to the new fee and leaves paid ones alone', async () => {
    const payments = [
      { id: 'a', sessionId: 's1', playerId: 'p1', amount: '3000.00', status: PaymentStatus.PENDING },
      { id: 'b', sessionId: 's1', playerId: 'p2', amount: '3000.00', status: PaymentStatus.PAID },
    ];
    const { service, sessionsRepo, applyCredits } = setup([{ id: 's1', kind: SessionKind.GAME }], payments);

    await service.repriceOpenDues(group);

    expect(payments[0].amount).toBe(1500);
    expect(payments[1].amount).toBe('3000.00');
    expect(sessionsRepo.update).toHaveBeenCalledWith('s1', { targetAmount: 1500 * 14 });
    expect(applyCredits).toHaveBeenCalledWith('g1', ['p1']);
  });

  it("sizes a dues period's target by its members", async () => {
    const { service, sessionsRepo } = setup([{ id: 'd1', kind: SessionKind.DUES }], []);
    await service.repriceOpenDues({ ...group, paymentType: PaymentType.MONTHLY });
    expect(sessionsRepo.update).toHaveBeenCalledWith('d1', { targetAmount: 1500 * 8 });
  });

  it("stops charging for games once the group collects monthly — dues cover them", async () => {
    const payments = [{ id: 'a', sessionId: 's1', playerId: 'p1', amount: '1500.00', status: PaymentStatus.PENDING }];
    const { service, sessionsRepo } = setup([{ id: 's1', kind: SessionKind.GAME }], payments);

    await service.repriceOpenDues({ ...group, paymentType: PaymentType.MONTHLY });

    expect(payments[0]).toMatchObject({ amount: 0, status: PaymentStatus.WAIVED, source: COVERED_BY_DUES });
    expect(sessionsRepo.update).toHaveBeenCalledWith('s1', { targetAmount: 0 });
  });

  it('charges for games again when the group switches back to paying per game', async () => {
    const payments = [{ id: 'a', sessionId: 's1', playerId: 'p1', amount: 0, status: PaymentStatus.WAIVED, source: COVERED_BY_DUES }];
    const { service } = setup([{ id: 's1', kind: SessionKind.GAME }], payments);

    await service.repriceOpenDues(group);

    expect(payments[0]).toMatchObject({ amount: 1500, status: PaymentStatus.PENDING, source: null });
  });

  it('does nothing without open sessions', async () => {
    const { service, paymentsRepo } = setup([], []);
    await service.repriceOpenDues(group);
    expect(paymentsRepo.save).not.toHaveBeenCalled();
  });
});

describe('kickoffFor', () => {
  it("uses the game's own time, then the group's", () => {
    expect(kickoffFor({ kickoffTime: '19:30', group: { kickoffTime: '20:00' } })).toBe('19:30');
    expect(kickoffFor({ kickoffTime: null, group: { kickoffTime: '20:00' } })).toBe('20:00');
    expect(kickoffFor({ kickoffTime: null, group: { kickoffTime: null } })).toBeNull();
  });
});
