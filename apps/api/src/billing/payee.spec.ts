import { BadRequestException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { Group } from '../groups/entities/group.entity';

/** BillingService with in-memory stand-ins for just what payees and payouts touch. */
function setup(groupOverrides: Partial<Group> = {}) {
  const group = { id: 'g1', name: 'FlowVault', organizationId: 'org1', accountNumber: '9999268301', ...groupOverrides } as Group;
  const saved: any[] = [];
  const groupsRepo = {
    findOne: jest.fn(async () => group),
    save: jest.fn(async (g: Group) => Object.assign(group, g)),
  };
  const payoutsRepo: any = {
    // Payouts are recorded inside a transaction that locks the group; here it just runs.
    manager: { transaction: (fn: (tx: unknown) => unknown) => fn({ findOne: async () => null, save: (p: any) => payoutsRepo.save(p) }) },
    createQueryBuilder: () => {
      const qb: any = { select: () => qb, where: () => qb, andWhere: () => qb, getRawOne: async () => ({ dailyTotal: 0 }) };
      return qb;
    },
    create: (p: any) => ({ ...p }),
    save: jest.fn(async (p: any) => {
      saved.push({ ...p });
      return p;
    }),
  };
  const pulse = new MockPulseClient('secret');
  jest.spyOn(pulse, 'nameEnquiry').mockResolvedValue({ accountName: 'ADEBAYO OGUNDIPE' });
  const transferOut = jest.spyOn(pulse, 'transferOut');
  const usersService = { verifyTransferPin: jest.fn(async () => true) };

  const service = new BillingService(
    groupsRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    payoutsRepo as any,
    {} as any, {} as any,
    pulse, {} as any, {} as any, usersService as any, {} as any, {} as any,
  );
  jest.spyOn(service, 'getGroupBalance').mockResolvedValue({ totalIn: 50_000, totalOut: 0, available: 50_000 } as any);
  return { service, group, saved, pulse, transferOut };
}

describe('saved payee', () => {
  it("saves the pitch owner with the name the bank returns, not what the organiser typed", async () => {
    const { service, pulse } = setup();
    const payee = await service.savePayee('g1', 'org1', { bankCode: '058', accountNumber: '0123454521', amount: 30_000 });

    expect(pulse.nameEnquiry).toHaveBeenCalledWith('058', '0123454521');
    expect(payee).toEqual({
      label: 'Pitch owner',
      name: 'ADEBAYO OGUNDIPE',
      accountNumber: '0123454521',
      bankCode: '058',
      bankName: expect.any(String),
      amount: 30_000,
    });
  });

  it("refuses to save an account the bank can't name", async () => {
    const { service, pulse } = setup();
    jest.spyOn(pulse, 'nameEnquiry').mockRejectedValue(new Error('not found'));

    await expect(service.savePayee('g1', 'org1', { bankCode: '058', accountNumber: '0000000000' })).rejects.toThrow(BadRequestException);
  });

  it('pays the saved payee in one call and records who was paid', async () => {
    const { service, saved, transferOut } = setup({
      payeeName: 'ADEBAYO OGUNDIPE', payeeAccount: '0123454521', payeeBankCode: '058', payeeBankName: 'GTBank', payeeLabel: 'Pitch owner',
    });
    await service.initiateTransferOut('g1', 'org1', 'u1', { amount: 30_000, toPayee: true, pin: '1234' });

    expect(transferOut).toHaveBeenCalledWith(expect.objectContaining({ beneficiaryAccountNumber: '0123454521', beneficiaryBankCode: '058', amount: 30_000 }));
    expect(saved[0]).toMatchObject({ beneficiaryName: 'ADEBAYO OGUNDIPE', beneficiaryAccount: '0123454521', beneficiaryBankName: 'GTBank' });
  });

  it('says so when there is no saved payee to pay', async () => {
    const { service } = setup();
    await expect(service.initiateTransferOut('g1', 'org1', 'u1', { amount: 30_000, toPayee: true, pin: '1234' })).rejects.toThrow(
      'This group has no saved payee yet',
    );
  });

  it('keeps the bank-verified name for a one-off payout too (it used to be blank)', async () => {
    const { service, saved } = setup();
    await service.initiateTransferOut('g1', 'org1', 'u1', { amount: 5_000, beneficiaryAccount: '0123454521', beneficiaryBankCode: '058', pin: '1234' });

    expect(saved[0].beneficiaryName).toBe('ADEBAYO OGUNDIPE');
  });
});
