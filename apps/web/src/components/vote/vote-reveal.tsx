'use client';

import type { CSSProperties } from 'react';
import type { Bibs } from '@pitchaside/shared';
import type { CardPlayer, MatchCard } from '@/app/share/[token]/match-card';
import type { TeamKey, VoteResults } from '@/lib/api';
import { Avatar, categoryMeta } from '@/components/ratings';
import { BibShirt } from '@/components/bib-shirt';
import { Trophy } from '@/components/illustrations';
import { stagger } from '@/components/motion';
import { bibFill, bibTint, teamName } from '@/lib/teams';

type Category = VoteResults['categories'][number];
type Standing = Category['standings'][number];

const nameOf = (s: Standing) => s.player.nickname || s.player.firstName;
const fullOf = (s: Standing) => `${s.player.firstName} ${s.player.lastName}`;
const votes = (n: number) => `${n} vote${n === 1 ? '' : 's'}`;
/** Everyone level with the top: a tie is shared, never decided by list order. */
const top = (c: Category | undefined) => (c?.standings.length ? c.standings.filter((s) => s.count === c.standings[0].count) : []);
const both = (list: Standing[]) => (list.length > 2 ? `${list.slice(0, 2).map(nameOf).join(', ')} +${list.length - 2}` : list.map(nameOf).join(' & '));

/** Played under half their side's games: why their votes counted half. */
const light = (s: Standing) => (s.played != null && s.of ? `played ${s.played} of ${s.of}` : null);

