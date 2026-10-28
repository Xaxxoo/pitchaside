'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { QRCodeCanvas } from 'qrcode.react';
import { PaymentStatus, PaymentType } from '@pitchaside/shared';
import {
  formatCurrency,
  getGroupBalance,
  getGroupBilling,
  getGroupTransfers,
  getRsvpBoard,
  getSession,
  sendReminders,
  remindToVote,
  updateSessionStatus,
  type BankTransfer,
  type GroupBalance,
  type GroupBilling,
  type IGroupWithMembers,
  type ISessionWithDetails,
  type RsvpBoard,
  type SessionVoting,
} from '@/lib/api';
import { gameInviteMessage, openWhatsApp } from '@/lib/whatsapp';
import { WhatsAppGlyph } from '@/components/game/group-message-sheet';
import { isVotingOpen } from '@/lib/game-status';
import { formatAccountNumber, frequencyShort, paymentShareText } from '@/lib/billing';
import { CountUp, CountUpNaira, LiveDot, stagger } from '@/components/motion';
import { Collapse, CollapseButton, useRemembered } from '@/components/collapse';
import { Sheet } from '@/components/sheet';
import { TransfersSheet, transferName } from '@/components/home/transfers-sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { EndGameSheet } from '@/components/game/end-game-sheet';
import { coveredByDues, leftToPay } from '@/lib/game-player';
import { useToast } from '@/components/toast';
import { prettyTime } from '@/components/player-ui';
import { moneyHref } from '@/lib/money-href';
import { Ticket } from '@/components/ticket';
import { FaceStack, PeopleRow, namesLine, type Face } from '@/components/people-row';

// ── Dates ──

/** Today as YYYY-MM-DD in the browser's time zone. */
export function localToday() {
  return new Date().toLocaleDateString('en-CA');
}

/** A game's date as a local calendar day (the API sends YYYY-MM-DD; parsing that as UTC can slip a day). */
export function gameDay(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from today to the game: 0 today, -1 yesterday. */
export function daysFromToday(iso: string) {
  const t = gameDay(localToday().slice(0, 10)).getTime();
  return Math.round((gameDay(iso).getTime() - t) / 86_400_000);
}

/** Where the week is for a game: collecting, playing, or settling up and voting. */
export type GamePhase = 'before' | 'matchday' | 'after';

export function phaseOf(game: ISessionWithDetails): GamePhase {
  const days = daysFromToday(game.date);
  if (game.status === 'completed' || days < 0) return 'after';
  return days === 0 ? 'matchday' : 'before';
}

/**
 * The game the home card is about, by these rules, in order:
 * 1. A game on today, or the next game when it's tomorrow.
 * 2. The last game while it still needs the organiser: played but not ended (up to a week back),
 *    or ended with its vote still open.
 * 3. Otherwise the next game. Once the last game is ended and its vote has closed, it's done:
 *    it moves to Games › Played and the card moves on.
 */
export function featuredGame(sessions: ISessionWithDetails[], groupId: string) {
  const games = sessions.filter((s) => s.groupId === groupId && s.kind !== 'dues' && s.status !== 'cancelled');
  const next = games
    .filter((s) => s.status === 'upcoming' && daysFromToday(s.date) >= 0)
    .sort((a, b) => gameDay(a.date).getTime() - gameDay(b.date).getTime())[0];
  if (next && daysFromToday(next.date) <= 1) return next;
  const recent = games
    .filter((s) => {
      const d = daysFromToday(s.date);
      return d < 0 && (s.status !== 'completed' ? d >= -VOTE_DAYS : isVotingOpen(s));
    })
    .sort((a, b) => gameDay(b.date).getTime() - gameDay(a.date).getTime())[0];
  return recent ?? next;
}

/** A game nobody has ended stays on the card for a week, so the organiser is reminded to end it. */
const VOTE_DAYS = 7;

function ago(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Re-renders every `ms` so "2m ago" labels stay true. */
function useNow(ms = 20_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ── Payments for a game ──

/** gamePaid covers groups whose monthly (weekly…) dues pay for games; otherwise the game's own due. */
export function gameStatusOf(p: { status: string; gamePaid?: string }) {
  if (!p.gamePaid) return p.status;
  return p.gamePaid === 'paid' ? PaymentStatus.PAID : p.gamePaid === 'waived' ? PaymentStatus.WAIVED : PaymentStatus.PENDING;
}

export function gameMoney(game: ISessionWithDetails) {
  // Players who said they were in and didn't come aren't part of the game's money.
  const payments = (game.payments ?? []).filter((p) => p.attendance !== 'no_show');
  const paid = payments.filter((p) => gameStatusOf(p) === PaymentStatus.PAID);
  const owing = payments.filter((p) => gameStatusOf(p) === PaymentStatus.PENDING);
  // Marked paid by hand on the game page; we can't tell whether that was cash, so we don't say cash.
  const byHand = paid.filter((p) => p.source === 'manual' || p.source === 'cash' || p.source === 'receipt').reduce((sum, p) => sum + Number(p.amount), 0);
  const coveredByDues = Number(game.targetAmount) === 0 && payments.length > 0;
  return { payments, paid, owing, byHand, coveredByDues };
}

// ── Live data for the card ──

/**
 * The group's balance, latest transfers and this week's game, refreshed every 20s while
 * the page is on screen, so an organiser at the pitch sees money land without pulling.
 */
export function useGroupMoney(groupId: string | null, gameId: string | null) {
  const [balance, setBalance] = useState<GroupBalance | null>(null);
  const [billing, setBilling] = useState<GroupBilling | null>(null);
  const [transfers, setTransfers] = useState<BankTransfer[] | null>(null);
  const [game, setGame] = useState<ISessionWithDetails | null>(null);
  const [rsvp, setRsvp] = useState<RsvpBoard | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // The balance call failed and there's nothing true to show yet.
  const [balanceFailed, setBalanceFailed] = useState(false);
  // The payments list failed and there's nothing true to show yet.
  const [transfersFailed, setTransfersFailed] = useState(false);
  // Which group/game the screen is on now; answers for an earlier one are dropped.
  const current = useRef('');
  current.current = `${groupId}|${gameId}`;

  const load = useCallback(async () => {
    if (!groupId) return;
    const key = `${groupId}|${gameId}`;
    const [b, bill, t, g, r] = await Promise.allSettled([
      getGroupBalance(groupId),
      getGroupBilling(groupId),
      getGroupTransfers(groupId),
      gameId ? getSession(gameId) : Promise.resolve(null),
      gameId ? getRsvpBoard(gameId) : Promise.resolve(null),
    ]);
    if (current.current !== key) return;
    if (b.status === 'fulfilled') setBalance(b.value);
    setBalanceFailed(b.status === 'rejected');
    setTransfersFailed(t.status === 'rejected');
    if (bill.status === 'fulfilled') setBilling(bill.value);
    if (g.status === 'fulfilled') setGame(g.value);
    if (r.status === 'fulfilled') setRsvp(r.value);
    if (t.status === 'fulfilled') setTransfers(t.value);
    // Only claim "updated" when the money itself came back.
    if (b.status === 'fulfilled') setUpdatedAt(Date.now());
  }, [groupId, gameId]);

  // New group or game: start clean so the last group's money never shows under this one's name.
  useEffect(() => {
    setBalance(null);
    setBilling(null);
    setTransfers(null);
    setGame(null);
    setRsvp(null);
    setUpdatedAt(null);
    setBalanceFailed(false);
    setTransfersFailed(false);
  }, [groupId, gameId]);

  useEffect(() => {
    if (!groupId) return;
    load();
    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [groupId, load]);

  return { balance, billing, transfers, game, rsvp, updatedAt, balanceFailed, transfersFailed, reload: load, setBilling };
}

// ── Pieces ──

const EyeIcon = ({ off }: { off: boolean }) => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    {off ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    ) : (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </>
    )}
  </svg>
);

const HIDE_KEY = 'pitchaside_hide_balance';

/** Remembered per phone: organisers often check the balance with players looking over their shoulder. */
/** Remembered per phone: organisers often check the balance with players looking over their shoulder. */
function useHiddenBalance() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === '1');
    } catch {
      // Private mode or blocked storage: just show it.
    }
  }, []);
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1');
      } catch {
        // Not remembered, still toggles for now.
      }
      return !h;
    });
  return [hidden, toggle] as const;
}


