import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { PayoutStatus } from './entities/outgoing-transfer.entity';

/** BillingService with one member holding `credit`, and just what refund payouts touch. */
function setup(credit: number) {
  const group = { id: 'g1', name: 'FlowVault', organizationId: 'org1', accountNumber: '9999268301' };
  const membership: any = { groupId: 'g1', playerId: 'p1', credit: credit.toFixed(2) };
  const tx = {
    findOne: async (_e: unknown, o: any) => (o.where.playerId === 'p1' ? membership : null),
    save: async (x: any) => x,
  };
  const manager = { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
  let stored: any = null;
  const payoutsRepo = {
    manager,
    createQueryBuilder: () => {
      const qb: any = { select: () => qb, where: () => qb, andWhere: () => qb, getRawOne: async () => ({ dailyTotal: 0 }) };
      return qb;
    },
    create: (p: any) => ({ id: 'po1', status: PayoutStatus.PENDING, ...p }),
    save: jest.fn(async (p: any) => (stored = p)),
    findOne: async () => stored,
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
  return { service, membership, refund, transferOut, payout: () => stored };
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

  it('gives the credit back when the bank rejects the transfer', async () => {
    const { membership, refund, transferOut } = setup(1500);
    transferOut.mockRejectedValueOnce(new Error('Beneficiary bank unavailable'));

    const payout = await refund(1000);

    expect(payout.status).toBe(PayoutStatus.FAILED);
    expect(membership.credit).toBe('1500.00');
  });

  it('gives it back when Pulse later reports failure, once, and takes it again if it then completes', async () => {
    const { service, membership, refund, payout } = setup(1500);
    transferOutProcessing();
    await refund(1000);
    expect(membership.credit).toBe('500.00');

    await service.handlePayoutWebhook(payout().providerReference, 'failed', 'Declined');
    await service.handlePayoutWebhook(payout().providerReference, 'failed', 'Declined');
    expect(membership.credit).toBe('1500.00');

    await service.handlePayoutWebhook(payout().providerReference, 'completed');
    expect(membership.credit).toBe('500.00');

    function transferOutProcessing() {
      jest.spyOn((service as any).pulse, 'transferOut').mockResolvedValueOnce({ status: 'processing' } as any);
    }
  });
});