/** Their day in numbers, for a line under a name: "2 goals · 1 assist". */
function dayLine(p: CardPlayer | undefined) {
  if (!p) return '';
  const bits = [
    p.goals ? `${p.goals} goal${p.goals === 1 ? '' : 's'}` : null,
    p.assists ? `${p.assists} assist${p.assists === 1 ? '' : 's'}` : null,
    p.saves ? `${p.saves} save${p.saves === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

/**
 * How the vote ended, told like an announcement: Player of the Match in the spotlight, the Team of
 * the Day, the Best VII on a pitch, the best on each team, then the awards. The match card fills in
 * each winner's day (goals, assists) and the Team of the Day; without it the votes still show.
 */
export function VoteReveal({ results, card }: { results: VoteResults; card: MatchCard | null }) {
  const bibs = results.bibs ?? card?.bibs;
  const players = new Map((card?.players ?? []).map((p) => [p.id, p]));
  const potm = results.categories.find((c) => c.key === 'potm');
  const vii = results.categories.find((c) => c.key === 'vii');
  const mates = results.categories.filter((c) => c.key === 'teammate' && c.standings.length);
  const awards = results.categories.filter((c) => !['potm', 'vii', 'teammate'].includes(c.key));
  const named = awards.filter((c) => !c.inconclusive && c.standings.length);
  const unnamed = awards.filter((c) => c.inconclusive);
  let n = 0;
  const rise = () => ({ className: 'animate-rise', style: stagger(n++, 90) });

  return (
    <div className="space-y-3">
      {potm && top(potm).length > 0 && <PlayerOfTheMatch c={potm} players={players} bibs={bibs} card={card} anim={rise()} />}
      {card?.teamOfTheDay && <TeamOfTheDay card={card} anim={rise()} />}
      {vii && vii.standings.length >= 6 && <BestSeven c={vii} card={card} anim={rise()} />}
      {mates.length > 0 && (
        <section aria-labelledby="best-on" className="animate-rise rounded-3xl bg-white border border-gray-100 shadow-card overflow-hidden" style={stagger(n++, 90)}>
          <h3 id="best-on" className="px-4 pt-3.5 pb-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
            Best on each team
          </h3>
          <ul className="divide-y divide-gray-100">
            {mates.map((c) => {
              const w = top(c);
              return (
                <li key={c.team ?? ''} className="flex items-center gap-3 px-4 py-2.5 min-h-14">
                  <Avatar name={fullOf(w[0])} photoKey={w[0].player.photoKey} className="w-10 h-10 text-xs" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold text-ink truncate">{both(w)}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-gray-500 min-w-0">
                      {c.team && <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={bibFill(c.team as TeamKey, bibs)} aria-hidden />}
                      <span className="truncate">
                        {c.team ? teamName(c.team as TeamKey, card?.captains as Record<string, string> | undefined, bibs) : 'Their team'} · {votes(w[0].count)}
                        {light(w[0]) ? ` · ${light(w[0])}` : ''}
                      </span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {mates.some((c) => c.standings.some((x) => light(x))) && (
            <p className="px-4 pb-3 text-[12px] leading-snug text-gray-500">Votes for someone who played under half their team’s games count half.</p>
          )}
        </section>
      )}
      {(named.length > 0 || unnamed.length > 0) && (
        <section aria-labelledby="awards" className="animate-rise" style={stagger(n++, 90)}>
          <h3 id="awards" className="px-1 mt-2 mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
            Awards
          </h3>
          {named.length > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {named.map((c) => {
                const w = top(c);
                const meta = categoryMeta[c.key];
                return (
                  <li key={c.key} className="min-w-0 rounded-3xl bg-white border border-gray-100 shadow-card p-3">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${meta.tone}`}>{meta.short}</span>
                      <span className="truncate text-[12px] font-semibold text-gray-500">{c.title}</span>
                    </span>
                    <span className="mt-2.5 flex items-center gap-2 min-w-0">
                      <Avatar name={fullOf(w[0])} photoKey={w[0].player.photoKey} className="w-9 h-9 text-[11px]" />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-extrabold text-ink truncate">{both(w)}</span>
                        <span className="block text-[11px] text-gray-500 tabular-nums">{votes(w[0].count)}</span>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {unnamed.length > 0 && (
            <p className="mt-2 px-1 text-[12px] leading-snug text-gray-500">
              <b className="font-semibold text-gray-700">Not enough votes to call: </b>
              {unnamed.map((c) => c.title).join(', ')}. An award needs 3 people to pick.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** The spotlight: the winner big, their day in numbers, and who came next. */
function PlayerOfTheMatch({ c, players, bibs, card, anim }: { c: Category; players: Map<string, CardPlayer>; bibs?: Bibs; card: MatchCard | null; anim: { className: string; style: CSSProperties } }) {
  const w = top(c);
  const shared = w.length > 1;
  const p = players.get(w[0].playerId);
  const next = c.standings.find((s) => s.count < w[0].count);
  const line = shared ? `${votes(w[0].count)} each` : [votes(w[0].count), dayLine(p)].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby="potm" className={`${anim.className} relative overflow-hidden rounded-3xl bg-ink text-white shadow-sticker`} style={anim.style}>
      <span className="absolute inset-0 turf-stripes opacity-70" aria-hidden />
      <Trophy className="absolute -right-6 -top-3 w-40 opacity-95" />
      <div className="relative p-5 pr-24">
        <h3 id="potm" className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-volt-300">
          {shared ? 'Players of the Match' : 'Player of the Match'}
        </h3>
        <div className="mt-4 flex -space-x-3">
          {w.slice(0, 3).map((s) => (
            <span key={s.playerId} className="rounded-full ring-4 ring-volt-300 animate-pop-in" style={{ animationDelay: '220ms' }}>
              <Avatar name={fullOf(s)} photoKey={s.player.photoKey} className="w-16 h-16 text-lg" />
            </span>
          ))}
        </div>
        <p className="mt-3 font-display text-[30px] leading-[1.05] font-extrabold text-white truncate">{shared ? both(w) : nameOf(w[0])}</p>
        {!shared && p?.team && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-white/70 min-w-0">
            <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={bibFill(p.team as TeamKey, bibs)} aria-hidden />
            <span className="truncate">
              {/* Their real name only when the big one is a nickname */}
              {w[0].player.nickname ? `${w[0].player.firstName} ${w[0].player.lastName} · ` : ''}
              {teamName(p.team as TeamKey, card?.captains as Record<string, string> | undefined, bibs)}
            </span>
          </p>
        )}
      </div>
      <div className="relative flex items-center gap-2 border-t border-white/10 bg-white/[0.04] px-5 py-3 text-[13px] tabular-nums min-w-0">
        <span className="font-bold text-volt-300 shrink-0">{line}</span>
        {next && <span className="ml-auto truncate text-white/55">Next: {nameOf(next)} {next.count}</span>}
      </div>
    </section>
  );
}

/** The side that topped the day: its bib, its record, and who played in it. */
function TeamOfTheDay({ card, anim }: { card: MatchCard; anim: { className: string; style: CSSProperties } }) {
  const t = card.teamOfTheDay!;
  const team = t.team as TeamKey;
  const squad = (card.players ?? []).filter((p) => p.team === t.team);
  const names = squad.length ? squad.map((p) => p.short) : t.players;
  const shown = squad.slice(0, 5);
  return (
    <section aria-labelledby="totd" className={`${anim.className} rounded-3xl border border-gray-100 shadow-card p-4`} style={{ ...anim.style, ...bibTint(team, card.bibs) }}>
      <div className="flex items-center gap-3">
        <BibShirt team={team} bibs={card.bibs} className="w-12 h-12 shrink-0" />
        <span className="min-w-0">
          <h3 id="totd" className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
            Team of the Day
          </h3>
          <span className="block font-display text-[22px] leading-tight font-extrabold text-ink truncate">{teamName(team, card.captains as Record<string, string> | undefined, card.bibs)}</span>
        </span>
        <span className="ml-auto shrink-0 text-right">
          <span className="block font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">{t.pts}</span>
          <span className="block text-[11px] font-bold text-gray-500">pts</span>
        </span>
      </div>
      <p className="mt-2 text-[13px] font-bold text-ink tabular-nums">
        Won {t.w} · drew {t.d} · lost {t.l}
      </p>
      {names.length > 0 && (
        <div className="mt-3 flex items-center gap-2 min-w-0">
          {shown.length > 0 && (
            <span className="flex -space-x-2 shrink-0" aria-hidden>
              {shown.map((p) => (
                <span key={p.id} className="rounded-full ring-2 ring-white">
                  <Avatar name={p.name} photoKey={p.photoKey} className="w-8 h-8 text-[10px]" />
                </span>
              ))}
              {squad.length > shown.length && (
                <span className="w-8 h-8 rounded-full ring-2 ring-white bg-ink text-volt-300 text-[10px] font-extrabold flex items-center justify-center">+{squad.length - shown.length}</span>
              )}
            </span>
          )}
          <span className="truncate text-[13px] text-gray-600">{names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(' & ')}</span>
        </div>
      )}
    </section>
  );
}

/** The players' Best VII on a pitch: the keeper in goal (when the vote had one), the rest in rows, the sub on the bench. */
function BestSeven({ c, card, anim }: { c: Category; card: MatchCard | null; anim: { className: string; style: CSSProperties } }) {
  const keeper = c.keeperId ? c.standings.find((s) => s.playerId === c.keeperId) : undefined;
  const rest = c.standings.filter((s) => s !== keeper);
  // Seven in all: the last one is the sub
  const sub = c.standings.length === 7 ? rest[rest.length - 1] : undefined;
  const outfield = sub ? rest.slice(0, -1) : rest;
  const rows = keeper ? [outfield.slice(0, 2), outfield.slice(2, 3), outfield.slice(3)] : [outfield.slice(0, 2), outfield.slice(2, 4), outfield.slice(4)];
  const players = new Map((card?.players ?? []).map((p) => [p.id, p]));
  const face = (s: Standing, gk = false) => {
    const tally = dayLine(players.get(s.playerId)).replace(/ goals?/, 'G').replace(/ assists?/, 'A').replace(/ saves?/, 'S').replace(/ · /g, ' ');
    return (
      <li key={s.playerId} className="w-[76px] flex flex-col items-center min-w-0">
        <span className="relative">
          <Avatar name={fullOf(s)} photoKey={s.player.photoKey} className="w-11 h-11 text-xs ring-2 ring-white/80" />
          {gk && <span className="absolute -bottom-1 -right-2 rounded-full bg-ink px-1.5 text-[9px] font-extrabold leading-4 text-volt-300">GK</span>}
          {tally && <span className="absolute -top-1.5 -right-3 rounded-full bg-volt-300 px-1 text-[9px] font-extrabold leading-4 text-ink">{tally}</span>}
        </span>
        <span className="mt-1 max-w-full truncate rounded-md bg-ink/70 px-1.5 text-[11px] font-bold leading-4 text-white">{nameOf(s)}</span>
      </li>
    );
  };
  return (
    <section aria-labelledby="vii" className={`${anim.className} rounded-3xl bg-ink p-2 shadow-sticker`} style={anim.style}>
      <h3 id="vii" className="flex items-center gap-2 px-2.5 pt-1.5 pb-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-volt-300">Best VII of the Day</span>
        <span className="ml-auto text-[11px] font-semibold text-white/50">Picked by the players</span>
      </h3>
      <div className="relative overflow-hidden rounded-2xl bg-pitch-600 px-2 py-3">
        <span className="absolute inset-0 turf-stripes opacity-60" aria-hidden />
        <span className="absolute left-1/2 -top-10 w-20 h-20 -translate-x-1/2 rounded-full border-2 border-white/25" aria-hidden />
        <span className="absolute left-1/2 bottom-0 w-2/5 h-12 -translate-x-1/2 border-2 border-b-0 border-white/25" aria-hidden />
        <ol className="relative space-y-2.5" aria-label="Best VII of the Day">
          {rows.filter((r) => r.length).map((r, i) => (
            <li key={i}>
              <ol className="flex justify-center gap-2">{r.map((s) => face(s))}</ol>
            </li>
          ))}
          {keeper && (
            <li>
              <ol className="flex justify-center">{face(keeper, true)}</ol>
            </li>
          )}
        </ol>
      </div>
      {sub && (
        <p className="mt-2 flex items-center gap-2 px-2.5 pb-1 text-[13px] text-white/80 min-w-0">
          <span className="shrink-0 text-[11px] font-extrabold text-white/50">SUB</span>
          <Avatar name={fullOf(sub)} photoKey={sub.player.photoKey} className="w-7 h-7 text-[10px]" />
          <span className="truncate font-bold text-white">{nameOf(sub)}</span>
        </p>
      )}
    </section>
  );
}
