import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { Group } from '../groups/entities/group.entity';
import { PayoutStatus } from './entities/outgoing-transfer.entity';

/**
 * BillingService over an in-memory ledger: `bankIn` naira has arrived, and every payout
 * recorded so far counts against it. Transactions behave like Postgres row locks: a
 * transaction that locks the group waits for the one holding it to finish.
 */
function setup(bankIn: number) {
  const group = { id: 'g1', name: 'FlowVault', organizationId: 'org1', accountNumber: '9999268301' } as Group;
  const recorded: { amount: number; fee: number; status: PayoutStatus }[] = [];
  let lockHeld: Promise<void> = Promise.resolve();
  const events: string[] = [];

  const manager = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const tx = {
        findOne: async (entity: unknown, o: any) => {
          if (entity === Group && o.lock) {
            const before = lockHeld;
            lockHeld = new Promise<void>((r) => (release = r));
            await before;
            events.push('lock');
          }
          return null;
        },
        save: async (p: any) => {
          recorded.push(p);
          return p;
        },
      };
      try {
        return await fn(tx);
      } finally {
        release?.();
      }
    },
  };
  const payoutsRepo = {
    manager,
    createQueryBuilder: () => {
      const qb: any = { select: () => qb, where: () => qb, andWhere: () => qb, getRawOne: async () => ({ dailyTotal: 0 }) };
      return qb;
    },
    create: (p: any) => ({ id: `po${recorded.length + 1}`, status: PayoutStatus.PENDING, ...p }),
    save: async (p: any) => p,
  };
  const pulse = new MockPulseClient('secret');
  jest.spyOn(pulse, 'nameEnquiry').mockResolvedValue({ accountName: 'TUNDE BAKARE' });
  const transferOut = jest.spyOn(pulse, 'transferOut');
  const usersService = { verifyTransferPin: jest.fn(async () => true) };

  const service = new BillingService(
    { findOne: async () => group } as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    payoutsRepo as any, pulse, {} as any, {} as any, usersService as any,
    { get: (_key: string, fallback?: unknown) => fallback } as any,
  );
  jest.spyOn(service, 'getGroupBalance').mockImplementation(async () => {
    events.push('balance');
    const out = recorded.filter((p) => p.status !== PayoutStatus.FAILED).reduce((s, p) => s + p.amount + p.fee, 0);
    return { totalIn: bankIn, manualIn: 0, totalOut: out, available: bankIn - out };
  });
  const pay = (amount: number) =>
    service.initiateTransferOut('g1', 'org1', 'u1', { amount, beneficiaryAccount: '0123456789', beneficiaryBankCode: '058', pin: '1234' });
  return { pay, pulse, transferOut, recorded, events };
}

describe('payout safety', () => {
  it('checks the balance only once it holds the lock on the group', async () => {
    const { pay, events } = setup(10_000);
    await pay(1000);
    expect(events.slice(0, 2)).toEqual(['lock', 'balance']);
  });

  it("payouts sent at the same moment can't spend the same money", async () => {
    // ₦499,650 available: one ₦400,000 payout (+ fee) fits, a second doesn't.
    const { pay, recorded, transferOut } = setup(499_650 + 0);
    const results = await Promise.allSettled([pay(400_000), pay(400_000), pay(400_000), pay(400_000), pay(400_000)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason instanceof BadRequestException)).toBe(true);
    expect(recorded).toHaveLength(1);
    expect(transferOut).toHaveBeenCalledTimes(1);
  });

  it('refuses a payout bigger than what the bank says the account holds, without sending anything', async () => {
    const { pay, pulse, transferOut } = setup(2_000_000); // our ledger thinks there's plenty…
    jest.spyOn(pulse, 'getBalance').mockResolvedValue(5_000); // …the bank says otherwise.

    await expect(pay(10_000)).rejects.toThrow('The group account holds');
    expect(transferOut).not.toHaveBeenCalled();
  });

  it("goes by our ledger when the bank's balance can't be read", async () => {
    const { pay, pulse } = setup(20_000);
    jest.spyOn(pulse, 'getBalance').mockRejectedValue(new Error('Pulse down'));

    const payout = await pay(10_000);
    expect(payout.status).not.toBe(PayoutStatus.FAILED);
  });
});