// ── The card ──

/**
 * The group's account, at the top of Money: the balance (it ticks over when a transfer lands),
 * money in today, in all and how many transfers, and the account number to share.
 */
export function MoneyCard({
  group,
  money,
  onOpenAccount,
}: {
  group: IGroupWithMembers;
  money: ReturnType<typeof useGroupMoney>;
  /** Opens the full account details: share text, QR, group link. */
  onOpenAccount: () => void;
}) {
  const toast = useToast();
  const now = useNow();
  const [hidden, toggleHidden] = useHiddenBalance();
  const { balance, billing, transfers, updatedAt, balanceFailed } = money;

  const recent = (transfers ?? [])
    .filter((t) => t.status !== 'ignored')
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const unknown = recent.filter((t) => t.status === 'unmatched');
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null);
  // Payments with no name are sorted out on the group's Money tab: the list of them, or one in the picker.
  const unnamedHref = moneyHref(group.id, { unnamed: true });
  const account = billing?.account ?? null;
  const [accountOpen, toggleAccount] = useRemembered('pitchaside_home_account_open', true);
  const accountId = useId();
  const [refreshing, setRefreshing] = useState(false);
  // Money in today (by this phone's clock) and how many transfers there are. The list holds the
  // latest 200, so past that the count says "200+" rather than a wrong number.
  const today = localToday();
  const todayIn = recent.filter((t) => localDay(t.receivedAt) === today).reduce((sum, t) => sum + Number(t.amount), 0);
  const transfersCount = (transfers?.length ?? 0) >= 200 ? '200+' : String(recent.length);

  async function refresh() {
    setRefreshing(true);
    try {
      await money.reload();
    } finally {
      setRefreshing(false);
    }
  }
  const [copiedNumber, setCopiedNumber] = useState(false);
  const copyNumber = (n: string) =>
    navigator.clipboard.writeText(n).then(
      () => {
        setCopiedNumber(true);
        window.setTimeout(() => setCopiedNumber(false), 1800);
        toast.success('Account number copied');
      },
      () => toast.error('Could not copy. Press and hold the number to copy it instead.'),
    );
  const hasAccount = billing ? !!billing.account : !!group.accountNumber;

  const cardCls = 'relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift';
  return (
    <>
    <section aria-label={`${group.name} account`} className={cardCls}>
      <div className="absolute inset-0 turf-stripes-soft" />
      <div className="relative p-5">
        {/* The account: whose money, refresh, fold */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">Account</p>
            <p className="text-sm font-semibold text-white truncate">{group.name}</p>
          </div>
          {hasAccount && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={refresh}
              disabled={refreshing}
              aria-label={refreshing ? 'Refreshing' : 'Refresh balance and transfers'}
              className="press w-11 h-11 -my-2 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-100 transition-colors"
            >
              <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <RefreshIcon spinning={refreshing} />
              </span>
            </button>
            <CollapseButton open={accountOpen} onClick={toggleAccount} controls={accountId} label="account" onDark />
          </div>
          )}
        </div>

        {/* No bank account yet: say so plainly instead of showing a ₦0 balance */}
        {!hasAccount && (
          <div className="mt-4 rounded-2xl bg-white/[0.06] p-4">
            <p className="text-sm font-bold text-white">No bank account yet</p>
            <p className="mt-1 text-[13px] text-white/70 leading-snug">
              Set one up so players can pay by transfer and see their payments matched automatically.
            </p>
            <Link
              href={moneyHref(group.id)}
              className="press mt-3 inline-flex items-center justify-center h-11 px-4 rounded-xl bg-volt-400 text-sm font-bold text-ink hover:bg-volt-300 transition-colors"
            >
              Set up account
            </Link>
          </div>
        )}

        {/* Folded: the figure that matters, and anything that needs them */}
        {hasAccount && !accountOpen && (
          <FoldedSummary
            onExpand={toggleAccount}
            value={balance == null ? '₦…' : hidden ? '₦••••••' : formatCurrency(Number(balance.available))}
            valueTone="text-volt-300"
            caption={todayIn > 0 && !hidden ? `Account balance · ${formatCurrency(todayIn)} received today` : 'Account balance'}
            action={
              unknown.length > 0
                ? { label: `${unknown.length} payment${unknown.length === 1 ? '' : 's'} with no name`, href: unnamedHref }
                : null
            }
          />
        )}

        {hasAccount && (
        <Collapse open={accountOpen} id={accountId}>
        {/* The balance: the number organisers check */}
        <div className="mt-3 flex items-center gap-1">
          <p className="text-xs font-semibold text-white/70">Account balance</p>
          <button
            onClick={toggleHidden}
            aria-pressed={hidden}
            aria-label="Hide balance"
            className="w-11 h-11 -my-3 -ml-1.5 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
          >
            <EyeIcon off={hidden} />
          </button>
        </div>
        {balance == null && balanceFailed ? (
          <div className="mt-1.5 flex items-center gap-3">
            <p className="text-sm font-semibold text-white/80">Couldn&apos;t load the balance.</p>
            <button
              onClick={refresh}
              className="shrink-0 h-11 px-3.5 rounded-full bg-white/10 text-[13px] font-bold text-white hover:bg-white/15 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className={`font-display text-[44px] leading-none font-extrabold text-volt-300 mt-1 transition-opacity ${refreshing ? 'opacity-60' : ''}`} aria-hidden>
            {balance == null ? (
              <span className="inline-block h-10 w-44 rounded-xl bg-white/10 animate-pulse align-middle" />
            ) : hidden ? (
              <span className="tracking-[0.08em]">₦••••••</span>
            ) : (
              <CountUpNaira value={Number(balance.available)} />
            )}
          </p>
        )}
        {/* What screen readers hear: the settled amount once, not every tick of the count-up. */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {balanceFailed && balance == null
            ? ''
            : balance == null
              ? 'Loading balance'
              : hidden
                ? 'Balance hidden'
                : `${formatCurrency(Number(balance.available))} in the account`}
        </p>
        {balanceFailed && balance != null ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-sun-400">
            Not up to date · couldn&apos;t refresh
            <button onClick={refresh} className="underline underline-offset-2 min-h-8">
              Try again
            </button>
          </p>
        ) : updatedAt ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/65">
            <LiveDot />
            {refreshing
              ? 'Refreshing…'
              : `Updated ${now - updatedAt < 60_000 ? 'just now' : ago(new Date(updatedAt).toISOString(), now).toLowerCase()}`}
          </p>
        ) : null}

        {/* Money in at a glance: today, ever, how many. Each opens the list behind it. */}
        {hasAccount && balance && transfers && (
          <div className="mt-4 grid grid-cols-[1fr_1fr_auto] rounded-2xl bg-white/[0.06] divide-x divide-white/[0.08]">
            {[
              { label: 'Today', value: hidden ? '₦•••' : todayIn ? `+${formatCurrency(todayIn)}` : formatCurrency(0), today: true },
              { label: 'Total received', value: hidden ? '₦•••' : formatCurrency(Number(balance.totalIn)) },
              { label: 'Transfers in', value: transfersCount },
            ].map((f: { label: string; value: string; today?: boolean }, i) => (
              <button
                key={f.label}
                onClick={() => setSheet({ id: null })}
                style={stagger(i, 60, 100)}
                className={`press animate-rise min-w-0 flex flex-col justify-start px-2.5 py-2.5 text-left hover:bg-white/[0.05] first:rounded-l-2xl last:rounded-r-2xl transition-colors ${
                  f.today && todayIn > 0 ? 'bg-volt-400/[0.08]' : ''
                }`}
              >
                <span
                  className={`block text-[14px] font-bold tabular-nums tracking-tight whitespace-nowrap ${
                    f.today && todayIn > 0 ? 'text-volt-300' : 'text-white/90'
                  }`}
                >
                  {f.value}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold leading-tight text-white/65 whitespace-nowrap">
                  {f.today && todayIn > 0 && <LiveDot />}
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Where players pay: the number is the one thing to read, copy sits right on it; sharing is a quieter row below */}
        {account && (
          <div className="mt-3 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-3.5 pt-2.5 pb-3">
              <p className="text-[11px] font-bold text-white/60">Players pay into</p>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="font-display text-[22px] leading-tight font-extrabold tracking-[0.04em] tabular-nums text-white select-all">
                  {formatAccountNumber(account.accountNumber)}
                </span>
                <button
                  onClick={() => copyNumber(account.accountNumber)}
                  aria-label={copiedNumber ? 'Account number copied' : 'Copy account number'}
                  className="press -my-1.5 w-11 h-11 shrink-0 rounded-xl text-white/80 flex items-center justify-center hover:bg-white/10 hover:text-white transition-colors"
                >
                  {copiedNumber ? <TickSmall /> : <CopySmall />}
                </button>
              </div>
              <p className="text-[13px] font-semibold text-white/80 truncate">{account.bankName}</p>
              <p className="text-[12px] text-white/60 truncate">{account.accountName}</p>
            </div>
            <button
              onClick={onOpenAccount}
              className="press w-full min-h-11 flex items-center justify-between gap-2 px-3.5 border-t border-white/10 text-[13px] font-bold text-volt-300 hover:bg-white/5 transition-colors"
            >
              Share account details
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}

        </Collapse>
        )}
        {sheet && transfers && (
          <TransfersSheet transfers={transfers} groupId={group.id} hidden={hidden} openId={sheet.id} onClose={() => setSheet(null)} />
        )}

      </div>
    </section>

    </>
  );
}

/**
 * Home's account strip: the balance, what came in today, payments still needing a name, and
 * Withdraw. Everything else about the money (the account number, every transfer) is on Money.
 */
export function AccountStrip({
  group,
  money,
  canManage,
}: {
  group: IGroupWithMembers;
  money: ReturnType<typeof useGroupMoney>;
  canManage: boolean;
}) {
  const [hidden, toggleHidden] = useHiddenBalance();
  const { balance, billing, transfers, balanceFailed } = money;
  const hasAccount = billing ? !!billing.account : !!group.accountNumber;
  const received = (transfers ?? []).filter((t) => t.status !== 'ignored');
  const today = localToday();
  const todayIn = received.filter((t) => localDay(t.receivedAt) === today).reduce((sum, t) => sum + Number(t.amount), 0);
  const unnamed = billing?.unmatchedTransfers ?? received.filter((t) => t.status === 'unmatched').length;
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const account = billing?.account ?? null;
  const copyNumber = (n: string) =>
    navigator.clipboard.writeText(n).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
        toast.success('Account number copied');
      },
      () => toast.error('Could not copy. Press and hold the number to copy it instead.'),
    );

  return (
    <section aria-label={`${group.name} account`} className="relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
      <div className="absolute inset-0 turf-stripes-soft" />
      <div className="relative px-5 pt-4 pb-4">
        {!hasAccount ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">No bank account yet</p>
              <p className="mt-0.5 text-[13px] leading-snug text-white/70">Set one up so players can pay by transfer.</p>
            </div>
            <Link
              href={moneyHref(group.id)}
              className="press shrink-0 inline-flex items-center justify-center h-11 px-4 rounded-xl bg-volt-400 text-sm font-bold text-ink hover:bg-volt-300 transition-colors"
            >
              Set up
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {/* The balance below is the link; one is enough */}
              <span className="text-xs font-semibold text-white/70">Account balance</span>
              <button
                onClick={toggleHidden}
                aria-pressed={hidden}
                aria-label="Hide balance"
                className="w-11 h-11 -my-3 -ml-1 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
              >
                <EyeIcon off={hidden} />
              </button>
            </div>
            {balance == null && balanceFailed ? (
              <div className="mt-1 flex items-center gap-3">
                <p className="text-sm font-semibold text-white/80">Couldn&apos;t load the balance.</p>
                <button onClick={() => money.reload()} className="shrink-0 h-11 px-3.5 rounded-full bg-white/10 text-[13px] font-bold text-white hover:bg-white/15">
                  Try again
                </button>
              </div>
            ) : (
              <Link
                href={moneyHref(group.id)}
                className="group mt-0.5 flex items-center justify-between gap-2 font-display text-[36px] leading-none font-extrabold text-volt-300 tabular-nums"
                aria-label="Open Money: payments in and withdrawals"
              >
                {balance == null ? (
                  <span className="inline-block h-9 w-40 rounded-xl bg-white/10 animate-pulse align-middle" />
                ) : hidden ? (
                  <span className="tracking-[0.08em]">₦••••••</span>
                ) : (
                  <CountUpNaira value={Number(balance.available)} />
                )}
                {/* Says the card opens Money, without another button */}
                <span className="shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80 group-hover:bg-white/15" aria-hidden>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </span>
              </Link>
            )}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {balance == null ? (balanceFailed ? '' : 'Loading balance') : hidden ? 'Balance hidden' : `${formatCurrency(Number(balance.available))} in the account`}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className={`flex items-center gap-1.5 text-[13px] font-semibold tabular-nums ${todayIn > 0 ? 'text-volt-300' : 'text-white/70'}`}>
                {todayIn > 0 && <LiveDot />}
                {transfers == null ? '\u00a0' : hidden ? 'Today ₦•••' : todayIn > 0 ? `+${formatCurrency(todayIn)} today` : 'Nothing in today'}
              </p>
              {canManage && (
                <Link
                  href={moneyHref(group.id, { view: 'payouts' })}
                  className="press shrink-0 inline-flex items-center h-11 px-4 -my-1 rounded-xl border border-white/15 text-[13px] font-bold text-white hover:bg-white/10 transition-colors"
                >
                  Withdraw
                </Link>
              )}
            </div>
            {/* The account players pay into: bank, number, copy */}
            {account && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 ring-1 ring-white/10 pl-3 pr-1 min-h-11">
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/70">
                  {account.bankName.replace(/ Microfinance Bank$/, ' MFB')}
                  <span className="mx-1.5 text-white/30" aria-hidden>
                    ·
                  </span>
                  <span className="font-bold text-white tabular-nums tracking-wide">{formatAccountNumber(account.accountNumber)}</span>
                </span>
                <button
                  onClick={() => copyNumber(account.accountNumber)}
                  aria-label={copied ? 'Account number copied' : `Copy account number ${account.accountNumber}`}
                  className="press shrink-0 w-11 h-11 -my-0.5 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10"
                >
                  {copied ? (
                    <svg className="w-4 h-4 text-volt-300 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </>
        )}
        {unnamed > 0 && (
          <Link
            href={moneyHref(group.id, { unnamed: true })}
            className="press mt-3 w-full flex items-center gap-2 min-h-11 px-3 rounded-xl bg-sun-400/15 text-[13px] font-bold text-sun-400 hover:bg-sun-400/25 transition-colors"
          >
            <LiveDot className="bg-sun-400" />
            <span className="flex-1 min-w-0 truncate">
              {unnamed} payment{unnamed === 1 ? '' : 's'} with no name yet
            </span>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * This week's game, on Home: it changes with the week (before, match day, after) and always has
 * the one thing to do next. With no game, it offers to schedule one.
 */
export function GameCard({
  group,
  money,
  gameFallback,
  canManage,
  onScheduleGame,
  onGameEnded,
  vote,
  next,
  className = '',
}: {
  group: IGroupWithMembers;
  money: ReturnType<typeof useGroupMoney>;
  /** The game as the list endpoint returned it, shown until the live copy arrives. */
  gameFallback: ISessionWithDetails | null;
  canManage: boolean;
  onScheduleGame: () => void;
  /** Called once a game is ended from the card, so the page can update its copy. */
  onGameEnded?: (gameId: string) => void;
  /** The game's vote, if it has one. */
  vote?: SessionVoting | null;
  /** The group's next game, when the card is still on the last one (settling up or voting). */
  next?: ISessionWithDetails | null;
  className?: string;
}) {
  const toast = useToast();
  const [reminding, setReminding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [gameOpen, toggleGame] = useRemembered('pitchaside_home_game_open', true);
  const { rsvp } = money;
  const game = money.game ?? gameFallback;

  async function remind() {
    if (!game) return;
    setReminding(true);
    try {
      const result = await sendReminders(game.id);
      toast.success(
        result.missed
          ? `Reminder pushed to ${result.sent} — ${result.missed} don't have notifications on yet`
          : `Reminder pushed to ${result.sent} player${result.sent === 1 ? '' : 's'}`,
      );
    } catch {
      toast.error('Reminders didn’t send. Check your connection and try again.');
    } finally {
      setReminding(false);
    }
  }

  const kickoffOf = (g: ISessionWithDetails) => g.kickoffTime || group.kickoffTime;
  const showNext = !!(next && game && next.id !== game.id);
  // The stub: the next game while this one is still being settled or voted on; otherwise where
  // it's played and what a place costs, as on a ticket.
  const venue = [group.location, group.paymentType === PaymentType.PER_SESSION ? `${formatCurrency(Number(group.feePerPlayer))} a player` : null]
    .filter(Boolean)
    .join(' · ');
  const stub = !game ? null : showNext ? (
    <Link
      href={`/sessions/${next!.id}`}
      aria-label={`Next game, ${gameDay(next!.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}: ${formatCurrency(Number(next!.collectedAmount))} paid so far`}
      className="press flex items-center gap-3 h-[52px] px-5 hover:bg-white/[0.04] transition-colors"
    >
      <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-white/85">
        <span className="text-white/65">Next · </span>
        {gameDay(next!.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}
        {kickoffOf(next!) && ` · ${prettyTime(kickoffOf(next!)!)}`}
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-white/65">{formatCurrency(Number(next!.collectedAmount))} paid</span>
      <svg className="w-3.5 h-3.5 shrink-0 text-white/45" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  ) : venue ? (
    <p className="flex items-center h-[52px] px-5 text-[13px] font-semibold text-white/75 truncate">{venue}</p>
  ) : null;

  return (
    <Ticket
      aria-label="This week's game"
      className={className}
      bodyClassName="rounded-[28px] text-white bg-[linear-gradient(160deg,#134927_0%,#10301d_42%,#0f1a14_100%)]"
      stub={stub}
    >
      <div className="absolute inset-0 turf-stripes-soft" />
      <div className="relative p-5">
        {game ? (
          <GameSection
            game={game}
            rsvp={rsvp}
            canManage={canManage}
            reminding={reminding}
            onRemind={remind}
            onEnd={() => setConfirmEnd(true)}
            open={gameOpen}
            onToggle={toggleGame}
            vote={vote}
            inviteLink={money.billing?.link}
            groupName={group.name}
            where={group.location}
          />
        ) : (
          <div>
            <p className="font-display text-xl font-extrabold leading-tight">No game this week</p>
            <p className="text-sm text-white/70 mt-1">
              {group.requireRsvp
                ? 'Schedule one and players can say they’re in. They pay once they’ve played.'
                : 'Schedule one and everyone in the group is on it.'}
            </p>
            {canManage && (
              <button
                onClick={onScheduleGame}
                className="mt-4 w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-volt-400 text-ink text-[15px] font-extrabold hover:bg-volt-300 transition-colors"
              >
                <PlusIcon />
                Schedule a game
              </button>
            )}
          </div>
        )}
      </div>
      {confirmEnd && game && (
        <EndGameSheet
          session={game}
          coveredByDues={coveredByDues(game, group.paymentType)}
          onClose={() => setConfirmEnd(false)}
          onEnded={() => {
            setConfirmEnd(false);
            onGameEnded?.(game.id);
            money.reload();
          }}
        />
      )}
    </Ticket>
  );
}

export const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

function GameSection({
  game,
  rsvp,
  canManage,
  reminding,
  onRemind,
  onEnd,
  open,
  onToggle,
  vote,
  inviteLink,
  groupName,
  where,
}: {
  /** The group's join link: with it the game can be shared on WhatsApp from here. */
  inviteLink?: string;
  groupName: string;
  where?: string | null;
  game: ISessionWithDetails;
  rsvp: RsvpBoard | null;
  canManage: boolean;
  reminding: boolean;
  onRemind: () => void;
  onEnd: () => void;
  open: boolean;
  onToggle: () => void;
  /** This game's vote, when the page has it: open or closed, and how many have voted. */
  vote?: SessionVoting | null;
}) {
  const bodyId = useId();
  const phase = phaseOf(game);
  const days = daysFromToday(game.date);
  const { payments, paid, owing, byHand, coveredByDues } = gameMoney(game);
  const target = Number(game.targetAmount);
  const collected = Number(game.collectedAmount);
  const byTransfer = Math.max(0, collected - byHand);
  // Before the game the bar runs to the full-squad target; once it's played, empty spots can't fill,
  // so it runs to what the players who were in actually owed.
  const pct = (n: number) => (scale > 0 ? Math.min(100, (n / scale) * 100) : 0);
  const duesPct = payments.length ? (paid.length / payments.length) * 100 : 0;
  const kickoff = game.kickoffTime || game.group?.kickoffTime;
  const when = gameDay(game.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const heading = phase === 'matchday' ? 'Match day' : phase === 'after' ? (days === -1 ? "Yesterday's game" : 'Last game') : 'Next game';
  // One word or two for where the game is: before, on the day, waiting to be ended, voting, done.
  const voteOn = !!vote?.open;
  const status: { text: string; tone: 'live' | 'warn' | 'calm'; dot: boolean } =
    days === 0
      ? { text: 'Today', tone: 'live', dot: true }
      : days > 0
        ? { text: days === 1 ? 'Tomorrow' : `In ${days} days`, tone: 'calm', dot: false }
        : game.status !== 'completed'
          ? { text: 'Not ended', tone: 'warn', dot: true }
          : voteOn
            ? { text: `Voting · ${vote!.ballots}/${vote!.squadSize}`, tone: 'live', dot: true }
            : { text: 'Final', tone: 'calm', dot: false };
  const gameHref = `/sessions/${game.id}`;
  const notEnded = phase === 'after' && game.status !== 'completed';

  // Where the game's money stands, kept apart so nobody has to do the sums: paid, owed by
  // players who've confirmed, and spots nobody has taken yet. The target is spots × fee
  // (gameTarget on the server), so the open spots aren't owed by anyone.
  const fee = Number(game.group?.feePerPlayer ?? 0);
  const owedAmount = owing.reduce((sum, p) => sum + leftToPay(p), 0);
  const capacity = rsvp?.requireRsvp ? rsvp.capacity : Number(game.group?.targetPlayers ?? 0);
  const taken = rsvp?.requireRsvp ? rsvp.in.length : payments.length;
  const openSpots = Math.max(0, capacity - taken);
  const openAmount = Math.max(0, target - collected - owedAmount);
  const played = phase === 'after';
  const dueTotal = collected + owedAmount;
  const scale = played ? dueTotal : target;
  const upcoming = phase === 'before';
  const rows = [
    {
      key: 'paid',
      dot: 'bg-volt-400',
      label: paid.length ? `${formatCurrency(collected)} paid by ${paid.length}` : 'Nobody has paid yet',
      href: `${gameHref}?tab=payments`,
    },
    // Before the game it's simply due; once it's been played, it's owed.
    owing.length
      ? {
          key: 'owed',
          dot: 'bg-sun-400',
          label: upcoming ? `${formatCurrency(owedAmount)} due from ${owing.length}` : `${formatCurrency(owedAmount)} still owed by ${owing.length}`,
          href: `${gameHref}?tab=payments`,
        }
      : null,
    // Places still free are in the headline ("17 of 28 in") and on the game page, not a row here.
  ].filter(Boolean) as { key: string; dot: string; label: string; href: string }[];

  return (
    <div>
      <div className="flex items-center gap-2">
      <Link href={gameHref} className="group flex-1 min-w-0 -mx-1 px-1 py-0.5 rounded-xl">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">{heading}</span>
        <span className="mt-1 flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white leading-tight truncate group-hover:text-volt-300 transition-colors">
            {when}
            {kickoff ? ` · ${prettyTime(kickoff)}` : ''}
          </span>
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-bold whitespace-nowrap animate-pop-in ${
              status.tone === 'live' ? 'bg-volt-400/15 text-volt-300' : status.tone === 'warn' ? 'bg-sun-400/15 text-sun-400' : 'bg-white/[0.08] text-white/75'
            }`}
          >
            {status.dot && <LiveDot className={status.tone === 'warn' ? 'bg-sun-400' : 'bg-volt-400'} />}
            {status.text}
          </span>
        </span>
      </Link>
      <CollapseButton open={open} onClick={onToggle} controls={bodyId} label="game details" onDark />
      </div>

      {/* Folded: money against target, and who still owes as a shortcut */}
      {!open && (
        <FoldedSummary
          onExpand={onToggle}
          value={
            coveredByDues ? `${paid.length}/${payments.length}` : upcoming && capacity > 0 ? `${taken} of ${capacity} in` : formatCurrency(collected)
          }
          valueTone="text-white"
          caption={
            coveredByDues
              ? 'paid their dues'
              : upcoming
                ? `${formatCurrency(collected)} collected${owedAmount ? ` · ${formatCurrency(owedAmount)} due` : ''}${openSpots ? ` · ${openSpots} places free` : ''}`
                : owedAmount
                  ? `collected · ${formatCurrency(owedAmount)} still owed`
                  : 'collected · everyone has paid'
          }
          action={null}
        />
      )}

      <Collapse open={open} id={bodyId}>

      {/* Collected so far, then one bar split into paid / owed / open */}
      <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
        {coveredByDues ? (
          <>
            <span className="font-display text-[28px] font-extrabold tabular-nums leading-none">{paid.length}</span>
            <span className="text-sm text-white/70 tabular-nums">of {payments.length} paid their dues</span>
          </>
        ) : upcoming && capacity > 0 ? (
          <>
            <CountUp value={taken} className="font-display text-[28px] font-extrabold leading-none" />
            <span className="text-sm text-white/70 tabular-nums">of {capacity} in · {formatCurrency(collected)} collected</span>
          </>
        ) : (
          <>
            <CountUpNaira value={collected} className="font-display text-[28px] font-extrabold leading-none" />
            <span className="text-sm text-white/70 tabular-nums">
              collected of {formatCurrency(played ? dueTotal : target)}
              {played ? ' due' : ''}
            </span>
          </>
        )}
      </div>
      <div
        className="mt-3 relative h-2.5 w-full rounded-full bg-white/12 overflow-hidden"
        role="img"
        aria-label={
          coveredByDues
            ? `${paid.length} of ${payments.length} paid their dues`
            : played
              ? `${formatCurrency(collected)} paid, ${formatCurrency(owedAmount)} still owed`
              : `${formatCurrency(collected)} paid, ${formatCurrency(owedAmount)} due, ${formatCurrency(openAmount)} more if the free places fill`
        }
      >
        {coveredByDues ? (
          <div className="h-full bg-volt-400 rounded-full transition-[width] duration-500 origin-left animate-fill-grow" style={{ width: `${duesPct}%` }} />
        ) : played && owedAmount <= 0 && collected > 0 ? (
          // All in: one solid bar. How much was marked by hand is said in words below.
          <div className="h-full w-full bg-volt-400 rounded-full origin-left animate-fill-grow" />
        ) : (
          <div className="flex h-full origin-left animate-fill-grow">
            <div className="h-full bg-volt-400 transition-[width] duration-500" style={{ width: `${pct(byTransfer)}%` }} />
            <div className="h-full bg-volt-300/60 transition-[width] duration-500" style={{ width: `${pct(byHand)}%` }} />
            <div className="h-full bg-sun-400 transition-[width] duration-500" style={{ width: `${pct(owedAmount)}%` }} />
          </div>
        )}
      </div>

      {/* The bar in words; each line opens the list behind it */}
      {!coveredByDues && (
        <ul className="mt-2.5 -mx-1.5">
          {rows.map((r, i) => (
            <li key={r.key} className="animate-rise" style={stagger(i, 50, 200)}>
              <Link href={r.href} className="press flex items-center gap-2.5 min-h-10 px-1.5 rounded-xl text-[13px] font-semibold text-white/85 hover:bg-white/[0.06] transition-colors">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.dot}`} aria-hidden />
                <span className="flex-1 min-w-0 truncate tabular-nums">{r.label}</span>
                <svg className="w-3.5 h-3.5 shrink-0 text-white/45" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </li>
          ))}
          {byHand > 0 && <li className="px-1.5 text-[11px] text-white/60">{formatCurrency(byHand)} of the paid amount was marked paid by hand</li>}
        </ul>
      )}

      {/* The people this moment is about: who's in, who still owes, who's still to vote, who won */}
      <GamePeople game={game} rsvp={rsvp} phase={phase} owing={owing} payments={payments} vote={vote} />

      </Collapse>

      {/* Before the game (and on the day, for late arrivals) it can be shared from here too: Share
          sits beside the main button, smaller, as on the game page. */}
      {inviteLink && (phase === 'before' || phase === 'matchday') ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() =>
              openWhatsApp(
                gameInviteMessage({
                  groupName,
                  when: `${when.replace(',', '')}${kickoff ? ` · ${prettyTime(kickoff)}` : ''}`,
                  where,
                  inCount: taken,
                  places: capacity || undefined,
                  link: inviteLink,
                }),
              )
            }
            aria-label="Share the game on WhatsApp"
            className="press shrink-0 inline-flex items-center justify-center gap-1.5 h-12 px-4 rounded-2xl bg-white/10 text-white text-[15px] font-bold hover:bg-white/20 transition-colors"
          >
            <WhatsAppGlyph className="w-5 h-5" />
            Share
          </button>
          <div className="flex-1 min-w-0 [&>*]:mt-0">
            <PrimaryAction phase={phase} game={game} owing={owing.length} canManage={canManage} reminding={reminding} onRemind={onRemind} />
          </div>
        </div>
      ) : (
        <PrimaryAction phase={phase} game={game} owing={owing.length} canManage={canManage} reminding={reminding} onRemind={onRemind} />
      )}
      {/* A played game nobody ended: voting only opens once it is */}
      {phase === 'after' && game.status !== 'completed' && canManage && (
        <button
          onClick={onEnd}
          className={
            owing.length
              ? 'press mt-2.5 w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 text-[15px] font-extrabold text-white hover:bg-white/10 disabled:opacity-60 transition-colors'
              : primaryCls
          }
        >
          <TickIcon />
          End game
        </button>
      )}
    </div>
  );
}

/** A player as a face: full name (for initials), photo when they have one. */
export const faceOf = (p: { id: string; firstName: string; lastName: string; nickname?: string | null; photoKey?: string | null }): Face => ({
  id: p.id,
  name: p.nickname || `${p.firstName} ${p.lastName}`.trim(),
  short: p.nickname || p.firstName,
  photoKey: p.photoKey ?? null,
});

/**
 * Who the game card is about right now, as faces: before the game, who's in; after it, who
 * still owes; once everyone's paid and the vote is on, who's still to vote (with a reminder);
 * when it's closed, the Player of the Match. Nothing to act on, no row.
 */
function GamePeople({
  game,
  rsvp,
  phase,
  owing,
  payments,
  vote,
}: {
  game: ISessionWithDetails;
  rsvp: RsvpBoard | null;
  phase: GamePhase;
  owing: NonNullable<ISessionWithDetails['payments']>;
  payments: NonNullable<ISessionWithDetails['payments']>;
  vote?: SessionVoting | null;
}) {
  const toast = useToast();
  const [nudging, setNudging] = useState(false);
  const gameHref = `/sessions/${game.id}`;
  const squad = payments.filter((p) => p.player && p.attendance !== 'no_show');

  if (phase !== 'after') {
    const inNow = rsvp?.requireRsvp ? rsvp.in.map(faceOf) : squad.map((p) => faceOf(p.player!));
    if (!inNow.length) return null;
    return (
      <PeopleRow onDark className="mt-2" people={inNow} title="Who's in" sub={namesLine(inNow, 2)} href={`${gameHref}?tab=players`} />
    );
  }

  if (owing.length) {
    const owe = owing.filter((p) => p.player).map((p) => faceOf(p.player!));
    return (
      <PeopleRow onDark className="mt-2" people={owe} title={`${owe.length} still to pay`} sub={namesLine(owe, 2)} href={`${gameHref}?tab=payments`} />
    );
  }

  if (!vote || game.status !== 'completed') return null;

  if (vote.open) {
    const voted = new Set(vote.voted ?? []);
    const waiting = squad.filter((p) => !voted.has(p.playerId)).map((p) => faceOf(p.player!));
    if (!waiting.length) {
      const all = squad.map((p) => faceOf(p.player!));
      return <PeopleRow onDark className="mt-2" people={all} title="Everyone has voted" sub="The winners show when the vote closes" />;
    }
    async function nudge() {
      setNudging(true);
      try {
        const r = await remindToVote(game.id);
        toast.success(
          r.missed
            ? `Reminder pushed to ${r.sent}. ${r.missed} don’t have notifications on yet`
            : `Reminder pushed to ${r.sent} player${r.sent === 1 ? '' : 's'}`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'The reminder didn’t send. Try again.');
      } finally {
        setNudging(false);
      }
    }
    return (
      <PeopleRow
        onDark
        className="mt-2"
        people={waiting}
        title={`${waiting.length} still to vote`}
        sub={namesLine(waiting, 2)}
        action={
          <button
            onClick={nudge}
            disabled={nudging}
            className="press shrink-0 min-h-11 px-3.5 rounded-xl border border-white/20 text-[13px] font-extrabold text-white hover:bg-white/10 disabled:opacity-60"
          >
            {nudging ? 'Sending…' : 'Remind'}
          </button>
        }
      />
    );
  }

  // Closed: the Player of the Match (shared when it's a tie).
  const potm = vote.categories.find((c) => c.key === 'potm');
  const top = potm?.standings[0];
  if (!top) return null;
  const winners = potm!.standings.filter((s) => s.count === top.count);
  const faces = winners.map((w) => faceOf(w.player));
  return (
    <PeopleRow
      onDark
      className="mt-2"
      people={faces}
      title={`Player of the Match${winners.length > 1 ? ' (shared)' : ''}`}
      sub={`${faces.map((f) => f.name).join(' & ')} · ${top.count} vote${top.count === 1 ? '' : 's'}`}
      href={`${gameHref}?tab=full`}
    />
  );
}

const primaryCls =
  'press relative overflow-hidden mt-4 w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-volt-400 text-ink text-[15px] font-extrabold hover:bg-volt-300 disabled:opacity-60 transition-colors';

/** The light band that sweeps across the main button every few seconds. */
const Shine = () => <span className="shine-band animate-shine" aria-hidden />;

/** One thing to do, and it changes with the week: collect, play, settle up. */
function PrimaryAction({
  phase,
  game,
  owing,
  canManage,
  reminding,
  onRemind,
}: {
  phase: GamePhase;
  game: ISessionWithDetails;
  owing: number;
  canManage: boolean;
  reminding: boolean;
  onRemind: () => void;
}) {
  const href = `/sessions/${game.id}`;
  if (phase === 'matchday') {
    return (
      <Link href={`${href}?tab=teams`} className={primaryCls}>
        <Shine />
        Start match day
        <Chevron />
      </Link>
    );
  }
  if (phase === 'after') {
    if (owing > 0) {
      return (
        <Link href={`${href}?tab=payments`} className={primaryCls}>
          <Shine />
          Review {owing} unpaid player{owing === 1 ? '' : 's'}
          <Chevron />
        </Link>
      );
    }
    // Everyone's paid and the game isn't ended: ending it (below) is the one thing to do.
    if (game.status !== 'completed') return null;
    return (
      <Link href={`${href}?tab=stars`} className={primaryCls}>
        <Shine />
        See the vote
        <Chevron />
      </Link>
    );
  }
  if (owing > 0 && canManage) {
    return (
      <button onClick={onRemind} disabled={reminding} className={primaryCls}>
        <Shine />
        <BellIcon />
        {reminding ? 'Sending reminders…' : `Remind ${owing} to pay`}
      </button>
    );
  }
  return (
    <Link href={href} className={primaryCls}>
      See who&apos;s in
      <Chevron />
    </Link>
  );
}

const Chevron = () => (
  <svg className="w-4 h-4 animate-nudge" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);

const TickIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
  </svg>
);

// ── Account details sheet ──


/**
 * The account number, share buttons, group link and QR — what used to fill the top of the
 * home page, now one tap away. Regenerating the link and setting up the account stay on the
 * group page's full account card.
 */
export function AccountDetailsSheet({
  group,
  billing,
  onClose,
}: {
  group: IGroupWithMembers;
  billing: GroupBilling;
  onClose: () => void;
}) {
  const titleId = useId();
  const toast = useToast();
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const account = billing.account;
  if (!account) return null;

  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        if (text === account?.accountNumber) {
          setCopiedNumber(true);
          window.setTimeout(() => setCopiedNumber(false), 1800);
        }
        toast.success(`${label} copied`);
      },
      () => toast.error('Could not copy. Press and hold to copy it instead.'),
    );
  const shareText = paymentShareText({
    groupName: group.name,
    amount: formatCurrency(Number(group.feePerPlayer)),
    frequency: frequencyShort(billing.paymentType),
    accountNumber: account.accountNumber,
    bankName: account.bankName,
    accountName: account.accountName,
    link: billing.link,
  });

  function saveQr() {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${account!.accountName.replace(/\s+/g, '-')}-QR.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <SheetTitle id={titleId} title="Account details" sub={`Players pay ${group.name} here`} onClose={onClose} />

      <button
        onClick={() => copy(account.accountNumber, 'Account number')}
        className="mt-4 w-full text-left rounded-2xl bg-ink text-white p-4 relative overflow-hidden"
      >
        <span className="absolute inset-0 turf-stripes-soft" aria-hidden />
        <span className="relative block text-xs font-semibold text-white/60">{account.bankName}</span>
        <span className="relative flex items-center justify-between gap-2 mt-1">
          <span className="font-display text-[26px] font-extrabold tracking-[0.04em] tabular-nums text-volt-300">
            {formatAccountNumber(account.accountNumber)}
          </span>
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-bold transition-colors ${
              copiedNumber ? 'bg-volt-400 text-ink' : 'bg-white/10 text-white'
            }`}
          >
            {copiedNumber ? <TickSmall /> : <CopySmall />}
            {copiedNumber ? 'Copied' : 'Copy'}
          </span>
        </span>
        <span className="relative block text-xs text-white/60 mt-1 truncate">{account.accountName}</span>
      </button>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={() => openWhatsApp(shareText)}
          className="h-12 flex items-center justify-center gap-2 text-sm font-bold text-ink bg-[#25D366] rounded-xl hover:brightness-95 transition"
        >
          Share on WhatsApp
        </button>
        <button
          onClick={() => copy(shareText, 'Payment details')}
          className="h-12 flex items-center justify-center gap-2 text-sm font-bold text-ink bg-chalk border border-gray-200 rounded-xl hover:border-ink transition-colors"
        >
          Copy all details
        </button>
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold text-ink">Group link</p>
        <p className="text-xs text-gray-500">Players join, get their payment code and see where to pay</p>
        <div className="flex gap-2 mt-2">
          <input
            readOnly
            value={billing.link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Group link"
            className="flex-1 min-w-0 h-11 px-3 !bg-chalk border border-gray-200 rounded-xl text-xs text-gray-600 truncate"
          />
          <button
            onClick={() => copy(billing.link, 'Link')}
            className="h-11 px-4 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      <button
        onClick={() => setShowQr((s) => !s)}
        aria-expanded={showQr}
        className="mt-4 h-11 w-full flex items-center justify-between text-sm font-bold text-ink border-t border-gray-100"
      >
        {showQr ? 'Hide QR code' : 'Show QR code'}
        <svg className={`w-4 h-4 transition-transform ${showQr ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {showQr && (
        <div className="flex flex-col items-center gap-2 pb-2">
          <div ref={qrRef} className="rounded-2xl bg-white border border-gray-200 p-3">
            <QRCodeCanvas value={[account.accountNumber, account.bankName, account.accountName].join('\n')} size={168} level="M" />
          </div>
          <p className="text-[11px] text-gray-500">Players scan it to get the account details</p>
          <button onClick={saveQr} className="h-11 px-4 text-sm font-bold text-pitch-700">
            Save QR image
          </button>
        </div>
      )}

    </Sheet>
  );
}

