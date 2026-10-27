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
  /** How long each game usually lasts on match day, in minutes; null for the usual 7. */
  gameMinutes?: number | null;
  /** Whether match day shows the game timer; on unless turned off. */
  timerOn?: boolean;

  /** What each side wears and is called; null for the default colours. */
  bibs?: Bibs | null;
  inviteCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  /** 'local' (Nigeria, bank transfers) or 'international' (crypto). */
  scope?: GroupScope;
  /** 'NGN' for local, 'USD' for international. */
  currency?: string;
  createdAt: string;
}

export interface IPlayer {
  id: string;
  firstName: string;
  lastName: string;
  /** What they're called on the pitch; shown on team sheets. */
  nickname?: string | null;
  /** Their photo's key (served at /api/photos/:key); null for none. */
  photoKey?: string | null;
  /** Optional contact number. Players sign in with their email. */
  phone?: string | null;
  email?: string | null;
  /** Level the organiser gave them; seeds their skill rating (null = average). */
  level?: PlayerLevel | null;
  /** Happy in goal, or would rather not, for the match day plan's swaps; null: doesn't mind. */
  keeper?: KeeperPref;
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
  /** When the vote opened (the game was ended); null until then. */
  voteOpensAt?: string | null;
  /** Set when everyone who came had voted: the vote closed early, then. */
  voteClosedAt?: string | null;
}

export interface IPayment {
  id: string;
  sessionId: string;
  playerId: string;
  /** PostgreSQL decimal: may serialize as a string; wrap with `Number()` before arithmetic. */
  amount: number | string;
  status: PaymentStatus;
  paidAt?: string | null;
  markedBy?: string | null;
  /** 'dues' on a game's ₦0 entry in a group whose period dues cover games. */
  source?: 'manual' | 'transfer' | 'dues' | 'cash' | null;
  /** On games: paid for this game — their own due, or the period's dues that cover it. */
  gamePaid?: 'paid' | 'unpaid' | 'waived';
  /** Already sent towards this due by transfer (a part payment); only on a player's oldest unpaid due. */
  paidSoFar?: number;
  /** The actual amount the player sent by transfer, when it differs from the due. */
  transferAmount?: number;
  /** Whether they turned up: not set until the game is ended (counts as came), 'came', or 'no_show'. */
  attendance?: 'came' | 'no_show' | null;
  player?: IPlayer;
}

// ── Audit ──

