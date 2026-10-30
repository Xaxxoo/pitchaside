'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ratings';
import { FilterBar, FilterMenu } from '@/components/filter-menu';
import { stagger } from '@/components/motion';
import { RatingBreakdownSheet } from '@/components/rating-breakdown-sheet';
import { getGroupTable, getRatingBreakdown, getRatingTrial, type LeagueTable, type RatingBreakdown, type RatingTrial, type TableRange } from '@/lib/api';
import { SteadyNotice } from '@/components/squad/steady-notice';

/**
 * Where the table and stats come from: the organiser's routes, or the player app's (which check the
 * player is in the group). A player has no player page to open, so `playerHref` is null and tapping
 * a row shows how that player's rating is made instead.
 */
export interface ClubApi {
  table: (groupId: string, range?: TableRange) => Promise<LeagueTable>;
  ratings: (groupId: string) => Promise<RatingTrial>;
  breakdown: (playerId: string) => Promise<RatingBreakdown | null>;
  playerHref: ((playerId: string) => string) | null;
}

export const ORGANISER_CLUB: ClubApi = {
  table: getGroupTable,
  ratings: getRatingTrial,
  breakdown: getRatingBreakdown,
  playerHref: (id) => `/players/${id}`,
};

type Row = LeagueTable['rows'][number];
type Parts = RatingTrial['rows'][number]['parts'];
const PARTS = [
  ['stats', 'Stats'],
  ['votes', 'Votes'],
  ['results', 'Results'],
] as const;
/** A match rating out of 10, one decimal ("7.4"), or a dash before there is one. */
const fmtRating = (n: number | null | undefined) => (n == null ? '–' : n.toFixed(1));
/** Where a 40–99 score sits along a bar, and where the club's middle (70) is. */
const along = (n: number) => `${Math.max(0, Math.min(100, ((n - 40) / 59) * 100))}%`;
export type StatSort =
  | 'rating'
  | 'goals'
  | 'assists'
  | 'contrib'
  | 'plusMinus'
  | 'potm'
  | 'vii'
  | 'wins'
  | 'bestOnTeam'
  | 'teamOfDay'
  | 'saves'
  | 'yellow'
  | 'red'
  | 'games';

/** Every number the list can rank by: its name, the short label beside the value, and how to read it. */
const STATS: { key: StatSort; label: string; unit: string; of: (r: Row) => number; perGame: boolean }[] = [
  { key: 'rating', label: 'Rating', unit: 'rating', of: (r) => r.ovr ?? 0, perGame: false },
  { key: 'goals', label: 'Goals', unit: 'goals', of: (r) => r.goals, perGame: true },
  { key: 'assists', label: 'Assists', unit: 'assists', of: (r) => r.assists, perGame: true },
  { key: 'contrib', label: 'Goals + assists', unit: 'G+A', of: (r) => r.goals + r.assists, perGame: true },
  { key: 'plusMinus', label: 'Plus/minus', unit: '+/−', of: (r) => r.plusMinus ?? 0, perGame: true },
  { key: 'potm', label: 'Player of the Match', unit: 'POTM', of: (r) => r.potmWins, perGame: true },
  { key: 'vii', label: 'Best VII of the Day', unit: 'Best VII', of: (r) => r.viiOfDay, perGame: true },
  { key: 'wins', label: 'Games won', unit: 'won', of: (r) => r.record.w, perGame: true },
  { key: 'bestOnTeam', label: 'Best on their team', unit: 'best on team', of: (r) => r.bestOnTeam, perGame: true },
  { key: 'teamOfDay', label: 'Team of the Day', unit: 'Team of Day', of: (r) => r.teamOfDay, perGame: true },
  { key: 'saves', label: 'Saves', unit: 'saves', of: (r) => r.saves ?? 0, perGame: true },
  { key: 'yellow', label: 'Yellow cards', unit: 'yellows', of: (r) => r.yellowCards ?? 0, perGame: true },
  { key: 'red', label: 'Red cards', unit: 'reds', of: (r) => r.redCards ?? 0, perGame: true },
  { key: 'games', label: 'Games played', unit: 'played', of: (r) => r.games, perGame: false },
];

const nameOf = (r: Row) => r.player.nickname || `${r.player.firstName} ${r.player.lastName}`.trim();

/**
 * Every player in the group, ranked by one number, like FPL's player stats: rating, goals,
 * assists, Player of the Match and the rest, in totals or per game. Rating rows show what the
 * number is made of. Tapping a player opens their profile.
 */
