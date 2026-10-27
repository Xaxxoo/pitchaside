/**
 * The player accounts this phone has signed in with: names and emails only (never a password),
 * so a group link can say "Continue as Femi" and let someone with two accounts pick the right one.
 */
export interface KnownAccount {
  email: string;
  firstName: string;
  lastName?: string;
  /** When it was last used here, newest first. */
  at: number;
}

const KEY = 'pitchaside_player_accounts';
const MAX = 4;

export function knownAccounts(): KnownAccount[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as KnownAccount[];
    return Array.isArray(list) ? list.filter((a) => a && typeof a.email === 'string' && a.email).sort((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}

export function rememberAccount(a: { email?: string | null; firstName?: string | null; lastName?: string | null }) {
  const email = a.email?.trim().toLowerCase();
  if (!email || !a.firstName) return;
  try {
    const rest = knownAccounts().filter((x) => x.email !== email);
    const next = [{ email, firstName: a.firstName, lastName: a.lastName ?? undefined, at: Date.now() }, ...rest].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: the link page just won't offer a shortcut.
  }
}

export function forgetAccount(email: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(knownAccounts().filter((x) => x.email !== email.trim().toLowerCase())));
  } catch {
    // Nothing remembered to forget.
  }
}
