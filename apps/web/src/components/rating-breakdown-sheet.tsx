'use client';

import { useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { LEVELS, levelOf } from '@/lib/rating-level';
import type { ClassicBreakdown, MatchRatingParts, RatingBreakdown, SteadyBreakdown } from '@/lib/api';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "How Ada's 80 is made": the card number's three parts, each with its score, its share of the
 * number, what went into it in plain words, and where the player stands in the club on it. Then
 * the sum. `load` fetches it (the organiser's route or the player app's).
 */
export function RatingBreakdownSheet({ name, load, onClose }: { name: string; load: () => Promise<RatingBreakdown | null | undefined>; onClose: () => void }) {
  const titleId = useId();
  const [data, setData] = useState<RatingBreakdown | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    load()
      .then((b) => setData(b ?? null))
      .catch((err) => setFailed(err instanceof Error ? err.message : ''));
    // Loaded once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = name.split(' ')[0];
  const title = data ? `How ${first}’s ${data.rating} is made` : `How ${first}’s rating is made`;

  const steady = data?.mode === 'steady' ? data : null;
  const classic = data && data.mode !== 'steady' ? (data as ClassicBreakdown) : null;
  const parts = classic
    ? [
        {
          key: 'stats',
          label: 'Stats',
          score: classic.stats.score,
          weight: classic.weights.stats,
          place: classic.stats.place,
          lines: [
            `${plural(classic.stats.goals, 'goal')}, ${plural(classic.stats.assists, 'assist')} in ${plural(classic.stats.games, 'game')}`,
            classic.stats.saves ? `${plural(classic.stats.saves, 'save')} (each worth a tenth of a goal)` : null,
            classic.stats.yellowCards || classic.stats.redCards
              ? `${[classic.stats.yellowCards ? plural(classic.stats.yellowCards, 'yellow card') : null, classic.stats.redCards ? plural(classic.stats.redCards, 'red card') : null]
                  .filter(Boolean)
                  .join(', ')}: a yellow costs a quarter of a goal, a red a whole goal`
              : null,
            'An assist counts three quarters of a goal. Per game, against the club.',
          ],
        },
        {
          key: 'votes',
          label: 'Votes',
          score: classic.votes.score,
          weight: classic.weights.votes,
          place: classic.votes.place,
          lines: classic.votes.ballots
            ? [
                `Player of the Match on ${classic.votes.potmVotes} of ${plural(classic.votes.ballots, 'ballot')} they could be on${classic.votes.potmWins ? ` (won it ${plural(classic.votes.potmWins, 'time')})` : ''}`,
                classic.votes.viiPicks ? `In ${plural(classic.votes.viiPicks, 'Best VII')} picked by teammates` : 'Not in anyone’s Best VII yet',
                classic.votes.awards.length ? `${plural(classic.votes.awards.length, 'award')} with enough voters` : 'No awards with enough voters yet',
              ]
            : ['No votes yet, so this sits in the middle. It never counts against them.'],
        },
        {
          key: 'results',
          label: 'Results',
          score: classic.results.score,
          weight: classic.weights.results,
          place: classic.results.place,
          lines: [
            `Their teams won ${classic.results.record.w}, drew ${classic.results.record.d}, lost ${classic.results.record.l}`,
            'Beating stronger sides counts for more. This is also what balances teams.',
          ],
        },
      ]
    : [];

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <SheetTitle
        id={titleId}
        title={title}
        sub={steady ? 'It follows their form, a few points at most each match day.' : '40% stats, 40% votes, 20% results, each against the rest of the club. 70 is the middle.'}
        onClose={onClose}
      />
      {data && <LevelStrip rating={data.rating} first={first} />}
      {failed !== null ? (
        <p className="mt-6 text-center text-sm text-gray-600" role="alert">
          This didn’t load.{failed ? ` The server said: “${failed}”` : ''}
        </p>
      ) : data === undefined ? (
        <div className="mt-4 space-y-2" aria-busy aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-3xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : data === null ? (
        <p className="mt-6 rounded-3xl bg-chalk px-4 py-6 text-center text-sm text-gray-600">
          {first} hasn’t played a game with scores yet. Until then the card shows the level their organiser gave them.
        </p>
      ) : steady ? (
        <SteadyBody data={steady} first={first} />
      ) : classic ? (
        <>
          <ol className="mt-4 space-y-2">
            {parts.map((p) => (
              <li key={p.key} className="rounded-3xl bg-white border border-gray-100 shadow-card px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-bold text-ink">
                    {p.label} <span className="text-[12px] font-semibold text-gray-500">· {Math.round(p.weight * 100)}% of the number</span>
                  </span>
                  <span className="font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">{p.score}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-100" aria-hidden>
                  <div className="h-2 rounded-full bg-pitch-500 animate-fill-grow" style={{ width: `${((p.score - 40) / 59) * 100}%` }} />
                </div>
                <p className={`mt-1 text-[12px] font-bold ${p.place !== null && p.place <= 3 ? 'text-pitch-700' : 'text-gray-500'}`}>
                  {p.place === null ? 'Level with everyone in the club so far' : `${ordinal(p.place)} of ${classic.of} in the club`}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[13px] leading-snug text-gray-600">
                  {p.lines.filter(Boolean).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="mt-3 rounded-2xl bg-chalk px-4 py-3 text-[13px] text-gray-700 tabular-nums">
            {Math.round(classic.weights.stats * 100)}% of {classic.stats.score} + {Math.round(classic.weights.votes * 100)}% of {classic.votes.score} +{' '}
            {Math.round(classic.weights.results * 100)}% of {classic.results.score} = <b className="text-ink">{classic.rating}</b>
          </p>
        </>
      ) : null}
    </Sheet>
  );
}

const PART_LABELS: [keyof MatchRatingParts, string][] = [
  ['goals', 'Goals'],
  ['assists', 'Assists'],
  ['results', 'Results'],
  ['keeping', 'In goal'],
  ['cleanSheets', 'Clean sheets'],
  ['cards', 'Cards'],
  ['votes', 'Votes'],
];
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
};

/**
 * A steady card: where they are (form, match days, how far the next match day can move it), then
 * their latest match days, each with its match rating, what made it and how far the card moved.
 */
function SteadyBody({ data, first }: { data: SteadyBreakdown; first: string }) {
  const votes = Math.round(data.votesCount * 100);
  return (
    <div className="mt-4 space-y-3">
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ['Form', data.form == null ? '–' : data.form.toFixed(1), 'out of 10'],
            ['Days rated', String(data.matchDays), data.settling ? 'still settling' : 'settled'],
            ['Next move', `±${data.maxMove}`, 'at most'],
          ] as const
        ).map(([label, v, hint]) => (
          <div key={label} className="min-w-0 rounded-2xl bg-chalk px-3 py-2.5">
            <dt className="text-[11px] font-bold text-gray-600 truncate">{label}</dt>
            <dd className="mt-1 font-display text-[22px] leading-none font-extrabold text-ink tabular-nums">{v}</dd>
            <dd className="mt-1 text-[11px] text-gray-500 truncate">{hint}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] leading-snug text-gray-600">
        {data.settling
          ? `Moves up to ${data.maxMove} a match day for the first ${data.newFor}, then ${data.settledMove}.`
          : `Settled: moves ${data.settledMove} at most a match day.`}{' '}
        Votes count {votes}% for {first} now.
      </p>
      {(data.missedLost ?? 0) > 0 && (
        <p className="rounded-2xl bg-kit-400/10 px-3 py-2.5 text-[13px] leading-snug text-kit-600">
          <b>Missed {data.missed} match days in a row: −{data.missedLost!.toFixed(1)}.</b> Playing again stops it.
        </p>
      )}

      {data.recent.length === 0 ? (
        <div className="rounded-3xl bg-chalk px-4 py-4">
          <p className="text-[14px] font-bold text-ink">No match days with scores yet</p>
          <p className="mt-0.5 text-[13px] text-gray-600">Until then the card shows the level their organiser gave them.</p>
        </div>
      ) : (
        <section aria-labelledby="steady-days">
          <h3 id="steady-days" className="text-[14px] font-extrabold text-ink">
            Latest match days
          </h3>
          <p className="text-[12px] text-gray-500">Each starts on 6.0. Fewer of the day’s games played, the less it moves the card.</p>
          <ol className="mt-2 space-y-2">
            {data.recent.map((d) => {
              const made = PART_LABELS.filter(([k]) => d.parts[k] !== 0);
              return (
                <li key={d.date} className="rounded-3xl bg-white border border-gray-100 shadow-card px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 w-12 h-12 rounded-xl bg-ink flex flex-col items-center justify-center leading-none" aria-label={`Match rating ${d.rating.toFixed(1)} out of 10`}>
                      <span className="font-display text-[18px] font-extrabold text-volt-300 tabular-nums">{d.rating.toFixed(1)}</span>
                      <span className="mt-0.5 text-[8px] font-extrabold tracking-[0.12em] text-white/60">/ 10</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-bold text-ink truncate">{dayLabel(d.date)}</span>
                      <span className="block text-[12px] text-gray-500 truncate">
                        {d.games} game{d.games === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-extrabold tabular-nums ${d.move > 0 ? 'bg-volt-300 text-ink' : d.move < 0 ? 'bg-kit-400/15 text-kit-600' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {d.move > 0 ? `+${d.move}` : d.move < 0 ? `−${Math.abs(d.move)}` : 'No change'}
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What made it">
                    {made.length ? (
                      made.map(([k, label]) => (
                        <li key={k} className="rounded-full bg-chalk px-2.5 py-1 text-[12px] font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                          {label} {signed(d.parts[k])}
                        </li>
                      ))
                    ) : (
                      <li className="text-[12px] text-gray-500">A level day: nothing added or taken off</li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {data.classic != null && (
        <p className="rounded-2xl bg-chalk px-4 py-3 text-[13px] text-gray-600">
          The classic rating would say <b className="text-ink tabular-nums">{data.classic}</b>. Organisers can switch back any time on the Stats page.
        </p>
      )}
    </div>
  );
}

/** Where the number puts them: the level by name, the five steps with theirs lit, and how far the next one is. */
function LevelStrip({ rating, first }: { rating: number; first: string }) {
  const l = levelOf(rating);
  return (
    <section aria-label={`${first} is a ${l.name}${l.next ? `, ${l.next.gap} from ${l.next.name}` : ''}`} className="mt-4 rounded-3xl bg-ink text-white px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-[22px] leading-none font-extrabold text-volt-300 truncate">{l.name}</p>
        <p className="shrink-0 text-[12px] font-bold text-white/70 tabular-nums">{l.next ? `${l.next.gap} to ${l.next.name}` : 'The top level'}</p>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1" aria-hidden>
        {LEVELS.map((x, i) => (
          <li key={x.name} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${i < l.index ? 'bg-volt-300/50' : i === l.index ? 'bg-volt-300' : 'bg-white/15'}`} />
            <span className={`mt-1 block truncate text-[10px] font-bold ${i === l.index ? 'text-volt-300' : 'text-white/50'}`}>{x.from ? `${x.from}+` : 'Up to 54'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
