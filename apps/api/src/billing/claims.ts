/**
 * A player's "Yes, I've paid" next to the bank transfers. A claim is only the player's word, so
 * it never takes a transfer by itself: it shows the organiser a suggestion on transfers that fit,
 * and it's closed when one of their transfers is matched to them another way.
 */

/** A claim and a transfer this far apart in time can still be the same payment. */
export const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Slack for a player's typo or a bank charge when pairing "I've paid" with a transfer. */
export const AMOUNT_TOLERANCE = 30;
/** An "I've paid" nobody could pair runs out after this: it stops showing as a suggestion. */
export const CLAIM_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;
/** A hand-typed transfer and the bank's own report of it can be this far apart. */
export const TWIN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** A game marked paid by hand (they said they'd transfer) waits this long for the transfer that confirms it. */
export const CONFIRM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface ClaimLike {
  id: string;
  playerId: string;
  amount: number | string;
  createdAt: Date;
}

export interface TransferLike {
  id: string;
  amount: number | string;
  receivedAt: Date;
}

export function couldPair(claim: ClaimLike, transfer: TransferLike): boolean {
  return (
    Math.abs(Number(claim.amount) - Number(transfer.amount)) <= AMOUNT_TOLERANCE &&
    Math.abs(new Date(claim.createdAt).getTime() - new Date(transfer.receivedAt).getTime()) <= CLAIM_WINDOW_MS
  );
}

/**
 * The player's own pending claim that a transfer just matched to them (by reference, name or
 * the organiser's pick) answers, so it stops showing as a suggestion on other transfers.
 * Their earliest claim that fits; none if nothing fits.
 */
export function claimSettledBy<C extends ClaimLike>(transfer: TransferLike, playerId: string, pendingClaims: C[]): C | null {
  const fits = pendingClaims.filter((c) => c.playerId === playerId && couldPair(c, transfer));
  return fits.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ?? null;
}
