import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { PayoutStatus } from './entities/outgoing-transfer.entity';

/** BillingService with one member holding `credit`, and just what refund payouts touch. */
function setup(credit: number, extra = 0) {
  const group = { id: 'g1', name: 'FlowVault', organizationId: 'org1', accountNumber: '9999268301' };
  const membership: any = { groupId: 'g1', playerId: 'p1', credit: credit.toFixed(2), extra: extra.toFixed(2) };
  const tx = {
    findOne: async (_e: unknown, o: any) => (o.where.playerId === 'p1' ? membership : null),
    // The payout row is written once, inside the locked transaction.
    save: async (x: any) => (x.providerReference ? (stored = x) : x),
  };
  const manager = { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  let stored: any = null;
  const payoutsRepo = {
    manager,
    createQueryBuilder: () => {
      const qb: any = { select: () => qb, where: () => qb, andWhere: () => qb, innerJoin: () => qb, getOne: async () => stored, getRawOne: async () => ({ dailyTotal: 0 }) };
      return qb;
    },
    create: (p: any) => ({ id: 'po1', status: PayoutStatus.PENDING, ...p }),
    save: jest.fn(async (p: any) => (stored = p)),
    findOne: async () => stored,
    findOneOrFail: async () => stored,
    update: async (where: any, changes: any) => {
      if (!stored || stored.id !== where.id || stored.status !== where.status) return { affected: 0 };
      Object.assign(stored, changes);
      return { affected: 1 };
    },
  };
  const pulse = new MockPulseClient('secret');
  jest.spyOn(pulse, 'nameEnquiry').mockResolvedValue({ accountName: 'TUNDE BAKARE' });
  const transferOut = jest.spyOn(pulse, 'transferOut');
  const usersService = { verifyTransferPin: jest.fn(async () => true) };

  const service = new BillingService(
    { findOne: async () => group } as any, { manager } as any, {} as any, {} as any, {} as any, {} as any,
    payoutsRepo as any,
    {} as any, {} as any,
    pulse, {} as any, {} as any, usersService as any,
    { get: (_key: string, fallback?: unknown) => fallback } as any, {} as any,
  );
  jest.spyOn(service, 'getGroupBalance').mockResolvedValue({ available: 50_000 } as any);
  const refund = (amount: number, refundPlayerId = 'p1') =>
    service.initiateTransferOut('g1', 'org1', 'u1', {
      amount,
      beneficiaryAccount: '0123456789',
      beneficiaryBankCode: '058',
      refundPlayerId,
      pin: '1234',
    });
  return { service, membership, refund, transferOut, payout: () => stored, leavePending: (p: any) => (stored = p) };
}

describe('refund payouts', () => {
  it("takes the refund off the member's credit and records who it was for", async () => {
    const { membership, refund } = setup(1500);
    const payout = await refund(1000);

    expect(membership.credit).toBe('500.00');
    expect(payout.refundPlayerId).toBe('p1');
    expect(payout.status).not.toBe(PayoutStatus.FAILED);
  });

  it('refuses more than the member has in credit, without sending anything', async () => {
    const { membership, refund, transferOut } = setup(300);
    await expect(refund(1000)).rejects.toThrow(BadRequestException);
    expect(membership.credit).toBe('300.00');
    expect(transferOut).not.toHaveBeenCalled();
  });

  it("refuses a player who isn't in the group", async () => {
    const { refund } = setup(300);
    await expect(refund(100, 'stranger')).rejects.toThrow("isn't in this group");
  });

  it('gives the money back as extra to sort when the bank rejects the transfer', async () => {
    const { membership, refund, transferOut } = setup(1500);
    transferOut.mockRejectedValueOnce(new Error('Beneficiary bank unavailable'));

    const payout = await refund(1000);

    expect(payout.status).toBe(PayoutStatus.FAILED);
    // Nobody chose to keep it for their next game, so it waits for the organiser.
    expect(membership.credit).toBe('500.00');
    expect(membership.extra).toBe('1000.00');
  });

  it('sends back extra not sorted yet before money kept for their next game', async () => {
    const { membership, refund } = setup(1000, 1500);
    await refund(2000);
    expect(membership.extra).toBe('0.00');
    expect(membership.credit).toBe('500.00');
  });

  it('refuses more than their extra and kept money together', async () => {
    const { refund } = setup(500, 1000);
    await expect(refund(2000)).rejects.toThrow('only have ₦1,500');
  });

  it('gives it back when Pulse later reports failure, once, and takes it again if it then completes', async () => {
    const { service, membership, refund, payout } = setup(1500);
    transferOutProcessing();
    await refund(1000);
    expect(membership.credit).toBe('500.00');

    await service.handlePayoutWebhook(payout().providerReference, 'failed', 'Declined');
    await service.handlePayoutWebhook(payout().providerReference, 'failed', 'Declined');
    expect(membership.credit).toBe('500.00');
    expect(membership.extra).toBe('1000.00');

    await service.handlePayoutWebhook(payout().providerReference, 'completed');
    expect(membership.credit).toBe('500.00');
    expect(membership.extra).toBe('0.00');

    function transferOutProcessing() {
      jest.spyOn((service as any).pulse, 'transferOut').mockResolvedValueOnce({ status: 'processing' } as any);
    }
  });

  it('gives a refund back once when the same failure message arrives twice at the same moment', async () => {
    const { service, membership, refund, payout } = setup(1500);
    jest.spyOn((service as any).pulse, 'transferOut').mockResolvedValueOnce({ status: 'processing' } as any);
    await refund(1000);

    const ref = payout().providerReference;
    await Promise.all([service.handlePayoutWebhook(ref, 'failed'), service.handlePayoutWebhook(ref, 'failed')]);
    expect(membership.extra).toBe('1000.00');
  });

  it("won't cancel a payout that may still be on its way to the bank", async () => {
    const { service, membership, leavePending } = setup(500);
    leavePending({ id: 'po1', groupId: 'g1', status: PayoutStatus.PENDING, refundPlayerId: 'p1', amount: '1000.00', createdAt: new Date() });
    await expect(service.cancelPayout('po1', 'org1')).rejects.toThrow(BadRequestException);
    expect(membership.extra).toBe('0.00');
  });

  it('cancels a payout left pending by a server stop, and gives the refund back once', async () => {
    const { service, membership, leavePending } = setup(500);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    leavePending({ id: 'po1', groupId: 'g1', status: PayoutStatus.PENDING, refundPlayerId: 'p1', amount: '1000.00', createdAt: old });
    const results = await Promise.allSettled([service.cancelPayout('po1', 'org1'), service.cancelPayout('po1', 'org1')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(membership.extra).toBe('1000.00');
  });
});
