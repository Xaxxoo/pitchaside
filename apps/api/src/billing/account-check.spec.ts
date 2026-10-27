import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';

/** Checking who owns an account before sending: a plain answer, never "Internal server error". */
function setup(bank: () => Promise<{ accountName: string }>) {
  const pulse = new MockPulseClient('secret');
  jest.spyOn(pulse, 'nameEnquiry').mockImplementation(bank);
  const service = new BillingService(
    { findOne: async () => ({ id: 'g1', organizationId: 'org1' }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, pulse, {} as any, {} as any, {} as any,
    { get: (_k: string, f?: unknown) => f } as any, {} as any,
  );
  (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  return (code = '100004', account = '2003041222') => service.nameEnquiry('g1', 'org1', code, account);
}

describe('account check before sending money', () => {
  it('the bank knows the account: its name', async () => {
    await expect(setup(async () => ({ accountName: ' MATTHEW IYANUOLUWA ' }))()).resolves.toEqual({ accountName: 'MATTHEW IYANUOLUWA' });
  });

  it('no such account at that bank (Payrep refuses the lookup): says so, a 400 not a 500', async () => {
    const check = setup(async () => { throw new Error('Payrep MFB name enquiry failed (400): Account not found'); });
    await expect(check()).rejects.toThrow(new BadRequestException('No account 2003041222 at OPay. Check the number and the bank.'));
  });

  it('the bank answers with no name: the same', async () => {
    await expect(setup(async () => ({ accountName: '' }))()).rejects.toThrow('No account 2003041222 at OPay');
  });

  it('the bank didn’t answer (timeout, 5xx, network): try again, not "check the number"', async () => {
    for (const msg of ['Payrep MFB name enquiry failed (504): Gateway timeout', 'The operation was aborted due to timeout', 'fetch failed']) {
      const check = setup(async () => { throw new Error(msg); });
      await expect(check()).rejects.toThrow(new ServiceUnavailableException("OPay didn't answer. Try again in a moment."));
    }
  });

  it('a bank code we don’t know reads "that bank"', async () => {
    await expect(setup(async () => ({ accountName: '' }))('999999')).rejects.toThrow('No account 2003041222 at that bank.');
  });
});
