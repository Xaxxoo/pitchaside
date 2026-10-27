'use client';

import { CountUpNaira } from '@/components/motion';
import { Ticket } from '@/components/ticket';
import { prettyTime } from '@/components/player-ui';
import { gameDay } from '@/components/money-card';
import { formatCurrency, type ISessionWithDetails } from '@/lib/api';
import { gameChip, toneOnDark } from '@/lib/game-status';
import { gameTally, type GamePhase } from '@/lib/game-player';

const WhatsAppIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.03c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.93-4.66-4.11-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.16 0 .39-.06.61.47.24.56.79 1.92.86 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.04.93 1.92 1.22 2.19 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.34Z" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
    />
  </svg>
);

/** One of the card's two numbers, on turf: what it is, the figure, a bar when it's a share, a line in words. */
function Cell({ label, children, share, note, warn }: { label: string; children: React.ReactNode; share?: number | null; note: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.08] px-3 py-2.5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/60">{label}</p>
      <div className="mt-0.5 leading-none truncate">{children}</div>
      {share != null && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden" aria-hidden>
          <div
            className={`h-full rounded-full animate-fill-grow ${warn ? 'bg-sun-400' : 'bg-volt-300'}`}
            style={{ width: `${Math.max(share > 0 ? 4 : 0, Math.min(100, share))}%` }}
          />
        </div>
      )}
      <p className={`mt-1.5 text-[12px] font-semibold leading-snug line-clamp-2 ${warn ? 'text-sun-400' : 'text-white/75'}`}>{note}</p>
    </div>
  );
}

/**
 * The game at a glance, on turf: which game (group, date, kick-off and venue) and where it stands
 * (In 5 days, Today, Voting). Then two separate numbers, never read as one: Players (who's in,
 * against the places; who played, after) and Money (paid so far, or what's left to collect).
 * The ticket's stub holds the messages to players: Share the game before it, Remind who owes.
 */
