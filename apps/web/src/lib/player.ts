/**
 * Player-side API client. Players sign in with email + password and get
 * their own session in HttpOnly cookies (separate from the organiser's).
 */
import type { PaymentType } from '@pitchaside/shared';
import type { PlayerRatings, VoteCategory, VoteResults, GroupAccount, PublicGroup, TeamKey } from './api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export class PlayerAuthError extends Error {}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/pitchaside_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let playerRefreshPromise: Promise<boolean> | null = null;

async function silentPlayerRefresh(): Promise<boolean> {
  if (playerRefreshPromise) return playerRefreshPromise;
  playerRefreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/player-auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      playerRefreshPromise = null;
    }
  })();
  return playerRefreshPromise;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: auth ? 'include' : 'same-origin',
  });

  if (res.status === 401 && auth) {
    const refreshed = await silentPlayerRefresh();
    if (refreshed) {
      const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (method !== 'GET' && method !== 'HEAD') {
        const csrf = getCsrfToken();
        if (csrf) retryHeaders['X-CSRF-Token'] = csrf;
      }
      const retry = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: retryHeaders,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (retry.ok) {
        const text = await retry.text();
        return text ? JSON.parse(text) : (undefined as T);
      }
    }
    throw new PlayerAuthError('Please sign in again');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export async function logoutPlayer(): Promise<void> {
  try {
    await request<void>('POST', '/player-auth/logout');
  } catch {
    // Best-effort — redirect regardless
  }
}

/** Whether this browser has a player session. The session lives in HttpOnly cookies, so ask the server. */
export async function isPlayerSignedIn(): Promise<boolean> {
  try {
    await request('GET', '/me/profile');
    return true;
  } catch {
    return false;
  }
}

// ── Sign-in ──

export type PasswordSignIn = { token: string; firstName: string } | { needsPassword: true; firstName: string };

export function loginWithPassword(email: string, password: string) {
  return request<PasswordSignIn>('POST', '/player-auth/login', { email, password }, false);
}

/** Emails a 6-digit code — for "Forgot password", and for players setting their first password. */
export function requestCode(email: string) {
  return request<{ sent: boolean; devCode?: string }>('POST', '/player-auth/request-code', { email }, false);
}

export function resetPassword(email: string, code: string, password: string) {
  return request<{ token: string; firstName: string }>('POST', '/player-auth/reset-password', { email, code, password }, false);
}

export type SignupInput = { email: string; firstName: string; lastName: string; phone?: string; password: string };

export function signupFromLink(code: string, data: SignupInput) {
  return request<JoinResult>('POST', `/public/groups/${code}/signup`, data, false);
}

export interface ClubGroup {
  id: string;
  code: string;
  name: string;
  schedule?: string | null;
  kickoffTime?: string | null;
  feePerPlayer: number;
  paymentType: PaymentType;
  memberCount: number;
  targetPlayers: number;
}

/** Club invite link: the club and its groups (public). */
export function getClub(code: string) {
  return request<{ clubName: string; groups: ClubGroup[] }>('GET', `/public/clubs/${code}`, undefined, false);
}

export type ClubJoinResult = { clubName: string; firstName: string };

/** Club invite link (/join/:code): create the account and join the club in one go. */
export function signupFromClubLink(code: string, data: SignupInput) {
  return request<ClubJoinResult>('POST', `/public/clubs/${code}/signup`, data, false);
}

/** Club invite link for someone already signed in. */
export function joinClubAsPlayer(code: string) {
  return request<ClubJoinResult>('POST', `/me/clubs/${code}/join`);
}

export function updateMyName(firstName: string, lastName: string) {
  return request<{ firstName: string; lastName: string }>('PATCH', '/me/account', { firstName, lastName });
}

export function changeMyPassword(currentPassword: string, newPassword: string) {
  return request<{ ok: boolean }>('POST', '/me/password', { currentPassword, newPassword });
}

export type JoinResult = PublicGroup & {
  groupId: string;
  paymentRef: string;
  firstName: string;
  alreadyMember: boolean;
};

export function joinAsPlayer(code: string) {
  return request<JoinResult>('POST', `/me/groups/${code}/join`);
}

// ── Home ──

export type PlayerGroup = {
  id: string;
  name: string;
  clubName?: string;
  schedule?: string;
  kickoffTime?: string | null;
  feePerPlayer: number;
  paymentType: PaymentType;
  paymentRef?: string;
  account: GroupAccount | null;
};

export type Organiser = { clubName: string; email: string } | null;

export interface PlayerHome {
  player: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
  organiser: Organiser;
  groups: {
    id: string;
    name: string;
    clubName?: string;
    kickoffTime?: string | null;
    schedule?: string;
    feePerPlayer: number;
    paymentType: PaymentType;
    paymentRef?: string;
    account: GroupAccount | null;
  }[];
  upcoming: {
    id: string;
    date: string;
    groupId: string;
    groupName: string;
    schedule?: string;
    kickoffTime?: string | null;
    requireRsvp: boolean;
    myStatus: 'in' | 'out' | 'waitlist' | null;
    waitlistPosition: number | null;
    confirmed: number;
    capacity: number;
    waitlist: number;
    payment: { status: 'paid' | 'pending' | 'waived'; amount: number } | null;
    /** Match day: the player can pick the bib they've been handed. */
    bibsOpen?: boolean;
    myTeam?: TeamKey | null;
    teamCount?: number;
  }[];
  /** `amount` is what's left to pay; `paidSoFar` is credit from partial transfers already counted against it. */
  owed: { id: string; amount: number; paidSoFar: number; groupId: string; groupName: string; label: string | null; date: string }[];
  openVotes: { token: string; sessionId: string; groupName?: string; date: string; voted: boolean }[];
  ratings: PlayerRatings;
  tables: {
    groupId: string;
    groupName: string;
    games: number;
    myPlayerId: string;
    top: { rank: number; id: string; name: string; points: number }[];
    me: { rank: number; points: number } | null;
  }[];
}

export type UpcomingGame = PlayerHome['upcoming'][number];

export interface RecentMatchDay {
  sessionId: string;
  date: string;
  groupName?: string;
  teamCount: number;
  myTeam: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  teamOfTheDay: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  record: { w: number; d: number; l: number };
  games: number;
  potm: { name: string; votes: number; isMe: boolean } | null;
  vote: { token: string; voted: boolean } | null;
  /** For the match-day share card; null before kick-off. */
  shareToken: string | null;
}

export function getPlayerGames() {
  return request<{ upcoming: UpcomingGame[]; recent: RecentMatchDay[] }>('GET', '/me/games');
}

export type GamePlayer = { name: string; me: boolean };

/** One game's own page: the game card plus where it is and who's playing. */
export type PlayerGame = UpcomingGame & {
  status: 'upcoming' | 'completed' | 'cancelled';
  location: string | null;
  playing: GamePlayer[];
  waitlistNames: GamePlayer[];
};

export function getPlayerGame(id: string) {
  return request<PlayerGame>('GET', `/me/games/${id}`);
}

export interface PlayerPayments {
  owed: PlayerHome['owed'];
  paid: { id: string; amount: number; groupName: string; label: string | null; date: string; paidAt: string | null; viaTransfer: boolean }[];
  groups: PlayerGroup[];
  /** Only groups whose organiser shares contributions with players. */
  contributions: GroupKitty[];
}

export interface GroupKitty {
  groupId: string;
  groupName: string;
  visibility: 'totals' | 'names';
  period: { label: string | null; date: string; kind: 'game' | 'dues' } | null;
  collected: number;
  expected: number;
  paidCount: number;
  total: number;
  allTime: number;
  players: { name: string; paid: boolean; me: boolean }[] | null;
}

export function getPlayerPayments() {
  return request<PlayerPayments>('GET', '/me/payments');
}

/** "Yes, I've paid": matched now if the transfer is already in, otherwise when it lands. */
export function claimPayment(groupId: string, amount: number) {
  return request<{ status: 'matched' | 'waiting' }>('POST', `/me/groups/${groupId}/paid`, { amount });
}

export interface PlayerProfile {
  player: PlayerHome['player'];
  organiser: Organiser;
  ratings: PlayerRatings;
  clubs: { clubName: string; ratings: PlayerRatings; groups: { id: string; name: string }[] }[];
}

export function getPlayerProfile() {
  return request<PlayerProfile>('GET', '/me/profile');
}

export function startGroup(data: { clubName: string; password: string }) {
  return request<{ accessToken: string; user: unknown }>('POST', '/me/start-group', data);
}

export function getPlayerHome() {
  return request<PlayerHome>('GET', '/me');
}

export function setRsvp(sessionId: string, status: 'in' | 'out') {
  return request<{ status: 'in' | 'out' | 'waitlist' }>('POST', `/me/sessions/${sessionId}/rsvp`, { status });
}

// ── Bibs on match day ──

/** Paid for this game: their own due, or the month's (week's…) dues when those cover games. */
export type GamePaid = 'paid' | 'unpaid' | 'waived';

export interface GameLineup {
  teamCount: number;
  bibsOpen: boolean;
  myTeam: TeamKey | null;
  myPaid: GamePaid;
  /** Whether the group shares who's paid with players. */
  showPaid: boolean;
  /** `paid` is null for others when the group keeps that private. */
  squad: { name: string; me: boolean; team: TeamKey | null; paid: GamePaid | null }[];
}

export function getGameLineup(sessionId: string) {
  return request<GameLineup>('GET', `/me/games/${sessionId}/lineup`);
}

export function pickBib(sessionId: string, team: TeamKey | null) {
  return request<GameLineup>('POST', `/me/games/${sessionId}/team`, { team });
}

// ── Voting ──

export function getMyBallot(token: string) {
  return request<{ playerId: string; firstName: string; picks: Partial<Record<VoteCategory, string>> }>(
    'GET',
    `/me/votes/${token}`,
  );
}

export function submitMyVotes(token: string, picks: Partial<Record<VoteCategory, string>>) {
  return request<VoteResults>('POST', `/me/votes/${token}`, { picks });
}

// ── Push ──

export function subscribePlayerPush(sub: PushSubscriptionJSON) {
  return request('POST', '/me/push', sub);
}


export function unsubscribePlayerPush(endpoint: string) {
  return request('DELETE', '/me/push', { endpoint });
}
