'use client';

import { useState } from 'react';
import { levelOf } from '@/lib/rating-level';
import Link from 'next/link';
import { Ticket } from '@/components/ticket';
import { photoUrl } from '@/lib/http';
import { Ball, Player, kitFor, skins } from '@/components/illustrations';
import { BallSpinner } from '@/components/skeleton';
import { Avatar, AttributeRow } from '@/components/ratings';
import { PeopleRow, namesLine } from '@/components/people-row';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';
import { MatchDayBibs } from '@/components/match-day-bibs';
import { KeepScoreLink } from '@/components/keep-score-link';
import { useToast } from '@/components/toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ShareCardButton, ShareIcon, shareIconTile } from '@/components/share-card';
import { CountUp, LiveDot, stagger } from '@/components/motion';
import { Stat } from '@/components/stat';
import { toneCls } from '@/lib/game-status';
import { formatCurrency, type PlayerRatings } from '@/lib/api';
import { setRsvp, type RecentMatchDay, type UpcomingGame } from '@/lib/player';

export function niceDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', opts);
}

/** Days from today to a game day: 0 today, negative once it's past. */
export function daysFrom(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

export function daysUntil(iso: string) {
  const n = daysFrom(iso);
  return n < 0 ? 'Played' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

export function prettyTime(hhmm?: string | null) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

/**
 * A player screen that didn't load: says so plainly, with the server's own words when there are
 * any, and a way to try again. A lost connection reads as one, not as "Failed to fetch".
 */
export function LoadError({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  const offline = error instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);
  // A server crash has no words worth showing; a refusal ("You're not in this game") does.
  const said = !offline && error instanceof Error && error.message && !/internal server error/i.test(error.message) ? error.message : null;
  return (
    <div className="rounded-3xl bg-chalk px-5 py-8 text-center" role="alert">
      <p className="text-[15px] font-bold text-ink">{what} didn’t load.</p>
      <p className="mt-1 text-[13px] text-gray-600">
        {offline ? 'Looks like you’re offline or the signal is weak. Check your connection.' : said ? `The server said: “${said}”` : 'Something went wrong on our side.'}
      </p>
      <button onClick={onRetry} className="press mt-3 min-h-11 px-5 rounded-full bg-ink text-sm font-bold text-volt-300 hover:bg-pitch-900">
        Try again
      </button>
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Trading-card portrait + name + attributes. */
export function PlayerCardHero({
  firstName,
  lastName,
  ratings,
  caption,
  photoKey,
  photoButton,
  onRatingTap,
  action,
  nickname,
}: {
  firstName: string;
  lastName: string;
  /** Shown in quotes under the name, as on the organiser's player page. */
  nickname?: string | null;
  ratings: PlayerRatings;
  caption?: string;
  /** Their photo takes the drawn player's place on the card. */
  photoKey?: string | null;
  /** The camera on the portrait's corner (CardPhotoButton), where they can change their photo. */
  photoButton?: React.ReactNode;
  /** Tapping the big number explains how it's made. */
  onRatingTap?: () => void;
  /** Card actions (e.g. share), in a toolbar row across the top like the organiser's player card. */
  action?: React.ReactNode;
}) {
  const fullName = `${firstName} ${lastName}`;
  const photo = photoUrl(photoKey);
  const kit = kitFor(fullName);
  return (
    <div className="relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
      <div className="absolute inset-0 turf-stripes" />
      {action && (
        <div className="relative flex items-center justify-between gap-2 pl-5 pr-4 pt-3 -mb-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Your card</p>
          <div className="flex">{action}</div>
        </div>
      )}
      <div className="relative grid grid-cols-[auto_1fr] gap-4 p-5">
        <div className="relative w-24 self-start">
        <div className="relative rounded-2xl bg-gradient-to-b from-pitch-600 to-pitch-800 border border-white/15 overflow-hidden">
          {onRatingTap && ratings.ovr !== null ? (
            <button
              onClick={onRatingTap}
              aria-label={`Rating ${ratings.ovr}: how it's made`}
              className="press absolute z-10 top-0 left-0 min-w-11 min-h-11 pt-2 pl-2 pr-2 pb-1 text-left leading-none rounded-br-xl hover:bg-white/10"
            >
              <span className="block font-display text-xl font-extrabold text-volt-300 tabular-nums">{ratings.ovr}</span>
              <span className="flex items-center gap-0.5 text-[7px] font-extrabold tracking-[0.14em] text-white/60 mt-0.5">
                OVR
                <span className="w-2.5 h-2.5 rounded-full bg-white/20 text-white text-[7px] leading-[10px] text-center tracking-normal" aria-hidden>
                  i
                </span>
              </span>
            </button>
          ) : (
            <div className="absolute z-10 top-2 left-2 leading-none">
              <p className="font-display text-xl font-extrabold text-volt-300 tabular-nums">{ratings.ovr ?? '–'}</p>
              <p className="text-[7px] font-extrabold tracking-[0.14em] text-white/60 mt-0.5">OVR</p>
            </div>
          )}
          {photo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="w-full aspect-[2/3] object-cover" />
              <span className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-ink/50" aria-hidden />
            </>
          ) : (
          <svg viewBox="0 0 100 150" className="w-full h-auto mt-3" aria-hidden>
            <Player
              x={50}
              y={146}
              scale={0.82}
              pose="stand"
              kit={kit.hex}
              numberColor={kit.text}
              skin={skins[(firstName.length + lastName.length) % skins.length]}
              hair={(['short', 'afro', 'buzz', 'bun'] as const)[lastName.length % 4]}
              number={firstName.charAt(0) + lastName.charAt(0)}
            />
            <Ball x={84} y={138} r={8} />
          </svg>
          )}
          {ratings.provisional && (
            <p className="absolute z-10 top-[46px] left-1.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-volt-300" title="Rating is still settling: fewer than 3 games with scores">
              Provisional
            </p>
          )}
        </div>
        {photoButton && <span className="absolute z-10 -bottom-2 -right-2">{photoButton}</span>}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-extrabold leading-tight mt-0.5 break-words">{fullName}</h2>
          {nickname && <p className="mt-0.5 text-sm font-bold text-volt-300 truncate">“{nickname}”</p>}
          {/* The number in words: Regular, Key player, Star… */}
          {ratings.ovr != null && <p className="mt-2 inline-flex rounded-full border border-volt-300/50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-volt-300">{levelOf(ratings.ovr).name}</p>}
          <div className="mt-3">
            <AttributeRow ratings={ratings} dark />
          </div>
          {caption && <p className="text-[11px] text-white/50 mt-2">{caption}</p>}
        </div>
      </div>
    </div>
  );
}

/** A later game in the list: one tap opens its game day card. */
/**
 * A game further ahead, as the organiser's games list shows one: a date block, where the player
 * stands as a chip, kick-off and group, then two numbers kept apart: who's in, and the player's own
 * money for it. Tapping opens the game.
 */
export function GameRow({ game, index = 0 }: { game: UpcomingGame; index?: number }) {
  // The game's calendar day, read as local midnight so it never slips a day.
  const day = new Date(`${String(game.date).slice(0, 10)}T00:00:00`);
  const time = prettyTime(game.kickoffTime);
  const chip =
    game.myStatus === 'in'
      ? { text: "You're in", cls: toneCls.live }
      : game.myStatus === 'waitlist'
        ? { text: `Waitlist #${game.waitlistPosition ?? '–'}`, cls: toneCls.warn }
        : game.myStatus === 'out'
          ? { text: "You're out", cls: toneCls.calm }
          : { text: game.requireRsvp ? 'Not replied' : daysUntil(game.date), cls: toneCls.calm };
  const owes = game.myStatus === 'in' && game.payment?.status === 'pending' && game.payment.amount > 0;
  const money: { value: string; note: string; tone: 'ink' | 'warn' | 'muted' } = owes
    ? { value: formatCurrency(game.payment!.amount), note: 'to pay', tone: 'warn' }
    : game.myStatus === 'in' && game.payment?.status === 'paid'
      ? { value: 'Paid', note: `${formatCurrency(game.payment.amount)} ✓`, tone: 'ink' }
      : game.myStatus === 'in' && game.payment?.status === 'waived'
        ? { value: 'Free', note: 'nothing to pay', tone: 'ink' }
        : { value: '—', note: game.myStatus === 'in' ? 'Nothing to pay' : 'Reply to play', tone: 'muted' };
  return (
    <div className="animate-rise" style={stagger(Math.min(index, 10), 35, 0)}>
      <Link
        href={`/me/games/${game.id}`}
        className="press group block p-3.5 bg-white rounded-3xl border border-gray-100 shadow-card hover:border-gray-300 hover:shadow-lift transition-all"
      >
        <span className="flex items-center gap-3">
          <span className="w-14 shrink-0 rounded-2xl py-2 text-center bg-pitch-800 text-white" aria-hidden>
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-volt-300">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className="block font-display text-[22px] leading-none font-extrabold tabular-nums mt-0.5">{day.getDate()}</span>
            <span className="block text-[11px] font-bold mt-0.5">{day.toLocaleDateString('en-GB', { month: 'short' })}</span>
          </span>
          <span className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.text}</span>
            <span className="mt-1 block text-[16px] font-bold text-ink truncate">{time ? `${time} kick-off` : day.toLocaleDateString('en-GB', { weekday: 'long' })}</span>
            <span className="block text-[13px] text-gray-600 truncate">{game.groupName}</span>
          </span>
          <svg className="w-5 h-5 shrink-0 self-center text-gray-400 group-hover:text-ink group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </span>
        <span className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-4">
          {game.requireRsvp ? (
            <Stat
              label="Players in"
              value={String(game.confirmed)}
              of={` / ${game.capacity}`}
              note={game.waitlist ? `${game.waitlist} waiting` : game.confirmed >= game.capacity ? 'full' : `${game.capacity - game.confirmed} places left`}
              share={(game.confirmed / Math.max(game.capacity, 1)) * 100}
            />
          ) : (
            <Stat label="Players" value="Squad" note="everyone in the group" />
          )}
          <Stat label="You" value={money.value} note={money.note} tone={money.tone} />
        </span>
      </Link>
    </div>
  );
}

export function GameCard({
  game,
  onChange,
  showDetails = true,
}: {
  game: UpcomingGame;
  onChange: () => Promise<unknown>;
  /** Link to the game's own page (who's playing); off on that page itself. */
  showDetails?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const full = game.confirmed >= game.capacity;
  // Played (or ended): nothing left to reply to.
  const played = game.status === 'completed' || daysFrom(game.date) < 0;
  const paid = game.payment?.status === 'paid';
  const pct = Math.min(100, Math.round((game.confirmed / Math.max(game.capacity, 1)) * 100));
  const time = prettyTime(game.kickoffTime);

  async function reply(status: 'in' | 'out') {
    setBusy(status);
    try {
      const res = await setRsvp(game.id, status);
      toast.success(
        res.status === 'in' ? "You're in ⚽" : res.status === 'waitlist' ? "Game's full: you're on the waitlist" : "You're out",
      );
      await onChange();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const days = daysFrom(game.date);
  const owes = game.myStatus === 'in' && game.payment?.status === 'pending' && game.payment.amount > 0;
  // Same pill as the organiser's match-day card: where the game is in time.
  const pill = played
    ? { text: 'Played', live: false }
    : days === 0
      ? { text: 'Today', live: true }
      : { text: days === 1 ? 'Tomorrow' : `In ${days} days`, live: false };
  // Where the player stands, in words and colour both.
  const me = played
    ? game.myStatus === 'in'
      ? { text: 'You played', cls: 'bg-white/[0.08] text-white/80' }
      : null
    : game.myStatus === 'in'
      ? { text: "You're in ✓", cls: 'bg-volt-400 text-ink' }
      : game.myStatus === 'waitlist'
        ? { text: `Waitlist #${game.waitlistPosition ?? '–'}`, cls: 'bg-sun-400 text-ink' }
        : game.myStatus === 'out'
          ? { text: "You're out", cls: 'bg-white/[0.08] text-white/80' }
          : game.requireRsvp
            ? { text: 'Not replied', cls: 'bg-white/[0.08] text-white/80' }
            : null;
  const chevron = (
    <svg className="w-3.5 h-3.5 shrink-0 text-white/45" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
  const primary =
    'press w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-volt-400 text-ink text-[15px] font-extrabold hover:bg-volt-300 disabled:opacity-60 transition-colors';
  const secondary =
    'press w-full h-12 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 text-[15px] font-bold text-white hover:bg-white/10 disabled:opacity-50 transition-colors';

  return (
    <Ticket
      aria-label={`${game.groupName}, ${niceDate(game.date)}`}
      bodyClassName="rounded-[28px] text-white bg-[linear-gradient(160deg,#134927_0%,#10301d_42%,#0f1a14_100%)]"
      stub={
        showDetails ? (
          <Link href={`/me/games/${game.id}`} className="press flex items-center gap-3 h-[52px] px-5 hover:bg-white/[0.04] transition-colors">
            <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-white/85">See who&apos;s playing</span>
            {chevron}
          </Link>
        ) : null
      }
    >
      <div className="absolute inset-0 turf-stripes-soft" aria-hidden />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/65">{days === 0 ? 'Match day' : played ? 'Last game' : 'Next game'}</span>
            <span className="mt-1 block font-display text-[22px] leading-tight font-extrabold truncate">{game.groupName}</span>
            {/* "Today · 3:56pm" says it in one short line, so the status on the right never cuts it off */}
            <span className="mt-1 flex items-center gap-2 min-w-0">
              {pill.live && <LiveDot className="bg-volt-400" />}
              <span className={`text-sm font-semibold truncate ${pill.live ? 'text-volt-300' : 'text-white/85'}`}>
                {days === 0 && !played ? 'Today' : days === 1 && !played ? 'Tomorrow' : niceDate(game.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                {time ? ` · ${time}` : ''}
              </span>
            </span>
          </div>
          {me && <span className={`shrink-0 text-[11px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${me.cls}`}>{me.text}</span>}
        </div>

        {game.requireRsvp && !played && (
          <>
            <div className="mt-4 flex items-baseline gap-1.5 flex-wrap">
              <CountUp value={game.confirmed} className="font-display text-[28px] font-extrabold leading-none" />
              <span className="text-sm text-white/70 tabular-nums">
                of {game.capacity} in{game.waitlist > 0 ? ` · ${game.waitlist} waiting` : full ? ' · full' : ''}
              </span>
            </div>
            <div
              className="mt-2.5 h-2.5 w-full rounded-full bg-white/12 overflow-hidden"
              role="img"
              aria-label={`${game.confirmed} of ${game.capacity} places taken`}
            >
              <div className={`h-full rounded-full origin-left animate-fill-grow ${full ? 'bg-kit-500' : 'bg-volt-400'}`} style={{ width: `${pct}%` }} />
            </div>
          </>
        )}

        {/* Who's playing, as faces: them first */}
        {!played && (game.playingCount ?? 0) > 0 && game.faces && (
          <PeopleRow
            onDark
            className="mt-2"
            people={game.faces}
            total={game.playingCount}
            title={game.requireRsvp ? "Who's in" : "Who's playing"}
            sub={namesLine(game.faces, 2, game.playingCount)}
          />
        )}

        {/* Their money for this game, as a row like the organiser's */}
        {game.myStatus === 'in' && game.payment && game.payment.amount > 0 && (
          <ul className="mt-2.5 -mx-1.5">
            <li>
              {owes ? (
                <Link href="/me/pay" className="press flex items-center gap-2.5 min-h-10 px-1.5 rounded-xl text-[13px] font-semibold text-white/85 hover:bg-white/[0.06] transition-colors">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-sun-400" aria-hidden />
                  <span className="flex-1 min-w-0 truncate tabular-nums">{formatCurrency(game.payment.amount)} to pay for this game</span>
                  {chevron}
                </Link>
              ) : (
                <p className="flex items-center gap-2.5 min-h-10 px-1.5 text-[13px] font-semibold text-white/85">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-volt-400" aria-hidden />
                  {game.payment.status === 'waived' ? 'Free for you this time' : `Paid ${formatCurrency(game.payment.amount)} ✓`}
                </p>
              )}
            </li>
          </ul>
        )}

        {/* Match day: pick your bib, then follow the scores as they come in */}
        {(game.bibsOpen || (days === 0 && game.status !== 'cancelled' && game.myStatus === 'in')) && <MatchDayBibs sessionId={game.id} live={days === 0} />}
        {!played && game.status !== 'cancelled' && game.myStatus === 'in' && <KeepScoreLink sessionId={game.id} today={days === 0} />}

        {!played && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {game.myStatus === 'in' || game.myStatus === 'waitlist' ? (
              <>
                {owes && (
                  <Link href="/me/pay" className={`${primary} col-span-2`}>
                    Pay {formatCurrency(game.payment!.amount)}
                  </Link>
                )}
                <button onClick={() => (paid ? setConfirmOut(true) : reply('out'))} disabled={!!busy} className={`${secondary} col-span-2`}>
                  {busy === 'out' && <BallSpinner />}
                  {game.myStatus === 'waitlist' ? 'Leave the waitlist' : "I'm out"}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => reply('in')} disabled={!!busy} className={primary}>
                  {busy === 'in' && <BallSpinner />}
                  {full && game.requireRsvp ? 'Join waitlist' : "I'm in"}
                </button>
                <button onClick={() => reply('out')} disabled={!!busy || game.myStatus === 'out'} className={secondary}>
                  {busy === 'out' && <BallSpinner />}
                  I&apos;m out
                </button>
              </>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmOut}
          variant="danger"
          title="Drop out of this game?"
          message={`You’ve paid ${formatCurrency(game.payment?.amount ?? 0)} for it. It goes to your organiser at ${game.groupName} to sort: kept for a later game, or sent back to you.`}
          confirmLabel="I'm out"
          cancelLabel="Stay in"
          onConfirm={() => {
            setConfirmOut(false);
            reply('out');
          }}
          onCancel={() => setConfirmOut(false)}
        />
      </div>
    </Ticket>
  );
}

/**
 * A finished match day from the player's point of view, in the organiser's games-list card: the
 * date block, their team, then two numbers kept apart (their results, and Player of the Match),
 * then the vote and sharing.
 */
export function MatchDayCard({ day, index = 0 }: { day: RecentMatchDay; index?: number }) {
  const played = day.record.w + day.record.d + day.record.l;
  const won = !!day.myTeam && day.teamOfTheDay === day.myTeam;
  const date = new Date(`${String(day.date).slice(0, 10)}T00:00:00`);
  return (
    <div className="animate-rise p-3.5 bg-white rounded-3xl border border-gray-100 shadow-card" style={stagger(Math.min(index, 10), 35, 0)}>
      <Link href={`/me/games/${day.sessionId}`} className="press group flex items-center gap-3 rounded-2xl">
        <span className="w-14 shrink-0 rounded-2xl py-2 text-center bg-chalk text-ink" aria-hidden>
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
          <span className="block font-display text-[22px] leading-none font-extrabold tabular-nums mt-0.5">{date.getDate()}</span>
          <span className="block text-[11px] font-bold mt-0.5">{date.toLocaleDateString('en-GB', { month: 'short' })}</span>
        </span>
        <span className="flex-1 min-w-0">
          {won ? (
            <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${toneCls.live}`}>🏆 Team of the Day</span>
          ) : (
            <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${toneCls.done}`}>Played</span>
          )}
          <span className="mt-1 block text-[16px] font-bold text-ink truncate">{day.groupName}</span>
          {day.myTeam ? (
            <span className="flex items-center gap-1.5 text-[13px] text-gray-600 truncate">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={bibFill(day.myTeam, day.bibs)} aria-hidden />
              {teamName(day.myTeam, day.captains, day.bibs)}
            </span>
          ) : (
            <span className="block text-[13px] text-gray-600">No team picked</span>
          )}
        </span>
        <svg className="w-5 h-5 shrink-0 self-center text-gray-400 group-hover:text-ink group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-4">
        <Stat
          label="Your games"
          value={played ? `${day.record.w}-${day.record.d}-${day.record.l}` : '—'}
          note={played ? 'won · drawn · lost' : 'No results recorded'}
          tone={played ? 'ink' : 'muted'}
        />
        <Stat
          label="Player of the Match"
          value={day.potm ? (day.potm.isMe ? 'You! ★' : day.potm.name) : '—'}
          note={day.potm ? `${day.potm.votes} vote${day.potm.votes === 1 ? '' : 's'}` : day.vote ? 'When the vote closes' : 'No vote'}
          tone={day.potm ? 'ink' : 'muted'}
          face={day.potm ? <Avatar name={day.potm.name} photoKey={day.potm.photoKey} className="w-8 h-8 text-[11px]" /> : undefined}
        />
      </div>

      {(() => {
        // Any ended game can be shared, scores or not: the card shows what the day recorded
        const canShare = !!day.shareToken;
        // Once the vote has closed, the same link shows how it ended
        const voteLink = day.vote ? (
          <Link
            href={`/v/${day.vote.token}`}
            className={`press flex-1 min-w-0 flex items-center justify-between gap-3 min-h-12 rounded-2xl px-4 text-[14px] font-bold ${
              day.vote.voted ? 'bg-chalk text-gray-700' : 'bg-sun-400 text-ink border-2 border-ink shadow-sticker'
            }`}
          >
            <span className="truncate">{day.vote.voted ? 'You voted · see who else has' : 'Vote for Player of the Match'}</span>
            <span aria-hidden>›</span>
          </Link>
        ) : day.shareToken && day.potm ? (
          <Link
            href={`/v/${day.shareToken}`}
            className="press flex-1 min-w-0 flex items-center justify-between gap-3 min-h-12 rounded-2xl px-4 bg-chalk text-[14px] font-bold text-ink hover:bg-gray-100"
          >
            <span className="truncate">See how the vote ended</span>
            <span aria-hidden>›</span>
          </Link>
        ) : null;
        if (!voteLink && !canShare && !day.teamOpen) return null;
        return (
          <>
            {day.teamOpen && (
              <Link href={`/me/games/${day.sessionId}`} className="press mt-2 inline-flex items-center min-h-11 px-1 text-[13px] font-bold text-pitch-700">
                {day.myTeam ? 'Change your team ›' : 'Which team were you in? ›'}
              </Link>
            )}
            {(voteLink || canShare) && (
              <div className={`${day.teamOpen ? 'mt-1' : 'mt-3'} flex items-center gap-2`}>
                {voteLink ?? (
                  <p className="flex-1 min-w-0 px-1 text-[13px] font-bold text-gray-600">Share how the day went</p>
                )}
                {canShare && (
                  <ShareCardButton
                    token={day.shareToken!}
                    caption={`⚽ ${day.groupName ?? 'Match day'} — ${niceDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}`}
                    label="Share the match card"
                    className={shareIconTile}
                  >
                    <ShareIcon />
                  </ShareCardButton>
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
