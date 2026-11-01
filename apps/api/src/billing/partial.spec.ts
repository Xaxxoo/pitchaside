import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { BankTransfer, TransferStatus } from './entities/bank-transfer.entity';
import { PaymentClaim } from './entities/payment-claim.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';

/**
 * BillingService over an in-memory member and their pending dues, oldest first.
 * The transaction hands back the same objects, so assertions see what was saved.
 */
function setup(dues: number[], credit = 0, dates?: string[]) {
  const membership: any = { groupId: 'g1', playerId: 'p1', credit: credit.toFixed(2), extra: '0.00' };
  // Games already played unless dates say otherwise.
  const payments: any[] = dues.map((amount, i) => ({
    id: `pay${i}`,
    sessionId: `s${i}`,
    playerId: 'p1',
    amount: String(amount),
    status: PaymentStatus.PENDING,
    session: { date: dates?.[i] ?? `2026-01-${String(i + 1).padStart(2, '0')}` },
  }));
  const pending = () => payments.filter((p) => p.status === PaymentStatus.PENDING);
  const qb: any = { innerJoin: () => qb, innerJoinAndSelect: () => qb, where: () => qb, andWhere: () => qb, orderBy: () => qb, getMany: async () => pending(), getOne: async () => payments[0] };
  const claims: any[] = [];
  // What the database holds for each transfer, so conditional updates behave like Postgres's.
  const transferRows: Record<string, { status: TransferStatus }> = {};
  const tx = {
    findOne: async () => membership,
    find: async (entity: unknown, { where }: any) =>
      entity === PaymentClaim ? claims.filter((c) => c.status === 'pending' && c.playerId === where.playerId) : [],
    update: async (entity: unknown, where: any, patch: any) => {
      const row =
        entity === BankTransfer
          ? (transferRows[where.id] ??= { status: TransferStatus.UNMATCHED })
          : entity === Payment
            ? payments.find((p) => p.id === where.id)
            : claims.find((c) => c.id === where.id);
      if (!row || row.status !== where.status) return { affected: 0 };
      Object.assign(row, patch);
      return { affected: 1 };
    },
    getRepository: () => ({ createQueryBuilder: () => qb }),
    save: async (x: unknown) => x,
  };
  const manager = { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  const membershipsRepo = { manager, findOne: async ({ where }: any) => (where.playerId === 'p1' ? membership : null) };
  const paymentsRepo = { createQueryBuilder: () => qb, save: async (x: unknown) => x };
  const transfersRepo = { manager, save: async (x: unknown) => x, findOne: async () => null };
  const paymentsService = { recalculateSessionTotal: jest.fn(), sendReceipts: jest.fn() };
  const notifications = { later: jest.fn() };
  const claimsRepo = { claims };

  const service = new BillingService(
    {} as any, membershipsRepo as any, {} as any, paymentsRepo as any, {} as any, transfersRepo as any, {} as any,
    {} as any, {} as any,
    new MockPulseClient('secret'), paymentsService as any, notifications as any, {} as any, {} as any, claimsRepo as any,
  );
  return { service, membership, payments, claimsRepo };
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

  it("matching a transfer to a player by hand closes that player's \"I've paid\" for it", async () => {
    const { service, claimsRepo } = setup([1500]);
    claimsRepo.claims.push({ id: 'c1', groupId: 'g1', playerId: 'p1', amount: '1500.00', status: 'pending', createdAt: new Date() });
    const transfer: any = { id: 't1', groupId: 'g1', amount: '1525.00', status: TransferStatus.UNMATCHED, receivedAt: new Date() };
    jest.spyOn(service as any, 'findTransfer').mockResolvedValue(transfer);

    await service.assignTransfer('t1', 'pay0', 'org1');

    expect(claimsRepo.claims[0]).toMatchObject({ status: 'matched', transferId: 't1' });
  });

  it('pays the due the organiser picked, and the rest through their credit', async () => {
    const { service, membership, payments } = setup([1500, 1500]);
    jest.spyOn(service as any, 'findTransfer').mockResolvedValue({ id: 't1', groupId: 'g1', amount: '1525.00', status: TransferStatus.UNMATCHED });

    await service.assignTransfer('t1', 'pay0', 'org1');

    expect(payments.map((p) => p.status)).toEqual([PaymentStatus.PAID, PaymentStatus.PENDING]);
    expect(membership.credit).toBe('25.00');
  });

  it('credits a transfer once when two organisers act on it at the same moment', async () => {
    const { service, membership } = setup([]);
    // Each request loads its own copy, still unmatched.
    jest.spyOn(service as any, 'findTransfer').mockImplementation(async () => ({ id: 't1', groupId: 'g1', amount: '1500.00', status: TransferStatus.UNMATCHED }));

    const results = await Promise.allSettled([service.giveTransfer('t1', 'p1', 'org1'), service.giveTransfer('t1', 'p1', 'org1')]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    // Owed nothing: it's credit for future dues, counted once.
    expect(membership.credit).toBe('1500.00');
  });

  it("won't set aside a transfer someone has already given to a player", async () => {
    const { service } = setup([]);
    jest.spyOn(service as any, 'findTransfer').mockImplementation(async () => ({ id: 't1', groupId: 'g1', amount: '1500.00', status: TransferStatus.UNMATCHED }));
    (service as any).transfersRepo.update = async () => ({ affected: 0 });
    await expect(service.ignoreTransfer('t1', 'org1')).rejects.toThrow('Someone else already sorted this payment.');
  });

  it('gives a transfer to a member who owes nothing: all of it stays as credit for future dues', async () => {
    const { service, membership } = setup([]);
    const transfer: any = { id: 't1', groupId: 'g1', amount: '1525.00', status: TransferStatus.UNMATCHED, receivedAt: new Date() };
    jest.spyOn(service as any, 'findTransfer').mockResolvedValue(transfer);

    const saved: any = await service.giveTransfer('t1', 'p1', 'org1');

    expect(saved).toMatchObject({ status: TransferStatus.ASSIGNED, playerId: 'p1' });
    expect(membership.credit).toBe('1525.00');
    expect(membership.extra).toBe('0.00');
  });

  it('gives a transfer to a member who owes: it pays their oldest game and keeps the rest', async () => {
    const { service, membership, payments } = setup([1500, 1500]);
    const transfer: any = { id: 't1', groupId: 'g1', amount: '1525.00', status: TransferStatus.UNMATCHED, receivedAt: new Date() };
    jest.spyOn(service as any, 'findTransfer').mockResolvedValue(transfer);

    await service.giveTransfer('t1', 'p1', 'org1');

    expect(payments.map((p) => p.status)).toEqual([PaymentStatus.PAID, PaymentStatus.PENDING]);
    expect(membership.credit).toBe('25.00');
  });

  it("won't give a transfer to someone outside the group", async () => {
    const { service } = setup([]);
    jest.spyOn(service as any, 'findTransfer').mockResolvedValue({ id: 't1', groupId: 'g1', amount: '1500.00', status: TransferStatus.UNMATCHED });
    await expect(service.giveTransfer('t1', 'stranger', 'org1')).rejects.toThrow("That player isn't in this group");
  });
});

describe('paid ahead or paid by this transfer', () => {
  it('marks a game paid wholly from money sent earlier as paid ahead', async () => {
    const { service, payments } = setup([1500], 1500);
    await service.applyCredit('g1', 'p1', 0);
    expect(payments[0]).toMatchObject({ status: PaymentStatus.PAID, source: 'transfer', markedBy: 'credit' });
  });

  it('marks a game the new transfer paid for (even partly) as paid by transfer', async () => {
    const fresh = setup([1500]);
    await fresh.service.applyCredit('g1', 'p1', 1500);
    expect(fresh.payments[0].markedBy).toBe('pulse');
    const topUp = setup([1500], 1000);
    await topUp.service.applyCredit('g1', 'p1', 500);
    expect(topUp.payments[0].markedBy).toBe('pulse');
  });

  it('labels each game: the first from what they had, the next from the new money', async () => {
    const { service, payments } = setup([1500, 1500], 1500);
    await service.applyCredit('g1', 'p1', 1500);
    expect(payments.map((p) => p.markedBy)).toEqual(['credit', 'pulse']);
  });
});

describe('extra money', () => {
  const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it('pays a played game and the next one, never a game further ahead', async () => {
    const { service, membership, payments } = setup([1500, 1500, 1500], 0, ['2026-01-01', future(5), future(12)]);
    await service.applyCredit('g1', 'p1', 4500);
    expect(payments.map((p) => p.status)).toEqual([PaymentStatus.PAID, PaymentStatus.PAID, PaymentStatus.PENDING]);
    expect(membership.extra).toBe('0.00');
    expect(membership.credit).toBe('1500.00');
  });

  it('sending double for this week: one game paid, the rest stays as credit', async () => {
    const { service, membership, payments } = setup([1500], 0, [future(3)]);
    await service.applyCredit('g1', 'p1', 3000);
    expect(payments[0].status).toBe(PaymentStatus.PAID);
    expect(membership.credit).toBe('1500.00');
  });

  it('a part payment still waits towards the game it is for, not as extra', async () => {
    const { service, membership } = setup([1500, 1500], 0, ['2026-01-01', future(5)]);
    await service.applyCredit('g1', 'p1', 2000);
    expect(membership.credit).toBe('500.00');
    expect(membership.extra).toBe('0.00');
  });

  it('money kept for them is never spent on a game beyond the next one', async () => {
    const { service, payments, membership } = setup([1500, 1500], 3000, [future(5), future(12)]);
    await service.applyCredit('g1', 'p1');
    expect(payments.map((p) => p.status)).toEqual([PaymentStatus.PAID, PaymentStatus.PENDING]);
    expect(membership.credit).toBe('1500.00');
  });

  it('keeping the extra moves it to their kept money', async () => {
    const { service, membership, payments } = setup([1500], 0, [future(3)]);
    membership.extra = '1500.00';
    (service as any).groupsRepo = { findOne: async () => ({ id: 'g1', organizationId: 'org1' }) };
    jest.spyOn(service as any, 'findGroup').mockResolvedValue({ id: 'g1' });
    await service.keepExtra('g1', 'p1', 'org1');
    expect(membership.extra).toBe('0.00');
    expect(payments[0].status).toBe(PaymentStatus.PAID);
    expect(membership.credit).toBe('0.00');
  });
});
