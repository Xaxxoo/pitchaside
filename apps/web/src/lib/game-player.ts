import { PaymentStatus, type IPayment } from '@pitchaside/shared';
import { formatCurrency } from './api';

/** What's still to pay on a due: the fee, less anything they've already sent towards it. */
export function leftToPay(p: Pick<IPayment, 'amount' | 'paidSoFar'>) {
  return Math.max(0, Number(p.amount) - (p.paidSoFar ?? 0));
}

/** Groups whose weekly, monthly (…) dues cover their games: a game costs nothing extra. */
const PERIODIC = ['weekly', 'monthly', 'quarterly', 'annually'];

export function coveredByDues(game: { kind?: string; group?: { paymentType?: string } | null }, paymentType = game.group?.paymentType) {
  return game.kind !== 'dues' && PERIODIC.includes(paymentType ?? '');
}

/**
 * Where one player stands for one game, in the words every screen uses. Attendance comes first
 * (a player who didn't come owes nothing), then money: paid by transfer, marked paid by hand,
 * played free, or still to pay. In groups whose monthly (weekly…) dues cover games, the game
 * itself costs nothing and the question is whether their dues are paid.
 */
export type PlayerStateKey = 'to_pay' | 'paid' | 'free' | 'no_show' | 'dues_paid' | 'dues_unpaid';

export interface PlayerState {
  key: PlayerStateKey;
  /** Short line under their name: "₦1,500 to pay", "Paid by transfer", "Didn't come". */
  label: string;
  /** Still to collect from them for this game. */
  owes: boolean;
}

export function playerState(p: IPayment, coveredByDues: boolean, before = false): PlayerState {
  const s = stateNow(p, coveredByDues, before);
  // Before the game, everyone listed has said they're in: say so first ("In · paid by transfer").
  return before && s.key !== 'no_show' ? { ...s, label: `In · ${s.label.charAt(0).toLowerCase()}${s.label.slice(1)}` } : s;
}

function stateNow(p: IPayment, coveredByDues: boolean, before: boolean): PlayerState {
  if (p.attendance === 'no_show') return { key: 'no_show', label: 'Didn’t come', owes: false };
  if (coveredByDues) {
    return p.gamePaid === 'paid'
      ? { key: 'dues_paid', label: 'Dues paid', owes: false }
      : p.gamePaid === 'waived'
        ? { key: 'free', label: before ? 'Plays free' : 'Played free', owes: false }
        : { key: 'dues_unpaid', label: 'Dues not paid yet', owes: false };
  }
  if (p.status === PaymentStatus.PAID) {
    // Paid from money they'd sent before (more than a game, or a game called off): paid ahead,
    // not a transfer for this game.
    if (p.source === 'transfer' && p.markedBy === 'credit') return { key: 'paid', label: 'Paid from earlier money', owes: false };
    if (p.source === 'transfer') {
      const label = p.transferAmount && p.transferAmount !== Number(p.amount)
        ? `Paid ${formatCurrency(p.transferAmount)} by transfer`
        : 'Paid by transfer';
      return { key: 'paid', label, owes: false };
    }
    if (p.source === 'cash') return { key: 'paid', label: 'Paid in cash', owes: false };
    return { key: 'paid', label: 'Marked paid', owes: false };
  }
  if (p.status === PaymentStatus.WAIVED) return { key: 'free', label: before ? 'Plays free' : 'Played free', owes: false };
  // Part paid by transfer: what's left, in one line beside Mark paid (what's in shows in their options).
  if (p.paidSoFar) return { key: 'to_pay', label: `${formatCurrency(leftToPay(p))} left to pay`, owes: true };
  // Before the game they've only said they're in: they pay once they've played (or ahead).
  return before
    ? { key: 'to_pay', label: 'Not paid yet', owes: true }
    : { key: 'to_pay', label: `${formatCurrency(Number(p.amount))} to pay`, owes: true };
}

/** The game's money in one place: who's in (no-shows aside), who's paid, who still owes. */
export function gameTally(payments: IPayment[], coveredByDues: boolean, before = false) {
  const states = payments.map((p) => ({ p, s: playerState(p, coveredByDues, before) }));
  const playing = states.filter(({ s }) => s.key !== 'no_show');
  const paid = states.filter(({ s }) => s.key === 'paid' || s.key === 'dues_paid');
  const toPay = states.filter(({ s }) => s.owes);
  const noShows = states.filter(({ s }) => s.key === 'no_show');
  const sum = (xs: { p: IPayment }[]) => xs.reduce((n, { p }) => n + Number(p.amount), 0);
  const left = (xs: { p: IPayment }[]) => xs.reduce((n, { p }) => n + leftToPay(p), 0);
  return {
    states,
    playing: playing.length,
    paid: paid.length,
    paidAmount: sum(paid.filter(({ s }) => s.key === 'paid')),
    toPay: toPay.length,
    toPayAmount: left(toPay),
    noShows: noShows.length,
  };
}

/**
 * Where a game is in its week, which decides what the page leads with and what can be done:
 * before (players saying they're in), today (match day, before kick-off), after (played, not
 * ended), ended, cancelled.
 */
export type GamePhase = 'before' | 'today' | 'after' | 'ended' | 'cancelled';

export function gamePhase(s: { status: string; date: string | Date; kickoffTime?: string | null }, days: number, groupKickoff?: string | null): GamePhase {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'completed') return 'ended';
  if (days > 0) return 'before';
  if (days < 0) return 'after';
  const ko = (s.kickoffTime || groupKickoff || '').slice(0, 5);
  if (!ko) return 'today';
  const [h, m] = ko.split(':').map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m ? 'after' : 'today';
}
