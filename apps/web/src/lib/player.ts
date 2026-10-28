/**
 * Player-side API client. Players sign in with email + password and get
 * their own session in HttpOnly cookies (separate from the organiser's).
 */
import type { GameTimer, PaymentType } from '@pitchaside/shared';
import type { Bibs, KeeperPref, Position } from '@pitchaside/shared';
import { tableQuery, type TableRange } from './api';
import type { GoalInput, Lineup, PlanInfo, MatchEventKind, RatingBreakdown, RatingTrial, LeagueTable, PlayerRatings, VoteCategory, VoteResults, GroupAccount, PublicGroup, TeamKey } from './api';
import { serverMessage } from './http';
import { rememberAccount } from './known-accounts';

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
    throw new Error(serverMessage(res.status, data));
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

/** `game`: they came from that game's QR code, so they're put on it where the group doesn't take replies. */
const fromGame = (game?: string | null) => (game ? `?game=${encodeURIComponent(game)}` : '');

export function signupFromLink(code: string, data: SignupInput, game?: string | null) {
  return request<JoinResult>('POST', `/public/groups/${code}/signup${fromGame(game)}`, data, false).then((res) => {
    rememberAccount(data);
    return res;
  });
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

/** Their own photo, on their record in every club they play for. */
export function setMyPhoto(image: string) {
  return request<{ photoKey: string }>('POST', '/me/photo', { image });
}

export function removeMyPhoto() {
  return request<{ photoKey: null }>('DELETE', '/me/photo');
}

export function updateMyName(firstName: string, lastName: string, nickname: string) {
  return request<{ firstName: string; lastName: string; nickname: string | null }>('PATCH', '/me/account', { firstName, lastName, nickname });
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

export function joinAsPlayer(code: string, game?: string | null) {
  return request<JoinResult>('POST', `/me/groups/${code}/join${fromGame(game)}`);
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
  /** To send now: played games and their next one, after any part payment (worked out on the server). */
  toPay: number;
  /** Owed for games further ahead: it can be paid once each is their next game. */
  later: number;
  /** Sent beyond what counts towards a due: it pays their next game. */
  paidAhead: number;
  /** Their money the organiser has to sort: more than was owed, or a game they paid for called off. */
  extra: number;
  account: GroupAccount | null;
  /** Their latest "I've paid" while it's news: waiting for the organiser, or answered lately (newer servers). */
  claim?: MyClaim | null;
};

export interface MyClaim {
  id: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
  hasReceipt: boolean;
  /** What the organiser said when it wasn't found. */
  note: string | null;
  decidedBy: string | null;
}

export type Organiser = { clubName: string; email: string } | null;

export interface PlayerHome {
  player: { id: string; firstName: string; lastName: string; nickname: string | null; photoKey?: string | null; keeper?: KeeperPref; position?: Position | null; emailNotices?: boolean; email: string; phone: string | null };
  organiser: Organiser;
  groups: PlayerGroup[];
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
    /** Set on a game's own page; the home lists only games still to play. */
    status?: 'upcoming' | 'completed' | 'cancelled';
    /** Match day: the player can pick the bib they've been handed. */
    bibsOpen?: boolean;
    myTeam?: TeamKey | null;
    teamCount?: number;
    /** Who's playing: how many, and the first few as faces (them first). */
    playingCount?: number;
    faces?: { id: string; name: string; short?: string; photoKey: string | null; me: boolean }[];
  }[];
  /** `amount` is what's left to pay; `paidSoFar` is credit from partial transfers already counted against it. */
  /** `now`: a transfer pays it today (played games and their next one). False: a game further ahead. */
  owed: { id: string; amount: number; paidSoFar: number; now: boolean; groupId: string; groupName: string; label: string | null; date: string }[];
  openVotes: {
    token: string;
    sessionId: string;
    groupId?: string;
    groupName?: string;
    date: string;
    /** When the vote shuts (missing from an older server). */
    closesAt?: string | null;
    voted: boolean;
    /** Turnout: who's voted so far (faces of the first few, never what they picked). */
    ballots?: number;
    squadSize?: number;
    voters?: { id: string; name: string; photoKey: string | null }[];
  }[];
  ratings: PlayerRatings;
  tables: {
    groupId: string;
    groupName: string;
    games: number;
    /** How many are in the table (missing from older servers). */
    of?: number;
    myPlayerId: string;
    top: { rank: number; id: string; name: string; points: number; ovr?: number | null }[];
    /** `ovr`: their rating, which the table is ranked by (missing from older servers). */
    me: { rank: number; points: number; ovr?: number | null } | null;
  }[];
}

export type UpcomingGame = PlayerHome['upcoming'][number];

export interface RecentMatchDay {
  sessionId: string;
  date: string;
  groupId?: string;
  groupName?: string;
  teamCount: number;
  myTeam: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  captains?: Partial<Record<TeamKey, string>>;
  bibs?: Bibs;
  /** Whether the player can still pick or change their team (until voting closes). */
  teamOpen?: boolean;
  teamOfTheDay: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  record: { w: number; d: number; l: number };
  games: number;
  potm: { name: string; votes: number; isMe: boolean; photoKey?: string | null } | null;
  vote: { token: string; voted: boolean } | null;
  /** For the match-day share card; null before kick-off. */
  shareToken: string | null;
}

export function getPlayerGames() {
  return request<{ upcoming: UpcomingGame[]; recent: RecentMatchDay[] }>('GET', '/me/games');
}

export type GamePlayer = { name: string; photoKey?: string | null; me: boolean };

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
  paid: { id: string; amount: number; groupId?: string; groupName: string; label: string | null; date: string; paidAt: string | null; viaTransfer: boolean }[];
  groups: PlayerGroup[];
  /** Only groups whose organiser shares contributions with players. */
  contributions: GroupKitty[];
  /** Money of theirs a group kept (nobody owes anybody for it now), newest first, with why. */
  keptByGroup?: { id: string; groupId?: string; groupName: string; amount: number; reason: string; note: string | null; date: string }[];
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
  players: { name: string; photoKey?: string | null; paid: boolean; me: boolean }[] | null;
}

