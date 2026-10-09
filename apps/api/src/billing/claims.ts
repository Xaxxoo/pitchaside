/**
 * Pairing a player's "Yes, I've paid" with a bank transfer that arrived without their
 * reference or a sender name we recognise. Amount and time are all we have to go on, so a
 * pair is only made when it's the one possible reading: this claim fits exactly one
 * transfer, and nobody else's claim fits that transfer. Anything less is left for the
 * organiser, with the claims shown as suggestions.
 */

/** A claim and a transfer this far apart in time can still be the same payment. */
export const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Rounding when we add PulseMFB's fee back on, plus slack for a player's typo. */
export const AMOUNT_TOLERANCE = 30;

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

/** Claims from players other than this one count as rivals; a player's own repeat taps don't. */
function onlyOnePlayer(claims: ClaimLike[]) {
  return new Set(claims.map((c) => c.playerId)).size === 1;
}

/** The unmatched transfer a new claim settles, if exactly one fits and no one else claims it. */
export function transferForClaim<T extends TransferLike>(claim: ClaimLike, unmatched: T[], pendingClaims: ClaimLike[]): T | null {
  const fits = unmatched.filter((t) => couldPair(claim, t));
  if (fits.length !== 1) return null;
  const claimants = [claim, ...pendingClaims.filter((c) => c.id !== claim.id)].filter((c) => couldPair(c, fits[0]));
  return onlyOnePlayer(claimants) ? fits[0] : null;
}

/** The pending claim a new transfer settles, if exactly one player's claim fits and no other transfer fits it. */
export function claimForTransfer<C extends ClaimLike>(transfer: TransferLike, pendingClaims: C[], otherUnmatched: TransferLike[]): C | null {
  const fits = pendingClaims.filter((c) => couldPair(c, transfer));
  if (!fits.length || !onlyOnePlayer(fits)) return null;
  // Their earliest claim: a repeat tap shouldn't leave the first one dangling.
  const claim = [...fits].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
  const competing = otherUnmatched.filter((t) => t.id !== transfer.id && couldPair(claim, t));
  return competing.length ? null : claim;
}
