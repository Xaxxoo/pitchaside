import { http } from './http';
import type { PaginatedResponse } from './api';
import type { UserRole } from '@pitchaside/shared';

/** HQ — the PitchAside team's view across every club (super admins only). */

export interface HqModes {
  bank: 'live' | 'mock';
  messaging: 'live' | 'mock';
  push: boolean;
  /** SMTP is configured, so emails really go out. */
  email: boolean;
  /** What players get when push can't reach them. */
  fallback: 'none' | 'email' | 'whatsapp';
}

export interface HqWeek {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  collected: number;
  newPlayers: number;
  newClubs: number;
  games: number;
}

export interface HqClubRow {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  organisers: number;
  groups: number;
  players: number;
  games: number;
  lastGame: string | null;
  collected: number;
  outstanding: number;
}

export interface HqOverview {
  totals: {
    clubs: number;
    organisers: number;
    groups: number;
    players: number;
    playersWithLogin: number;
    gamesPlayed: number;
    gamesUpcoming: number;
    pushDevices: number;
  };
  money: {
    collected: number;
    outstanding: number;
    collected30d: number;
    collectedPrev30d: number;
    collectedByTransfer: number;
  };
  growth: {
    clubs30d: number;
    clubsPrev30d: number;
    players30d: number;
    playersPrev30d: number;
    games30d: number;
    gamesPrev30d: number;
  };
  weekly: HqWeek[];
  attention: {
    unmatchedTransfers: number;
    unmatchedAmount: number;
    groupsWithoutAccount: number;
    clubsWithoutGroups: number;
    dormantClubs: number;
    overdueAmount: number;
    failedMessages7d: number;
    pushDelivered7d: number;
    pushMissed7d: number;
  };
  topClubs: { id: string; name: string; collected: number }[];
  recentClubs: HqClubRow[];
  modes: HqModes;
}

export interface HqOrganiser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  twoFactorEnabled: boolean;
  createdAt: string;
  clubId?: string;
  clubName?: string;
}

export interface HqActivity {
  id: string;
  action: string;
  entityType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  clubId: string | null;
  clubName: string | null;
  actor: string | null;
}

export interface HqClubDetail {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  createdAt: string;
  players: number;
  collected: number;
  outstanding: number;
  organisers: HqOrganiser[];
  groups: {
    id: string;
    name: string;
    paymentType: string;
    feePerPlayer: number;
    targetPlayers: number;
    accountNumber: string | null;
    bankName: string | null;
    createdAt: string;
    members: number;
    unmatchedTransfers: number;
    collected: number;
    outstanding: number;
  }[];
  sessions: {
    id: string;
    date: string;
    kind: 'game' | 'dues';
    label: string | null;
    status: 'upcoming' | 'completed' | 'cancelled';
    groupName: string;
    targetAmount: number;
    collectedAmount: number;
    paid: number;
    billed: number;
  }[];
  activity: HqActivity[];
}

export interface HqPlayer {
  /** Person key (their email) — one row per person across clubs. */
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  firstSeen: string;
  clubs: string[];
  hasLogin: boolean;
  paid: number;
  owed: number;
}

export type TransferStatus = 'matched' | 'assigned' | 'unmatched' | 'ignored';

export interface HqTransfer {
  id: string;
  amount: number;
  senderName: string | null;
  narration: string | null;
  status: TransferStatus;
  receivedAt: string;
  accountNumber: string;
  groupId: string | null;
  groupName: string | null;
  clubId: string | null;
  clubName: string | null;
}

export interface HqMoney {
  summary: { collected: number; byTransfer: number; byHand: number; outstanding: number; waived: number };
  byStatus: { status: TransferStatus; count: number; amount: number }[];
  transfers: PaginatedResponse<HqTransfer>;
}

export interface HqMessage {
  id: string;
  channel: string;
  kind: string;
  to: string;
  /** 'sent' | 'no_device' | 'failed' | 'mock' */
  status: string;
  error: string | null;
  createdAt: string;
  /** Null for sign-in codes — those are never shown. */
  body: string | null;
  clubId: string | null;
  clubName: string | null;
}

export interface HqMessages {
  modes: HqModes;
  /** Last 7 days. */
  byStatus: { channel: string; status: string; count: number }[];
  messages: PaginatedResponse<HqMessage>;
}

export type ClubSort = 'newest' | 'collected' | 'outstanding' | 'players';

function qs(params: Record<string, string | number | undefined>) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') out.set(key, String(value));
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

export const hq = {
  overview: () => http.get<HqOverview>('/admin/platform/overview'),
  clubs: (p: { page?: number; search?: string; sort?: ClubSort }) =>
    http.get<PaginatedResponse<HqClubRow>>(`/admin/platform/clubs${qs(p)}`),
  club: (id: string) => http.get<HqClubDetail>(`/admin/platform/clubs/${id}`),
  organisers: (p: { page?: number; search?: string }) =>
    http.get<PaginatedResponse<HqOrganiser>>(`/admin/platform/organisers${qs(p)}`),
  players: (p: { page?: number; search?: string }) =>
    http.get<PaginatedResponse<HqPlayer>>(`/admin/platform/players${qs(p)}`),
  money: (p: { page?: number; status?: string }) => http.get<HqMoney>(`/admin/platform/money${qs(p)}`),
  messages: (p: { page?: number; status?: string }) => http.get<HqMessages>(`/admin/platform/messages${qs(p)}`),
  broadcastPush: (input: { title: string; body: string; url?: string }) =>
    http.post<{ audience: number; delivered: number; missed: number }>('/admin/platform/notifications/push', input),
  activity: (p: { page?: number; limit?: number }) =>
    http.get<PaginatedResponse<HqActivity>>(`/admin/platform/activity${qs(p)}`),
};

// ── Formatting ──

/** "12 Mar" / "12 Mar 2025" (year only when it isn't this year). */
export function shortDay(value: string) {
  // Date-only strings are calendar days, not instants — keep them out of UTC.
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function dayTime(value: string) {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** ₦1.2M / ₦45K / ₦900 — for tiles and axis ticks; tables use the full figure. */
export function compactNaira(amount: number) {
  return `₦${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)}`;
}

const actionLabels: Record<string, string> = {
  payment_marked_paid: 'Marked a payment paid',
  payment_waived: 'Waived a payment',
  payment_bulk_marked_paid: 'Marked several payments paid',
  session_created: 'Created a session',
  session_status_changed: 'Changed a session status',
  group_created: 'Created a group',
  player_created: 'Added a player',
  member_added: 'Added a player to a group',
  member_removed: 'Removed a player from a group',
};

export function actionLabel(action: string) {
  return actionLabels[action] ?? action.replace(/_/g, ' ');
}