export function getPlayerPayments() {
  return request<PlayerPayments>('GET', '/me/payments');
}

/** "Yes, I've paid": matched now if the transfer is already in, otherwise when it lands. */
export function claimPayment(groupId: string, amount: number, receipt?: string) {
  // `owes`: what's still to pay after it (a part payment leaves some); older servers leave it out
  return request<{ status: 'matched' | 'waiting'; owes?: number }>('POST', `/me/groups/${groupId}/paid`, { amount, ...(receipt ? { receipt } : {}) });
}

export interface PlayerProfile {
  player: PlayerHome['player'];
  organiser: Organiser;
  ratings: PlayerRatings;
  /** Which of their player records the card's number is for; null before they've played. */
  ratingsPlayerId: string | null;
  clubs: { playerId: string; clubName: string; ratings: PlayerRatings; groups: { id: string; name: string }[] }[];
}

export function getPlayerProfile() {
  return request<PlayerProfile>('GET', '/me/profile');
}

export function startGroup(data: { clubName: string; password: string }) {
  return request<{ accessToken: string; user: unknown }>('POST', '/me/start-group', data);
}

export function getPlayerHome() {
  // Each time a player's home loads, this phone remembers the account (name and email only), so
  // a group link can offer "Continue as …" and someone with two accounts can pick the right one.
  return request<PlayerHome>('GET', '/me').then((home) => {
    rememberAccount(home.player);
    return home;
  });
}

export function setRsvp(sessionId: string, status: 'in' | 'out') {
  return request<{ status: 'in' | 'out' | 'waitlist' }>('POST', `/me/sessions/${sessionId}/rsvp`, { status });
}

// ── Bibs on match day ──

/** Paid for this game: their own due, or the month's (week's…) dues when those cover games. */
export type GamePaid = 'paid' | 'unpaid' | 'waived';

export interface GameLineup extends PlanInfo {
  /** Match day as it happens: each game's score and scorers, cards and saves, and the day's table. */
  live?: {
    games: {
      id: string;
      teamA: TeamKey;
      teamB: TeamKey;
      scoreA: number;
      scoreB: number;
      seconds?: number | null;
      goals: { team: TeamKey; scorer: string | null; scorerPhoto?: string | null; assist: string | null; assistPhoto?: string | null; ownGoal?: boolean; mine: boolean }[];
    }[];
    events: { kind: MatchEventKind; name: string | null; photoKey?: string | null; mine: boolean }[];
    table: { rows: { team: TeamKey; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; ppg?: number }[]; teamOfTheDay: TeamKey | null; perGame?: boolean };
  };
  teamCount: number;
  bibsOpen: boolean;
  /** Scores are in (or the vote has closed): teams are set. */
  bibsClosed: boolean;
  myTeam: TeamKey | null;
  /** Side → its captain's name; a side with a captain goes by "Team <name>". */
  captains: Partial<Record<TeamKey, string>>;
  bibs?: Bibs;
  myPaid: GamePaid;
  /** Whether the group shares who's paid with players. */
  showPaid: boolean;
  /** `paid` is null for others when the group keeps that private. */
  squad: {
    /** Missing from servers before the match day plan. */
    id?: string;
    keeper?: KeeperPref;
    position?: Position | null;
    name: string;
    /** Nickname, else first name. */
    short?: string;
    photoKey?: string | null;
    me: boolean;
    team: TeamKey | null;
    captain: boolean;
    vice?: boolean;
    paid: GamePaid | null;
  }[];
  /** They captain (or vice-captain) a side today, so they can keep the score from their phone. */
  canKeepScore?: boolean;
  /** What they lead in this game, if anything. */
  myRole?: 'captain' | 'vice' | null;
}

