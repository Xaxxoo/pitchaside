/**
 * The sender's name for matching a transfer to a member. The bank's sender field when it's
 * there; otherwise the name some banks put only in the narration, e.g. "Transfer from DAVID
 * OREKOYA" or "TRF FROM SEGUN JOHN/0123". Anything after the name (a "to …", a reference,
 * a slash or a dash) is left off.
 */
export function payerNameFrom(senderName?: string | null, narration?: string | null): string | null {
  if (senderName?.trim()) return senderName;
  const m = narration?.match(/\b(?:transfer|trf|trsf|tfr)\s+from\s+([a-z][a-z .']*?)(?=\s+(?:to|for|ref|via)\b|\s*[/|:,\-–]|\s*\d|$)/i);
  const name = m?.[1].trim();
  return name && name.split(/\s+/).length >= 2 ? name : null;
}

/** A player's payment code in a narration: "PA7K3FQ", "PA-7K3FQ", "pa 7k3fq". */
export const REF_PATTERN = /\bPA[- ]?([A-HJ-NP-Z2-9]{5})\b/i;

/**
 * Every payment code a narration could hold, in order. Words like "PAYMENT" have the same shape
 * as a code, so the real one can come later: "Payment for football PA7K3FQ".
 */
export function refsIn(narration?: string | null): string[] {
  const all = new RegExp(REF_PATTERN.source, 'gi');
  return [...(narration ?? '').toUpperCase().matchAll(all)].map((m) => `PA${m[1]}`);
}

export function normaliseName(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1);
}

export interface MemberLike {
  playerId: string;
  paymentRef?: string | null;
  firstName: string;
  lastName: string;
}

/** A bank account number as we compare them: its last 10 digits (NUBAN), or null if it isn't one. */
export function normaliseAccount(account?: string | null): string | null {
  const digits = (account ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Which member sent a transfer, when it's certain. Their payment code in the narration wins.
 * Otherwise the account it came from (`accountOwner`: it has only ever paid for them, worked out
 * by the caller from earlier transfers) and the sender's name (every word of exactly one member's
 * first and last name is in it) decide, and when they point at different members (someone paying
 * for themselves from an account that once paid for a mate) it's null, and a person decides.
 */
export function whoSent(
  members: MemberLike[],
  senderName?: string | null,
  narration?: string | null,
  accountOwner?: string | null,
): string | null {
  for (const ref of refsIn(narration)) {
    const m = members.find((x) => x.paymentRef === ref);
    if (m) return m.playerId;
  }
  const name = payerNameFrom(senderName, narration);
  const byName = nameMatch(members, name);
  // An account that paid for someone once is only theirs again when the name fits them too (at
  // least one word of it): a friend's account paying for himself next time isn't theirs.
  const owner = accountOwner ? members.find((m) => m.playerId === accountOwner) : undefined;
  const words = new Set(normaliseName(name ?? ''));
  // No name at all: nothing says otherwise, so the account stands
  const fits = (m: MemberLike) => !words.size || [...normaliseName(m.firstName ?? ''), ...normaliseName(m.lastName ?? '')].some((w) => words.has(w));
  const byAccount = owner && fits(owner) ? owner.playerId : null;
  if (byAccount && byName && byAccount !== byName) return null;
  return byAccount ?? byName;
}

/** The one member whose whole name is in the sender's name. A name with no usable words ("J. O.") fits no one. */
function nameMatch(members: MemberLike[], name: string | null): string | null {
  if (!name) return null;
  const words = new Set(normaliseName(name));
  const candidates = members.filter((m) => {
    const theirs = [...normaliseName(m.firstName), ...normaliseName(m.lastName)];
    return theirs.length > 0 && theirs.every((w) => words.has(w));
  });
  return candidates.length === 1 ? candidates[0].playerId : null;
}
