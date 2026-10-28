import type { MatchCard } from '@/app/share/[token]/match-card';
import type { Bibs, GroupScope, KeeperPref, MatchPlan, Position } from '@pitchaside/shared';
import type {
  ContributionsVisibility,
  IGroup,
  IPlayer,
  ISession,
  IPayment,
  PaymentType,
  PaymentStatus,
  MemberRole,
  PlayerLevel,
  ICompetition,
  ICompetitionTeam,
  ICompetitionMatch,
  ICompetitionStanding,
  CompetitionFormat,
  CompetitionScope,
  CompetitionVisibility,
  CompetitionStatus,
  GameTimer,
  ICryptoTransfer,
  IGroupWallet,
  IUserWallet,
  IChainInfo,
  ICryptoOutgoingTransfer,
} from '@pitchaside/shared';
import { http } from './http';

// ── Currency formatter ──

export function formatCurrency(amount: number, currency?: string): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Pagination types ──

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── Extended interfaces (unchanged — consumed by pages) ──

export interface IGroupWithMembers extends IGroup {
  memberships?: {
    id: string;
    role: MemberRole;
    player: IPlayer;
    joinedAt: string;
    /** Kept for their games: part of a due, a called-off game's money, or extra the organiser kept for them (decimal string). */
    credit?: string;
    /** Sent beyond what they owed, waiting for the organiser to sort (decimal string). */
    extra?: string;
    /** Extra put aside for someone not in the group yet (decimal string). */
    waiting?: string;
    /** The code this player puts in their transfer description so it's matched to them automatically. */
    paymentRef?: string | null;
  }[];
}

export interface ISessionWithDetails extends ISession {
  group?: IGroup;
  payments?: (IPayment & { player?: IPlayer })[];
}

// ── Groups ──

export async function getGroups(): Promise<IGroupWithMembers[]> {
  const res = await http.get<PaginatedResponse<IGroupWithMembers>>('/groups');
  return res.data;
}

export function getGroup(id: string): Promise<IGroupWithMembers> {
  return http.get<IGroupWithMembers>(`/groups/${id}`);
}

export function createGroup(data: {
  name: string;
  description?: string;
  location?: string;
  schedule?: string;
  targetPlayers: number;
  feePerPlayer: number;
  paymentType?: PaymentType;
  requireRsvp?: boolean;
  kickoffTime?: string;
  contributionsVisibility?: ContributionsVisibility;
  gameMinutes?: number;
  timerOn?: boolean;
  bibs?: Bibs | null;
  scope?: GroupScope;
}): Promise<IGroup> {
  return http.post<IGroup>('/groups', data);
}

export function updateGroup(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    location: string;
    schedule: string;
    targetPlayers: number;
    feePerPlayer: number;
    paymentType: PaymentType;
    requireRsvp: boolean;
    kickoffTime: string;
    contributionsVisibility: ContributionsVisibility;
    gameMinutes: number | null;
    timerOn: boolean;

    bibs: Bibs | null;
  }>,
): Promise<IGroup> {
  return http.patch<IGroup>(`/groups/${id}`, data);
}

export function deleteGroup(id: string): Promise<void> {
  return http.delete<void>(`/groups/${id}`);
}

export function addMember(
  groupId: string,
  data: { playerId: string; role?: MemberRole },
): Promise<void> {
  return http.post<void>(`/groups/${groupId}/members`, data);
}

/** The signed-in organiser joins this group as a player. */
export function addMeToGroup(groupId: string): Promise<void> {
  return http.post<void>(`/groups/${groupId}/members/me`);
}

/** What removing a member would do: games still to come they come off, and money that goes with them. */
export interface LeavingPreview {
  games: number;
  /** Paid by transfer for those games. */
  byTransfer: number;
  /** Paid in cash for those games: the organiser gives it back themselves. */
  cash: { date: string; amount: number }[];
  /** Kept, extra and waiting money they have in the group. */
  held: number;
  /** All the money that goes with them: `held` plus `byTransfer`. */
  dropped: number;
}

export function getLeavingPreview(groupId: string, playerId: string): Promise<LeavingPreview> {
  return http.get(`/groups/${groupId}/members/${playerId}/leaving`);
}

/** `force` removes a member who still has money in the group, which goes with them. */
export function removeMember(groupId: string, playerId: string, force = false): Promise<void> {
  return http.delete<void>(`/groups/${groupId}/members/${playerId}${force ? '?force=true' : ''}`);
}

// ── Players ──

export async function getPlayers(search?: string): Promise<IPlayer[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await http.get<PaginatedResponse<IPlayer>>(`/players${query}`);
  return res.data;
}

export function getPlayer(id: string): Promise<IPlayer> {
  return http.get<IPlayer>(`/players/${id}`);
}

export function createPlayer(data: {
  firstName: string;
  lastName: string;
  nickname?: string;
  email?: string;
  phone?: string;
  level?: PlayerLevel;
  position?: Position | null;
}): Promise<IPlayer> {
  return http.post<IPlayer>('/players', data);
}

export function updatePlayer(
  id: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    /** Blank clears it. */
    nickname: string;
    /** null clears it. */
    phone: string | null;
    email: string | null;
    level: PlayerLevel;
    /** null: doesn't mind. */
    keeper: KeeperPref;
    /** null clears it. */
    position: Position | null;
  }>,
): Promise<IPlayer> {
  return http.patch<IPlayer>(`/players/${id}`, data);
}

export function deletePlayer(id: string): Promise<void> {
  return http.delete<void>(`/players/${id}`);
}

// ── Sessions ──

export async function getSessions(groupId?: string): Promise<ISessionWithDetails[]> {
  const query = groupId ? `?groupId=${groupId}` : '';
  const res = await http.get<PaginatedResponse<ISessionWithDetails>>(`/sessions${query}`);
  return res.data;
}

export function getSession(id: string): Promise<ISessionWithDetails> {
  return http.get<ISessionWithDetails>(`/sessions/${id}`);
}

export function createSession(data: {
  groupId: string;
  date: string;
  /** "HH:mm"; left out, the group's kick-off time applies. */
  kickoffTime?: string;
  recurrenceType?: string;
  recurrenceCount?: number;
}): Promise<ISession> {
  return http.post<ISession>('/sessions', data);
}

export function updateSessionStatus(
  id: string,
  status: 'upcoming' | 'completed' | 'cancelled',
): Promise<ISessionWithDetails> {
  return http.patch<ISessionWithDetails>(`/sessions/${id}/status`, { status });
}

