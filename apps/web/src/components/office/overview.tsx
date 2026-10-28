'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/api';
import { moneyHref } from '@/lib/money-href';
import { kitFor } from '@/components/illustrations';
import { stagger } from '@/components/motion';

/** What GET /admin/org/overview sends: the Club office at a glance. */
export interface OrgOverview {
  season: string;
  quietDays: number;
  /** Dues marked paid this season, and what was due (paid + still owed), games up to today. */
  paid: number;
  due: number;
  matchDays: number;
  players: number;
  /** Every transfer into the club's accounts, all time. */
  received: number;
  owed: { amount: number; players: number };
  toSort: { amount: number; count: number };
  quiet: { id: string; name: string; nickname: string | null; lastPlayed: string; games: number; group: string }[];
  groups: { id: string; name: string; matchDays: number; turnout: number; paid: number; due: number; owed: number; toSort: number }[];
}

const pct = (paid: number, due: number) => (due > 0 ? Math.round((paid / due) * 100) : null);
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const Chevron = () => (
  <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);

/** The one answer first: how much came in this season, and how much of what was due. */
export function SeasonHero({ o, club, groups }: { o: OrgOverview; club: string; groups: number }) {
  const share = pct(o.paid, o.due);
  return (
    <section aria-label="This season" className="relative overflow-hidden rounded-3xl bg-ink text-white shadow-card">
      <span className="absolute inset-0 turf-stripes" aria-hidden />
      <div className="relative p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-volt-300 truncate">
          {o.season} season · {club}
        </p>
        <p className="mt-2 font-display text-[40px] leading-none font-extrabold tabular-nums text-volt-300">{formatCurrency(o.paid)}</p>
        <p className="mt-1.5 text-[13px] text-white/75 tabular-nums truncate">
          {o.due > 0 ? `paid for games so far · ${share}% of ${formatCurrency(o.due)}` : 'paid · no games played yet this season'}
        </p>
        {o.due > 0 && (
          <div className="mt-3 h-2 rounded-full bg-white/10" aria-hidden>
            <div className="h-2 rounded-full bg-volt-300 animate-fill-grow" style={{ width: `${share}%` }} />
          </div>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ['Match days', o.matchDays],
              ['Players', o.players],
              ['Groups', groups],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="min-w-0 rounded-2xl bg-white/[0.07] px-3 py-2.5">
              <dt className="text-[11px] font-bold text-white/60 truncate">{label}</dt>
              <dd className="mt-0.5 font-display text-[22px] leading-none font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** What needs doing about money, in words: owed now, waiting to be sorted, and what came in. */
export function MoneyHealth({ o }: { o: OrgOverview }) {
  const rows = [
    {
      key: 'owed',
      tone: o.owed.amount > 0 ? 'text-kit-600' : 'text-pitch-700',
      value: o.owed.amount > 0 ? formatCurrency(o.owed.amount) : 'Nothing owed',
      line: o.owed.amount > 0 ? `owed by ${o.owed.players} player${o.owed.players === 1 ? '' : 's'} for games played` : 'Everyone who played has paid',
    },
    {
      key: 'sort',
      tone: o.toSort.count > 0 ? 'text-amber-700' : 'text-pitch-700',
      value: o.toSort.count > 0 ? formatCurrency(o.toSort.amount) : 'Nothing to sort',
      line: o.toSort.count > 0 ? `${o.toSort.count} transfer${o.toSort.count === 1 ? '' : 's'} with no name yet` : 'Every transfer is matched to someone',
    },
    { key: 'in', tone: 'text-ink', value: formatCurrency(o.received), line: 'received by transfer, all time' },
  ];
  return (
    <section aria-labelledby="money-health">
      <h2 id="money-health" className="text-base font-bold text-ink">
        Money health
      </h2>
      <p className="mb-2 text-xs text-gray-500">Each group’s money page below shows who and what.</p>
      <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.key} className="px-4 py-3">
            <p className={`font-display text-[20px] leading-tight font-extrabold tabular-nums ${r.tone}`}>{r.value}</p>
            <p className="text-[13px] text-gray-600 truncate">{r.line}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Players who used to come and haven't for a few weeks: worth a message. */
export function QuietPlayers({ o }: { o: OrgOverview }) {
  // "4 weeks", "1 week", or days for a short window
  const span = o.quietDays % 7 === 0 ? (o.quietDays === 7 ? 'week' : `${o.quietDays / 7} weeks`) : o.quietDays === 1 ? 'day' : `${o.quietDays} days`;
  return (
    <section aria-labelledby="quiet">
      <h2 id="quiet" className="text-base font-bold text-ink">
        Gone quiet
      </h2>
      <p className="mb-2 text-xs text-gray-500">Played before, but not in the last {span}.</p>
      {o.quiet.length === 0 ? (
        <div className="flex items-center gap-3 rounded-3xl bg-white border border-gray-100 shadow-card px-4 py-3.5">
          <span className="w-10 h-10 shrink-0 rounded-full bg-volt-300 text-ink flex items-center justify-center" aria-hidden>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-ink">No one’s gone quiet</span>
            <span className="block text-[13px] text-gray-600 truncate">Everyone has played in the last {span}.</span>
          </span>
        </div>
      ) : (
        <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
          {o.quiet.map((p, i) => {
            const kit = kitFor(p.name);
            return (
              <li key={p.id} className="animate-rise" style={stagger(Math.min(i, 8), 25, 0)}>
                <Link href={`/players/${p.id}`} className="press flex items-center gap-3 min-h-14 px-4 py-2.5 hover:bg-chalk">
                  <span className={`w-9 h-9 shrink-0 rounded-full ${kit.bg} ${kit.fg} flex items-center justify-center text-xs font-extrabold font-display`} aria-hidden>
                    {p.name.charAt(0)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold text-ink truncate">{p.nickname || p.name}</span>
                    <span className="block text-[12px] text-gray-500 truncate">
                      Last played {day(p.lastPlayed)} · {p.games} games
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Each group on one line: how often it plays, how full, how well it pays. Tapping opens its money. */
export function GroupsCompared({ o }: { o: OrgOverview }) {
  return (
    <section aria-labelledby="groups-compared">
      <h2 id="groups-compared" className="text-base font-bold text-ink">
        Groups
      </h2>
      <p className="mb-2 text-xs text-gray-500">This season, side by side. Tap one for its money.</p>
      <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
        {o.groups.map((g) => {
          const share = pct(g.paid, g.due);
          const flag = g.owed > 0 ? { text: `${formatCurrency(g.owed)} owed`, cls: 'bg-kit-400/15 text-kit-600' } : g.toSort > 0 ? { text: `${g.toSort} to sort`, cls: 'bg-sun-400/30 text-amber-800' } : g.matchDays ? { text: 'All paid', cls: 'bg-volt-300 text-ink' } : null;
          return (
            <li key={g.id}>
              <Link href={moneyHref(g.id)} className="press flex items-center gap-3 min-h-16 px-4 py-3 hover:bg-chalk">
                {/* Name and its flag on top; the numbers get the full width underneath, so nothing is cut */}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[15px] font-bold text-ink truncate">{g.name}</span>
                    {flag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums whitespace-nowrap ${flag.cls}`}>{flag.text}</span>}
                  </span>
                  <span className="block mt-0.5 text-[12px] text-gray-500 tabular-nums truncate">
                    {g.matchDays
                      ? `${g.matchDays} match day${g.matchDays === 1 ? '' : 's'} · ${Math.round(g.turnout)} a game${share != null ? ` · ${share}% paid` : ''}`
                      : 'No games played this season'}
                  </span>
                </span>
                <Chevron />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
