'use client';

import { useState } from 'react';
import type { ComparedStat, PlayerRatings, StatCompare, VoteCategory } from '@/lib/api';
import { InfoTip } from '@/components/info-tip';

/** The awards voted on after games, in the ballot's order, with the old Fastest kept as The Engine. */
const AWARDS: { key: VoteCategory; title: string }[] = [
  { key: 'shooting', title: 'Best Finisher' },
  { key: 'passing', title: 'Best Passer' },
  { key: 'dribbling', title: 'Best Dribbler' },
  { key: 'defending', title: 'Best Defender' },
  { key: 'smartest', title: 'Smartest Player' },
  { key: 'engine', title: 'The Engine' },
  { key: 'playmaker', title: 'Best Playmaker' },
  { key: 'movement', title: 'Best Off-Ball Movement' },
  { key: 'keeper', title: 'Best Goalkeeper' },
];

/** Two or three choices side by side, the whole width: which slice of the numbers to show. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex p-1 bg-chalk rounded-2xl">
      {options.map(([k, text]) => (
        <button
          key={k}
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`press flex-1 min-h-10 px-3 rounded-xl text-[13px] font-bold transition-colors ${value === k ? 'bg-ink text-volt-300 shadow-card' : 'text-gray-600 hover:text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** The numbers the tracker compares with the club, in their usual order. */
const TRACKED: { key: ComparedStat; label: string }[] = [
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'potmWins', label: 'Player of the Match' },
  { key: 'viiOfDay', label: 'Best VII of the Day' },
  { key: 'wins', label: 'Games won' },
  { key: 'bestOnTeam', label: 'Best on their team' },
  { key: 'teamOfDay', label: 'Team of the Day' },
  { key: 'saves', label: 'Saves' },
  { key: 'yellowCards', label: 'Yellow cards' },
  { key: 'redCards', label: 'Red cards' },
  { key: 'ownGoals', label: 'Own goals' },
  { key: 'penMisses', label: 'Penalties missed' },
];

/** Numbers where more is worse: ranked "most", never shown in green. */
const WORSE = new Set<ComparedStat>(['yellowCards', 'redCards', 'ownGoals', 'penMisses']);

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const valueOf = (r: PlayerRatings, k: ComparedStat) => (k === 'wins' ? r.record.w : (r[k] ?? 0));

/**
 * Each number beside the club's: a bar for theirs with a tick at the club average, and where
 * they rank. In totals or per game, in the usual order or best rank first.
 */
