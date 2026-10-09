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
} from '@pitchaside/shared';
import { http } from './http';

// ── Currency formatter ──

export function formatCurrency(amount: number): string {
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
    /** Paid toward their next due but not enough to cover it yet (decimal string). */
    credit?: string;
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

/** `force` removes a member who still has credit, which goes with them. */
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
  email?: string;
  phone?: string;
  level?: PlayerLevel;
}): Promise<IPlayer> {
  return http.post<IPlayer>('/players', data);
}

export function updatePlayer(
  id: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    /** null clears it. */
    phone: string | null;
    email: string | null;
    level: PlayerLevel;
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

export function markPaid(paymentId: string): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/mark-paid`);
}

export function waivePayment(paymentId: string): Promise<IPayment> {
  return http.patch<IPayment>(`/payments/${paymentId}/waive`);
}

export function bulkMarkPaid(paymentIds: string[]): Promise<IPayment[]> {
  return http.patch<IPayment[]>('/payments/bulk-mark-paid', { paymentIds });
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

export function updateProfile(data: { firstName: string; lastName: string; phone?: string; bvn?: string }): Promise<any> {
  return http.patch('/auth/profile', data);
}

export function changePassword(data: { currentPassword: string; newPassword: string }): Promise<any> {
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

export function validate2FALogin(userId: string, code: string): Promise<any> {
  return http.post('/auth/2fa/validate', { userId, code });
}

export function getSessionsPaginated(
  page = 1,
  limit = 10,
  groupId?: string,
): Promise<PaginatedResponse<ISessionWithDetails>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (groupId) params.set('groupId', groupId);
  return http.get<PaginatedResponse<ISessionWithDetails>>(`/sessions?${params}`);
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
  narration?: string;
  status: 'matched' | 'assigned' | 'unmatched' | 'ignored';
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

export interface PublicGroup {
  groupName: string;
  organizationName?: string;
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

/** Give an unmatched transfer to the player whose "I've paid" it matches. */
export function acceptTransferClaim(transferId: string, claimId: string): Promise<{ status: string }> {
  return http.post(`/transfers/${transferId}/claims/${claimId}/accept`);
}

export function ignoreTransfer(transferId: string): Promise<BankTransfer> {
  return http.post(`/transfers/${transferId}/ignore`);
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
    | { amount: number; beneficiaryAccount: string; beneficiaryBankCode: string; narration?: string; refundPlayerId?: string; pin: string }
    | { amount: number; toPayee: true; narration?: string; pin: string },
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

export interface MatchGame {
  id: string;
  teamA: TeamKey;
  teamB: TeamKey;
  scoreA: number;
  scoreB: number;
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
}

export interface Lineup {
  teamCount: number;
  /** `paid`: for this game, or for the dues period it falls in when dues cover games. */
  squad: (SquadMember & { team: TeamKey | null; ovr: number | null; skill: number; paid?: 'paid' | 'unpaid' | 'waived' })[];
  games: MatchGame[];
  standings: TeamStanding[];
  teamOfTheDay: TeamKey | null;
}

export function getLineup(sessionId: string): Promise<Lineup> {
  return http.get(`/sessions/${sessionId}/lineup`);
}

export function saveLineup(
  sessionId: string,
  data: { teamCount?: number; teams?: Record<string, TeamKey | null> },
): Promise<Lineup> {
  return http.put(`/sessions/${sessionId}/lineup`, data);
}

export function balanceLineup(sessionId: string, teamCount?: number): Promise<Lineup> {
  return http.post(`/sessions/${sessionId}/lineup/balance`, teamCount ? { teamCount } : {});
}

export function addMatchGame(
  sessionId: string,
  game: { teamA: TeamKey; teamB: TeamKey; scoreA: number; scoreB: number },
): Promise<Lineup> {
  return http.post(`/sessions/${sessionId}/games`, game);
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

/** Organiser → "Playing": exchange the organiser session for their player session. */
export function playerTokenFromOrganiser(): Promise<{ token: string }> {
  return http.post('/player-auth/from-organiser');
}

// ── Email Verification ──

export function resendVerification(): Promise<{ message: string }> {
  return http.post('/auth/resend-verification');
}

export function subscribeOrganiserPush(sub: PushSubscriptionJSON) {
  return http.post('/push/subscribe', sub);
}

// ── Post-match voting, ratings & league table ──

export type VoteCategory = 'potm' | 'pace' | 'shooting' | 'passing' | 'defending' | 'keeper';
export type Attribute = 'PAC' | 'SHO' | 'PAS' | 'DEF' | 'GK';

export interface SquadMember {
  id: string;
  firstName: string;
  lastName: string;
}

export interface VoteResults {
  ballots: number;
  squadSize: number;
  categories: {
    key: VoteCategory;
    title: string;
    standings: { playerId: string; count: number; player: SquadMember }[];
  }[];
}

export interface SessionVoting extends VoteResults {
  token: string;
  link: string;
  open: boolean;
  notYet: boolean;
  closesAt: string;
}

export interface Ballot {
  groupName?: string;
  date: string;
  open: boolean;
  notYet: boolean;
  closesAt: string;
  categories: { key: VoteCategory; title: string }[];
  squad: SquadMember[];
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
}

export interface LeagueTable {
  games: number;
  points: { potmVote: number; attrVote: number; potmWin: number };
  rows: (PlayerRatings & { player: SquadMember })[];
}

export function getSessionVoting(sessionId: string): Promise<SessionVoting> {
  return http.get(`/sessions/${sessionId}/voting`);
}

export function getGroupTable(groupId: string): Promise<LeagueTable> {
  return http.get(`/groups/${groupId}/table`);
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
