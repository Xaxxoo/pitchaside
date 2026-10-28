'use client';

import { useEffect, useState } from 'react';
import { groupVoteMessage } from '@/lib/whatsapp';
import { photoUrl } from '@/lib/http';
import type { Bibs } from '@pitchaside/shared';
import { teamName } from '@/lib/teams';
import { EmptyState } from '@/components/empty-state';
import Link from 'next/link';
import { kitFor } from '@/components/illustrations';
import { useToast } from '@/components/toast';
import { ShareCardButton, ShareIcon, shareIconInk } from '@/components/share-card';
import { isVotingOpen } from '@/lib/game-status';
import { ratingWords } from '@/lib/rating-words';
import {
  getSessions,
  getSessionVoting,
  type ISessionWithDetails,
  type LeagueTable,
  type PlayerRatings,
  type SessionVoting,
  type TeamKey,
  type VoteCategory,
  type VoteResults,
  type Attribute,
} from '@/lib/api';

export const categoryMeta: Record<VoteCategory, { short: string; tone: string; chip: string; attr?: string }> = {
  potm: { short: '★', tone: 'bg-sun-400 text-ink', chip: 'bg-sun-400' },
  pace: { short: 'PAC', tone: 'bg-sky-300 text-ink', chip: 'bg-sky-300' },
  shooting: { short: 'SHO', tone: 'bg-kit-500 text-white', chip: 'bg-kit-500', attr: 'SHO' },
  passing: { short: 'PAS', tone: 'bg-volt-400 text-ink', chip: 'bg-volt-400', attr: 'PAS' },
  defending: { short: 'DEF', tone: 'bg-ink text-volt-300', chip: 'bg-ink', attr: 'DEF' },
  keeper: { short: 'GK', tone: 'bg-pitch-600 text-white', chip: 'bg-pitch-600', attr: 'GK' },
  teammate: { short: 'TEAM', tone: 'bg-pitch-600 text-white', chip: 'bg-pitch-600' },
  vii: { short: 'VII', tone: 'bg-ink text-sun-400', chip: 'bg-ink' },
  vii_sub: { short: 'SUB', tone: 'bg-ink text-sun-400', chip: 'bg-ink' },
  vii_gk: { short: 'GK', tone: 'bg-ink text-sun-400', chip: 'bg-ink' },
  dribbling: { short: 'TEC', tone: 'bg-sky-300 text-ink', chip: 'bg-sky-300' },
  smartest: { short: 'IQ', tone: 'bg-pitch-500 text-white', chip: 'bg-pitch-500' },
  engine: { short: 'ENG', tone: 'bg-kit-400 text-ink', chip: 'bg-kit-400' },
  playmaker: { short: 'PLAY', tone: 'bg-volt-300 text-ink', chip: 'bg-volt-300' },
  movement: { short: 'MOV', tone: 'bg-sun-400 text-ink', chip: 'bg-sun-400' },
};

/** A result's heading: "Best on Orange" for the per-team pick, else the category's own title. */
export function resultTitle(c: { key: VoteCategory; title: string; team?: TeamKey | null }, bibs?: Bibs | null) {
  return c.key === 'teammate' && c.team ? `Best on ${teamName(c.team, undefined, bibs)}` : c.title;
}

export function Avatar({ name, photoKey, className = 'w-9 h-9 text-xs' }: { name: string; photoKey?: string | null; className?: string }) {
  const src = photoUrl(photoKey);
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className={`${className} rounded-full object-cover shrink-0 bg-chalk`} loading="lazy" />;
  const k = kitFor(name);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <span className={`${className} ${k.bg} ${k.fg} rounded-full flex items-center justify-center font-extrabold font-display shrink-0`}>
      {initials}
    </span>
  );
}

