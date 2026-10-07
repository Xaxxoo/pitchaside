import { ConflictException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { refundToCredit } from '../payments/credit';
import { GroupsService } from '../groups/groups.service';

/** An in-memory member per player; the transaction hands back the same objects. */
function manager(credits: Record<string, number>) {
  const memberships: Record<string, any> = {};
  for (const [playerId, credit] of Object.entries(credits)) {
    memberships[playerId] = { groupId: 'g1', playerId, credit: credit.toFixed(2) };
  }
  const tx = { findOne: async (_e: unknown, o: any) => memberships[o.where.playerId] ?? null, save: async (x: unknown) => x };
  return { memberships, manager: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as any };
}

const due = (playerId: string, status: PaymentStatus, source?: string): Payment =>
  ({ id: `pay-${playerId}`, sessionId: 's1', playerId, amount: 1000, status, source }) as unknown as Payment;

describe('refundToCredit', () => {
  it('credits dues paid by transfer and leaves cash and unpaid dues alone', async () => {
    const { memberships, manager: m } = manager({ p1: 0, p2: 0, p3: 50 });
    const credited = await refundToCredit(m, 'g1', [
      due('p1', PaymentStatus.PAID, 'transfer'),
      due('p2', PaymentStatus.PAID, 'manual'),
      due('p3', PaymentStatus.PENDING),
    ]);

    expect(credited).toEqual(['p1']);
    expect(memberships.p1.credit).toBe('1000.00');
    expect(memberships.p2.credit).toBe('0.00');
    expect(memberships.p3.credit).toBe('50.00');
  });

  it("skips a player who is no longer a member", async () => {
    const { manager: m } = manager({});
    await expect(refundToCredit(m, 'g1', [due('gone', PaymentStatus.PAID, 'transfer')])).resolves.toEqual([]);
  });
});

describe('releaseTransferDues', () => {
  function setup() {
    const { memberships, manager: m } = manager({ p1: 0 });
    const paymentsRepo = { manager: m, save: jest.fn(async (x: unknown) => x) };
    const paymentsService = { recalculateSessionTotal: jest.fn() };
    const service = new BillingService(
      {} as any, {} as any, {} as any, paymentsRepo as any, {} as any, {} as any, {} as any,
      {} as any, {} as any,
      new MockPulseClient('secret'), paymentsService as any, {} as any, {} as any, {} as any,
    );
    const applyCredits = jest.spyOn(service, 'applyCredits').mockResolvedValue(undefined);
    return { service, memberships, paymentsRepo, paymentsService, applyCredits };
  }

  it('on cancel, reopens the paid due and moves the money to credit', async () => {
    const { service, memberships, paymentsService, applyCredits } = setup();
    const payment = due('p1', PaymentStatus.PAID, 'transfer');

    await service.releaseTransferDues({ groupId: 'g1', payments: [payment] }, { reopen: true });

    expect(memberships.p1.credit).toBe('1000.00');
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payment.source).toBeNull();
    expect(paymentsService.recalculateSessionTotal).toHaveBeenCalledWith('s1');
    expect(applyCredits).toHaveBeenCalledWith('g1', ['p1']);
  });

  it('on delete, only credits the member', async () => {
    const { service, memberships, paymentsRepo, applyCredits } = setup();

    await service.releaseTransferDues({ groupId: 'g1', payments: [due('p1', PaymentStatus.PAID, 'transfer')] }, { reopen: false });

    expect(memberships.p1.credit).toBe('1000.00');
    expect(paymentsRepo.save).not.toHaveBeenCalled();
    expect(applyCredits).toHaveBeenCalledWith('g1', ['p1']);
  });

  it('does nothing for a game paid in cash', async () => {
    const { service, applyCredits } = setup();
    await service.releaseTransferDues({ groupId: 'g1', payments: [due('p1', PaymentStatus.PAID, 'manual')] }, { reopen: true });
    expect(applyCredits).not.toHaveBeenCalled();
  });
});

describe('GroupsService money guards', () => {
  function setup({ credit = '0.00', available = 0 } = {}) {
    const groupsRepo = { findOne: async () => ({ id: 'g1' }), remove: jest.fn() };
    const membershipsRepo = { findOne: async () => ({ groupId: 'g1', playerId: 'p1', credit }), delete: jest.fn() };
    const billing = { getGroupBalance: async () => ({ available }) };
    const service = new GroupsService(groupsRepo as any, membershipsRepo as any, billing as any);
    return { service, groupsRepo, membershipsRepo };
  }

  it("won't remove a member holding credit unless forced", async () => {
    const { service, membershipsRepo } = setup({ credit: '300.00' });
    await expect(service.removeMember('g1', 'p1', 'org1')).rejects.toThrow(ConflictException);
    expect(membershipsRepo.delete).not.toHaveBeenCalled();

    await service.removeMember('g1', 'p1', 'org1', true);
    expect(membershipsRepo.delete).toHaveBeenCalledWith({ groupId: 'g1', playerId: 'p1' });
  });

  it('removes a member without credit straight away', async () => {
    const { service, membershipsRepo } = setup();
    await service.removeMember('g1', 'p1', 'org1');
    expect(membershipsRepo.delete).toHaveBeenCalled();
  });

  it("won't delete a group whose account still holds money", async () => {
    const { service, groupsRepo } = setup({ available: 2500 });
    await expect(service.remove('g1', 'org1')).rejects.toThrow(ConflictException);
    expect(groupsRepo.remove).not.toHaveBeenCalled();
  });

  it('deletes an empty group', async () => {
    const { service, groupsRepo } = setup();
    await service.remove('g1', 'org1');
    expect(groupsRepo.remove).toHaveBeenCalled();
  });
});