// ── Needs you ──

export interface NeedsItem {
  key: string;
  href: string;
  title: string;
  detail?: string;
  tone: 'kit' | 'sun' | 'volt' | 'sky';
  icon: React.ReactNode;
  /** Who it's about, as faces beside the names. */
  faces?: Face[];
}

const toneCls: Record<NeedsItem['tone'], string> = {
  kit: 'bg-kit-500 text-white',
  sun: 'bg-sun-400 text-ink',
  volt: 'bg-volt-300 text-ink',
  sky: 'bg-sky-300 text-ink',
};

/** Only things the organiser can act on now; each row is one tap to where it gets done. */
export function NeedsYou({ items }: { items: NeedsItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-6" aria-labelledby="needs-you">
      <h2 id="needs-you" className="text-base font-bold text-ink mb-2.5">
        Needs you
      </h2>
      <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
        {items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className="flex items-center gap-3 px-4 min-h-16 py-3 hover:bg-chalk transition-colors">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toneCls[it.tone]}`}>{it.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-bold text-ink leading-snug">{it.title}</span>
                {it.faces && it.faces.length > 0 ? (
                  <span className="mt-1 flex items-center gap-2 min-w-0">
                    <FaceStack people={it.faces} max={4} />
                    {it.detail && <span className="min-w-0 text-xs text-gray-500 truncate">{it.detail}</span>}
                  </span>
                ) : (
                  it.detail && <span className="block text-xs text-gray-500 mt-0.5 truncate">{it.detail}</span>
                )}
              </span>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A transfer's day as YYYY-MM-DD on this phone's clock, to compare with localToday(). */
function localDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA');
}

const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

/**
 * A folded half of the home card: its main figure with a caption, and (when something needs the
 * organiser) one shortcut to it. Tapping the figure unfolds the half.
 */
function FoldedSummary({
  value,
  valueTone,
  caption,
  action,
  onExpand,
}: {
  value: string;
  valueTone: string;
  caption: string;
  action: { label: string; href?: string; onClick?: () => void } | null;
  onExpand: () => void;
}) {
  const pill =
    'press w-full flex items-center gap-2 min-h-11 px-3 rounded-xl bg-sun-400/15 text-[13px] font-bold text-sun-400 hover:bg-sun-400/25 transition-colors';
  const pillBody = action && (
    <>
      <LiveDot className="bg-sun-400" />
      <span className="flex-1 min-w-0 truncate text-left">{action.label}</span>
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </>
  );
  return (
    <div className="animate-rise mt-3 rounded-2xl bg-white/[0.06] p-2">
      <button onClick={onExpand} className="w-full text-left px-1.5 pt-1 pb-1.5">
        <span className={`block font-display text-[22px] font-extrabold leading-none tabular-nums ${valueTone}`}>{value}</span>
        <span className="block mt-1 text-xs font-semibold text-white/70">{caption}</span>
      </button>
      {action &&
        (action.href ? (
          <Link href={action.href} className={pill}>
            {pillBody}
          </Link>
        ) : (
          <button onClick={action.onClick} className={pill}>
            {pillBody}
          </button>
        ))}
    </div>
  );
}

const CopySmall = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
  </svg>
);

const TickSmall = () => (
  <svg className="w-[18px] h-[18px] text-volt-300 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);