function Tracker({ r, compare, you }: { r: PlayerRatings; compare: StatCompare; you: boolean }) {
  const [per, setPer] = useState<'total' | 'game'>('total');
  const [sort, setSort] = useState<'usual' | 'rank'>('usual');
  // Older servers don't send the newer numbers: leave those out rather than show a blank
  const rows = TRACKED.filter(({ key }) => compare[key]).map(({ key, label }) => {
    const c = compare[key];
    const raw = valueOf(r, key);
    const mine = per === 'game' ? (r.games ? raw / r.games : 0) : raw;
    const avg = per === 'game' ? c.avgPerGame : c.avg;
    // Room for both their number and the average, so neither sits at the very end.
    const scale = Math.max(mine, avg * 2, per === 'game' ? 0.5 : 1);
    return { key, label, c, mine, avg, w: (mine / scale) * 100, a: (avg / scale) * 100 };
  });
  // A rank only means something once they have one: a 0 isn't "1st" because everyone else has 0 too.
  const placed = (x: (typeof rows)[number]) => (valueOf(r, x.key) > 0 && !WORSE.has(x.key) ? x.c.rank : 999);
  if (sort === 'rank') rows.sort((x, y) => placed(x) - placed(y));
  // Numbers no one in the club has yet say nothing: one line under the list instead of a row each.
  const nobody = rows.filter((x) => x.c.avg === 0 && valueOf(r, x.key) === 0);
  const shown = rows.filter((x) => !nobody.includes(x));
  const fmt = (n: number) => (per === 'game' ? String(Math.round(n * 100) / 100) : String(n));
  return (
    <section aria-labelledby="vs-club" className="mt-3 rounded-3xl bg-white border border-gray-100 shadow-card">
      <div className="px-4 pt-4">
        <h3 id="vs-club" className="text-[15px] font-bold text-ink">
          Against the club
        </h3>
        <p className="text-[12px] text-gray-500">Each bar is {you ? 'you' : 'them'}; the dark tick is the club average.</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1">
            <Segmented label="Show" value={per} onChange={setPer} options={[['total', 'Totals'], ['game', 'Per game']]} />
          </div>
          <button
            onClick={() => setSort(sort === 'rank' ? 'usual' : 'rank')}
            aria-pressed={sort === 'rank'}
            className={`press shrink-0 min-h-12 px-3.5 rounded-2xl border text-[13px] font-bold transition-colors ${
              sort === 'rank' ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-gray-700 hover:border-ink'
            }`}
          >
            Best first
          </button>
        </div>
      </div>
      {shown.length > 0 ? (
        <ul className="mt-2 divide-y divide-gray-100 px-4">
          {shown.map((x) => (
            <li key={x.key} className="py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-bold text-ink">{x.label}</span>
                <span className="shrink-0 font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">{fmt(x.mine)}</span>
              </div>
              <div className="relative mt-2 h-2.5 rounded-full bg-gray-100" aria-hidden>
                <div className={`h-2.5 rounded-full animate-fill-grow ${WORSE.has(x.key) ? 'bg-kit-400' : 'bg-pitch-500'}`} style={{ width: `${Math.min(100, x.w)}%` }} />
                <span className="absolute -top-1 w-1 h-[18px] bg-ink rounded-full ring-2 ring-white" style={{ left: `calc(${Math.min(99, x.a)}% - 2px)` }} />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[12px]">
                <span className={`font-bold ${placed(x) <= 3 && !WORSE.has(x.key) ? 'text-pitch-700' : 'text-gray-500'}`}>
                  {x.c.rank === 0
                    ? 'Not played yet'
                    : valueOf(r, x.key) === 0
                      ? 'None yet'
                      : `${WORSE.has(x.key) ? `${ordinal(x.c.rank)} most` : ordinal(x.c.rank)} of ${x.c.of}${per === 'game' ? ' (totals)' : ''}`}
                </span>
                <span className="shrink-0 text-gray-500 tabular-nums">club avg {fmt(x.avg)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-[13px] text-gray-600">Nothing to compare yet.</p>
      )}
      {nobody.length > 0 && (
        <p className="mx-4 mb-4 mt-1 rounded-2xl bg-chalk px-3.5 py-2.5 text-[12px] leading-snug text-gray-600">
          <b className="text-ink">No one has yet:</b> {nobody.map((x) => x.label).join(' · ')}
        </p>
      )}
    </section>
  );
}

/**
 * A player's numbers and what teammates say about them. Totals for this season or all time;
 * then each award they've been nominated for, as a share of the votes they could have had and
 * from how many different people. Below three people it's "not enough to count yet", and the
 * card isn't moved by it. Being nominated only ever lifts the card.
 */
export function PlayerStats({ ratings, you = false }: { ratings: PlayerRatings; you?: boolean }) {
  const hasSeason = !!ratings.season;
  const [range, setRange] = useState<'season' | 'all'>(hasSeason && ratings.season!.games > 0 ? 'season' : 'all');
  const r = range === 'season' && ratings.season ? ratings.season : ratings;
  const awards = AWARDS.map((a) => ({ ...a, e: r.evidence?.[a.key] })).filter((a) => a.e && a.e.nominations > 0);

  const played = r.record.w + r.record.d + r.record.l;
  return (
    <section aria-labelledby="stats-title">
      <h2 id="stats-title" className="flex items-center gap-2 text-lg font-bold text-ink">
        Stats
        <InfoTip label="What these stats mean">
          <span className="block"><b>Match days</b> days {you ? 'you' : 'they'} turned up and played; each has several short games.</span>
          <span className="block mt-1"><b>POTM</b> Player of the Match: most votes after the game.</span>
          <span className="block mt-1"><b>Best VII</b> in the day’s Best VII, picked by everyone’s votes.</span>
          <span className="block mt-1"><b>Best on team</b> voted the best on their own side.</span>
          <span className="block mt-1"><b>Team of the Day</b> on the side that finished top that match day.</span>
          <span className="block mt-1"><b>Points</b> for the table: wins, draws, Team of the Day and Player of the Match.</span>
        </InfoTip>
      </h2>
      {hasSeason && (
        <div className="mt-2">
          <Segmented label="Show" value={range} onChange={setRange} options={[['season', 'This season'], ['all', 'All time']]} />
        </div>
      )}

      {r.games === 0 ? (
        <p className="mt-3 rounded-3xl bg-chalk px-4 py-6 text-center text-sm text-gray-600">
          {range === 'season' ? 'No games this season yet.' : 'No games yet.'}
        </p>
      ) : (
        <>
          {/* The season in three numbers, one card */}
          <dl className="mt-3 grid grid-cols-3 rounded-3xl bg-white border border-gray-100 shadow-card divide-x divide-gray-100">
            <div className="flex flex-col-reverse justify-end items-center px-2 py-4 text-center">
              <dt className="mt-1 text-[11px] font-bold text-gray-500">Match days</dt>
              <dd className="font-display text-[26px] leading-none font-extrabold text-ink tabular-nums">{r.games}</dd>
            </div>
            <div className="flex flex-col-reverse justify-end items-center px-2 py-4 text-center">
              <dt className="mt-1 text-[11px] font-bold text-gray-500">
                Won · drew · lost
                <span className="block font-semibold text-gray-400 tabular-nums">{played} game{played === 1 ? '' : 's'}</span>
              </dt>
              <dd className="font-display text-[26px] leading-none font-extrabold text-ink tabular-nums" aria-label={`Won ${r.record.w}, drew ${r.record.d}, lost ${r.record.l}`}>
                {r.record.w}
                <span className="text-gray-300">·</span>
                {r.record.d}
                <span className="text-gray-300">·</span>
                {r.record.l}
              </dd>
            </div>
            <div className="flex flex-col-reverse justify-end items-center px-2 py-4 text-center">
              <dt className="mt-1 text-[11px] font-bold text-gray-500">Points</dt>
              <dd className="font-display text-[26px] leading-none font-extrabold text-pitch-700 tabular-nums">{r.points}</dd>
            </div>
          </dl>
          {r.compare ? (
            <Tracker r={r} compare={r.compare} you={you} />
          ) : (
            <dl className="mt-3 grid grid-cols-3 rounded-3xl bg-white border border-gray-100 shadow-card divide-x divide-gray-100">
              {(
                [
                  ['Goals', r.goals],
                  ['Assists', r.assists],
                  ['POTM', r.potmWins],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="flex flex-col-reverse justify-end items-center px-2 py-4 text-center">
                  <dt className="mt-1 text-[11px] font-bold text-gray-500">{label}</dt>
                  <dd className="font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      {/* What teammates say: its own card */}
      <section aria-labelledby="awards-title" className="mt-3 rounded-3xl bg-white border border-gray-100 shadow-card overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <h3 id="awards-title" className="text-[15px] font-bold text-ink">
            What teammates say
          </h3>
          <p className="text-[12px] leading-snug text-gray-500">
            Awards from the vote after each game. One counts once 3 different people have named {you ? 'you' : 'them'}, and only ever lifts the card.
          </p>
        </div>
        {awards.length === 0 ? (
          <p className="border-t border-gray-100 px-4 py-4 text-[13px] text-gray-600">No award nominations yet.</p>
        ) : (
          <ul className="border-t border-gray-100 divide-y divide-gray-100">
            {awards.map(({ key, title, e }) => {
              const pct = Math.round((e!.share || 0) * 100);
              return (
                <li key={key} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-bold text-ink">{title}</span>
                    <span className={`shrink-0 text-[13px] font-bold tabular-nums ${e!.enough ? 'text-ink' : 'text-gray-500'}`}>
                      {e!.enough ? `${pct}% of votes` : 'Not enough yet'}
                    </span>
                  </div>
                  {e!.enough && (
                    <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${title}: ${pct}% of votes`}>
                      <div className="h-full rounded-full bg-pitch-500 animate-fill-grow" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
                    </div>
                  )}
                  <p className="mt-1 text-[12px] text-gray-500 tabular-nums">
                    {e!.nominations} nomination{e!.nominations === 1 ? '' : 's'} from {e!.voters} {e!.voters === 1 ? 'person' : 'people'}, over {e!.games} game
                    {e!.games === 1 ? '' : 's'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