/** Move a game that hasn't started: a new day and/or kick-off time ("" = the group's usual time). */
export function updateSession(id: string, data: { date?: string; kickoffTime?: string }): Promise<ISessionWithDetails> {
  return http.patch<ISessionWithDetails>(`/sessions/${id}`, data);
}

export function deleteSession(id: string): Promise<void> {
  return http.delete<void>(`/sessions/${id}`);
}

// ── Payments ──

export function getSessionPayments(sessionId: string): Promise<IPayment[]> {
  return http.get<IPayment[]>(`/payments/session/${sessionId}`);
}

export function getPlayerPayments(playerId: string): Promise<IPayment[]> {
  return http.get<IPayment[]>(`/payments/player/${playerId}`);
}

export function createPayment(data: {
  sessionId: string;
  playerId: string;
  amount: number;
  status?: PaymentStatus;
}): Promise<IPayment> {
  return http.post<IPayment>('/payments', data);
}

export function markPaid(paymentId: string, source?: 'cash' | 'manual'): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/mark-paid`, { source });
}

export function markUnpaid(paymentId: string): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/mark-unpaid`);
}

/** A payment that came by transfer pays another of the same player's unpaid games instead. */
export function movePayment(paymentId: string, toPaymentId: string): Promise<{ from: string; to: string; kept: number }> {
  return http.patch(`/payments/${paymentId}/move`, { toPaymentId });
}

export function waivePayment(paymentId: string): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/waive`);
}

/** Said they were in and didn't come: nothing to pay; transfer money goes to extra to sort. */
export function markNoShow(paymentId: string): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/no-show`);
}

/** They came after all: back to owing. */
export function markCame(paymentId: string): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/came`);
}

/** Full time: the players who didn't come owe nothing; the game ends and the rest get the vote link. */
export function endGame(sessionId: string, noShows: string[]): Promise<ISessionWithDetails> {
  return http.post<ISessionWithDetails>(`/sessions/${sessionId}/end`, { noShows });
}

export function bulkMarkPaid(paymentIds: string[], source?: 'cash' | 'manual'): Promise<IPayment[]> {
  return http.patch<IPayment[]>('/payments/bulk-mark-paid', { paymentIds, source });
}

// ── Paginated functions ──

export function getGroupsPaginated(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResponse<IGroupWithMembers>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  return http.get<PaginatedResponse<IGroupWithMembers>>(`/groups?${params}`);
}

export function getPlayersPaginated(
  page = 1,
  limit = 10,
  search?: string,
): Promise<PaginatedResponse<IPlayer>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  return http.get<PaginatedResponse<IPlayer>>(`/players?${params}`);
}

// ── Profile / Auth ──

export function updateProfile(data: { firstName: string; lastName: string; phone?: string }): Promise<void> {
  return http.patch('/auth/profile', data);
}

/** The organiser's BVN and/or NIN; either one unlocks a group collection account. */
export function setIdentity(data: { bvn?: string; nin?: string }): Promise<void> {
  return http.put('/auth/identity', data);
}

export function changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
  return http.post('/auth/change-password', data);
}

// ── CSV Export ──

export async function downloadCsv(path: string, filename: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const res = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportGroupsCsv() {
  return downloadCsv('/groups/export', 'groups.csv');
}

export function exportPlayersCsv() {
  return downloadCsv('/players/export', 'players.csv');
}

export function exportSessionPaymentsCsv(sessionId: string) {
  return downloadCsv(`/sessions/${sessionId}/export`, 'session-payments.csv');
}

// ── Invite / Join ──

export function getInviteCode(): Promise<{ inviteCode: string; link: string }> {
  return http.get('/organizations/invite-code');
}

export function regenerateInviteCode(): Promise<{ inviteCode: string; link: string }> {
  return http.post('/organizations/invite-code/regenerate');
}

export function getOrgByInviteCode(
  code: string,
): Promise<{ organizationId: string; organizationName: string }> {
  return http.get(`/organizations/join/${code}`);
}

// ── Reminders ──

/** Nudge the players who came and haven't voted; the server allows it once every two hours. */
export function remindToVote(sessionId: string): Promise<{ sent: number; missed: number; waiting: number }> {
  return http.post(`/sessions/${sessionId}/remind-vote`);
}

export function sendReminders(sessionId: string): Promise<{ sent: number; missed: number }> {
  return http.post<{ sent: number; missed: number }>(`/sessions/${sessionId}/send-reminders`);
}

// ── Player Stats ──

export function getPlayerStats(playerId: string): Promise<{
  totalSessions: number;
  totalPaid: number;
  totalOwed: number;
  paymentRate: number;
}> {
  return http.get(`/players/${playerId}/stats`);
}

// ── 2FA ──

export function setup2FA(): Promise<{ qrCodeUrl: string; secret: string }> {
  return http.post('/auth/2fa/setup');
}

export function verify2FA(code: string): Promise<{ message: string }> {
  return http.post('/auth/2fa/verify', { code });
}

export function disable2FA(code: string): Promise<{ message: string }> {
  return http.post('/auth/2fa/disable', { code });
}

export function validate2FALogin(challenge: string, code: string): Promise<void> {
  return http.post('/auth/2fa/validate', { challenge, code });
}

/** The Games screens' lists: coming up (soonest first), played with money still to collect, played. */
export type GameList = 'ahead' | 'collect' | 'past';

export function getSessionsPaginated(
  page = 1,
  limit = 10,
  groupId?: string,
  when?: GameList,
): Promise<PaginatedResponse<ISessionWithDetails> & { meta: { counts?: Record<GameList, number> } }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (groupId) params.set('groupId', groupId);
  if (when) params.set('when', when);
  return http.get(`/sessions?${params}`);
}

// ── Group accounts, share links & transfers (PulseMFB) ──

export interface GroupAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
}

export interface GroupBilling {
  inviteCode: string;
  link: string;
  paymentType: PaymentType;
  account: GroupAccount | null;
  currentPeriod: { id: string; label: string; date: string } | null;
  unmatchedTransfers: number;
  providerMode: 'mock' | 'live';
}

export interface BankTransfer {
  id: string;
  amount: number;
  senderName?: string;
  /** The account it came from (last 10 digits), when the bank says. */
  senderAccount?: string | null;
  narration?: string;
  status: 'matched' | 'assigned' | 'unmatched' | 'ignored' | 'other';
  /** Not a player's payment (status 'other'): what it was, and the organiser's note. */
  category?: MoneyInCategory | null;
  note?: string | null;
  receivedAt: string;
  payment?: (IPayment & { player?: IPlayer; session?: ISession & { label?: string } }) | null;
  /** Who sent it, when known — also set when it only added to their credit. */
  player?: IPlayer | null;
  /** Unmatched only: players who said "I've paid" a similar amount around then. */
  claims?: TransferClaim[];
}

export interface TransferClaim {
  id: string;
  amount: number;
  createdAt: string;
  player: { id: string; firstName: string; lastName: string };
}

/** Who the invite is from: the organiser by first name; the club's name only if we don't have one. */
export const invitedBy = (g: { organiserName?: string | null; organizationName?: string }) => g.organiserName || g.organizationName || '';

export interface PublicGroup {
  /** Newer servers: lets a signed-in player's phone see they're already in the group. */
  groupId?: string;
  groupName: string;
  organizationName?: string;
  /** First name of the person who runs the account: "Matthew invites you". */
  organiserName?: string | null;
  description?: string;
  schedule?: string;
  feePerPlayer: number;
  paymentType: PaymentType;
  memberCount: number;
  targetPlayers: number;
  account: GroupAccount | null;
}

export interface WebhookStatus {
  ok: boolean;
  pulseUrl: string;
  expectedUrl: string;
  events: string[];
  secretMatch: boolean;
  problems: string[];
}

export function getWebhookStatus(): Promise<WebhookStatus> {
  return http.get('/webhook-status');
}

export function getGroupBilling(groupId: string): Promise<GroupBilling> {
  return http.get(`/groups/${groupId}/billing`);
}

export function provisionGroupAccount(groupId: string): Promise<GroupBilling> {
  return http.post(`/groups/${groupId}/account`);
}

export function regenerateGroupInvite(groupId: string): Promise<GroupBilling> {
  return http.post(`/groups/${groupId}/invite/regenerate`);
}

export function getGroupTransfers(groupId: string): Promise<BankTransfer[]> {
  return http.get(`/groups/${groupId}/transfers`);
}

export function simulateTransfer(
  groupId: string,
  data: { amount: number; senderName?: string; narration?: string },
): Promise<{ status: string }> {
  return http.post(`/groups/${groupId}/transfers/simulate`, data);
}

export function recordManualTransfer(
  groupId: string,
  data: { amount: number; senderName?: string; narration?: string },
): Promise<BankTransfer> {
  return http.post(`/groups/${groupId}/transfers/record`, data);
}

export function assignTransfer(transferId: string, paymentId: string): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/assign`, { paymentId });
}

