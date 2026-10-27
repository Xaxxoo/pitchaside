'use client';

import { useCallback, useEffect, useState } from 'react';
import { LeagueTableView } from '@/components/ratings';
import { tableQuery, type LeagueTable, type TableRange } from '@/lib/api';
import { FilterBar, FilterMenu } from '@/components/filter-menu';
import { Avatar } from '@/components/ratings';
import { InfoTip } from '@/components/info-tip';
import { ORGANISER_CLUB, type ClubApi, type StatSort } from './group-stats';
import { ShareCardButton, ShareIcon, shareIconLight } from '@/components/share-card';
import { ratingWords } from '@/lib/rating-words';

type PeriodKey = 'all' | 'last3' | 'last5' | 'last10' | 'month' | 'prev' | 'year';

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });

/**
 * The periods a table can cover: the whole season, the latest few match days (only those shorter
 * than the season), or by the calendar. `range` is what the server is asked; `short` goes in the
 * shared message ("last 5 match days", "October").
 */
function periods(seasonDays: number, now = new Date()) {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevLast = new Date(now.getFullYear(), now.getMonth(), 0);
  const out: { value: PeriodKey; label: string; short: string | null; range?: TableRange }[] = [{ value: 'all', label: 'Whole season', short: null }];
  for (const n of [3, 5, 10]) {
    if (seasonDays > n) out.push({ value: `last${n}` as PeriodKey, label: `Last ${n} match days`, short: `last ${n} match days`, range: { last: n } });
  }
  out.push(
    { value: 'month', label: 'This month', short: monthName(now), range: { from: day(first), to: day(now) } },
    { value: 'prev', label: 'Last month', short: monthName(prevFirst), range: { from: day(prevFirst), to: day(prevLast) } },
    { value: 'year', label: 'This year', short: String(now.getFullYear()), range: { from: `${now.getFullYear()}-01-01`, to: day(now) } },
  );
  return out;
}

