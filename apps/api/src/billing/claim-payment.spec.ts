import { BillingService } from './billing.service';
import { MockPulseClient } from './pulse/mock-pulse.client';
import { TransferStatus } from './entities/bank-transfer.entity';
import { ClaimStatus } from './entities/payment-claim.entity';

/**
 * "I've paid" is only the player's word, so it never takes a transfer by itself: it waits for
 * their reference or name to match, or for the organiser to confirm it. It's answered straight
 * away only when one of their own transfers already came in and was matched to them.
 */
function setup(transfers: any[], claims: any[] = []) {
  const claimsRepo = {
    rows: claims,
    findOne: async ({ where }: any) =>
      claims
        .filter((c) => c.groupId === where.groupId && c.playerId === where.playerId && c.status === where.status)
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    find: async ({ where }: any) => claims.filter((c) => c.groupId === where.groupId && c.playerId === where.playerId && c.status === where.status),
    create: (row: any) => ({ id: `c${claims.length + 1}`, status: ClaimStatus.PENDING, createdAt: new Date(), transferId: null, ...row }),
    save: async (row: any) => (claims.push(row), row),
    update: async (where: any, patch: any) => {
      const row = claims.find((c) => c.id === where.id && c.status === where.status);
      if (!row) return { affected: 0 };
      Object.assign(row, patch);
      return { affected: 1 };
    },
  };
  const transfersRepo = {
    // Their own matched or assigned transfers only, as the query asks.
    find: async ({ where }: any) =>
      transfers.filter((t) => t.groupId === where.groupId && t.playerId === where.playerId && where.status.value.includes(t.status)),
  };
  const service = new BillingService(
    {} as any, {} as any, {} as any, {} as any, {} as any, transfersRepo as any, {} as any,
    {} as any, {} as any,
    new MockPulseClient('secret'), {} as any, {} as any, {} as any, {} as any, claimsRepo as any,
  );
  const settle = jest.spyOn(service as any, 'settleTransfer');
  // What's still owed after the claim: covered by its own test below
  jest.spyOn(service as any, 'owesNow').mockResolvedValue(0);
  return { service, claims, transfers, settle };
}

const transfer = (id: string, amount: number, playerId: string | null, status: TransferStatus) => ({
  id,
  groupId: 'g1',
  amount: amount.toFixed(2),
  playerId,
  status,
  receivedAt: new Date(Date.now() - 5 * 60 * 1000),
});

describe('claimPayment ("I\'ve paid")', () => {
  it('waits for the organiser when only an unmatched transfer fits, and never moves money', async () => {
    const { service, claims, settle } = setup([transfer('t1', 3000, null, TransferStatus.UNMATCHED)]);
    expect(await service.claimPayment('g1', 'ada', 3000)).toEqual({ status: 'waiting', owes: 0 });
    expect(settle).not.toHaveBeenCalled();
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ playerId: 'ada', status: ClaimStatus.PENDING, transferId: null });
  });

  it("is answered at once by the player's own transfer that already matched", async () => {
    const { service, claims, settle } = setup([transfer('t1', 3000, 'ada', TransferStatus.MATCHED)]);
    expect(await service.claimPayment('g1', 'ada', 3000)).toEqual({ status: 'matched', owes: 0 });
    expect(settle).not.toHaveBeenCalled();
    expect(claims[0]).toMatchObject({ status: ClaimStatus.MATCHED, transferId: 't1' });
  });

  it("isn't answered by someone else's matched transfer", async () => {
    const { service } = setup([transfer('t1', 3000, 'bola', TransferStatus.MATCHED)]);
    expect(await service.claimPayment('g1', 'ada', 3000)).toEqual({ status: 'waiting', owes: 0 });
  });

  it('uses each of their transfers for one claim only', async () => {
    const used = { id: 'c0', groupId: 'g1', playerId: 'ada', amount: '3000.00', status: ClaimStatus.MATCHED, transferId: 't1', createdAt: new Date() };
    const { service } = setup([transfer('t1', 3000, 'ada', TransferStatus.MATCHED)], [used]);
    expect(await service.claimPayment('g1', 'ada', 3000)).toEqual({ status: 'waiting', owes: 0 });
  });

  it('turns down a ₦0 claim', async () => {
    const { service } = setup([]);
    await expect(service.claimPayment('g1', 'ada', 0)).rejects.toThrow('Enter the amount you sent');
  });
});
