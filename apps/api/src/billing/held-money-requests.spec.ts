import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { GroupKeptMoney } from './entities/group-kept-money.entity';
import { GroupMembership } from '../groups/entities/group-membership.entity';

/** A player's requests about money the organiser holds for them, and the organiser accepting. */
function setup(fields: Partial<GroupMembership>) {
  const m = Object.assign(new GroupMembership(), { groupId: 'g1', playerId: 'ada', credit: '0.00', waiting: '0.00', extra: '0.00', extraRequest: null, extraRequestAmount: null, extraRequestAt: null }, fields);
  const saved: any[] = [];
  const tx = {
    findOne: jest.fn(async () => m),
    // Like TypeORM: entity listeners run on save.
    save: jest.fn(async (row: any) => {
      if (row instanceof GroupMembership) row.dropRequestWhenNothingHeld();
      saved.push(row);
      return row;
    }),
    create: jest.fn((_e: unknown, row: any) => ({ __entity: _e, ...row })),
  };
  const membershipsRepo = { manager: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
  const groupsRepo = { findOne: jest.fn(async () => ({ id: 'g1', organizationId: 'org' })) };
  const service = new BillingService(
    groupsRepo as any, membershipsRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any,
    new MockPulseClient('secret'), {} as any, {} as any, {} as any, {} as any, {} as any,
  );
  return { service, m, saved };
}

describe('held money: player requests', () => {
  it('records an offer to the group with how much it was for', async () => {
    const { service, m } = setup({ extra: '7500.00' });
    await expect(service.requestAboutExtra('g1', 'ada', 'give')).resolves.toEqual({ request: 'give', amount: 7500 });
    expect(m).toMatchObject({ extraRequest: 'give', extraRequestAmount: '7500.00' });
    expect(m.extra).toBe('7500.00');
  });

  it('can be taken back', async () => {
    const { service, m } = setup({ extra: '7500.00', extraRequest: 'refund', extraRequestAmount: '7500.00', extraRequestAt: new Date() });
    await service.requestAboutExtra('g1', 'ada', null);
    expect(m).toMatchObject({ extraRequest: null, extraRequestAmount: null, extraRequestAt: null });
  });

  it('turns down a request when nothing is held', async () => {
    const { service } = setup({ extra: '0.00' });
    await expect(service.requestAboutExtra('g1', 'ada', 'refund')).rejects.toThrow('isn’t holding any money of yours');
  });
});

describe('held money: organiser accepts an offer', () => {
  it('keeps what was offered for the group, recorded as given by the player', async () => {
    const { service, m, saved } = setup({ extra: '7500.00', extraRequest: 'give', extraRequestAmount: '7500.00' });
    await expect(service.acceptGift('g1', 'ada', 'org', 'u1')).resolves.toEqual({ kept: 7500 });
    expect(m).toMatchObject({ extra: '0.00', extraRequest: null });
    expect(saved.find((r) => r.__entity === GroupKeptMoney)).toMatchObject({ amount: '7500.00', reason: 'player_gave', recordedBy: 'u1' });
  });

  it('never takes more than was offered, even if more extra came in since', async () => {
    const { service, m } = setup({ extra: '9000.00', extraRequest: 'give', extraRequestAmount: '7500.00' });
    await expect(service.acceptGift('g1', 'ada', 'org')).resolves.toEqual({ kept: 7500 });
    expect(m.extra).toBe('1500.00');
  });

  it('takes only what is still held if some was sorted another way first', async () => {
    const { service, m } = setup({ extra: '2000.00', extraRequest: 'give', extraRequestAmount: '7500.00' });
    await expect(service.acceptGift('g1', 'ada', 'org')).resolves.toEqual({ kept: 2000 });
    expect(m.extra).toBe('0.00');
  });

  it('refuses when the player took the offer back, or asked for a refund instead', async () => {
    await expect(setup({ extra: '7500.00' }).service.acceptGift('g1', 'ada', 'org')).rejects.toThrow('haven’t offered it');
    await expect(setup({ extra: '7500.00', extraRequest: 'refund', extraRequestAmount: '7500.00' }).service.acceptGift('g1', 'ada', 'org')).rejects.toThrow('haven’t offered it');
  });
});

describe('held money: a request never outlives the money', () => {
  it('clears itself when the held money reaches ₦0, however it was sorted', () => {
    const m = Object.assign(new GroupMembership(), { extra: '0.00', extraRequest: 'refund', extraRequestAmount: '7500.00', extraRequestAt: new Date() });
    m.dropRequestWhenNothingHeld();
    expect(m).toMatchObject({ extraRequest: null, extraRequestAmount: null, extraRequestAt: null });
  });

  it('stays while some money is still held', () => {
    const m = Object.assign(new GroupMembership(), { extra: '500.00', extraRequest: 'refund', extraRequestAmount: '7500.00' });
    m.dropRequestWhenNothingHeld();
    expect(m.extraRequest).toBe('refund');
  });
});
