'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Ball, Player, kitFor, skins } from '@/components/illustrations';
import { BallSpinner } from '@/components/skeleton';
import { AttributeRow } from '@/components/ratings';
import { TEAMS } from '@/components/lineup-card';
import { MatchDayBibs } from '@/components/match-day-bibs';
import { useToast } from '@/components/toast';
import { ShareCardButton } from '@/components/share-card';
import { formatCurrency, type PlayerRatings } from '@/lib/api';
import { setRsvp, type RecentMatchDay, type UpcomingGame } from '@/lib/player';

export function niceDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', opts);
}

export function daysUntil(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  const n = Math.round((d - today) / 86400000);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

export function prettyTime(hhmm?: string | null) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
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

export function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-pitch-600">{eyebrow}</p>
      <h1 className="text-[28px] leading-none font-extrabold text-ink mt-1">{title}</h1>
    </div>
  );
}

/** Trading-card portrait + name + attributes. */
export function PlayerCardHero({
  firstName,
  lastName,
  ratings,
  caption,
}: {
  firstName: string;
  lastName: string;
  ratings: PlayerRatings;
  caption?: string;
}) {
  const fullName = `${firstName} ${lastName}`;
  const kit = kitFor(fullName);
  return (
    <div className="relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
      <div className="absolute inset-0 turf-stripes" />
      <div className="relative grid grid-cols-[auto_1fr] gap-4 p-5">
        <div className="relative w-24 rounded-2xl bg-gradient-to-b from-pitch-600 to-pitch-800 border border-white/15 overflow-hidden">
          <div className="absolute top-2 left-2 leading-none">
            <p className="font-display text-xl font-extrabold text-volt-300 tabular-nums">{ratings.ovr ?? '–'}</p>
            <p className="text-[7px] font-extrabold tracking-[0.14em] text-white/60 mt-0.5">OVR</p>
          </div>
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
          {ratings.provisional && (
            <p className="absolute bottom-1.5 inset-x-1.5 text-center rounded-md bg-black/45 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-volt-300" title="Rating is still settling: fewer than 3 games with scores">
              Provisional
            </p>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Hi {firstName} 👋</p>
          <h1 className="font-display text-2xl font-extrabold leading-tight mt-0.5 truncate">{fullName}</h1>
          <div className="mt-3">
            <AttributeRow ratings={ratings} dark />
          </div>
          {caption && <p className="text-[11px] text-white/50 mt-2">{caption}</p>}
        </div>
      </div>
    </div>
  );
}

export function GameCard({ game, onChange }: { game: UpcomingGame; onChange: () => Promise<unknown> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const full = game.confirmed >= game.capacity;
  const pct = Math.min(100, Math.round((game.confirmed / Math.max(game.capacity, 1)) * 100));
  const time = prettyTime(game.kickoffTime);

  async function reply(status: 'in' | 'out') {
    setBusy(status);
    try {
      const res = await setRsvp(game.id, status);
      toast.success(
        res.status === 'in' ? "You're in ⚽" : res.status === 'waitlist' ? "Game's full — you're on the waitlist" : 'Got it — maybe next time',
      );
      await onChange();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const statusChip =
    game.myStatus === 'in'
      ? { text: "You're in ✅", cls: 'bg-volt-400 text-ink' }
      : game.myStatus === 'waitlist'
        ? { text: `Waitlist #${game.waitlistPosition ?? '–'}`, cls: 'bg-sun-400 text-ink' }
        : game.myStatus === 'out'
          ? { text: "You're out", cls: 'bg-gray-100 text-gray-600' }
          : null;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-pitch-600">
            {daysUntil(game.date)}
            {time ? ` · ${time}` : ''}
          </p>
          <p className="font-display text-xl font-extrabold text-ink leading-tight truncate">{game.groupName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{niceDate(game.date)}</p>
        </div>
        {statusChip && (
          <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${statusChip.cls}`}>{statusChip.text}</span>
        )}
      </div>

      {game.requireRsvp && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 mb-1">
            <span className="tabular-nums">
              {game.confirmed}/{game.capacity} confirmed
            </span>
            {game.waitlist > 0 && <span className="tabular-nums">{game.waitlist} waiting</span>}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className={`h-2 rounded-full ${full ? 'bg-kit-500' : 'bg-pitch-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {game.myStatus === 'in' && game.payment?.status === 'pending' && (
        <Link href="/me/pay" className="mt-3 block text-xs font-semibold text-amber-800 bg-sun-400/20 rounded-xl px-3 py-2">
          {formatCurrency(game.payment.amount)} to pay for this game — tap for the account details ›
        </Link>
      )}

      {game.bibsOpen && <MatchDayBibs sessionId={game.id} />}

      <div className="grid grid-cols-2 gap-2 mt-4">
        {game.myStatus === 'in' || game.myStatus === 'waitlist' ? (
          <button
            onClick={() => reply('out')}
            disabled={!!busy}
            className="col-span-2 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-ink disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy === 'out' && <BallSpinner />}
            {game.myStatus === 'waitlist' ? 'Leave the waitlist' : "I can't make it anymore"}
          </button>
        ) : (
          <>
            <button
              onClick={() => reply('in')}
              disabled={!!busy}
              className="py-3 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy === 'in' && <BallSpinner />}
              {full && game.requireRsvp ? 'Join waitlist' : "I'm in"}
            </button>
            <button
              onClick={() => reply('out')}
              disabled={!!busy || game.myStatus === 'out'}
              className="py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-ink disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy === 'out' && <BallSpinner />}
              Can&apos;t make it
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** A finished match day from the player's point of view. */
export function MatchDayCard({ day }: { day: RecentMatchDay }) {
  const played = day.record.w + day.record.d + day.record.l;
  const won = day.myTeam && day.teamOfTheDay === day.myTeam;
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-gray-500">{niceDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="font-display text-lg font-extrabold text-ink leading-tight truncate">{day.groupName}</p>
        </div>
        {day.myTeam && (
          <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-ink bg-chalk border border-gray-200 rounded-full px-2.5 py-1">
            <span className={`w-2.5 h-2.5 rounded-sm ${TEAMS[day.myTeam].swatch}`} />
            {TEAMS[day.myTeam].name}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {played > 0 && (
          <span className="text-xs font-bold text-ink bg-chalk rounded-full px-2.5 py-1 tabular-nums">
            W{day.record.w} D{day.record.d} L{day.record.l}
          </span>
        )}
        {won && <span className="text-xs font-extrabold text-ink bg-volt-400 rounded-full px-2.5 py-1">🏆 Team of the Day</span>}
        {day.potm && (
          <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${day.potm.isMe ? 'bg-sun-400 text-ink' : 'bg-chalk text-gray-600'}`}>
            ★ POTM: {day.potm.isMe ? 'You!' : day.potm.name}
          </span>
        )}
        {!played && !day.potm && <span className="text-xs text-gray-500">No results recorded</span>}
        {day.shareToken && (played > 0 || day.potm) && (
          <ShareCardButton
            token={day.shareToken}
            caption={`⚽ ${day.groupName ?? 'Match day'} — ${niceDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}`}
            className="ml-auto text-xs font-bold text-ink bg-white border-2 border-ink rounded-full px-2.5 py-0.5 hover:bg-volt-300 transition-colors"
          >
            Share ↗
          </ShareCardButton>
        )}
      </div>

      {day.vote && (
        <Link
          href={`/v/${day.vote.token}`}
          className={`mt-3 flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm font-bold ${
            day.vote.voted ? 'bg-chalk text-gray-600' : 'bg-sun-400 text-ink border-2 border-ink'
          }`}
        >
          {day.vote.voted ? 'You voted — see results' : 'Vote for the stars of the night'}
          <span>›</span>
        </Link>
      )}
    </div>
  );
}