/** Give an unmatched transfer to any member: it pays their oldest unpaid games, the rest is kept for their next game. */
export function giveTransfer(transferId: string, playerId: string): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/give`, { playerId });
}

/** One thing a member still owes: a game (or dues period) and how much. */
export interface OwedItem {
  paymentId: string;
  playerId: string;
  amount: number;
  sessionId: string;
  date: string;
  label: string | null;
  kind: string;
}

/** Everything still owed in a group, oldest first. */
export function getGroupOwed(groupId: string): Promise<OwedItem[]> {
  return http.get(`/groups/${groupId}/owed`);
}

export function ignoreTransfer(transferId: string): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/ignore`);
}

/** Undoes Set aside: the payment is back among those with no name yet. */
export function restoreTransfer(transferId: string): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/restore`);
}

export type MoneyInCategory = 'organiser' | 'sponsor' | 'refund' | 'other';
export type PayoutCategory = 'pitch' | 'footballs' | 'bibs' | 'water' | 'supplies' | 'refund' | 'other';

/** What marking money in as not a player's would undo, if it had been placed on a player. */
export interface NotPlayerPreview {
  amount: number;
  playerId: string | null;
  /** Extra they sent that wasn't sorted yet: taken back first. */
  fromExtra: number;
  fromKept: number;
  backToKept: number;
  reopen: { paymentId: string; sessionId: string; date: string; label: string | null; kind: string; amount: number }[];
}

/** A member who sent more than they owed: the extra waits until the organiser sorts it. */
export interface ExtraMoney {
  playerId: string;
  name: string;
  nickname?: string | null;
  photoKey?: string | null;
  extra: number;
  /** Extra put aside for someone not in the group yet, or no one knows who. */
  waiting: number;
  waitingNote: string | null;
  lastTransfer: { id: string; amount: number; receivedAt: string } | null;
}

/** Whose money pays: the sender's extra, or what's waiting for a player. */
export type ExtraSource = 'extra' | 'waiting';

export interface GiveExtraPreview {
  /** How much of the extra it would use: no more than they owe now. */
  move: number;
  pays: { paymentId: string; date: string; label: string | null; kind: string; amount: number }[];
  /** Less than a whole game: what it would have paid towards the next one. */
  towards: { paymentId: string; date: string; label: string | null; kind: string; amount: number; paidSoFar: number } | null;
  /** Extra still to sort afterwards. */
  left: number;
}

export function getExtraMoney(groupId: string): Promise<ExtraMoney[]> {
  return http.get(`/groups/${groupId}/extra`);
}

export function getGiveExtraPreview(groupId: string, fromId: string, toId: string, from: ExtraSource = 'extra'): Promise<GiveExtraPreview> {
  return http.get(`/groups/${groupId}/extra/${fromId}/give/${toId}?from=${from}`);
}

/** The extra was for someone else: it pays what they owe now. */
export function giveExtra(groupId: string, fromId: string, toId: string, from: ExtraSource = 'extra'): Promise<{ settled: number }> {
  return http.post(`/groups/${groupId}/extra/${fromId}/give`, { playerId: toId, from });
}

/** For someone not in the group yet, or no one knows who: it waits apart from the sender's money. */
export function holdExtra(groupId: string, playerId: string, note?: string): Promise<{ waiting: number }> {
  return http.post(`/groups/${groupId}/extra/${playerId}/hold`, note ? { note } : {});
}

/** Money waiting for a player goes back with the sender's extra, still to sort. */
export function releaseWaiting(groupId: string, playerId: string): Promise<{ extra: number }> {
  return http.post(`/groups/${groupId}/extra/${playerId}/release`);
}

/** The extra really was for their own next game. */
/** Why a group keeps a member's extra (the player sees this). */
export type KeptReason = 'player_agreed' | 'unreachable' | 'sorted_in_person' | 'other';
export const KEPT_REASON_WORDS: Record<KeptReason | 'player_gave', string> = {
  player_agreed: 'They said the group can keep it',
  player_gave: 'They gave it to the group',
  unreachable: 'Couldn’t reach them',
  sorted_in_person: 'Sorted out in person',
  other: 'Another reason',
};

/** The group keeps a member's extra: nobody is owed it any more. Organisers only. */
export function keepExtraForGroup(groupId: string, playerId: string, reason: KeptReason, note?: string): Promise<{ kept: number }> {
  return http.post(`/groups/${groupId}/extra/${playerId}/keep-for-group`, { reason, ...(note ? { note } : {}) });
}

export function keepExtra(groupId: string, playerId: string): Promise<{ kept: number }> {
  return http.post(`/groups/${groupId}/extra/${playerId}/keep`);
}

/** The organiser adds or changes a player's photo (a small square data URL from resizePhoto). */
export function setPlayerPhoto(playerId: string, image: string): Promise<{ photoKey: string }> {
  return http.post(`/players/${playerId}/photo`, { image });
}

export function removePlayerPhoto(playerId: string): Promise<{ photoKey: null }> {
  return http.delete(`/players/${playerId}/photo`);
}

export function getNotPlayerPreview(transferId: string): Promise<NotPlayerPreview> {
  return http.get(`/transfers/${transferId}/not-player`);
}

/** Not a player's payment: stays in the account, never anyone's dues. */
export function markNotPlayer(transferId: string, data: { category: MoneyInCategory; note?: string }): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/not-player`, data);
}

