import type { MatchPlan } from '@pitchaside/shared';
import { drawOrder, sideRota, weekOf, type Day, type DayInput, type Fixture, type LiveDay, type Side } from './match-plan';

/**
 * Winner stays, worked out the same way on every phone from the scores saved so far:
 *
 * - First round (until every side has played once): games last `firstMinutes`. The winner stays,
 *   the loser goes off; level at the whistle, both go off.
 * - After that: the side that concedes `firstTo` goes off, or at the time limit (`gameMinutes`)
 *   the side ahead wins; level, both go off.
 * - With `twoAndOff`, a side that wins twice in a row goes off as well.
 * - Who comes on: the waiting side with the fewest minutes played, then one the side staying on
 *   hasn't played yet, then whoever has waited longest. A side that has just gone off only comes
 *   straight back when nobody else is waiting.
 *
 * Nothing here is saved: the saved games are the truth. If a game was saved between other sides
 * than the app suggested, that's what happened, and the day carries on from there.
 */

export interface WsGame {
  teamA: Side;
  teamB: Side;
  scoreA: number;
  scoreB: number;
  /** How long it lasted, from the timer; missing: its time limit. */
  seconds?: number | null;
}

export interface WsPlayed extends WsGame {
  /** 0-based. */
  n: number;
  /** Minutes after kick-off it started, games back to back. */
  start: number;
  minutes: number;
  firstRound: boolean;
  winner: Side | null;
  /** Who went off after it. */
  off: Side[];
}

export interface WsState {
  /** On the pitch now (or next, before a game starts). Null with fewer than 2 sides. */
  on: [Side, Side] | null;
  /** Waiting, in the order they'd come on if nothing else decided it. */
  line: Side[];
  /** Is the game on (or next) a first-round game: a fixed length, whatever the score. */
  firstRound: boolean;
  /** Its time limit in minutes (the booking's end can make the last one shorter). */
  limit: number;
  /** Wins in a row so far for each side on now. */
  streak: Partial<Record<Side, number>>;
  /** Minutes each side has played. */
  minutes: Record<Side, number>;
  played: WsPlayed[];
  /** Minutes after kick-off the games so far add up to. */
  clock: number;
  /** The booking is used up: no more games. */
  over: boolean;
}

export const WS_DEFAULTS = { firstMinutes: 10, gameMinutes: 10, firstTo: 2, twoAndOff: true };

const pairKey = (a: Side, b: Side) => (a < b ? a + b : b + a);

export function winnerStays(
  teams: Side[],
  plan: Pick<MatchPlan, 'pitchMinutes' | 'gameMinutes' | 'firstMinutes' | 'firstTo' | 'twoAndOff' | 'draw'>,
  saved: WsGame[],
): WsState {
  // The draw picks who's on first and the queue behind them.
  const sides = drawOrder(teams, plan.draw);
  const firstMinutes = plan.firstMinutes ?? WS_DEFAULTS.firstMinutes;
  const limitAfter = plan.gameMinutes || WS_DEFAULTS.gameMinutes;
  const minutes = Object.fromEntries(sides.map((s) => [s, 0])) as Record<Side, number>;
  const empty: WsState = { on: null, line: [...sides], firstRound: true, limit: firstMinutes, streak: {}, minutes, played: [], clock: 0, over: false };
  if (sides.length < 2) return empty;

  const met = new Set<string>();
  const hasPlayed = new Set<Side>();
  const streak: Partial<Record<Side, number>> = {};
  let on: [Side, Side] = [sides[0], sides[1]];
  let line: Side[] = sides.slice(2);
  let clock = 0;
  const played: WsPlayed[] = [];

  saved.forEach((g, n) => {
    // What was saved is what was played, even if it isn't who the app had on.
    if (!(on.includes(g.teamA) && on.includes(g.teamB))) {
      const was = on.filter((s) => s !== g.teamA && s !== g.teamB);
      line = [...line.filter((s) => s !== g.teamA && s !== g.teamB), ...was];
      // A side that wasn't on keeps no winning run.
      for (const s of [g.teamA, g.teamB]) if (!on.includes(s)) streak[s] = 0;
      on = [g.teamA, g.teamB];
    }
    const firstRound = hasPlayed.size < sides.length;
    const limit = firstRound ? firstMinutes : limitAfter;
    const mins = g.seconds != null && g.seconds > 0 ? g.seconds / 60 : limit;
    const winner = g.scoreA > g.scoreB ? g.teamA : g.scoreB > g.scoreA ? g.teamB : null;
    const off: Side[] = [];
    if (!winner) {
      off.push(g.teamA, g.teamB);
      streak[g.teamA] = 0;
      streak[g.teamB] = 0;
    } else {
      const loser = winner === g.teamA ? g.teamB : g.teamA;
      off.push(loser);
      streak[loser] = 0;
      streak[winner] = (streak[winner] ?? 0) + 1;
      if (plan.twoAndOff && (streak[winner] ?? 0) >= 2) {
        off.push(winner);
        streak[winner] = 0;
      }
    }
    minutes[g.teamA] += mins;
    minutes[g.teamB] += mins;
    met.add(pairKey(g.teamA, g.teamB));
    hasPlayed.add(g.teamA);
    hasPlayed.add(g.teamB);
    played.push({ ...g, n, start: clock, minutes: mins, firstRound, winner, off });
    clock += mins;

    // Off they go to the back of the line; whoever has played more goes behind.
    const leaving = [...off].sort((a, b) => minutes[a] - minutes[b]);
    const staying = on.filter((s) => !off.includes(s));
    const waiting = [...line];
    line = [...line, ...leaving];
    const picks: Side[] = [];
    for (let k = 0; k < off.length; k++) {
      const against = staying[0] ?? picks[0] ?? null;
      // Someone who has just gone off only comes straight back if nobody else is waiting.
      const rested = line.filter((s) => !picks.includes(s) && waiting.includes(s));
      const pool = rested.length ? rested : line.filter((s) => !picks.includes(s));
      const pick = [...pool].sort(
        (a, b) =>
          // Teams that haven't played yet come on first, in the first round's order.
          Number(hasPlayed.has(a)) - Number(hasPlayed.has(b)) ||
          minutes[a] - minutes[b] ||
          (against ? Number(met.has(pairKey(a, against))) - Number(met.has(pairKey(b, against))) : 0) ||
          line.indexOf(a) - line.indexOf(b),
      )[0];
      if (pick) picks.push(pick);
    }
    line = line.filter((s) => !picks.includes(s));
    on = [...staying, ...picks].slice(0, 2) as [Side, Side];
  });

  const firstRound = hasPlayed.size < sides.length;
  const left = plan.pitchMinutes - clock;
  const limit = Math.max(0, Math.min(firstRound ? firstMinutes : limitAfter, left));
  return { on, line, firstRound, limit, streak: Object.fromEntries(on.map((s) => [s, streak[s] ?? 0])), minutes, played, clock, over: left < 1 };
}

