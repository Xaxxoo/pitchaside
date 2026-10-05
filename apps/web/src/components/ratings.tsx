'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { kitFor } from '@/components/illustrations';
import { useToast } from '@/components/toast';
import { ShareCardButton } from '@/components/share-card';
import {
  getSessions,
  getSessionVoting,
  type ISessionWithDetails,
  type LeagueTable,
  type PlayerRatings,
  type SessionVoting,
  type VoteCategory,
  type VoteResults,
} from '@/lib/api';

export const categoryMeta: Record<VoteCategory, { short: string; tone: string; chip: string; attr?: string }> = {
  potm: { short: 'POTM', tone: 'bg-sun-400 text-ink', chip: 'bg-sun-400' },
  pace: { short: 'PAC', tone: 'bg-sky-300 text-ink', chip: 'bg-sky-300', attr: 'PAC' },
  shooting: { short: 'SHO', tone: 'bg-kit-500 text-white', chip: 'bg-kit-500', attr: 'SHO' },
  passing: { short: 'PAS', tone: 'bg-volt-400 text-ink', chip: 'bg-volt-400', attr: 'PAS' },
  defending: { short: 'DEF', tone: 'bg-ink text-volt-300', chip: 'bg-ink', attr: 'DEF' },
  keeper: { short: 'GK', tone: 'bg-pitch-600 text-white', chip: 'bg-pitch-600', attr: 'GK' },
};