export function GameHero({
  session,
  coveredByDues,
  phase,
  reminding,
  onRemind,
  onShare,
}: {
  session: ISessionWithDetails;
  coveredByDues: boolean;
  phase: GamePhase;
  reminding: boolean;
  onRemind: () => void;
  /** Share the game on WhatsApp; only before it's played. */
  onShare?: () => void;
}) {
  const before = phase === 'before' || phase === 'today';
  const payments = session.payments ?? [];
  const tally = gameTally(payments, coveredByDues, before);
  const chip = gameChip(session);
  const kickoff = session.kickoffTime || session.group?.kickoffTime;
  const collected = Number(session.collectedAmount);
  const due = collected + tally.toPayAmount;
  const places = Number(session.group?.targetPlayers ?? 0);
  const isDues = session.kind === 'dues';
  const title = isDues && session.label ? `${session.label} dues` : gameDay(session.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const time = !isDues && kickoff ? prettyTime(kickoff) : null;
  const venue = session.group?.location;
  const canRemind = tally.toPay > 0 && phase !== 'cancelled' && !coveredByDues;
  const share = before && onShare ? onShare : undefined;
  const n = tally.playing;

  const players = isDues
    ? { value: tally.paid, of: n, note: `of ${n} paid their dues`, share: n ? (tally.paid / n) * 100 : null }
    : before
      ? {
          value: n,
          of: places || undefined,
          note: !n ? 'No one’s in yet' : !places ? 'said they’re in' : n >= places ? (n > places ? `${n - places} over the ${places} places` : 'Full') : `${places - n} place${places - n === 1 ? '' : 's'} left`,
          share: places ? (n / places) * 100 : null,
        }
      : phase === 'cancelled'
        ? { value: n, of: undefined, note: n ? `had said they’re in. Called off` : 'Called off', share: null }
        : { value: n, of: undefined, note: !n ? 'No one played' : tally.noShows ? `played, ${tally.noShows} didn’t come` : 'played', share: null };

  const money = coveredByDues
    ? { value: null, note: `Covered by ${session.group?.paymentType ?? ''} dues`.replace('  ', ' '), warn: false, share: null }
    : !due
      ? { value: null, note: phase === 'cancelled' ? 'Nothing to collect' : n ? 'Nothing to pay' : 'Nothing due yet', warn: false, share: null }
      : tally.toPay
        ? before
          ? { value: collected, note: `${tally.toPay} not paid yet`, warn: false, share: (collected / due) * 100 }
          : { value: collected, note: `${formatCurrency(tally.toPayAmount)} left from ${tally.toPay}`, warn: true, share: (collected / due) * 100 }
        : { value: collected, note: 'Everyone’s paid', warn: false, share: 100 };

  const stub =
    share || canRemind ? (
      <div className="flex items-center gap-2 h-[64px] px-4">
        {share && (
          <button
            onClick={share}
            aria-label="Share game on WhatsApp"
            className={`press min-w-0 inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-full text-[13px] font-bold ${
              canRemind ? 'shrink-0 bg-white/10 text-white hover:bg-white/20' : 'flex-1 bg-white text-ink hover:bg-volt-300'
            }`}
          >
            <WhatsAppIcon />
            <span className="truncate">{canRemind ? 'Share' : 'Share game'}</span>
          </button>
        )}
        {canRemind && (
          <button
            onClick={onRemind}
            disabled={reminding}
            className="press flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-full bg-white text-ink text-[13px] font-bold shadow-card hover:bg-volt-300 disabled:opacity-60"
          >
            <BellIcon />
            <span className="truncate">{reminding ? 'Sending…' : `Remind ${tally.toPay} to pay`}</span>
          </button>
        )}
      </div>
    ) : null;

  return (
    <Ticket aria-label="The game" stub={stub} stubHeight={64} bodyClassName="bg-pitch-800 rounded-[28px] text-white">
      <div className="absolute inset-0 turf-stripes" />
      <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 400 300" aria-hidden>
        <g stroke="white" strokeOpacity="0.1" strokeWidth="2" fill="none">
          <rect x="12" y="12" width="376" height="276" rx="12" />
          <line x1="12" y1="150" x2="388" y2="150" />
          <circle cx="200" cy="150" r="46" />
        </g>
      </svg>

      <div className="relative px-4 pt-4 pb-4">
        {/* Which game: group, the date as the title, then kick-off and venue */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 pt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-volt-300 truncate">{session.group?.name || 'Game'}</p>
          <span className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full ${toneOnDark[chip.tone]}`}>
            {chip.tone === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse-soft" aria-hidden />}
            {chip.text}
          </span>
        </div>
        <h1 className="mt-1 font-display text-[28px] leading-none font-extrabold tabular-nums">{title}</h1>
        {/* Kick-off, then the venue on its own line, so a long venue is never cut off */}
        {time && <p className="mt-1.5 text-[13px] font-semibold text-white/85">{time} kick-off</p>}
        {venue && <p className={`${time ? 'mt-0.5' : 'mt-1.5'} text-[13px] font-semibold text-white/65`}>{venue}</p>}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Cell label={isDues ? 'Dues paid' : before ? 'Players in' : 'Players'} share={players.share} note={players.note}>
            <span className="font-display text-[26px] font-extrabold tabular-nums">{players.value}</span>
            {players.of !== undefined && <span className="text-[14px] font-bold text-white/55 tabular-nums"> / {players.of}</span>}
          </Cell>
          <Cell label={before ? 'Paid so far' : 'Money'} share={money.share} note={money.note} warn={money.warn}>
            {money.value === null ? (
              <span className="font-display text-[26px] font-extrabold text-white/40">—</span>
            ) : (
              <CountUpNaira value={money.value} className="font-display text-[22px] leading-[26px] font-extrabold tabular-nums" />
            )}
          </Cell>
        </div>
      </div>
    </Ticket>
  );
}