export enum AuditAction {
  PAYMENT_MARKED_PAID = 'payment_marked_paid',
  PAYMENT_MARKED_UNPAID = 'payment_marked_unpaid',
  PAYMENT_WAIVED = 'payment_waived',
  PAYMENT_NO_SHOW = 'payment_no_show',
  PAYMENT_CAME = 'payment_came',
  PAYMENT_BULK_MARKED_PAID = 'payment_bulk_marked_paid',
  PAYMENT_MOVED = 'payment_moved',
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
  /** Masked (`•••••••4521`): only whether there is one, and its last digits. */
  bvn?: string | null;
  /** Masked like bvn. A BVN or a NIN unlocks a group collection account. */
  nin?: string | null;
  role: UserRole;
  organizationId: string;
  organization?: IOrganization;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  /** Emails when a notification can't reach them (on unless switched off). */
  emailNotices?: boolean;
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

// ── Match-day timer ──

/** A game's length when the group hasn't set one (the API keeps its own copy: DEFAULT_GAME_MINUTES). */
export const DEFAULT_GAME_MINUTES = 7;

/** The match-day clock as every phone gets it. */
export interface GameTimer {
  /** Whether the group uses the timer; off (false), match day doesn't show it. Missing: on. */
  on?: boolean;
  /** Today's game length in minutes: the day's own, else the group's, else 7. */
  minutes: number;
  /** When the running game's clock started (moved on by any pauses); null while it isn't running. */
  startedAt: string | null;
  /** When it was paused; null (or missing, from an older server) while it runs. */
  pausedAt?: string | null;
  /** The server's time when sent, so every phone counts down from the same clock. */
  now: string;
}

// ── Match day plan: the day's games and each side's swaps ──

/** Whether a player wants to go in goal when the swaps come round. Null: they don't mind. */
export type KeeperPref = 'happy' | 'rather_not' | null;

/**
 * How the day is played. `schedule`: everyone plays everyone, games and times fixed in advance.
 * `winner_stays`: a first round of fixed-length games, then first to concede `firstTo` goes off
 * (or the time limit); the app picks who comes on next from each saved result.
 */
export type MatchFormat = 'schedule' | 'winner_stays';

/** How the organiser set up the day. The games and swaps are worked out from it on every phone. */
export interface MatchPlan {
  /** Missing: `schedule` (plans made before winner stays). */
  format?: MatchFormat;
  /** Winner stays: how long each first-round game lasts (winner stays, loser off, whatever the score). */
  firstMinutes?: number;
  /** Winner stays, after the first round: the side that concedes this many goes off. */
  firstTo?: number;
  /** Winner stays: a side that wins twice in a row goes off too. */
  twoAndOff?: boolean;
  /** How long the pitch is booked for, from kick-off. */
  pitchMinutes: number;
  /** How long each game lasts (winner stays: the time limit after the first round). */
  gameMinutes: number;
  /** Players on the pitch per side, keeper included. */
  onPitch: number;
  /** Swap players (and the keeper) every this many minutes; 0: no swaps. */
  swapMinutes: number;
  /** Players who left early: playerId → minutes after kick-off when they went. */
  away?: Record<string, number>;
  /**
   * The draw: a number the organiser rolls with "Shuffle" before kick-off. It mixes which sides
   * start and the order after (winner stays: who's on first and the queue), and who sits out
   * first in each side's swaps. The same number gives the same plan on every phone. Missing:
   * the plain order (Team A v Team B first). Fixed once the first game starts.
   */
  draw?: number;
  /**
   * Who was happy in goal or would rather not when the first score went in (playerId → choice;
   * left out: didn't mind). Kept so a change of mind mid-day can't reshuffle the swaps under way.
   */
  keepers?: Record<string, Exclude<KeeperPref, null>>;
}

// ── Bibs: the colours a group's sides wear, and their names ──

/** Bib colours an organiser can pick. `ink`: dark text reads on it (else white). */
export const BIB_COLOURS = {
  orange: { label: 'Orange', hex: '#ff6a3d', ink: true },
  yellow: { label: 'Yellow', hex: '#ffc93c', ink: true },
  blue: { label: 'Blue', hex: '#3b82f6', ink: false },
  white: { label: 'White', hex: '#ffffff', ink: true },
  green: { label: 'Green', hex: '#2f8f48', ink: false },
  red: { label: 'Red', hex: '#e5484d', ink: false },
  black: { label: 'Black', hex: '#1b201d', ink: false },
  sky: { label: 'Sky blue', hex: '#62c4f0', ink: true },
  navy: { label: 'Navy', hex: '#1f3a8a', ink: false },
  maroon: { label: 'Maroon', hex: '#7c1f2b', ink: false },
  pink: { label: 'Pink', hex: '#f472b6', ink: true },
  purple: { label: 'Purple', hex: '#7c4dde', ink: false },
  grey: { label: 'Grey', hex: '#9aa19c', ink: true },
  lime: { label: 'Lime', hex: '#c8f03c', ink: true },
} as const;
export type BibColour = keyof typeof BIB_COLOURS;
export const BIB_COLOUR_KEYS = Object.keys(BIB_COLOURS) as BibColour[];

/** One side's bib: its colour, and a name the organiser gave it ("Red Devils"), if any. */
export interface TeamBib {
  colour: BibColour;
  name?: string | null;
}
export type BibSides = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
/** A group's (or one game's) bibs, side by side. Sides left out wear the default colour. */
export type Bibs = Partial<Record<BibSides, TeamBib>>;

/** What each side wears when nobody has set bibs. */
export const DEFAULT_BIBS: Record<BibSides, TeamBib> = {
  A: { colour: 'orange' },
  B: { colour: 'yellow' },
  C: { colour: 'blue' },
  D: { colour: 'white' },
  E: { colour: 'green' },
  F: { colour: 'red' },
};

/** Longest team name an organiser can give a side. */
export const TEAM_NAME_MAX = 20;

// ── Crypto / International Groups ──

export type GroupScope = 'local' | 'international';

export interface ICryptoTransfer {
  id: string;
  txHash: string;
  chain: string;
  token: 'USDT' | 'USDC';
  fromAddress?: string;
  toAddress: string;
  amount: number;
  status: 'matched' | 'assigned' | 'unmatched' | 'ignored' | 'other';
  category?: string;
  note?: string;
  player?: IPlayer;
  payment?: IPayment;
  receivedAt: string;
  blockNumber?: number;
  confirmations?: number;
}

export interface IGroupWallet {
  chainFamily: string;
  address: string;
  /** Which specific chains this address works on (e.g. an EVM address works on polygon, base, ethereum…). */
  chains: string[];
}

export interface IUserWallet {
  chainFamily: string;
  address: string;
  /** Which specific chains this address works on (e.g. an EVM address works on polygon, base, ethereum…). */
  chains: string[];
}

export interface IChainInfo {
  id: string;
  name: string;
  family: 'evm' | 'tron' | 'solana';
  tokens: ('USDT' | 'USDC')[];
}

export interface ICryptoOutgoingTransfer {
  id: string;
  groupId: string;
  chain: string;
  token: string;
  amount: number;
  fee: number;
  toAddress: string;
  txHash?: string;
  status: PayoutStatus;
  errorMessage?: string;
  initiatedBy?: { firstName: string; lastName: string };
  refundPlayerId?: string | null;
  category?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * How long a game's vote stays open after the organiser ends it (or until everyone who played
 * has voted). The API keeps its own copy: VOTE_HOURS in ratings.service.
 */
export const VOTE_HOURS = 36;

export * from './phone';