/** Winner + runners-up for each award. */
export function VoteResultsList({ results, compact = false }: { results: VoteResults; compact?: boolean }) {
  return (
    <div className={compact ? 'grid sm:grid-cols-2 gap-2' : 'space-y-2.5'}>
      {results.categories.map((c) => {
        const meta = categoryMeta[c.key];
        const [winner, ...rest] = c.standings;
        const fullName = winner ? `${winner.player.firstName} ${winner.player.lastName}` : '';
        const winnerName = winner ? winner.player.nickname || fullName : '';
        return (
          <div
            key={`${c.key}-${c.team ?? ''}`}
            className={`rounded-2xl border p-3.5 ${
              c.key === 'potm' && !compact ? 'bg-ink text-white border-ink' : 'bg-white border-gray-100 shadow-card'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.tone}`}>
                {meta.short}
              </span>
              <span className={`text-[11px] font-semibold ${c.key === 'potm' && !compact ? 'text-white/50' : 'text-gray-500'}`}>
                {resultTitle(c, results.bibs)}
              </span>
            </div>
            {c.key === 'vii' && c.standings.length > 0 ? (
              // Best VII of the Day: the keeper first (when the vote had one), the outfield starters, then the sub.
              <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {c.standings.map((s, i) => (
                  <li key={s.playerId} className="flex items-center gap-2 min-w-0">
                    <Avatar name={`${s.player.firstName} ${s.player.lastName}`} photoKey={s.player.photoKey} className="w-7 h-7 text-[10px]" />
                    <span className="min-w-0 truncate text-[13px] font-bold">
                      {s.player.nickname || s.player.firstName}
                      {s.playerId === c.keeperId && <span className="font-semibold text-gray-500"> · keeper</span>}
                      {i === c.standings.length - 1 && c.standings.length === 7 && <span className="font-semibold text-gray-500"> · sub</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : c.inconclusive ? (
              <p className="text-sm mt-3 text-gray-500">
                Not enough votes to call it{c.voters ? ` (${c.voters} voted)` : ''}
              </p>
            ) : winner ? (
              <div className="flex items-center gap-3 mt-3">
                <Avatar name={fullName} photoKey={winner.player.photoKey} className="w-10 h-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-extrabold leading-tight truncate">{winnerName}</p>
                  {rest.length > 0 && (
                    <p className={`mt-0.5 flex items-center gap-2 text-[11px] min-w-0 ${c.key === 'potm' && !compact ? 'text-white/60' : 'text-gray-500'}`}>
                      {rest.slice(0, 3).map((s) => (
                        <span key={s.playerId} className="inline-flex items-center gap-1 min-w-0">
                          <Avatar name={`${s.player.firstName} ${s.player.lastName}`} photoKey={s.player.photoKey} className="w-4 h-4 text-[7px]" />
                          <span className="truncate">
                            {s.player.nickname || s.player.firstName} {s.count}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <span className="font-display text-2xl font-extrabold tabular-nums">{winner.count}</span>
              </div>
            ) : (
              <p className={`text-sm mt-3 ${c.key === 'potm' && !compact ? 'text-white/50' : 'text-gray-500'}`}>No votes yet</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Team of the Day, in the table's small print. */
const TrophyMark = () => (
  <svg className="inline w-3 h-3 -mt-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 7.35 12H7a4 4 0 0 1-4-4V5h3V3Zm0 4H5v1a2 2 0 0 0 1 1.73V7Zm12 0v2.73A2 2 0 0 0 19 8V7h-1Z" />
  </svg>
);

/** The group's league: points from results (every short game on match day), Team of the Day and Player of the Match. */
type TableRow = LeagueTable['rows'][number];

const FORM_STYLE: Record<'W' | 'D' | 'L', { bg: string; word: string }> = {
  W: { bg: 'bg-volt-400', word: 'won' },
  D: { bg: 'bg-gray-200', word: 'drew' },
  L: { bg: 'bg-kit-400', word: 'lost' },
};

/** A player's last three match days as lettered dots: colour and letter, and said in words. */
function FormDots({ form }: { form: TableRow['form'] }) {
  if (!form.length) return <span className="text-[11px] text-gray-400">–</span>;
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`Last ${form.length} match day${form.length === 1 ? '' : 's'}: ${form.map((f) => FORM_STYLE[f].word).join(', ')}`}>
      {form.map((f, i) => (
        <span key={i} className={`w-4 h-4 rounded-[5px] ${FORM_STYLE[f].bg} text-ink text-[9px] font-extrabold flex items-center justify-center`} aria-hidden>
          {f}
        </span>
      ))}
    </span>
  );
}

/** ▲2, ▼1 or – : places moved since before the latest match day. */
function Move({ move }: { move: number | null }) {
  if (move === null) return <span className="text-[10px] font-bold text-gray-400">new</span>;
  if (move === 0) return <span className="text-[10px] font-bold text-gray-400" aria-label="Same place">–</span>;
  return (
    <span className={`text-[10px] font-extrabold ${move > 0 ? 'text-pitch-600' : 'text-kit-600'}`} aria-label={`${move > 0 ? 'Up' : 'Down'} ${Math.abs(move)}`}>
      {move > 0 ? '▲' : '▼'}
      {Math.abs(move)}
    </span>
  );
}

const nameOf = (r: TableRow) => r.player.nickname || `${r.player.firstName} ${r.player.lastName}`.trim();
/**
 * For the narrow table rows: the full name when it fits (about 10 letters), else first name and
 * initial, so "Chidi Nwosu" reads "Chidi N." rather than "Chidi Nw…".
 */
const shortOf = (r: TableRow) => {
  const full = nameOf(r);
  return r.player.nickname || full.length <= 10 || !r.player.lastName ? full : `${r.player.firstName} ${r.player.lastName.charAt(0)}.`;
};

/** The top three on a striped pitch: their shirt (or photo), name and rating (points under it), tallest in the middle. */
function Podium({ rows }: { rows: TableRow[] }) {
  // Second, first, third, left to right.
  const order = [rows[1], rows[0], rows[2]];
  const place = ['2nd', '1st', '3rd'];
  const block = ['h-[68px] bg-gray-200', 'h-[92px] bg-volt-300', 'h-[52px] bg-kit-400'];
  return (
    <div className="turf-stripes bg-pitch-700 rounded-3xl px-3 pt-4 grid grid-cols-3 gap-2 items-end" aria-label="Top three">
      {order.map((r, i) => {
        const name = nameOf(r);
        const initials = `${r.player.firstName[0] ?? ''}${r.player.lastName[0] ?? ''}`.toUpperCase();
        return (
          <div key={r.player.id} className="flex flex-col items-center gap-1.5 min-w-0 text-center text-ink">
            {r.player.photoKey ? (
              <Avatar name={name} photoKey={r.player.photoKey} className="w-12 h-12 ring-2 ring-ink" />
            ) : (
              // Always a light shirt: a dark one would vanish on the pitch.
              <svg viewBox="0 0 48 48" className="w-12 h-12" aria-hidden>
                <path
                  d="M14 6 L19 4 Q24 8 29 4 L34 6 L45 13 L40 22 L35 19 L35 44 L13 44 L13 19 L8 22 L3 13 Z"
                  className={['fill-sky-300', 'fill-sun-400', 'fill-white'][i]}
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <text x="24" y="34" textAnchor="middle" fontSize="12" fontWeight="800" className="font-display fill-ink">
                  {initials}
                </text>
              </svg>
            )}
            <span className="max-w-full truncate text-[13px] font-bold text-white">{name}</span>
            <div className={`w-full ${block[i]} rounded-t-2xl flex flex-col items-center pt-2 text-ink animate-rise`}>
              <span className="font-display text-2xl font-extrabold leading-none tabular-nums" aria-label={`Rating ${r.ovr ?? 'not yet'}`}>
                {r.ovr ?? '–'}
              </span>
              <span className="text-[11px] font-bold tabular-nums">
                {place[i]} · {r.points} pts
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The season table: the top three on a podium, then everyone else in a dense list with their
 * record, form over their last three match days and places moved since the last one.
 */
export function LeagueTableView({ table }: { table: LeagueTable }) {
  if (table.rows.length === 0 || table.rows.every((r) => r.games === 0)) {
    return (
      <EmptyState
        icon="box"
        title="No games yet"
        description="The table fills in from match day: each game’s score, goals, and the vote after it."
      />
    );
  }
  const byRating = table.rankedBy === 'rating';
  // A podium needs three who've played; otherwise it's all one list.
  const podium = table.rows.length >= 3 && (byRating ? table.rows[2].games > 0 : table.rows[2].points > 0);
  const rest = podium ? table.rows.slice(3) : table.rows;
  const first = podium ? 4 : 1;
  const cols = 'grid grid-cols-[26px_minmax(0,1fr)_22px_54px_36px] items-center gap-2';
  return (
    <div className="space-y-3">
      {podium && <Podium rows={table.rows} />}
      {rest.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
          <div className={`${cols} px-3.5 py-2.5 bg-ink text-[10px] font-extrabold uppercase tracking-wider text-white/60`}>
            <span>#</span>
            <span>Player</span>
            <span className="text-center" title="Games played">
              P<span className="sr-only">layed</span>
            </span>
            <span className="text-center">Form</span>
            <span className="text-right text-volt-300">{byRating ? 'Rating' : 'Pts'}</span>
          </div>
          {rest.map((row, i) => {
            const name = nameOf(row);
            return (
              <div key={row.player.id} className={`${cols} px-3.5 py-2.5 border-t border-gray-100`}>
                <span className="flex flex-col leading-none gap-0.5">
                  <span className="font-display text-[15px] font-extrabold text-ink tabular-nums">{first + i}</span>
                  <Move move={row.move} />
                </span>
                <span className="min-w-0 flex items-center gap-2.5">
                  <Avatar name={`${row.player.firstName} ${row.player.lastName}`} photoKey={row.player.photoKey} className="w-8 h-8 text-[10px]" />
                  <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink truncate" title={name}>
                    {shortOf(row)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 tabular-nums whitespace-nowrap">
                    {/* Ranked by rating, the points stand in for the record: one short line that fits */}
                    {byRating ? `${row.points} pts` : `${row.record.w}W ${row.record.d}D ${row.record.l}L`}
                    {row.potmWins > 0 && <span aria-label={`Player of the Match ${row.potmWins}`}>· ★ {row.potmWins}</span>}
                    {row.teamOfDay > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-amber-700" aria-label={`Team of the Day ${row.teamOfDay} time${row.teamOfDay === 1 ? '' : 's'}`}>
                        <span aria-hidden>·</span>
                        <TrophyMark />
                        <span aria-hidden>{row.teamOfDay}</span>
                      </span>
                    )}
                  </span>
                  </span>
                </span>
                <span className="text-center text-sm text-gray-500 tabular-nums">{row.games}</span>
                <span className="flex justify-center">
                  <FormDots form={row.form} />
                </span>
                <span className="text-right font-display text-lg font-extrabold text-ink tabular-nums">{byRating ? (row.ovr ?? '–') : row.points}</span>
              </div>
            );
          })}
        </div>
      )}
      {byRating && (
        <p className="px-1 text-[12px] leading-snug text-gray-600">
          <b className="text-ink">Ranked by rating:</b> {ratingWords(table.ratingMode).short}. So being on the winning side isn’t enough to top
          it. Level on rating, points decide.
        </p>
      )}
      <p className="px-1 text-[11px] leading-snug text-gray-500">
        {table.points.win} pts a win · {table.points.draw} a draw · +{table.points.teamOfDay} for Team of the Day
        {/* The trophy is drawn, so it isn't text: its brackets are drawn with it, or copied text and screen readers get "()" */}
        <span aria-hidden className="ml-1 before:content-['('] after:content-[')']">
          <TrophyMark />
        </span>{' '}
        · +{table.points.potm} for
        Player of the Match (★). ▲▼ places moved since the last match day. Form: their last 3 match days, W more games won than lost, D level, L fewer.
      </p>
    </div>
  );
}

/** Organiser's view of a game's vote: share link, turnout and live results. */
export function SessionVotingCard({
  sessionId,
  groupName,
  context,
}: {
  sessionId: string;
  groupName: string;
  /** Shown on the dashboard so it's clear which game the vote is for. */
  context?: { label: string; href: string };
}) {
  const toast = useToast();
  const [voting, setVoting] = useState<SessionVoting | null>(null);

  useEffect(() => {
    getSessionVoting(sessionId).then(setVoting).catch(() => {});
  }, [sessionId]);

  if (!voting) return null;

  const share = () => {
    const text = groupVoteMessage({ groupName, link: voting.link, ballots: voting.ballots, squadSize: voting.squadSize, closes: voting.closesAt ? closeTime(voting.closesAt) : null });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const copy = () =>
    navigator.clipboard.writeText(voting.link).then(
      () => toast.success('Vote link copied'),
      () => toast.error('Could not copy'),
    );
  const turnout = voting.squadSize ? Math.round((voting.ballots / voting.squadSize) * 100) : 0;
  const closes = voting.closesAt ? closeTime(voting.closesAt) : null;

  return (
    <section className="mb-6 rounded-[28px] bg-sun-400 border-2 border-ink shadow-sticker p-5 relative overflow-hidden">
      <div className="absolute inset-0 chalk-dots opacity-50 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink/60">Post-match vote</p>
            <h2 className="text-xl font-extrabold text-ink leading-tight mt-0.5">Who was Player of the Match?</h2>
            {context && (
              <Link href={context.href} className="text-xs font-bold text-ink/70 underline decoration-ink/30 underline-offset-2 hover:text-ink">
                {context.label}
              </Link>
            )}
          </div>
          {/* Every ended game has a match card, votes or not: while the vote is open it's the invite */}
          {!voting.notYet && (
            <ShareCardButton
              token={voting.token}
              caption={`⚽ ${groupName} — match day. Who was Player of the Match?`}
              label="Share the match card"
              className={`${shareIconInk} -mt-1 -mr-1`}
            >
              <ShareIcon />
            </ShareCardButton>
          )}
        </div>

        {voting.notYet ? (
          <p className="text-sm text-ink/70 mt-2">
            The vote opens when you end the game, for 36 hours. Only players who came vote, and the winners show when it closes.
          </p>
        ) : (
          <>
            <div className="w-full bg-ink/15 rounded-full h-2 mt-4">
              <div className="bg-ink h-2 rounded-full transition-all" style={{ width: `${turnout}%` }} />
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              {voting.open && voting.closesAt && new Date(voting.closesAt).getTime() - Date.now() <= 3 * 3_600_000 ? (
                <VoteClock closesAt={voting.closesAt} />
              ) : (
                <p className="text-xs text-ink/70">{voting.open ? `Open until ${closes} · winners show when it closes` : 'Voting closed'}</p>
              )}
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-ink text-sun-400 tabular-nums whitespace-nowrap">
                {voting.ballots}/{voting.squadSize} voted
              </span>
            </div>
          </>
        )}

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-4">
          <a
            href={voting.link}
            target="_blank"
            rel="noopener noreferrer"
            className={`py-3 text-sm font-bold text-center rounded-xl border-2 border-ink transition-colors ${
              voting.notYet ? 'bg-white/50 text-ink/50 pointer-events-none' : 'bg-white text-ink hover:bg-volt-300'
            }`}
            aria-disabled={voting.notYet}
          >
            Vote now
          </a>
          <button
            onClick={share}
            className="py-3 text-sm font-bold text-white bg-[#25D366] rounded-xl border-2 border-ink hover:brightness-95 transition"
          >
            Share link
          </button>
          <button
            onClick={copy}
            className="px-4 py-3 text-sm font-bold text-sun-400 bg-ink rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Copy
          </button>
        </div>

        {voting.ballots > 0 && !voting.hidden && (
          <div className="mt-4">
            <VoteResultsList results={voting} compact />
          </div>
        )}
      </div>
    </section>
  );
}

/** "Tue 21 Oct, 8pm": when a vote closes. */
export function closeTime(at: string) {
  const d = new Date(at);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '');
  return `${day}, ${time}`;
}

/** When a vote closes, said the way people say it: "at 10pm", "tomorrow at 10pm", "Sun at 10pm". */
export function closeWords(at: string, now = new Date()) {
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '').replace(' ', '');
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(d) - day(now)) / 86_400_000);
  if (days <= 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} at ${time}`;
}

/** How long a vote has left: "2h 40m", "35 min", or null once it's shut. */
export function timeLeft(at: string, now = Date.now()) {
  const ms = new Date(at).getTime() - now;
  if (ms <= 0) return null;
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h >= 24 ? `${Math.round(h / 24) === 1 ? '1 day' : `${Math.round(h / 24)} days`}` : m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * When the vote closes, kept up to date: quiet while there's time ("Closes tomorrow at 10pm"),
 * then a pulsing countdown for the last 3 hours ("Closes in 2h 40m"). Nothing once it's shut.
 */
export function VoteClock({ closesAt, tone = 'light', className = '' }: { closesAt?: string | null; tone?: 'light' | 'sun' | 'dark'; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!closesAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [closesAt]);
  if (!closesAt) return null;
  const left = timeLeft(closesAt, now);
  if (!left) return null;
  const soon = new Date(closesAt).getTime() - now <= 3 * 3_600_000;
  if (!soon) return <span className={`text-xs ${tone === 'sun' ? 'text-ink/70' : tone === 'dark' ? 'text-white/65' : 'text-gray-500'} ${className}`}>Closes {closeWords(closesAt, new Date(now))}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-kit-500 px-2 py-0.5 text-[11px] font-extrabold text-ink tabular-nums whitespace-nowrap animate-pop-in ${className}`} role="timer" aria-label={`Voting closes in ${left}`}>
      <span className="relative flex w-1.5 h-1.5" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-ink animate-ping-soft" />
        <span className="relative w-1.5 h-1.5 rounded-full bg-ink" />
      </span>
      Closes in {left}
    </span>
  );
}

/** Slim prompt linking to the latest open vote — sits on the Players page. */
export function VotePrompt() {
  const [game, setGame] = useState<ISessionWithDetails | null>(null);
  const [voting, setVoting] = useState<SessionVoting | null>(null);

  useEffect(() => {
    getSessions()
      .then((all) => {
        const latest = all.filter(isVotingOpen).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!latest) return;
        // The server has the last word: if it says the vote has closed, there's nothing to show.
        return getSessionVoting(latest.id).then((v) => {
          if (!v.open) return;
          setGame(latest);
          setVoting(v);
        });
      })
      .catch(() => {});
  }, []);

  if (!game) return null;
  const date = new Date(`${game.date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <Link
      href={`/sessions/${game.id}/vote`}
      className="group flex items-center gap-3 mb-4 rounded-2xl bg-sun-400 border-2 border-ink px-4 py-3 hover:-translate-y-0.5 hover:shadow-sticker transition-all"
    >
      <span className="w-9 h-9 rounded-xl bg-ink text-sun-400 flex items-center justify-center font-display font-extrabold shrink-0">★</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-ink leading-tight">
          Game ended · vote open{voting?.closesAt ? ` until ${closeTime(voting.closesAt)}` : ''}
        </span>
        <span className="block text-xs text-ink/70 truncate">
          {game.group?.name ?? 'Last game'} · {date}
          {voting ? ` · ${voting.ballots} of ${voting.squadSize} voted` : ''}
        </span>
      </span>
      <span className="text-xs font-bold text-ink shrink-0 flex items-center gap-1">
        Open
        <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </span>
    </Link>
  );
}

/** What each card ability means, in a few words (said to screen readers and on long-press). */
export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  SHO: 'Shooting',
  PAS: 'Passing',
  TEC: 'Dribbling and control',
  DEF: 'Defending',
  IQ: 'Reading the game',
  PHY: 'Work rate',
  MOV: 'Movement',
  GK: 'Goalkeeping',
};

/** The card's abilities: seven outfield, plus GK once they've been nominated in goal. */
export function AttributeRow({ ratings, dark = false }: { ratings: PlayerRatings; dark?: boolean }) {
  // Only abilities with evidence (stats or award votes) have a number; the rest are left out, never made up
  const shown = (Object.keys(ATTRIBUTE_NAMES) as Attribute[]).filter((a) => ratings.attributes[a] != null);
  if (!shown.length) {
    return (
      <p className={`rounded-xl px-3 py-2.5 text-[12px] leading-snug ${dark ? 'bg-white/10 text-white/70' : 'bg-chalk text-gray-600'}`}>
        <b className={dark ? 'text-white' : 'text-ink'}>Skills show up as you play.</b> Goals, assists, saves and award votes fill them in.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-1">
      {shown.map((a) => {
        const v = ratings.attributes[a];
        return (
          <div key={a} title={ATTRIBUTE_NAMES[a]} className={`rounded-xl px-1 py-1.5 text-center ${dark ? 'bg-white/10' : 'bg-chalk border border-gray-200'}`}>
            <p className={`font-display text-lg font-extrabold tabular-nums leading-none ${dark ? 'text-white' : 'text-ink'}`}>
              {v ?? '–'}
              <span className="sr-only"> {ATTRIBUTE_NAMES[a]}</span>
            </p>
            <p className={`text-[9px] font-extrabold tracking-[0.14em] mt-1 ${dark ? 'text-volt-300' : 'text-gray-500'}`} aria-hidden>
              {a}
            </p>
          </div>
        );
      })}
    </div>
  );
}