/** The match-day clock, for anyone in the game. */
export function getGameTimer(sessionId: string) {
  return request<GameTimer>('GET', `/me/games/${sessionId}/timer`);
}

export function getGameLineup(sessionId: string) {
  return request<GameLineup>('GET', `/me/games/${sessionId}/lineup`);
}

// ── Keeping the score: the day's captains ──

export function getMatchDay(sessionId: string) {
  return request<Lineup>('GET', `/me/games/${sessionId}/match-day`);
}

export function addCaptainGame(
  sessionId: string,
  game: { teamA: TeamKey; teamB: TeamKey; scoreA: number; scoreB: number; goals?: GoalInput[]; seconds?: number; keeperA?: string | null; keeperB?: string | null; satOut?: string[] },
) {
  return request<Lineup>('POST', `/me/games/${sessionId}/match-day/games`, game);
}

export function addCaptainGoal(sessionId: string, gameId: string, goal: GoalInput) {
  return request<Lineup>('POST', `/me/games/${sessionId}/match-day/games/${gameId}/goals`, goal);
}

export function deleteCaptainGame(sessionId: string, gameId: string) {
  return request<Lineup>('DELETE', `/me/games/${sessionId}/match-day/games/${gameId}`);
}

export function deleteCaptainGoal(sessionId: string, goalId: string) {
  return request<Lineup>('DELETE', `/me/games/${sessionId}/match-day/goals/${goalId}`);
}

export function addCaptainEvent(sessionId: string, event: { playerId: string; kind: MatchEventKind }) {
  return request<Lineup>('POST', `/me/games/${sessionId}/match-day/events`, event);
}

export function deleteCaptainEvent(sessionId: string, eventId: string) {
  return request<Lineup>('DELETE', `/me/games/${sessionId}/match-day/events/${eventId}`);
}

/** A captain marks one of their players as gone early (`at`: minutes after kick-off), or back. */
export function setCaptainAway(sessionId: string, playerId: string, at: number | null) {
  return request<Lineup>('PUT', `/me/games/${sessionId}/match-day/away`, { playerId, at });
}

/** Happy in goal, rather not, or don't mind (null): the same in every club. */
/** Emails when a notification can't reach them: on unless they switch it off. */
export function setMyEmailNotices(email: boolean) {
  return request<{ emailNotices: boolean }>('PATCH', '/me/notices', { email });
}

export function setMyPosition(position: Position | null) {
  return request<{ position: Position | null }>('PATCH', '/me/position', { position });
}

export function setMyKeeper(keeper: KeeperPref) {
  return request<{ keeper: KeeperPref }>('PATCH', '/me/keeper', { keeper });
}

export function pickBib(sessionId: string, team: TeamKey | null) {
  return request<GameLineup>('POST', `/me/games/${sessionId}/team`, { team });
}

/** A captain or vice-captain moves a player to another side, or off the teams (null). */
export function moveGamePlayer(sessionId: string, playerId: string, team: TeamKey | null) {
  return request<GameLineup>('POST', `/me/games/${sessionId}/match-day/move`, { playerId, team });
}

// ── Voting ──

export function getMyBallot(token: string) {
  return request<{ playerId: string; firstName: string; picks: Partial<Record<VoteCategory, string>> }>(
    'GET',
    `/me/votes/${token}`,
  );
}

export function submitMyVotes(token: string, picks: Partial<Record<VoteCategory, string | string[]>>) {
  return request<VoteResults>('POST', `/me/votes/${token}`, { picks });
}

// ── Push ──

export function subscribePlayerPush(sub: PushSubscriptionJSON) {
  return request('POST', '/me/push', sub);
}


export function unsubscribePlayerPush(endpoint: string) {
  return request('DELETE', '/me/push', { endpoint });
}

/** How a player's card number is made: theirs, or a clubmate's. Null before they've played. */
/** The Club tab: a group's table (all season, or the last N match days), for a group they play in. */
export function getMyGroupTable(groupId: string, range?: TableRange) {
  return request<LeagueTable>('GET', `/me/groups/${groupId}/table${tableQuery(range)}`);
}

/** The Club tab's rating parts (stats, votes, results) for everyone in a group they play in. */
export function getMyGroupRatings(groupId: string) {
  return request<RatingTrial>('GET', `/me/groups/${groupId}/ratings`);
}

export function getPlayerRatingBreakdown(playerId: string) {
  return request<RatingBreakdown | null>('GET', `/me/players/${playerId}/rating-breakdown`);
}
