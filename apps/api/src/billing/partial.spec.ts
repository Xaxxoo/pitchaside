import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { TransferStatus } from './entities/bank-transfer.entity';
import { PaymentStatus } from '../payments/entities/payment.entity';

/**
 * BillingService over an in-memory member and their pending dues, oldest first.
 * The transaction hands back the same objects, so assertions see what was saved.
 */
function setup(dues: number[], credit = 0) {
  const membership: any = { groupId: 'g1', playerId: 'p1', credit: credit.toFixed(2) };
  const payments: any[] = dues.map((amount, i) => ({ id: `pay${i}`, sessionId: `s${i}`, playerId: 'p1', amount: String(amount), status: PaymentStatus.PENDING }));
  const pending = () => payments.filter((p) => p.status === PaymentStatus.PENDING);
  const qb: any = { innerJoin: () => qb, where: () => qb, andWhere: () => qb, orderBy: () => qb, getMany: async () => pending(), getOne: async () => payments[0] };
  const tx = { findOne: async () => membership, getRepository: () => ({ createQueryBuilder: () => qb }), save: async (x: unknown) => x };
  const membershipsRepo = { manager: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
  const paymentsRepo = { createQueryBuilder: () => qb, save: async (x: unknown) => x };
  const transfersRepo = { save: async (x: unknown) => x, findOne: async () => null };
  const paymentsService = { recalculateSessionTotal: jest.fn(), sendReceipts: jest.fn() };
  const notifications = { later: jest.fn() };

  const service = new BillingService(
    {} as any, membershipsRepo as any, {} as any, paymentsRepo as any, {} as any, transfersRepo as any, {} as any,
    {} as any, {} as any,
    new MockPulseClient('secret'), paymentsService as any, notifications as any, {} as any, {} as any, {} as any,
  );
  return { service, membership, payments };
}

describe('partial payments', () => {
  it('holds a payment smaller than the due as credit and leaves the due pending', async () => {
    const { service, membership, payments } = setup([1000]);
    const { settled, credit } = await service.applyCredit('g1', 'p1', 198);

    expect(settled).toEqual([]);
    expect(credit).toBe(198);
    expect(membership.credit).toBe('198.00');
    expect(payments[0].status).toBe(PaymentStatus.PENDING);
  });

  it('pays the due once credit plus the new transfer reaches it', async () => {
    const { service, membership, payments } = setup([1000], 198);
    const { settled } = await service.applyCredit('g1', 'p1', 802);

    expect(settled.map((p) => p.id)).toEqual(['pay0']);
    expect(payments[0].status).toBe(PaymentStatus.PAID);
    expect(membership.credit).toBe('0.00');
  });

  it('pays oldest dues first and keeps the remainder', async () => {
    const { service, membership, payments } = setup([1000, 1000, 1000]);
    await service.applyCredit('g1', 'p1', 2500);

    expect(payments.map((p) => p.status)).toEqual([PaymentStatus.PAID, PaymentStatus.PAID, PaymentStatus.PENDING]);
    expect(membership.credit).toBe('500.00');
  });

  it("assigning a small transfer to a due by hand credits the player instead of marking the due paid", async () => {
    const { service, membership, payments } = setup([1000]);
    const transfer: any = { id: 't1', groupId: 'g1', amount: '198.00', status: TransferStatus.UNMATCHED };
    jest.spyOn(service as any, 'findTransfer').mockResolvedValue(transfer);

    const saved: any = await service.assignTransfer('t1', 'pay0', 'org1');

    expect(payments[0].status).toBe(PaymentStatus.PENDING);
    expect(membership.credit).toBe('198.00');
    expect(saved).toMatchObject({ status: TransferStatus.ASSIGNED, playerId: 'p1' });
  });
});