/** A group's season table, with its own loading and "didn't load" states. */
export function GroupTable({
  groupId,
  groupName,
  onSeeAll,
  api = ORGANISER_CLUB,
}: {
  groupId: string;
  /** For the shared table's message. */
  groupName?: string;
  onSeeAll?: (sort: StatSort) => void;
  api?: ClubApi;
}) {
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [failed, setFailed] = useState<string | false>(false);
  // Which match days the table covers (a dropdown: the season, the latest few, or by the calendar).
  const [period, setPeriod] = useState<PeriodKey>('all');
  // How many match days the season has, so only periods shorter than it are offered.
  const [seasonDays, setSeasonDays] = useState(0);
  const options = periods(seasonDays);
  const chosen = options.find((o) => o.value === period) ?? options[0];

  const load = useCallback(() => {
    setFailed(false);
    api.table(groupId, chosen.range)
      .then((t) => {
        setTable(t);
        if (period === 'all') setSeasonDays(t.games);
      })
      .catch((err) => setFailed(err instanceof Error ? err.message : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, period]);

  useEffect(() => {
    setTable(null);
    load();
  }, [load]);

  return (
    <section aria-labelledby="table-title">
      <div className="mb-2">
        <div className="flex items-center justify-between gap-3 min-h-11">
        <h2 id="table-title" className="flex items-center gap-2 text-base font-bold text-ink">
          Table
          {table && (
            <InfoTip label="How the table works">
              {table.rankedBy === 'rating' && (
                <>
                  <span className="block font-bold text-volt-300">How it’s ranked</span>
                  <span className="block mt-1 mb-2">By rating: {ratingWords(table.ratingMode).short}. Level on rating, more points go higher.</span>
                </>
              )}
              <span className="block font-bold text-volt-300">How points are won</span>
              <span className="block mt-1">
                Win a game: {table.points.win} · Draw: {table.points.draw} · Team of the Day: {table.points.teamOfDay} · Player of the Match: {table.points.potm}
              </span>
              <span className="block mt-2">
                <b>P</b> games played. <b>★</b> Player of the Match wins. <b>W D L</b> games won, drawn and lost. Team of the Day is the side that finished top on a match day.
              </span>
            </InfoTip>
          )}
        </h2>
        {table?.shareCode && table.rows.length > 0 && (
          <ShareCardButton
            page={`/g/${table.shareCode}/table${tableQuery(chosen.range)}`}
            heading="Share the table"
            fileName="pitchaside-table.png"
            caption={`📊 ${groupName ?? 'Our'} table${chosen.short ? ` · ${chosen.short}` : ''}. Where do you stand?`}
            label="Share the table"
            className={shareIconLight}
          >
            <ShareIcon />
          </ShareCardButton>
        )}
        </div>
        <p className="-mt-1 text-xs text-gray-500">
          {table?.rankedBy === 'rating' ? 'Ranked by rating. Points break a tie.' : 'Points from results, Team of the Day and Player of the Match'}
        </p>
        {/* The table as an image for WhatsApp: the season, or the last few match days, as shown */}
      </div>
      {seasonDays > 0 && (
        <FilterBar className="mb-3">
          <FilterMenu label="Which match days" title="Show the table for" value={period} onChange={setPeriod} columns={2} options={options} />
        </FilterBar>
      )}
      {table && period !== 'all' && table.games === 0 ? (
        // A period with no match days in it: say so, and the way back to the whole season.
        <div className="rounded-3xl bg-chalk px-5 py-8 text-center">
          <p className="font-display text-[17px] font-extrabold text-ink">No match days in {chosen.short ?? 'this period'}</p>
          <p className="mt-1 text-[13px] text-gray-600">Scores saved on a match day in this period will show here.</p>
          <button onClick={() => setPeriod('all')} className="press mt-3 min-h-11 px-4 rounded-2xl bg-white border border-gray-300 text-[14px] font-bold text-ink hover:border-ink">
            Show the whole season
          </button>
        </div>
      ) : table ? (
        <>
          <LeagueTableView table={table} />
          <Leaders table={table} onSeeAll={onSeeAll} />
        </>
      ) : failed !== false ? (
        <div className="py-10 text-center" role="alert">
          <p className="text-sm text-gray-600">The table didn&apos;t load.</p>
          {failed && <p className="mt-1 text-[12px] text-gray-500">The server said: “{failed}”</p>}
          <button onClick={load} className="mt-2 h-11 px-3 text-sm font-bold text-pitch-700">
            Try again
          </button>
        </div>
      ) : (
        <div className="h-40 bg-gray-100 rounded-3xl animate-pulse" aria-busy aria-label="Loading the table" />
      )}
    </section>
  );
}

/**
 * The season's leaders: the top three in goals, assists, Player of the Match and Best VII of the
 * Day. All four boards always show, so goals and assists are there before anyone has one; each
 * opens the full ranked list in Stats.
 */
function Leaders({ table, onSeeAll }: { table: LeagueTable; onSeeAll?: (sort: StatSort) => void }) {
  const boards = (
    [
      ['goals', 'Goals', 'No goals yet. Add scorers on match day.', (r) => r.goals],
      ['assists', 'Assists', 'No assists yet.', (r) => r.assists],
      ['potm', 'Player of the Match', 'From the vote after each game.', (r) => r.potmWins],
      ['vii', 'Best VII of the Day', 'From the vote after each game.', (r) => r.viiOfDay],
    ] as [StatSort, string, string, (r: LeagueTable['rows'][number]) => number][]
  ).map(([key, title, none, of]) => ({
    key,
    title,
    none,
    top: [...table.rows]
      .filter((r) => (of(r) ?? 0) > 0)
      .sort((a, b) => of(b) - of(a))
      .slice(0, 3)
      // Two narrow columns: first name and initial fits where the full name would be cut off.
      .map((r) => ({ id: r.player.id, full: `${r.player.firstName} ${r.player.lastName}`, name: r.player.nickname || `${r.player.firstName} ${r.player.lastName.charAt(0)}.`, photoKey: r.player.photoKey, value: of(r) })),
  }));
  return (
    <section aria-labelledby="leaders-title" className="mt-6">
      <h2 id="leaders-title" className="text-base font-bold text-ink">
        Leaders
      </h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {boards.map((b) => (
          <div key={b.key} className="min-w-0 flex flex-col rounded-3xl bg-white border border-gray-100 shadow-card p-3">
            <h3 className="text-[12px] font-extrabold text-gray-600">{b.title}</h3>
            {b.top.length ? (
              <ol className="mt-1.5 space-y-1.5">
                {b.top.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 min-w-0">
                    <span className="w-3 text-[11px] font-extrabold text-gray-400 tabular-nums">{i + 1}</span>
                    <Avatar name={p.full} photoKey={p.photoKey} className="w-6 h-6 text-[9px]" />
                    <span className="flex-1 min-w-0 truncate text-[13px] font-bold text-ink" title={p.full}>
                      {p.name}
                    </span>
                    <span className="font-display text-[15px] font-extrabold text-ink tabular-nums">{p.value}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1.5 text-[12px] leading-snug text-gray-500">{b.none}</p>
            )}
            {onSeeAll && (
              <button onClick={() => onSeeAll(b.key)} className="press mt-auto pt-1.5 -mb-1 min-h-11 text-left text-[12px] font-bold text-pitch-700">
                See all ›
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
