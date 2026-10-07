export enum PaymentType {
  PER_SESSION = 'per_session',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually',
}

export enum SessionKind {
  GAME = 'game',
  DUES = 'dues',
}

export enum MemberRole {
  ORGANIZER = 'organizer',
  PLAYER = 'player',
}

export enum SessionStatus {
  UPCOMING = 'upcoming',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PAID = 'paid',
  PENDING = 'pending',
  WAIVED = 'waived',
}

/** What players in a group can see of the kitty: nothing, totals, or totals plus who's paid. */
export type ContributionsVisibility = 'private' | 'totals' | 'names';
export const CONTRIBUTIONS_VISIBILITY: ContributionsVisibility[] = ['private', 'totals', 'names'];

export interface IGroup {
  id: string;
  name: string;
  description?: string;
  location?: string;
  schedule?: string;
  targetPlayers: number;
  feePerPlayer: number;
  paymentType: PaymentType;
  requireRsvp?: boolean;
  kickoffTime?: string | null;
  contributionsVisibility?: ContributionsVisibility;
  inviteCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  createdAt: string;
}

export interface IPlayer {
  id: string;
  firstName: string;
  lastName: string;
  /** Optional contact number. Players sign in with their email. */
  phone?: string | null;
  email?: string | null;
  /** Level the organiser gave them; seeds their skill rating (null = average). */
  level?: PlayerLevel | null;
  createdAt: string;
}

/** How good a player is before they've played here: seeds their skill rating for team balancing. */
export type PlayerLevel = 'beginner' | 'average' | 'good' | 'strong';

export interface ISession {
  id: string;
  groupId: string;
  date: string;
  targetAmount: number;
  collectedAmount: number;
  status: SessionStatus;
  kind?: SessionKind;
  label?: string;
  /** "HH:mm" set for this game; null means the group's kick-off time. */
  kickoffTime?: string | null;
  /** Coloured sides on match day (2–6). */
  teamCount?: number;
  payments?: IPayment[];
}

export interface IPayment {
  id: string;
  sessionId: string;
  playerId: string;
  amount: number;
  status: PaymentStatus;
  paidAt?: string;
  markedBy?: string;
  /** 'dues' on a game's ₦0 entry in a group whose period dues cover games. */
  source?: 'manual' | 'transfer' | 'dues' | null;
  /** On games: paid for this game — their own due, or the period's dues that cover it. */
  gamePaid?: 'paid' | 'unpaid' | 'waived';
  player?: IPlayer;
}

// ── Audit ──

export enum AuditAction {
  PAYMENT_MARKED_PAID = 'payment_marked_paid',
  PAYMENT_WAIVED = 'payment_waived',
  PAYMENT_BULK_MARKED_PAID = 'payment_bulk_marked_paid',
  SESSION_CREATED = 'session_created',
  SESSION_STATUS_CHANGED = 'session_status_changed',
  GROUP_CREATED = 'group_created',
  PLAYER_CREATED = 'player_created',
  MEMBER_ADDED = 'member_added',
  MEMBER_REMOVED = 'member_removed',
}

// ── Recurring Sessions ──

export enum RecurrenceType {
  NONE = 'none',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

// ── Auth & Multi-tenancy ──

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  MEMBER = 'member',
  TREASURER = 'treasurer',
}

export interface IOrganization {
  id: string;
  name: string;
  inviteCode?: string;
  createdAt: string;
}

export interface IUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  bvn?: string | null;
  role: UserRole;
  organizationId: string;
  organization?: IOrganization;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  createdAt: string;
}

export interface IAuthResponse {
  accessToken: string;
  user: IUser;
}

// ── Payouts ──

export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface IOutgoingTransfer {
  id: string;
  groupId: string;
  amount: number;
  fee: number;
  beneficiaryAccount: string;
  beneficiaryName: string;
  beneficiaryBankCode: string;
  beneficiaryBankName: string;
  narration?: string;
  status: PayoutStatus;
  providerReference?: string;
  errorMessage?: string;
  initiatedById?: string;
  initiatedBy?: { firstName: string; lastName: string };
  createdAt: string;
  completedAt?: string;
}

export interface INigerianBank {
  code: string;
  name: string;
}

export interface IGroupBalance {
  totalIn: number;
  totalOut: number;
  available: number;
}

// ── Competitions ──

export enum CompetitionFormat {
  KNOCKOUT = 'knockout',
  LEAGUE = 'league',
}

export enum CompetitionScope {
  NATIONWIDE = 'nationwide',
  STATE = 'state',
  CITY = 'city',
}

export enum CompetitionStatus {
  DRAFT = 'draft',
  REGISTRATION_OPEN = 'registration_open',
  REGISTRATION_CLOSED = 'registration_closed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum CompetitionVisibility {
  PUBLIC = 'public',
  INVITE_ONLY = 'invite_only',
}

export enum MatchStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  WALKOVER = 'walkover',
}

export enum TeamRegistrationStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  WITHDRAWN = 'withdrawn',
  DISQUALIFIED = 'disqualified',
}

export interface ICompetition {
  id: string;
  name: string;
  description?: string;
  format: CompetitionFormat;
  scope: CompetitionScope;
  state?: string;
  city?: string;
  visibility: CompetitionVisibility;
  status: CompetitionStatus;
  entryFee: number;
  maxTeams: number;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  registrationDeadline?: string;
  startDate?: string;
  endDate?: string;
  rules?: string;
  inviteCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  createdByUserId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICompetitionTeam {
  id: string;
  competitionId: string;
  name: string;
  captainName: string;
  captainPhone: string;
  captainEmail?: string;
  registrationStatus: TeamRegistrationStatus;
  paidAt?: string;
  seed?: number;
  paymentRef?: string;
  createdAt: string;
}

export interface ICompetitionMatch {
  id: string;
  competitionId: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeam?: ICompetitionTeam;
  awayTeam?: ICompetitionTeam;
  round: number;
  matchNumber: number;
  scheduledDate?: string;
  scheduledTime?: string;
  venue?: string;
  homeScore?: number;
  awayScore?: number;
  homePenalties?: number;
  awayPenalties?: number;
  winnerId?: string;
  status: MatchStatus;
  notes?: string;
  createdAt: string;
}

export interface ICompetitionStanding {
  position: number;
  teamId: string;
  team: ICompetitionTeam;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