export function GroupStats({
  groupId,
  sort,
  onSort,
  api = ORGANISER_CLUB,
}: {
  groupId: string;
  sort: StatSort;
  onSort: (s: StatSort) => void;
  api?: ClubApi;
}) {
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [parts, setParts] = useState<Map<string, RatingTrial['rows'][number]>>(new Map());
  const [failed, setFailed] = useState<string | false>(false);
  const [per, setPer] = useState<'total' | 'game'>('total');
  const [explaining, setExplaining] = useState<Row | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    api
      .table(groupId)
      .then(setTable)
      .catch((err) => setFailed(err instanceof Error ? err.message : ''));
    // What each rating is made of; the list still works without it.
    api
      .ratings(groupId)
      .then((t) => setParts(new Map(t.rows.map((r) => [r.player.id, r]))))
      .catch(() => setParts(new Map()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  useEffect(() => {
    setTable(null);
    load();
  }, [load]);

  const stat = STATS.find((s) => s.key === sort) ?? STATS[0];
  const byGame = per === 'game' && stat.perGame;
  const value = (r: Row) => (byGame ? (r.games ? stat.of(r) / r.games : 0) : stat.of(r));
  const fmt = (n: number) => {
    const v = byGame ? Math.round(n * 100) / 100 : n;
    // Plus/minus reads with its sign: +3, −2, 0
    return sort === 'plusMinus' ? (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0') : String(v);
  };

  const played = (table?.rows ?? []).filter((r) => r.games > 0);
  // Counting stats list only players who have one; the rest fold into a line (a 0 isn't a place).
  const counts = sort !== 'rating' && sort !== 'games' && sort !== 'plusMinus';
  const none = counts ? played.filter((r) => stat.of(r) === 0).length : 0;
  const rows = [...(counts ? played.filter((r) => stat.of(r) > 0) : played)].sort((a, b) => value(b) - value(a) || (b.ovr ?? 0) - (a.ovr ?? 0) || nameOf(a).localeCompare(nameOf(b)));
  const notYet = (table?.rows.length ?? 0) - played.length;
  const steady = table?.ratingMode === 'steady';

  return (
    <section aria-labelledby="stats-title">
      <h2 id="stats-title" className="text-base font-bold text-ink">
        Stats
      </h2>
      <p className="mb-2.5 text-xs text-gray-500">Every player, ranked. Pick what to rank by.</p>
      {table && <SteadyNotice switchedAt={table.ratingsSwitchedAt ?? null} />}
      <FilterBar>
        <FilterMenu
          label="Rank by"
          title="Rank by"
          value={sort}
          onChange={onSort}
          columns={2}
          options={STATS.map((s) => ({ value: s.key, label: s.label }))}
        />
        {stat.perGame && (
          <FilterMenu
            label="Show"
            value={per}
            onChange={setPer}
            columns={2}
            options={[
              { value: 'total', label: 'Totals' },
              { value: 'game', label: 'Per game' },
            ]}
          />
        )}
      </FilterBar>

      {failed !== false ? (
        <div className="py-10 text-center" role="alert">
          <p className="text-sm text-gray-600">Stats didn&apos;t load.</p>
          {failed && <p className="mt-1 text-[12px] text-gray-500">The server said: “{failed}”</p>}
          <button onClick={load} className="mt-2 h-11 px-3 text-sm font-bold text-pitch-700">
            Try again
          </button>
        </div>
      ) : !table ? (
        <div className="mt-3 h-64 rounded-3xl bg-gray-100 animate-pulse" aria-busy aria-label="Loading stats" />
      ) : played.length === 0 ? (
        <p className="mt-3 rounded-3xl bg-chalk px-4 py-8 text-center text-sm text-gray-600">No one has played a game with scores yet.</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 rounded-3xl bg-chalk px-4 py-8 text-center text-sm text-gray-600">
          No {stat.label.toLowerCase()} recorded yet.{' '}
          {sort === 'goals' || sort === 'assists' || sort === 'contrib'
            ? 'Add scorers on match day.'
            : sort === 'saves' || sort === 'yellow' || sort === 'red'
              ? 'Add them under Cards and saves on match day.'
              : ''}
        </p>
      ) : (
        <>
          {sort === 'rating' && <RatingSpotlight top={rows.filter((r) => value(r) === value(rows[0]))} parts={parts} of={played.length} steady={steady} onExplain={setExplaining} />}
          <div className="mt-3 bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
            {sort === 'rating' && !steady && (
              <div className="flex items-center gap-3 px-3.5 pt-2.5 pb-2 border-b border-gray-100 text-[9px] font-extrabold uppercase tracking-[0.1em] text-gray-500" aria-hidden>
                <span className="w-6 shrink-0 text-center">#</span>
                <span className="w-9 shrink-0" />
                <span className="flex-1 min-w-0 grid grid-cols-3 gap-2">
                  {PARTS.map(([k, label]) => (
                    <span key={k}>{label}</span>
                  ))}
                </span>
                <span className="w-12 shrink-0 text-center">OVR</span>
              </div>
            )}
            <ol className="divide-y divide-gray-100" aria-label={`Ranked by ${stat.label}`}>
              {rows.map((r, i) => {
                const v = value(r);
                // Level players share a place.
                const place = 1 + rows.findIndex((x) => value(x) === v);
                const joint = rows.filter((x) => value(x) === v).length > 1;
                const p = parts.get(r.player.id);
                const name = nameOf(r);
                return (
                  <li key={r.player.id} className="animate-rise" style={stagger(Math.min(i, 12), 20, 0)}>
                    <RowLink
                      href={api.playerHref?.(r.player.id) ?? null}
                      onTap={() => setExplaining(r)}
                      label={`${name}: how their rating is made`}
                      className="press w-full text-left flex items-center gap-3 min-h-16 px-3.5 py-2.5 hover:bg-chalk/60"
                    >
                      <span
                        className={`w-6 shrink-0 text-center font-display text-[15px] font-extrabold tabular-nums ${place <= 3 && v > 0 ? 'text-pitch-700' : 'text-gray-400'}`}
                        aria-label={joint ? `Joint ${place}` : `${place}`}
                      >
                        {i > 0 && value(rows[i - 1]) === v ? '=' : place}
                      </span>
                      <Avatar name={name} photoKey={r.player.photoKey} className="w-9 h-9 text-[11px]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-bold text-ink truncate">{name}</span>
                        {sort === 'rating' && p && !steady ? (
                          <PartBars parts={p.parts} />
                        ) : sort === 'rating' && p?.steady ? (
                          <span className="block text-[12px] text-gray-500 tabular-nums truncate">
                            Form {fmtRating(p.steady.form)} · last {fmtRating(p.steady.last)}
                          </span>
                        ) : (
                          <span className="block text-[12px] text-gray-500 tabular-nums truncate">
                            {r.games} played · {r.goals} G · {r.assists} A{r.potmWins ? ` · ★ ${r.potmWins}` : ''}
                          </span>
                        )}
                      </span>
                      {sort === 'rating' ? (
                        <span className="shrink-0 w-12 h-12 rounded-xl bg-ink flex flex-col items-center justify-center leading-none">
                          <span className="font-display text-[19px] font-extrabold text-volt-300 tabular-nums">{fmt(v)}</span>
                          <span className="mt-0.5 text-[8px] font-extrabold tracking-[0.14em] text-white/60">OVR</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-right">
                          <span className="block font-display text-[20px] leading-none font-extrabold text-ink tabular-nums">{fmt(v)}</span>
                          <span className="block mt-0.5 text-[10px] font-bold text-gray-500">{byGame ? `${stat.unit} a game` : stat.unit}</span>
                        </span>
                      )}
                    </RowLink>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
      {table && rows.length > 0 && none > 0 && (
        <p className="mt-2 px-1 text-[12px] text-gray-500">
          {none} other player{none === 1 ? ' has' : 's have'} none.
        </p>
      )}
      {table && notYet > 0 && (
        <p className="mt-2 px-1 text-[12px] text-gray-500">
          {notYet} player{notYet === 1 ? ' hasn’t' : 's haven’t'} played a game with scores yet.
        </p>
      )}
      {explaining && (
        <RatingBreakdownSheet
          name={`${explaining.player.firstName} ${explaining.player.lastName}`}
          load={() => api.breakdown(explaining.player.id)}
          onClose={() => setExplaining(null)}
        />
      )}
    </section>
  );
}

/** A rating's three parts as thin bars, each with a tick at the club's middle (70). */
function PartBars({ parts }: { parts: Parts }) {
  return (
    <span className="mt-1.5 grid grid-cols-3 gap-2" aria-label={`Stats ${parts.stats}, votes ${parts.votes}, results ${parts.results}`}>
      {PARTS.map(([k]) => (
        <span key={k} className="min-w-0" aria-hidden>
          <span className={`block font-display text-[13px] leading-none font-extrabold tabular-nums ${parts[k] > 70 ? 'text-pitch-700' : parts[k] < 70 ? 'text-kit-600' : 'text-ink'}`}>{parts[k]}</span>
          <span className="relative mt-1 block h-1.5 rounded-full bg-gray-100">
            <span className="block h-1.5 rounded-full bg-pitch-500" style={{ width: along(parts[k]) }} />
            <span className="absolute -top-0.5 h-2.5 w-px bg-ink/40" style={{ left: along(70) }} />
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * The top of the rating list as a hero: who leads the club (or who shares the lead), their card
 * number, what it is made of against the club's middle, and how the number is built. "How it's
 * made" opens the same breakdown as tapping a player card.
 */
function RatingSpotlight({
  top,
  parts,
  of,
  steady,
  onExplain,
}: {
  top: Row[];
  parts: Map<string, RatingTrial['rows'][number]>;
  of: number;
  steady: boolean;
  onExplain: (r: Row) => void;
}) {
  const lead = top[0];
  const p = steady ? undefined : parts.get(lead.player.id)?.parts;
  const st = steady ? parts.get(lead.player.id)?.steady : null;
  const name = `${lead.player.firstName} ${lead.player.lastName}`.trim();
  const others = top.length - 1;
  return (
    <section aria-label="Top rated" className="mt-3 relative overflow-hidden rounded-3xl bg-ink text-white shadow-card animate-pop-in">
      <span className="absolute inset-0 turf-stripes" aria-hidden />
      <div className="relative p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-volt-300">
          {others ? `Joint top rated · ${top.length} players` : `Top rated of ${of}`}
        </p>
        <div className="mt-3 flex items-center gap-3.5">
          <span className="relative shrink-0">
            <Avatar name={name} photoKey={lead.player.photoKey} className="w-16 h-16 text-[18px] ring-2 ring-white/20" />
            <span className="absolute -bottom-1.5 -right-1.5 min-w-9 h-9 px-1 rounded-xl bg-ink border-2 border-volt-300 text-volt-300 flex items-center justify-center font-display text-[17px] font-extrabold tabular-nums">
              {lead.ovr ?? '–'}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[22px] leading-tight font-extrabold break-words">{name}</span>
            {lead.player.nickname && <span className="block text-[13px] font-bold text-volt-300 truncate">“{lead.player.nickname}”</span>}
            <span className="block mt-0.5 text-[12px] text-white/70 tabular-nums">
              {lead.games} played · {lead.goals} G · {lead.assists} A{lead.potmWins ? ` · ${lead.potmWins} POTM` : ''}
            </span>
            {others > 0 && (
              <span className="block mt-0.5 text-[12px] text-white/70">
                Level with {top
                  .slice(1, 3)
                  .map((r) => r.player.nickname || r.player.firstName)
                  .join(', ')}
                {others > 2 ? ` and ${others - 2} more` : ''}
              </span>
            )}
          </span>
        </div>
        {p && (
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {PARTS.map(([k, label]) => (
              <div key={k} className="min-w-0 rounded-2xl bg-white/[0.07] px-2.5 py-2">
                <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/60 truncate">{label}</dt>
                <dd className="mt-0.5 font-display text-[20px] leading-none font-extrabold tabular-nums">{p[k]}</dd>
                <dd className="relative mt-1.5 h-1.5 rounded-full bg-white/10" aria-hidden>
                  <span className="block h-1.5 rounded-full bg-volt-300 animate-fill-grow" style={{ width: along(p[k]) }} />
                  <span className="absolute -top-0.5 h-2.5 w-px bg-white/60" style={{ left: along(70) }} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {st && (
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {(
              [
                ['Form', fmtRating(st.form)],
                ['Last match', fmtRating(st.last)],
                ['Days rated', String(st.matchDays)],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="min-w-0 rounded-2xl bg-white/[0.07] px-2.5 py-2">
                <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/60 truncate">{label}</dt>
                <dd className="mt-0.5 font-display text-[20px] leading-none font-extrabold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-[12px] leading-snug text-white/70">
          {steady
            ? 'Form is their average match rating out of 10. The rating follows it, a few points at most each match day.'
            : 'Every rating is 40% stats, 40% votes and 20% team results, each against the rest of the club. The line on each bar is the middle, 70.'}
        </p>
        <button
          onClick={() => onExplain(lead)}
          className="press mt-3 w-full min-h-11 rounded-full bg-white/10 text-[14px] font-bold text-white hover:bg-white/15"
        >
          How {lead.player.nickname || lead.player.firstName}’s {lead.ovr} is made
        </button>
      </div>
    </section>
  );
}

/** A row that opens the player's page where there is one, or how their rating is made. */
function RowLink({ href, onTap, label, className, children }: { href: string | null; onTap: () => void; label: string; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onTap} aria-label={label} className={className}>
      {children}
    </button>
  );
}
