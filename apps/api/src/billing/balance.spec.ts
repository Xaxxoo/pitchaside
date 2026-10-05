import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { Group } from '../groups/entities/group.entity';

/** BillingService with in-memory stand-ins for what the balance path touches. */
function setup(recordedIn = 0, recordedOut = 0, recordedByHand = 0) {
  const group = { id: 'g1', name: 'FlowVault', organizationId: 'org1', accountNumber: '9999268301' } as Group;
  const qbFor = (row: Record<string, number>) => () => {
    const qb: any = { select: () => qb, addSelect: () => qb, where: () => qb, andWhere: () => qb, setParameter: () => qb, getRawOne: async () => row };
    return qb;
  };
  const groupsRepo = { findOne: jest.fn(async () => group), exists: jest.fn(async () => false) };
  const pulse = new MockPulseClient('secret');

  const service = new BillingService(
    groupsRepo as any, {} as any, {} as any, {} as any, {} as any,
    { createQueryBuilder: qbFor({ totalIn: recordedIn, manualIn: recordedByHand }) } as any,
    { createQueryBuilder: qbFor({ totalOut: recordedOut }) } as any,
    pulse, {} as any, {} as any, {} as any, {} as any,
  );
  return { service };
}

describe('group balance', () => {
  it('available is totalIn minus totalOut from our records', async () => {
    const { service } = setup(5000, 1000);
    const b = await service.getGroupBalance('g1', 'org1');

    expect(b).toMatchObject({ totalIn: 5000, totalOut: 1000, available: 4000 });
  });

  it("doesn't count transfers recorded by hand as money that can be paid out", async () => {
    // ₦2m typed in by the organiser on top of ₦5k that really arrived: only the ₦5k is withdrawable.
    const { service } = setup(2_005_000, 1000, 2_000_000);
    const b = await service.getGroupBalance('g1', 'org1');

    expect(b).toMatchObject({ totalIn: 2_005_000, manualIn: 2_000_000, totalOut: 1000, available: 4000 });
  });

  it('returns zero when nothing has been recorded', async () => {
    const { service } = setup(0, 0);
    const b = await service.getGroupBalance('g1', 'org1');

    expect(b).toMatchObject({ totalIn: 0, totalOut: 0, available: 0 });
  });
});
