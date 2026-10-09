import { CLAIM_WINDOW_MS, claimForTransfer, couldPair, transferForClaim } from './claims';

const t0 = new Date('2026-10-09T09:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const claim = (id: string, playerId: string, amount: number, minutes = 0) => ({ id, playerId, amount, createdAt: at(minutes) });
const transfer = (id: string, amount: number, minutes = 0) => ({ id, amount, receivedAt: at(minutes) });

describe('couldPair', () => {
  it('allows rounding on the amount but not a different amount', () => {
    expect(couldPair(claim('c', 'p', 3000), transfer('t', 3025))).toBe(true);
    expect(couldPair(claim('c', 'p', 3000), transfer('t', 1500))).toBe(false);
  });

  it('only pairs within the window either side', () => {
    expect(couldPair(claim('c', 'p', 3000, 0), transfer('t', 3000, -30))).toBe(true);
    expect(couldPair(claim('c', 'p', 3000, 0), transfer('t', 3000, CLAIM_WINDOW_MS / 60_000 + 1))).toBe(false);
  });
});

describe('transferForClaim (player says "I\'ve paid" after the money landed)', () => {
  it('pairs the one transfer that fits', () => {
    const c = claim('c1', 'tobi', 3000, 5);
    expect(transferForClaim(c, [transfer('t1', 3000), transfer('t2', 1500)], [c])?.id).toBe('t1');
  });

  it('leaves it when two transfers fit', () => {
    const c = claim('c1', 'tobi', 3000, 5);
    expect(transferForClaim(c, [transfer('t1', 3000), transfer('t2', 3000, 2)], [c])).toBeNull();
  });

  it("leaves it when another player's claim fits the same transfer", () => {
    const c = claim('c1', 'tobi', 3000, 5);
    const rival = claim('c2', 'uche', 3000, 3);
    expect(transferForClaim(c, [transfer('t1', 3000)], [c, rival])).toBeNull();
  });

  it("isn't put off by the player's own repeat tap", () => {
    const c = claim('c2', 'tobi', 3000, 6);
    expect(transferForClaim(c, [transfer('t1', 3000)], [claim('c1', 'tobi', 3000, 5), c])?.id).toBe('t1');
  });
});

describe('claimForTransfer (money lands after the player said "I\'ve paid")', () => {
  it('pairs the one claim that fits', () => {
    expect(claimForTransfer(transfer('t1', 3000, 10), [claim('c1', 'tobi', 3000), claim('c2', 'uche', 1500)], [])?.id).toBe('c1');
  });

  it('takes the earliest of one player\'s repeat claims', () => {
    expect(claimForTransfer(transfer('t1', 3000, 10), [claim('c2', 'tobi', 3000, 2), claim('c1', 'tobi', 3000)], [])?.id).toBe('c1');
  });

  it('leaves it when two players claim the same amount', () => {
    expect(claimForTransfer(transfer('t1', 3000, 10), [claim('c1', 'tobi', 3000), claim('c2', 'uche', 3000)], [])).toBeNull();
  });

  it("leaves it when another unmatched transfer fits the claim too", () => {
    const t = transfer('t2', 3000, 10);
    expect(claimForTransfer(t, [claim('c1', 'tobi', 3000)], [transfer('t1', 3000, 4), t])).toBeNull();
  });

  it('leaves it when no claim fits', () => {
    expect(claimForTransfer(transfer('t1', 5000), [claim('c1', 'tobi', 3000)], [])).toBeNull();
  });
});