/** Undoes markNotPlayer: back with the payments that have no name yet. */
export function markPlayerMoney(transferId: string): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/player-money`);
}

export function setPayoutCategory(payoutId: string, category: PayoutCategory): Promise<OutgoingTransfer> {
  return http.post(`/payouts/${payoutId}/category`, { category });
}

export function getPublicGroup(code: string): Promise<PublicGroup> {
  return http.get(`/public/groups/${code}`);
}

// ── Payouts (transfer out) ──

export interface GroupBalance {
  totalIn: number;
  /** Part of totalIn recorded by hand: kept for the books, not withdrawable. */
  manualIn: number;
  totalOut: number;
  available: number;
}

export interface OutgoingTransfer {
  id: string;
  groupId: string;
  amount: number;
  fee: number;
  beneficiaryAccount: string;
  beneficiaryName: string;
  beneficiaryBankCode: string;
  beneficiaryBankName: string;
  narration?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  providerReference?: string;
  errorMessage?: string;
  initiatedBy?: { firstName: string; lastName: string };
  /** The member whose credit this refunds, if it's a refund. */
  refundPlayerId?: string | null;
  refundPlayer?: { firstName: string; lastName: string } | null;
  /** What it was for (null for withdrawals made before categories). */
  category?: PayoutCategory | null;
  createdAt: string;
  completedAt?: string;
}

export interface NigerianBank {
  code: string;
  name: string;
}

export function getGroupBalance(groupId: string): Promise<GroupBalance> {
  return http.get(`/groups/${groupId}/balance`);
}

export function nameEnquiry(groupId: string, bankCode: string, accountNumber: string): Promise<{ accountName: string }> {
  return http.post(`/groups/${groupId}/name-enquiry`, { bankCode, accountNumber });
}

export function getGroupPayouts(groupId: string): Promise<OutgoingTransfer[]> {
  return http.get(`/groups/${groupId}/payouts`);
}

export function initiateGroupPayout(
  groupId: string,
  data:
    | { amount: number; beneficiaryAccount: string; beneficiaryBankCode: string; narration?: string; refundPlayerId?: string; category?: PayoutCategory; pin: string }
    | { amount: number; toPayee: true; narration?: string; category?: PayoutCategory; pin: string },
): Promise<OutgoingTransfer> {
  return http.post(`/groups/${groupId}/payouts`, data);
}

/** Who the group usually pays: the pitch owner or facility manager. `name` is the bank's. */
export interface GroupPayee {
  label: string;
  name: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  /** The usual amount (e.g. the pitch fee), if saved. */
  amount: number | null;
}

export function getGroupPayee(groupId: string): Promise<GroupPayee | null> {
  return http.get(`/groups/${groupId}/payee`);
}

/** Saves the payee after the API checks the account's name with the bank. */
export function saveGroupPayee(
  groupId: string,
  data: { bankCode: string; accountNumber: string; label?: string; amount?: number },
): Promise<GroupPayee> {
  return http.put(`/groups/${groupId}/payee`, data);
}

export function clearGroupPayee(groupId: string): Promise<null> {
  return http.delete(`/groups/${groupId}/payee`);
}

export function cancelPayout(payoutId: string): Promise<OutgoingTransfer> {
  return http.post(`/payouts/${payoutId}/cancel`);
}

export function getNigerianBanks(): Promise<NigerianBank[]> {
  return http.get('/banks');
}

export function getTransferPinStatus(): Promise<{ hasPin: boolean }> {
  return http.get('/me/transfer-pin');
}

export function setTransferPin(pin: string, currentPin?: string): Promise<{ success: boolean }> {
  return http.post('/me/transfer-pin', { pin, currentPin });
}

export function changeTransferPin(currentPin: string, newPin: string): Promise<{ success: boolean }> {
  return http.put('/me/transfer-pin', { currentPin, newPin });
}

// ── RSVP team sheet ──

export interface RsvpBoard {
  capacity: number;
  requireRsvp: boolean;
  in: SquadMember[];
  waitlist: SquadMember[];
  out: SquadMember[];
  noReply: SquadMember[];
}

export function getRsvpBoard(sessionId: string): Promise<RsvpBoard> {
  return http.get(`/sessions/${sessionId}/rsvp`);
}

export function setRsvpForPlayer(sessionId: string, playerId: string, status: 'in' | 'out'): Promise<RsvpBoard> {
  return http.post(`/sessions/${sessionId}/rsvp`, { playerId, status });
}

// ── Match day: teams on the day + short games ──

export type TeamKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** A goal as it's recorded: the side, the scorer, and the teammate who set it up (if anyone). */
export interface GoalInput {
  team: TeamKey;
  scorerId: string;
  assistId?: string | null;
  /** Put in their own net: counts for `team`, `scorerId` is the other side's player who did it. */
  ownGoal?: boolean;
}

export interface MatchGoal extends GoalInput {
  id: string;
  /** "Tunde (organiser)", "Ada (captain)". */
  recordedBy: string | null;
}

export interface MatchGame {
  id: string;
  teamA: TeamKey;
  teamB: TeamKey;
  scoreA: number;
  scoreB: number;
  /** Named scorers; can be fewer than the score. */
  goals: MatchGoal[];
  /** "Tunde (organiser)", "Ada (captain)": who saved the score. */
  recordedBy?: string | null;
  /** How long it lasted, from the timer; null when not known. */
  seconds?: number | null;
  /** Who was in goal for each side (anyone playing that day; a borrowed keeper too). Null: not recorded. */
  keeperA?: string | null;
  keeperB?: string | null;
  /** Players on either side who sat this whole game out; empty or null: everyone played. */
  satOut?: string[] | null;
}

export interface TeamStanding {
  team: TeamKey;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
  /** Points per game played (winner stays ranks by it). */
  ppg?: number;
}

/** The day's plan and what it's worked out from (see lib/match-plan). */
export interface PlanInfo {
  /** Null: no plan for this game yet. */
  plan?: MatchPlan | null;
  /** With no plan yet: the last one this group used, to start from. */
  lastPlan?: MatchPlan | null;
  /** "HH:mm", or null when the game has no kick-off time. */
  kickoff?: string | null;
  /** "YYYY-MM-DD": the swaps start from a different player each week. */
  date?: string;
}

export interface Lineup extends PlanInfo {
  teamCount: number;
  /** Scores are in, so the teams are fixed until they're deleted. */
  locked: boolean;
  /** Scores can be added: it's match day or later, and the game wasn't called off. */
  scoresOpen: boolean;
  /** Side → its captain's name; a side with a captain goes by "Team <name>". */
  captains: Partial<Record<TeamKey, string>>;
  /** Each side's bib colour and name for this game (its own, else the group's). */
  bibs?: Bibs;
  /** `paid`: for this game, or for the dues period it falls in when dues cover games. */
  squad: (SquadMember & {
    team: TeamKey | null;
    captain: boolean;
    vice?: boolean;
    keeper?: KeeperPref;
    /** Where they play today (their usual position unless changed for today), and where they usually play. */
    position?: Position | null;
    usualPosition?: Position | null;
    ovr: number | null;
    skill: number;
    paid?: 'paid' | 'unpaid' | 'waived';
  })[];
  games: MatchGame[];
  /** Cards and saves recorded today, oldest first. */
  events: MatchEvent[];
  standings: TeamStanding[];
  teamOfTheDay: TeamKey | null;
  /** Winner stays: the table is ranked by points per game. */
  tablePerGame?: boolean;
}

export function getLineup(sessionId: string): Promise<Lineup> {
  return http.get(`/sessions/${sessionId}/lineup`);
}

export function saveLineup(
  sessionId: string,
  data: {
    teamCount?: number;
    teams?: Record<string, TeamKey | null>;
    captains?: Partial<Record<TeamKey, string | null>>;
    vices?: Partial<Record<TeamKey, string | null>>;
    /** Where they play today; null: their usual position. */
    positions?: Record<string, Position | null>;
  },
): Promise<Lineup> {
  return http.put(`/sessions/${sessionId}/lineup`, data);
}

/** Set up the day's plan, or take it away (null). */
export function savePlan(sessionId: string, plan: Omit<MatchPlan, 'away'> | null): Promise<Lineup> {
  return http.put(`/sessions/${sessionId}/plan`, { plan });
}

/** Someone left early (`at`: minutes after kick-off), or is back (null). */
export function setPlanAway(sessionId: string, playerId: string, at: number | null): Promise<Lineup> {
  return http.put(`/sessions/${sessionId}/plan/away`, { playerId, at });
}

/** The match-day clock. */
export function getTimer(sessionId: string): Promise<GameTimer> {
  return http.get(`/sessions/${sessionId}/timer`);
}

/** Start (from now) or stop the clock, and/or set today's game length. */
export function setTimer(sessionId: string, change: { start?: boolean; minutes?: number; pause?: boolean }): Promise<GameTimer> {
  return http.put(`/sessions/${sessionId}/timer`, change);
}

/** One game's bibs and team names (null: back to the group's). Allowed after scores too; it's only how sides look. */
export function setGameBibs(sessionId: string, bibs: Bibs | null): Promise<Lineup> {
  return http.patch(`/sessions/${sessionId}/bibs`, { bibs });
}

/** Fair teams, different on each tap. `fair.onlyOne`: no other fair split exists for these players. */
export function balanceLineup(sessionId: string, teamCount?: number): Promise<Lineup & { fair?: { gap: number; onlyOne: boolean } }> {
  return http.post(`/sessions/${sessionId}/lineup/balance`, teamCount ? { teamCount } : {});
}

export function addMatchGame(
  sessionId: string,
  game: { teamA: TeamKey; teamB: TeamKey; scoreA: number; scoreB: number; goals?: GoalInput[]; seconds?: number; keeperA?: string | null; keeperB?: string | null; satOut?: string[] },
): Promise<Lineup> {
  return http.post(`/sessions/${sessionId}/games`, game);
}

/** Names the scorer of a goal in a game already saved. */
export function addGoal(sessionId: string, gameId: string, goal: GoalInput): Promise<Lineup> {
  return http.post(`/sessions/${sessionId}/games/${gameId}/goals`, goal);
}

export function deleteGoal(sessionId: string, goalId: string): Promise<Lineup> {
  return http.delete(`/sessions/${sessionId}/goals/${goalId}`);
}

export type MatchEventKind = 'yellow' | 'red' | 'save' | 'pen_miss';
export interface MatchEvent {
  id: string;
  playerId: string;
  kind: MatchEventKind;
  /** "Tunde (organiser)", "Ada (captain)". */
  recordedBy: string | null;
}

/** A yellow card, red card or save on match day. */
export function addMatchEvent(sessionId: string, event: { playerId: string; kind: MatchEventKind }): Promise<Lineup> {
  return http.post(`/sessions/${sessionId}/events`, event);
}

export function deleteMatchEvent(sessionId: string, eventId: string): Promise<Lineup> {
  return http.delete(`/sessions/${sessionId}/events/${eventId}`);
}

/** Correct a saved game's score (the organiser only). Named scorers stay. */
export function updateMatchGame(
  sessionId: string,
  gameId: string,
  score: { scoreA?: number; scoreB?: number; keeperA?: string | null; keeperB?: string | null; satOut?: string[] },
): Promise<Lineup> {
  return http.patch(`/sessions/${sessionId}/games/${gameId}`, score);
}

export function deleteMatchGame(sessionId: string, gameId: string): Promise<Lineup> {
  return http.delete(`/sessions/${sessionId}/games/${gameId}`);
}

// ── Messages outbox & organiser push ──

export interface OutboundMessage {
  id: string;
  channel: string;
  to: string;
  kind: string;
  body: string;
  status: string;
  createdAt: string;
}

export function getMessages(): Promise<{ mode: 'mock' | 'live'; messages: OutboundMessage[] }> {
  return http.get('/messages');
}

/**
 * Organiser → "Playing": exchange the organiser session for their player session. When the email
 * isn't confirmed and already belongs to a player, the server emails a code first and answers
 * `needsCode`; send it back as `code`.
 */
export function playerTokenFromOrganiser(
  code?: string,
): Promise<{ token: string; needsCode?: undefined } | { needsCode: true; email: string; devCode?: string; token?: undefined }> {
  return http.post('/player-auth/from-organiser', code ? { code } : {});
}

// ── Email Verification ──

export function resendVerification(): Promise<{ message: string }> {
  return http.post('/auth/resend-verification');
}

export function subscribeOrganiserPush(sub: PushSubscriptionJSON) {
  return http.post('/push/subscribe', sub);
}

export function unsubscribeOrganiserPush(endpoint: string) {
  return http.delete('/push/subscribe', { endpoint });
}

/** Emails when a notification can't reach this organiser: on unless switched off. */
export function setOrganiserEmails(email: boolean) {
  return http.patch<{ emailNotices: boolean }>('/notifications/settings', { email });
}

// ── Post-match voting, ratings & league table ──

export type VoteCategory =
  | 'potm'
  | 'pace'
  | 'shooting'
  | 'passing'
  | 'defending'
  | 'keeper'
  | 'teammate'
  | 'vii'
  | 'vii_sub'
  | 'vii_gk'
  | 'dribbling'
  | 'smartest'
  | 'engine'
  | 'playmaker'
  | 'movement';
/** The card's abilities, from teammates' award nominations; GK only once nominated in goal. */
export type Attribute = 'SHO' | 'PAS' | 'TEC' | 'DEF' | 'IQ' | 'PHY' | 'MOV' | 'GK';

/** What teammates' nominations say about one award: `enough` once 3 different people said so. */
export interface AwardEvidence {
  nominations: number;
  voters: number;
  games: number;
  share: number;
  enough: boolean;
}

export interface SquadMember {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  photoKey?: string | null;
}

export interface VoteResults {
  bibs?: Bibs;
  ballots: number;
  squadSize: number;
  /** The vote is still open: only the turnout is shown, the winners come at the close. */
  hidden?: boolean;
  categories: {
    key: VoteCategory;
    title: string;
    /** For "Best on your team": whose team this result is for. */
    team?: TeamKey | null;
    /** `played`/`of` only when they played under half their side's games: their POTM and best-on-team votes count half. */
    standings: { playerId: string; count: number; player: SquadMember; played?: number; of?: number }[];
    /** Awards: how many different voters nominated anyone. */
    voters?: number;
    /** Awards: too few voters to name a winner. */
    inconclusive?: boolean;
    /** Best VII: its keeper, listed first (null on days voted before the keeper spot). */
    keeperId?: string | null;
  }[];
}

export interface SessionVoting extends VoteResults {
  token: string;
  link: string;
  open: boolean;
  /** The game hasn't been ended yet: the vote opens at full time. */
  notYet: boolean;
  closesAt: string | null;
  /** Ids of the players who've voted (never what they picked). */
  voted?: string[];
}

export interface Ballot {
  groupName?: string;
  date: string;
  open: boolean;
  notYet: boolean;
  closesAt: string | null;
  categories: { key: VoteCategory; title: string }[];
  /**
   * Best VII of the Day: six starters and a sub, some from other teams. Null when too few played.
   * `keepers`: who can be its keeper (in goal today); empty means no keeper spot.
   */
  vii: { starters: number; subs: number; minOtherTeams: number; keepers: string[]; keepersFrom: 'goal' | 'position' | null } | null;
  /** The awards a voter can nominate for, each optional, up to maxAwards. */
  awards: { key: VoteCategory; title: string; hint: string }[];
  maxAwards: number;
  /** Who played, each with their side (null when teams weren't set). */
  /** `played` of `of`: games they played of the games their side played (newer servers). */
  squad: (SquadMember & { team: TeamKey | null; position?: Position | null; played?: number; of?: number })[];
  teamCount: number;
  captains: Partial<Record<TeamKey, string>>;
  /** Each side's bib colour and name for this game (its own, else the group's). */
  bibs?: Bibs;
  ballots: number;
  squadSize: number;
}

export interface PlayerRatings {
  games: number;
  ballotsSeen: number;
  votes: Record<VoteCategory, number>;
  potmWins: number;
  record: { w: number; d: number; l: number };
  teamOfDay: number;
  points: number;
  /** Skill rating from match results (~1500 average); drives team balancing. */
  skill: number;
  /** Still settling: fewer than three scored games. */
  provisional: boolean;
  ovr: number | null;
  attributes: Record<Attribute, number | null>;
  goals: number;
  assists: number;
  /** Cards and saves recorded on match day. */
  yellowCards: number;
  redCards: number;
  saves: number;
  /** Own goals put in, penalties missed (newer servers). */
  ownGoals?: number;
  penMisses?: number;
  /** Goals their side scored minus goals it let in, in the games they played (newer servers). */
  plusMinus?: number;
  /** Times someone put them in their Best VII. */
  viiPicks: number;
  /** Times they made the Best VII of the Day. */
  viiOfDay: number;
  /** Times they won Best on their team. */
  bestOnTeam: number;
  /** Per award: the evidence behind the attributes. */
  evidence: Partial<Record<VoteCategory, AwardEvidence>>;
  evidenceGames: number;
  /** This calendar year's, when asked for one player. */
  season?: PlayerRatings;
  /** When asked for one player: the club's average per number, and where they rank. */
  compare?: StatCompare;
}

export type ComparedStat =
  | 'goals'
  | 'assists'
  | 'potmWins'
  | 'viiOfDay'
  | 'wins'
  | 'points'
  | 'games'
  | 'bestOnTeam'
  | 'teamOfDay'
  | 'saves'
  | 'yellowCards'
  | 'redCards'
  | 'ownGoals'
  | 'penMisses'
  | 'plusMinus';
/** Per number: the club's average in total and per game, this player's rank (ties share it; 0 if not played) and out of how many. */
export type StatCompare = Record<ComparedStat, { avg: number; avgPerGame: number; rank: number; of: number }>;

export interface LeagueTable {
  games: number;
  /** The latest match day counted. */
  lastDate?: string | null;
  /** The group's join-link code: the table's share link is built on it. Null: can't be shared. */
  shareCode?: string | null;
  /** 'rating': ranked by the card's rating, points shown beside it. Missing: by points (older servers). */
  rankedBy?: 'rating';
  /** How the club's cards are worked out, so every screen explains the same number. Missing: classic. */
  ratingMode?: RatingMode;
  points: { win: number; draw: number; teamOfDay: number; potm: number };
  rows: (PlayerRatings & {
    player: SquadMember;
    /** The player's own last three match days, oldest first: W more games won than lost, L fewer, D level. */
    form: ('W' | 'D' | 'L')[];
    /** Places up (+) or down since before the latest match day; null if they weren't in the table then. */
    move: number | null;
  })[];
}

export function getSessionVoting(sessionId: string): Promise<SessionVoting> {
  return http.get(`/sessions/${sessionId}/voting`);
}

/**
 * How the club's player cards are worked out (a club setting, both apps). 'classic': where each
 * player ranks in the club (40% stats, 40% votes, 20% results). 'steady': a match rating out of 10
 * each match day, and a card that moves a little at a time toward their form.
 */
export type RatingMode = 'classic' | 'steady';

export function getRatingMode(): Promise<{ mode: RatingMode }> {
  return http.get('/ratings/mode');
}

export function setRatingMode(mode: RatingMode): Promise<{ mode: RatingMode }> {
  return http.put('/ratings/mode', { mode });
}

/** Each player's 40/40/20 rating and its three parts, beside the old way's number, for the organiser. */
export interface RatingTrial {
  /** Missing: classic (older servers). */
  mode?: RatingMode;
  weights: { stats: number; votes: number; results: number };
  rows: {
    player: SquadMember;
    games: number;
    ballotsSeen: number;
    goals: number;
    assists: number;
    /** What the card showed the old way (results, lifted by awards), for comparing. */
    oldOvr: number | null;
    trial: number;
    parts: { stats: number; votes: number; results: number };
    /** The number on the card, whichever way the club works it out. */
    card?: number | null;
    /** Steady clubs: form (average match rating), match days rated, the latest match rating. */
    steady?: { form: number | null; matchDays: number; last: number | null } | null;
  }[];
}

/** How a player's card number is made. Null before they've played. */
export type RatingBreakdown = ClassicBreakdown | SteadyBreakdown;

/** What made one match rating, in points out of 10 on top of the 6.0 everyone starts the day on. */
export interface MatchRatingParts {
  goals: number;
  assists: number;
  results: number;
  keeping: number;
  cleanSheets: number;
  cards: number;
  /** Own goals and missed penalties (newer servers). */
  mistakes?: number;
  votes: number;
}

export interface SteadyBreakdown {
  mode: 'steady';
  player: SquadMember;
  rating: number;
  /** What the classic card would say, while the club compares. */
  classic: number | null;
  matchDays: number;
  settling: boolean;
  newFor: number;
  /** The most the card can move on their next match day, and once settled. */
  maxMove: number;
  settledMove: number;
  /** Share of the vote bonus their next match day gets: 1 while new, down to votesFloor. */
  votesCount: number;
  votesFull: number;
  votesFloor: number;
  form: number | null;
  /** Their groups' match days missed in a row, and what that has taken off (after missGrace). Newer servers. */
  missed?: number;
  missedLost?: number;
  missGrace?: number;
  /** Newest first. */
  recent: { date: string; rating: number; parts: MatchRatingParts; games: number; move: number }[];
}

/** The classic card: three parts, each against the club. */
export interface ClassicBreakdown {
  /** Missing on older servers. */
  mode?: 'classic';
  player: SquadMember;
  rating: number;
  weights: { stats: number; votes: number; results: number };
  /** Players in the club who have played: "2nd of 22". */
  of: number;
  /** In goals: what a save adds and a card costs. */
  worth: { save: number; yellow: number; red: number; ownGoal?: number; penMiss?: number };
  stats: { score: number; place: number | null; games: number; goals: number; assists: number; saves: number; yellowCards: number; redCards: number; ownGoals?: number; penMisses?: number };
  votes: { score: number; place: number | null; ballots: number; potmVotes: number; potmWins: number; viiPicks: number; awards: { key: string; share: number }[] };
  results: { score: number; place: number | null; record: { w: number; d: number; l: number }; skill: number };
}

export function getRatingBreakdown(playerId: string): Promise<RatingBreakdown | null> {
  return http.get(`/players/${playerId}/rating-breakdown`);
}

export function getRatingTrial(groupId: string): Promise<RatingTrial> {
  return http.get(`/groups/${groupId}/rating-trial`);
}

/** The group's table; `lastDays` limits it to the latest match days. */
/** Which match days a table counts: the latest N, and/or between two dates (YYYY-MM-DD, inclusive). */
export interface TableRange {
  last?: number;
  from?: string;
  to?: string;
}

/** "?last=5", "?from=2026-10-01&to=2026-10-31", or nothing for the whole season. */
export function tableQuery(range?: TableRange) {
  const q = new URLSearchParams();
  if (range?.last) q.set('last', String(range.last));
  if (range?.from) q.set('from', range.from);
  if (range?.to) q.set('to', range.to);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function getGroupTable(groupId: string, range?: TableRange): Promise<LeagueTable> {
  return http.get(`/groups/${groupId}/table${tableQuery(range)}`);
}

export function getPlayerRatings(playerId: string): Promise<PlayerRatings> {
  return http.get(`/players/${playerId}/ratings`);
}

export function getBallot(token: string): Promise<Ballot> {
  return http.get(`/public/votes/${token}`);
}



export function getVoteResults(token: string): Promise<VoteResults> {
  return http.get(`/public/votes/${token}/results`);
}

/** The day in one go (Team of the Day, everyone's goals and assists, the Best VII), as the share card has it. */
export function getVoteCard(token: string): Promise<MatchCard> {
  return http.get(`/public/votes/${token}/card`);
}

// ── Competitions (organiser) ──

export type CompetitionWithCount = ICompetition & { teamCount?: number };

export function getCompetitions(page = 1, limit = 10): Promise<PaginatedResponse<ICompetition>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return http.get<PaginatedResponse<ICompetition>>(`/competitions?${params}`);
}

export function getCompetition(id: string): Promise<CompetitionWithCount> {
  return http.get<CompetitionWithCount>(`/competitions/${id}`);
}

export function createCompetition(data: {
  name: string;
  description?: string;
  format: CompetitionFormat;
  scope: CompetitionScope;
  state?: string;
  city?: string;
  visibility?: CompetitionVisibility;
  entryFee?: number;
  maxTeams?: number;
  minPlayersPerTeam?: number;
  maxPlayersPerTeam?: number;
  registrationDeadline?: string;
  startDate?: string;
  endDate?: string;
  rules?: string;
}): Promise<ICompetition> {
  return http.post<ICompetition>('/competitions', data);
}

export function updateCompetition(id: string, data: Partial<Parameters<typeof createCompetition>[0]>): Promise<ICompetition> {
  return http.patch<ICompetition>(`/competitions/${id}`, data);
}

export function deleteCompetition(id: string): Promise<void> {
  return http.delete<void>(`/competitions/${id}`);
}

export function updateCompetitionStatus(id: string, status: CompetitionStatus): Promise<ICompetition> {
  return http.post<ICompetition>(`/competitions/${id}/status`, { status });
}

export function provisionCompetitionAccount(id: string): Promise<ICompetition> {
  return http.post<ICompetition>(`/competitions/${id}/account`);
}

export function generateFixtures(id: string): Promise<ICompetitionMatch[]> {
  return http.post<ICompetitionMatch[]>(`/competitions/${id}/generate-fixtures`);
}

export function getCompetitionTeams(id: string): Promise<ICompetitionTeam[]> {
  return http.get<ICompetitionTeam[]>(`/competitions/${id}/teams`);
}

export function confirmTeamPayment(competitionId: string, teamId: string): Promise<ICompetitionTeam> {
  return http.post<ICompetitionTeam>(`/competitions/${competitionId}/teams/${teamId}/confirm`);
}

export function removeCompetitionTeam(competitionId: string, teamId: string): Promise<void> {
  return http.delete<void>(`/competitions/${competitionId}/teams/${teamId}`);
}

export function getCompetitionMatches(id: string): Promise<ICompetitionMatch[]> {
  return http.get<ICompetitionMatch[]>(`/competitions/${id}/matches`);
}

export function recordMatchResult(
  competitionId: string,
  matchId: string,
  data: { homeScore: number; awayScore: number; homePenalties?: number; awayPenalties?: number },
): Promise<ICompetitionMatch> {
  return http.post<ICompetitionMatch>(`/competitions/${competitionId}/matches/${matchId}/result`, data);
}

export function updateMatchSchedule(
  competitionId: string,
  matchId: string,
  data: { scheduledDate?: string; scheduledTime?: string; venue?: string },
): Promise<ICompetitionMatch> {
  return http.patch<ICompetitionMatch>(`/competitions/${competitionId}/matches/${matchId}`, data);
}

export function getCompetitionStandings(id: string): Promise<ICompetitionStanding[]> {
  return http.get<ICompetitionStanding[]>(`/competitions/${id}/standings`);
}

export function getCompetitionBracket(id: string): Promise<{ rounds: Record<number, ICompetitionMatch[]> }> {
  return http.get(`/competitions/${id}/bracket`);
}

// ── Competitions (public) ──

export function browseCompetitions(
  filters?: { scope?: CompetitionScope; state?: string; city?: string },
  page = 1,
  limit = 10,
): Promise<PaginatedResponse<ICompetition>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filters?.scope) params.set('scope', filters.scope);
  if (filters?.state) params.set('state', filters.state);
  if (filters?.city) params.set('city', filters.city);
  return http.get<PaginatedResponse<ICompetition>>(`/public/competitions?${params}`);
}

export function getPublicCompetition(id: string): Promise<CompetitionWithCount> {
  return http.get<CompetitionWithCount>(`/public/competitions/${id}`);
}

export function getCompetitionByInvite(code: string): Promise<ICompetition> {
  return http.get<ICompetition>(`/public/competitions/invite/${code}`);
}

export function registerTeam(
  competitionId: string,
  data: { name: string; captainName: string; captainPhone: string; captainEmail?: string },
): Promise<ICompetitionTeam> {
  return http.post<ICompetitionTeam>(`/public/competitions/${competitionId}/register`, data);
}

export function getPublicCompetitionTeams(id: string): Promise<ICompetitionTeam[]> {
  return http.get<ICompetitionTeam[]>(`/public/competitions/${id}/teams`);
}

export function getPublicCompetitionMatches(id: string): Promise<ICompetitionMatch[]> {
  return http.get<ICompetitionMatch[]>(`/public/competitions/${id}/matches`);
}

export function getPublicCompetitionStandings(id: string): Promise<ICompetitionStanding[]> {
  return http.get<ICompetitionStanding[]>(`/public/competitions/${id}/standings`);
}

export function getPublicCompetitionBracket(id: string): Promise<{ rounds: Record<number, ICompetitionMatch[]> }> {
  return http.get(`/public/competitions/${id}/bracket`);
}

export interface NigerianStateData {
  name: string;
  cities: string[];
}

export function getNigerianStates(): Promise<NigerianStateData[]> {
  return http.get<NigerianStateData[]>('/public/nigerian-states');
}

// ── Crypto / International Groups ──

export function getSupportedChains(): Promise<IChainInfo[]> {
  return http.get<IChainInfo[]>('/crypto/chains');
}

export function getUserWallets(): Promise<IUserWallet[]> {
  return http.get<IUserWallet[]>('/crypto/wallets');
}

export function getGroupWallets(groupId: string): Promise<IGroupWallet[]> {
  return http.get<IGroupWallet[]>(`/crypto/groups/${groupId}/wallets`);
}

export function getGroupCryptoTransfers(groupId: string): Promise<ICryptoTransfer[]> {
  return http.get<ICryptoTransfer[]>(`/crypto/groups/${groupId}/transfers`);
}

export function getGroupCryptoBalance(groupId: string): Promise<GroupBalance> {
  return http.get<GroupBalance>(`/crypto/groups/${groupId}/balance`);
}

export function initiateGroupCryptoWithdrawal(
  groupId: string,
  data: { chain: string; token: string; amount: number; toAddress: string; category?: string; refundPlayerId?: string; pin: string },
): Promise<ICryptoOutgoingTransfer> {
  return http.post<ICryptoOutgoingTransfer>(`/crypto/groups/${groupId}/withdraw`, data);
}

export function getGroupCryptoPayouts(groupId: string): Promise<ICryptoOutgoingTransfer[]> {
  return http.get<ICryptoOutgoingTransfer[]>(`/crypto/groups/${groupId}/payouts`);
}

export function assignCryptoTransfer(transferId: string, paymentId: string): Promise<ICryptoTransfer> {
  return http.post<ICryptoTransfer>(`/crypto/transfers/${transferId}/assign`, { paymentId });
}

export function giveCryptoTransfer(transferId: string, playerId: string): Promise<ICryptoTransfer> {
  return http.post<ICryptoTransfer>(`/crypto/transfers/${transferId}/give`, { playerId });
}

export function ignoreCryptoTransfer(transferId: string): Promise<ICryptoTransfer> {
  return http.post<ICryptoTransfer>(`/crypto/transfers/${transferId}/ignore`);
}

export function restoreCryptoTransfer(transferId: string): Promise<ICryptoTransfer> {
  return http.post<ICryptoTransfer>(`/crypto/transfers/${transferId}/restore`);
}