/**
 * The game in the score box has been decided before its time limit: after the first round, the
 * side that has conceded `firstTo` goes off. Returns that side ('teamA' or 'teamB'), or null.
 */
export function decidedEarly(state: Pick<WsState, 'firstRound'>, plan: Pick<MatchPlan, 'firstTo'>, scoreA: number, scoreB: number): 'teamA' | 'teamB' | null {
  if (state.firstRound) return null;
  const to = plan.firstTo ?? WS_DEFAULTS.firstTo;
  return scoreB >= to ? 'teamA' : scoreA >= to ? 'teamB' : null;
}

export interface WsDay extends Day {
  ws: WsState;
}

/**
 * Winner stays as a Day, so the swaps, keepers and "left early" work as they do for a schedule:
 * the games played so far (with their real lengths), then the game on now (or next) at its limit.
 */
export function buildWsDay({ plan, teamCount, date, squad }: DayInput, saved: WsGame[]): WsDay {
  const sides = (['A', 'B', 'C', 'D', 'E', 'F'] as Side[]).slice(0, Math.max(0, Math.min(6, teamCount)));
  const ws = winnerStays(sides, plan, saved);
  const all: Fixture[] = ws.played.map((g) => ({ n: g.n, teamA: g.teamA, teamB: g.teamB, start: g.start, minutes: g.minutes, round: g.firstRound ? 1 : 2 }));
  if (ws.on && !ws.over && ws.limit >= 1) {
    all.push({ n: ws.played.length, teamA: ws.on[0], teamB: ws.on[1], start: ws.clock, minutes: ws.limit, round: ws.firstRound ? 1 : 2 });
  }
  const week = date ? weekOf(date) : 0;
  const rotas: Day['rotas'] = {};
  for (const side of sides) {
    const keeperOf = (m: DayInput['squad'][number]) => (plan.keepers ? (plan.keepers[m.id!] ?? null) : (m.keeper ?? null));
    const players = squad.filter((m) => m.team === side && m.id).map((m) => ({ id: m.id!, keeper: keeperOf(m) }));
    if (!players.length) continue;
    rotas[side] = sideRota(players, all.filter((f) => f.teamA === side || f.teamB === side), plan, week, sides.indexOf(side) + 1);
  }
  return { sides, fixtures: all, rotas, ws };
}

/**
 * Where a winner-stays day is up to, in the shape the plan screens use: the game on now while its
 * clock runs (and how far in), else the game up next. No running late: the last game simply ends
 * when the booking does.
 */
export function wsLive(day: WsDay, clock: { startedAt: string | null; minutes: number; pausedAt?: string | null } | null, now: number): LiveDay {
  const current = day.fixtures.find((f) => f.n === day.ws.played.length) ?? null;
  const started = clock?.startedAt ? Date.parse(clock.startedAt) : NaN;
  const pausedAt = clock?.pausedAt ? Date.parse(clock.pausedAt) : NaN;
  // A paused game is still on: the clock just stands still where it stopped.
  const paused = Number.isFinite(started) && Number.isFinite(pausedAt);
  const running = !!current && Number.isFinite(started) && (paused || now < started + (clock?.minutes ?? 0) * 60_000);
  return {
    playing: running ? current : null,
    elapsed: running ? ((paused ? pausedAt : now) - started) / 60_000 : null,
    ahead: { games: !running && current ? [current] : [], late: 0, dropped: 0, lastMinutes: null },
  };
}
