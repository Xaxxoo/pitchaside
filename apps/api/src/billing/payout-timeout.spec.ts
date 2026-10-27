import { BillingService, payoutFailureText, unclearTransferError } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { Group } from '../groups/entities/group.entity';
import { PayoutStatus } from './entities/outgoing-transfer.entity';

/**
 * The bank answers "Transfer request timed out" (Payrep's 400, seen live in October). That isn't
 * proof the money stayed put: the app asks the bank what happened before freeing the money, so
 * nothing can be sent twice, and the ₦350 fee follows the transfer whenever it's confirmed.
 */
const TIMED_OUT = 'Payrep MFB transfer failed (400): Transfer request timed out. Please try again.';

function setup(bankSays: { status: string; errorMessage?: string } | Error) {
  const group = { id: 'g1', name: 'Saturday Ballers', organizationId: 'org1', accountNumber: '9999268301' } as Group;
  const recorded: any[] = [];
  const payoutsRepo = {
    manager: {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ findOne: async () => null, save: async (p: any) => (recorded.push(p), p) }),
    },
    createQueryBuilder: () => {
      const qb: any = { select: () => qb, where: () => qb, andWhere: () => qb, getRawOne: async () => ({ dailyTotal: 0 }) };
      return qb;
    },
    create: (p: any) => ({ id: `po${recorded.length + 1}`, status: PayoutStatus.PENDING, createdAt: new Date(), ...p }),
    update: async (where: any, changes: any) => {
      const p = recorded.find((r) => r.id === where.id);
      if (!p || p.status !== where.status) return { affected: 0 };
      Object.assign(p, changes);
      return { affected: 1 };
    },
    findOneOrFail: async ({ where }: any) => recorded.find((r) => r.id === where.id),
    findOne: async ({ where }: any) => recorded.find((r) => r.providerReference === where.providerReference || r.id === where.id),
    find: async ({ where }: any) => recorded.filter((r) => r.status === where.status),
  };
  const pulse = new MockPulseClient('secret');
  jest.spyOn(pulse, 'nameEnquiry').mockResolvedValue({ accountName: 'MATTHEW IYANUOLUWA' });
  const transferOut = jest.spyOn(pulse, 'transferOut').mockImplementation(async (t) => {
    if (t.reference.endsWith('-FEE')) return { reference: t.reference, status: 'completed' };
    throw new Error(TIMED_OUT);
  });
  const getTransfer = jest.spyOn(pulse, 'getTransfer').mockImplementation(async () => {
    if (bankSays instanceof Error) throw bankSays;
    return bankSays;
  });
  const service = new BillingService(
    { findOne: async () => group } as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    payoutsRepo as any,
    {} as any, {} as any,
    pulse, {} as any, {} as any, { verifyTransferPin: jest.fn(async () => true) } as any,
    { get: (key: string, fallback?: unknown) => (key === 'PLATFORM_FEE_ACCOUNT' ? '1100000001' : fallback) } as any, {} as any,
  );
  jest.spyOn(service, 'getGroupBalance').mockResolvedValue({ totalIn: 100_000, manualIn: 0, totalOut: 0, available: 100_000 } as any);
  (service as any).handlePayoutWebhook = async (ref: string, status: 'completed' | 'failed', msg?: string) => {
    const p = recorded.find((r) => r.providerReference === ref);
    await payoutsRepo.update({ id: p.id, status: p.status }, { status: status === 'completed' ? PayoutStatus.COMPLETED : PayoutStatus.FAILED, ...(msg ? { errorMessage: msg } : {}) });
  };
  const pay = () => service.initiateTransferOut('g1', 'org1', 'u1', { amount: 5000, beneficiaryAccount: '8031234567', beneficiaryBankCode: '100004', pin: '1234' });
  const fees = () => transferOut.mock.calls.filter((c) => c[0].reference.endsWith('-FEE')).length;
  return { service, pay, recorded, getTransfer, fees };
}

describe('withdrawals when the bank says "timed out"', () => {
  it('reads Payrep’s timeout, our own cut-off and dropped connections as unclear, not as a refusal', () => {
    for (const m of [TIMED_OUT, 'The operation was aborted due to timeout', 'fetch failed', 'Payrep MFB transfer failed (502): Bad gateway', 'ECONNRESET'])
      expect(unclearTransferError(m)).toBe(true);
    for (const m of ['Payrep MFB transfer failed (400): Insufficient balance', 'Payrep MFB transfer failed (400): Invalid account number'])
      expect(unclearTransferError(m)).toBe(false);
  });

  it('the bank has no record of it: failed, the money is free again, no fee', async () => {
    const { pay, fees } = setup({ status: 'not_found' });
    const p = await pay();
    expect(p.status).toBe(PayoutStatus.FAILED);
    expect(p.errorMessage).toBe('The bank timed out sending this to OPay. No money left the account. Try again in a few minutes, or send it to another bank.');
    expect(fees()).toBe(0);
  });

  it('the bank says it went through after all: completed, and the fee is sent once', async () => {
    const { pay, fees } = setup({ status: 'successful' });
    const p = await pay();
    expect(p.status).toBe(PayoutStatus.COMPLETED);
    expect(fees()).toBe(1);
  });

  it('the bank says it failed: failed, with a plain reason', async () => {
    const { pay } = setup({ status: 'failed', errorMessage: 'Transfer request timed out. Please try again.' });
    const p = await pay();
    expect(p.status).toBe(PayoutStatus.FAILED);
    expect(p.errorMessage).toMatch(/^The bank timed out sending this to OPay\. No money left the account\./);
  });

  it('the bank is still working on it, or can’t be asked: held (processing), never freed to send twice', async () => {
    for (const says of [{ status: 'processing' }, new Error('Payrep MFB transfer lookup failed (500): oops')]) {
      const { pay, fees } = setup(says);
      const p = await pay();
      expect(p.status).toBe(PayoutStatus.PROCESSING);
      expect(p.errorMessage).toMatch(/money is held until it does/);
      expect(fees()).toBe(0);
    }
  });

  it('the follow-up settles a held one: confirmed later sends the fee; no record after 30 minutes fails it', async () => {
    let s = setup({ status: 'processing' });
    let p = await s.pay();
    s.getTransfer.mockResolvedValue({ status: 'completed' });
    await s.service.followUpPayouts(Date.now() + 3 * 60_000);
    expect(p.status).toBe(PayoutStatus.COMPLETED);
    expect(s.fees()).toBe(1);

    s = setup({ status: 'processing' });
    p = await s.pay();
    s.getTransfer.mockResolvedValue({ status: 'not_found' });
    await s.service.followUpPayouts(Date.now() + 10 * 60_000);
    expect(p.status).toBe(PayoutStatus.PROCESSING);
    await s.service.followUpPayouts(Date.now() + 31 * 60_000);
    expect(p.status).toBe(PayoutStatus.FAILED);
    expect(s.fees()).toBe(0);
  });

  it('plain words for other refusals', () => {
    expect(payoutFailureText('Payrep MFB transfer failed (400): Insufficient balance')).toBe('Not enough in the group account for this transfer. No money left the account.');
    expect(payoutFailureText('Payrep MFB transfer failed (400): Invalid account number', 'OPay')).toMatch(/couldn't find that account to OPay/);
    expect(payoutFailureText('Payrep MFB transfer failed (400): Daily limit reached', 'GTBank')).toBe("The bank didn't send this to GTBank. No money left the account. (Daily limit reached)");
  });
});