export function Avatar({ name, className = 'w-9 h-9 text-xs' }: { name: string; className?: string }) {
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
        const winnerName = winner ? `${winner.player.firstName} ${winner.player.lastName}` : '';
        return (
          <div
            key={c.key}
            className={`rounded-2xl border p-3.5 ${
              c.key === 'potm' && !compact ? 'bg-ink text-white border-ink' : 'bg-white border-gray-100 shadow-card'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.tone}`}>
                {meta.short}
              </span>
              <span className={`text-[11px] font-semibold ${c.key === 'potm' && !compact ? 'text-white/50' : 'text-gray-500'}`}>
                {c.title}
              </span>
            </div>
            {winner ? (
              <div className="flex items-center gap-3 mt-3">
                <Avatar name={winnerName} className="w-10 h-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-extrabold leading-tight truncate">{winnerName}</p>
                  {rest.length > 0 && (
                    <p className={`text-[11px] truncate ${c.key === 'potm' && !compact ? 'text-white/50' : 'text-gray-500'}`}>
                      {rest
                        .slice(0, 3)
                        .map((s) => `${s.player.firstName} ${s.count}`)
                        .join(' · ')}
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

/** FPL-style mini league: points from teammates' votes. */
export function LeagueTableView({ table }: { table: LeagueTable }) {
  if (table.rows.length === 0 || table.rows.every((r) => r.points === 0)) {
    return (
      <div className="text-center py-10 px-6 bg-white rounded-3xl border border-dashed border-gray-300 chalk-dots">
        <p className="font-display text-lg font-extrabold text-ink">The table is empty — for now</p>
        <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
          After each game, share the vote link from the session page. Every vote earns points here.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
      <div className="grid grid-cols-[28px_1fr_32px_40px_44px] sm:grid-cols-[32px_1fr_40px_64px_48px_48px_56px] items-center gap-2 px-4 py-2.5 bg-ink text-[10px] font-extrabold uppercase tracking-wider text-white/50">
        <span>#</span>
        <span>Player</span>
        <span className="text-center">P</span>
        <span className="hidden sm:block text-center">W-D-L</span>
        <span className="text-center">POTM</span>
        <span className="hidden sm:block text-center">OVR</span>
        <span className="text-right text-volt-300">Pts</span>
      </div>
      {table.rows.map((row, i) => {
        const name = `${row.player.firstName} ${row.player.lastName}`;
        return (
          <div
            key={row.player.id}
            className={`grid grid-cols-[28px_1fr_32px_40px_44px] sm:grid-cols-[32px_1fr_40px_64px_48px_48px_56px] items-center gap-2 px-4 py-3 border-t border-gray-100 ${
              i === 0 ? 'bg-volt-100' : ''
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold tabular-nums ${
                i === 0 ? 'bg-sun-400 text-ink' : i === 1 ? 'bg-gray-200 text-ink' : i === 2 ? 'bg-kit-400/30 text-ink' : 'text-gray-500'
              }`}
            >
              {i + 1}
            </span>
            <span className="flex items-center gap-2.5 min-w-0">
              <Avatar name={name} className="w-8 h-8 text-[11px]" />
              <span className="text-sm font-bold text-ink truncate">{name}</span>
              {row.potmWins > 0 && (
                <span className="hidden sm:inline text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-sun-400 text-ink shrink-0">
                  ★{row.potmWins}
                </span>
              )}
            </span>
            <span className="text-center text-sm text-gray-500 tabular-nums">{row.games}</span>
            <span className="hidden sm:block text-center text-xs font-semibold text-gray-500 tabular-nums">
              {row.record.w}-{row.record.d}-{row.record.l}
            </span>
            <span className="text-center text-sm text-gray-500 tabular-nums">{row.votes.potm}</span>
            <span className="hidden sm:block text-center text-sm font-bold text-ink tabular-nums">{row.ovr ?? '–'}</span>
            <span className="text-right font-display text-lg font-extrabold text-ink tabular-nums">{row.points}</span>
          </div>
        );
      })}
      <p className="px-4 py-3 border-t border-gray-100 text-[11px] text-gray-500">
        {table.points.potmVote} pts per Player of the Match vote · {table.points.attrVote} pt per award vote · +{table.points.potmWin} for
        winning POTM
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
    const text = `⚽ ${groupName} — who was Player of the Match? Vote in 30 seconds: ${voting.link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const copy = () =>
    navigator.clipboard.writeText(voting.link).then(
      () => toast.success('Vote link copied'),
      () => toast.error('Could not copy'),
    );
  const turnout = voting.squadSize ? Math.round((voting.ballots / voting.squadSize) * 100) : 0;

  return (
    <section className="mb-6 rounded-[28px] bg-sun-400 border-2 border-ink shadow-sticker p-5 relative overflow-hidden">
      <div className="absolute inset-0 chalk-dots opacity-50 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink/60">Post-match vote</p>
            <h2 className="text-xl font-extrabold text-ink leading-tight mt-0.5">Who were the stars?</h2>
            {context && (
              <Link href={context.href} className="text-xs font-bold text-ink/70 underline decoration-ink/30 underline-offset-2 hover:text-ink">
                {context.label}
              </Link>
            )}
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-ink text-sun-400 tabular-nums whitespace-nowrap">
            {voting.ballots}/{voting.squadSize} voted
          </span>
        </div>

        {voting.notYet ? (
          <p className="text-sm text-ink/70 mt-2">
            Voting opens on match day. Share the link after the final whistle — players rate each other and it feeds their card
            ratings and the group table.
          </p>
        ) : (
          <>
            <div className="w-full bg-ink/15 rounded-full h-2 mt-4">
              <div className="bg-ink h-2 rounded-full transition-all" style={{ width: `${turnout}%` }} />
            </div>
            <p className="text-xs text-ink/70 mt-2">
              {voting.open
                ? `Open until ${new Date(voting.closesAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
                : 'Voting closed'}
            </p>
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

        {voting.ballots > 0 && (
          <div className="mt-4">
            <VoteResultsList results={voting} compact />
            <ShareCardButton
              token={voting.token}
              caption={`⚽ ${groupName} — match day. Who were the stars?`}
              className="mt-3 w-full py-3 text-sm font-bold text-ink bg-white rounded-xl border-2 border-ink hover:bg-volt-300 transition-colors"
            >
              Share the match card
            </ShareCardButton>
          </div>
        )}
      </div>
    </section>
  );
}

/** True while a game is inside its match-day + 7 days voting window. */
export function isVotingOpen(session: Pick<ISessionWithDetails, 'date' | 'kind' | 'status'>) {
  if (session.kind === 'dues' || session.status === 'cancelled') return false;
  const day = new Date(`${session.date.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return day <= today && day >= today - 7 * 86400000;
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
        setGame(latest);
        return getSessionVoting(latest.id).then(setVoting);
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
        <span className="block text-sm font-extrabold text-ink leading-tight">Post-match vote is open</span>
        <span className="block text-xs text-ink/70 truncate">
          {game.group?.name ?? 'Last game'} · {date}
          {voting ? ` · ${voting.ballots}/${voting.squadSize} voted` : ''}
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

/** PAC / SHO / PAS / DEF row for the player card. */
export function AttributeRow({ ratings, dark = false }: { ratings: PlayerRatings; dark?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {(['PAC', 'SHO', 'PAS', 'DEF', 'GK'] as const).map((a) => {
        const v = ratings.attributes[a];
        return (
          <div key={a} className={`rounded-xl px-1 py-1.5 text-center ${dark ? 'bg-white/10' : 'bg-chalk border border-gray-200'}`}>
            <p className={`font-display text-lg font-extrabold tabular-nums leading-none ${dark ? 'text-white' : 'text-ink'}`}>
              {v ?? '–'}
            </p>
            <p className={`text-[9px] font-extrabold tracking-[0.14em] mt-1 ${dark ? 'text-volt-300' : 'text-gray-500'}`}>{a}</p>
          </div>
        );
      })}
    </div>
  );
}
