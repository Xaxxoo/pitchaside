import type { KeeperPref, MatchPlan } from '@pitchaside/shared';

/**
 * The match day plan, worked out the same way on every phone from what the organiser set: the
 * games that fill the booked time (everyone plays everyone, then round again), and for each side
 * who's in goal and who sits out in each few-minute spell, so everyone gets the same time.
 *
 * Nothing here is saved: the same settings, teams and date give the same plan on the organiser's
 * phone, the captains' and the players'.
 */

export type Side = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface Fixture {
  /** 0-based: the nth game of the day. */
  n: number;
  teamA: Side;
  teamB: Side;
  /** Minutes after kick-off it starts. */
  start: number;
  minutes: number;
  /** 1: everyone plays everyone; 2: the second time round, and so on. */
  round: number;
}

/** A game shorter than this isn't worth playing: the spare minutes go on the game before. */
const MIN_GAME = 4;
/** A swap spell shorter than this goes on the one before it (7-minute games: one 7, not 5 + 2). */
const MIN_SPELL = 3;

/**
 * Every pairing once, in matchdays where each side plays once (one side rests when there's an odd
 * number): the usual way a league is drawn, so the number of games stays even all day.
 */
function matchdays(sides: Side[]): [Side, Side][][] {
  const list: (Side | null)[] = sides.length % 2 ? [...sides, null] : [...sides];
  const m = list.length;
  let ring = list.slice(1);
  const days: [Side, Side][][] = [];
  for (let r = 0; r < m - 1; r++) {
    const cur = [list[0], ...ring];
    const day: [Side, Side][] = [];
    for (let i = 0; i < m / 2; i++) {
      const x = cur[i];
      const y = cur[m - 1 - i];
      if (x && y) day.push(x < y ? [x, y] : [y, x]);
    }
    days.push(day);
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }
  return days;
}

/**
 * The order the games are played in, as long as needed: each round has every pairing once, a
 * matchday at a time. Within a matchday the next game is the one that keeps the games most even,
 * then has the fewest sides straight back on, then whoever has waited longest. With 2 sides it's
 * the same game each time.
 */
export function gameOrder(sides: Side[], count: number): { teamA: Side; teamB: Side; round: number }[] {
  if (sides.length < 2 || count <= 0) return [];
  const days = matchdays(sides);
  const lastPlayed = new Map<Side, number>(sides.map((s) => [s, -Infinity]));
  const games = new Map<Side, number>(sides.map((s) => [s, 0]));
  const out: { teamA: Side; teamB: Side; round: number }[] = [];
  let pool: [Side, Side][] = [];
  let day = -1;
  let round = 0;
  for (let n = 0; n < count; n++) {
    if (!pool.length) {
      day = (day + 1) % days.length;
      if (day === 0) round++;
      pool = [...days[day]];
    }
    let best = 0;
    let bestKey: number[] | null = null;
    pool.forEach(([a, b], i) => {
      const restA = n - lastPlayed.get(a)!;
      const restB = n - lastPlayed.get(b)!;
      const key = [
        Math.max(games.get(a)!, games.get(b)!),
        Number(restA === 1) + Number(restB === 1),
        -Math.min(restA, restB),
        -(restA + restB),
        i,
      ];
      if (!bestKey || lessThan(key, bestKey)) {
        best = i;
        bestKey = key;
      }
    });
    const [a, b] = pool.splice(best, 1)[0];
    lastPlayed.set(a, n);
    lastPlayed.set(b, n);
    games.set(a, games.get(a)! + 1);
    games.set(b, games.get(b)! + 1);
    out.push({ teamA: a, teamB: b, round });
  }
  return out;
}

function lessThan(x: number[], y: number[]) {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/** How the booked minutes split into games: whole games, and the spare minutes on the last one (or one short game). */
export function gameLengths(pitchMinutes: number, gameMinutes: number): number[] {
  const p = Math.max(0, Math.floor(pitchMinutes));
  const g = Math.max(1, Math.floor(gameMinutes));
  if (p === 0) return [];
  if (p <= g) return [p];
  const whole = Math.floor(p / g);
  const spare = p - whole * g;
  const out = Array<number>(whole).fill(g);
  if (spare >= MIN_GAME) out.push(spare);
  else if (spare > 0) out[out.length - 1] += spare;
  return out;
}

/** The day's games, back to back from kick-off until the booking ends. */
/** The largest draw number: any whole number from 1 up to this is a draw. */
export const MAX_DRAW = 2_147_483_647;

/** A small seeded random (mulberry32): the same draw gives the same numbers on every phone. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** `items` shuffled by the draw (`salt` gives each side its own shuffle); unchanged without one. */
export function drawOrder<T>(items: T[], draw?: number | null, salt = 0): T[] {
  if (!draw) return [...items];
  const rand = seeded(draw + salt * 7919);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A fresh draw for "Shuffle": random, and never one that starts the day the same way as `current`
 * (same opening game, and the same first players out), when another start is possible at all.
 */
export function newDraw(current: number | undefined, sameStart: (a: number | undefined, b: number) => boolean, random: () => number = Math.random): number {
  let pick = 1;
  for (let i = 0; i < 40; i++) {
    pick = 1 + Math.floor(random() * MAX_DRAW);
    if (pick !== current && !sameStart(current, pick)) return pick;
  }
  return pick === current ? (pick % MAX_DRAW) + 1 : pick;
}

export function fixtures(teamCount: number, plan: Pick<MatchPlan, 'pitchMinutes' | 'gameMinutes' | 'draw'>): Fixture[] {
  // The draw mixes the sides before the order is made: a different start, the games still as even.
  const sides = drawOrder((['A', 'B', 'C', 'D', 'E', 'F'] as Side[]).slice(0, Math.max(0, Math.min(6, teamCount))), plan.draw);
  const lengths = gameLengths(plan.pitchMinutes, plan.gameMinutes);
  const order = gameOrder(sides, lengths.length);
  let start = 0;
  return order.map((o, n) => {
    const f = { n, ...o, start, minutes: lengths[n] };
    start += lengths[n];
    return f;
  });
}

// ── Running late ──

export interface CatchUp {
  /** The games still to play, with their new start (minutes after kick-off) and length. */
  games: Fixture[];
  /** Minutes behind the plan; 0 when on time. */
  late: number;
  /** How many games at the end no longer fit. */
  dropped: number;
  /** The last game's new length, when it changed to finish on time; null when it didn't. */
  lastMinutes: number | null;
}

/**
 * When the day runs late the booking still ends on time, so the last game gets shorter. If it
 * would be too short to play, it goes, and its few minutes go on the game before so the pitch is
 * used to the end.
 *
 * `next` is the first game not started yet; `at` is when it can start, in minutes after kick-off
 * (now, or when the game being played ends).
 */
export function catchUp(all: Fixture[], next: number, at: number, pitchMinutes: number): CatchUp {
  const rest = all.slice(next);
  if (!rest.length) return { games: [], late: 0, dropped: 0, lastMinutes: null };
  const late = Math.max(0, Math.round(at - rest[0].start));
  let start = Math.max(at, rest[0].start);
  let time = Math.max(0, pitchMinutes - start);
  const games: Fixture[] = [];
  for (const f of rest) {
    if (time < MIN_GAME) break;
    const minutes = Math.min(f.minutes, time);
    games.push({ ...f, start, minutes });
    start += minutes;
    time -= minutes;
  }
  const last = games[games.length - 1];
  if (last && time > 0 && games.length < rest.length) last.minutes += time;
  const lastMinutes = last && last.minutes !== rest[games.length - 1].minutes ? last.minutes : null;
  return { games, late, dropped: rest.length - games.length, lastMinutes };
}

// ── Swaps ──

export interface PlanPlayer {
  id: string;
  keeper: KeeperPref;
}

export interface Spell {
  /** Minutes into the game it starts. */
  start: number;
  minutes: number;
  keeper: string | null;
  /** On the pitch, keeper included. */
  on: string[];
  off: string[];
}

export interface SideRota {
  /** The side's games, in order, each split into spells. */
  games: { fixture: Fixture; spells: Spell[] }[];
  /** Per player: minutes on the pitch and in goal, over the day. */
  minutes: Record<string, { played: number; inGoal: number; off: number }>;
}

/** Minutes of a game in swap spells: 15 at 5 is 5, 5, 5; 7 at 5 is one 7. */
export function spells(gameMinutes: number, swapMinutes: number): { start: number; minutes: number }[] {
  if (!swapMinutes || swapMinutes >= gameMinutes) return [{ start: 0, minutes: gameMinutes }];
  const out: { start: number; minutes: number }[] = [];
  for (let s = 0; s < gameMinutes; s += swapMinutes) out.push({ start: s, minutes: Math.min(swapMinutes, gameMinutes - s) });
  const last = out[out.length - 1];
  if (out.length > 1 && last.minutes < MIN_SPELL) {
    out.pop();
    out[out.length - 1].minutes += last.minutes;
  }
  return out;
}

/** A number for the week a date falls in, so the order the swaps start from moves on each week. */
export function weekOf(date: string) {
  const t = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / (7 * 86_400_000)) : 0;
}

/**
 * Who's in goal and who sits out in each spell of a side's games, so everyone gets the same time
 * on the pitch (give or take one spell) and the keeping is shared:
 *
 * - Whoever has played most so far sits out next.
 * - In goal: whoever has kept least. Players happy in goal take about twice the share; players
 *   who'd rather not only go in when nobody else can.
 * - Someone who left early is out of the spells after they went; the rest share their time.
 * - The order it starts from turns each week (`week`), and the organiser's draw mixes it, so the
 *   same players don't always start on the bench.
 */
export function sideRota(
  players: PlanPlayer[],
  games: Fixture[],
  plan: Pick<MatchPlan, 'onPitch' | 'swapMinutes' | 'away' | 'draw'>,
  week = 0,
  salt = 0,
): SideRota {
  // A draw mixes who starts on the bench (each side its own way); the week turns it on from there.
  const sorted = drawOrder([...players].sort((a, b) => a.id.localeCompare(b.id)), plan.draw, salt);
  const turn = sorted.length ? ((week % sorted.length) + sorted.length) % sorted.length : 0;
  const order = [...sorted.slice(turn), ...sorted.slice(0, turn)];
  const rank = new Map(order.map((p, i) => [p.id, i]));
  const pref = new Map(order.map((p) => [p.id, p.keeper]));
  const minutes: SideRota['minutes'] = Object.fromEntries(order.map((p) => [p.id, { played: 0, inGoal: 0, off: 0 }]));
  // When each player last sat out (spell count), so the bench goes round rather than back and forth.
  const lastOff = new Map<string, number>(order.map((p) => [p.id, -1]));
  const onPitch = Math.max(1, plan.onPitch);
  let lastKeeper: string | null = null;
  let k = 0;

  const out: SideRota['games'] = games.map((fixture) => {
    const list = spells(fixture.minutes, plan.swapMinutes).map((sp) => {
      k++;
      const at = fixture.start + sp.start;
      const here = order.filter((p) => plan.away?.[p.id] === undefined || plan.away[p.id] > at).map((p) => p.id);
      const byPlayed = (a: string, b: string) =>
        minutes[b].played - minutes[a].played || lastOff.get(a)! - lastOff.get(b)! || rank.get(a)! - rank.get(b)!;
      const sitOut = Math.max(0, here.length - onPitch);
      const due = [...here].sort(byPlayed);
      let off = due.slice(0, sitOut);
      let on = here.filter((id) => !off.includes(id));

      const willing = (id: string) => pref.get(id) !== 'rather_not';
      const share = (id: string) => minutes[id].inGoal / (pref.get(id) === 'happy' ? 2 : 1);
      const byKeeping = (a: string, b: string) =>
        share(a) - share(b) || Number(a === lastKeeper) - Number(b === lastKeeper) || rank.get(a)! - rank.get(b)!;
      // Nobody on the pitch wants to keep but someone sitting out does: they swap.
      if (!on.some(willing)) {
        // Whoever has played least comes on to keep.
        const sub = off.filter(willing).sort((a, b) => minutes[a].played - minutes[b].played || byKeeping(a, b))[0];
        if (sub) {
          const outfield = [...on].sort(byPlayed)[0];
          off = [...off.filter((id) => id !== sub), outfield];
          on = [...on.filter((id) => id !== outfield), sub];
        }
      }
      const pool = on.some(willing) ? on.filter(willing) : on;
      const keeper = [...pool].sort(byKeeping)[0] ?? null;

      for (const id of on) minutes[id].played += sp.minutes;
      for (const id of off) {
        minutes[id].off += sp.minutes;
        lastOff.set(id, k);
      }
      if (keeper) minutes[keeper].inGoal += sp.minutes;
      lastKeeper = keeper;
      const byName = (a: string, b: string) => rank.get(a)! - rank.get(b)!;
      return { start: sp.start, minutes: sp.minutes, keeper, on: on.sort(byName), off: off.sort(byName) };
    });
    return { fixture, spells: list };
  });
  return { games: out, minutes };
}

/** A game's spells cut to the minutes it really gets (a last game shortened for running late). */
export function clipSpells(list: Spell[], minutes: number): Spell[] {
  return list.filter((s) => s.start < minutes).map((s) => (s.start + s.minutes > minutes ? { ...s, minutes: minutes - s.start } : s));
}

/** The spell a running game is in, from how long it's been going, and when the next swap is. */
export function spellAt(list: Spell[], elapsedMinutes: number) {
  let i = list.findIndex((s) => elapsedMinutes < s.start + s.minutes);
  if (i < 0) i = list.length - 1;
  const next = list[i + 1] ?? null;
  return { index: i, spell: list[i], next, nextAt: next ? next.start : null };
}

/** "7:00" from a kick-off of "19:00" and minutes after it; null without a kick-off time. */
export function clockAt(kickoff: string | null | undefined, minutesAfter: number) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(kickoff ?? '');
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + Math.round(minutesAfter);
  const h = Math.floor(total / 60) % 24;
  const min = ((total % 60) + 60) % 60;
  return `${h % 12 || 12}:${String(min).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

// ── The whole day, and where it's up to ──

export interface DayInput {
  plan: MatchPlan;
  teamCount: number;
  /** "YYYY-MM-DD": the swaps start from a different player each week. */
  date?: string;
  squad: { id?: string; team: Side | null; keeper?: KeeperPref }[];
}

export interface Day {
  sides: Side[];
  fixtures: Fixture[];
  rotas: Partial<Record<Side, SideRota>>;
}

/** The day's games and every side's swaps, from the plan and the teams. */
export function buildDay({ plan, teamCount, date, squad }: DayInput): Day {
  const all = fixtures(teamCount, plan);
  const sides = (['A', 'B', 'C', 'D', 'E', 'F'] as Side[]).slice(0, Math.max(0, Math.min(6, teamCount)));
  const week = date ? weekOf(date) : 0;
  const rotas: Day['rotas'] = {};
  for (const side of sides) {
    // Once the day has started, the goal choices kept then (a change of mind can't reshuffle it).
    const keeperOf = (m: DayInput['squad'][number]) => (plan.keepers ? (plan.keepers[m.id!] ?? null) : (m.keeper ?? null));
    const players = squad.filter((m) => m.team === side && m.id).map((m) => ({ id: m.id!, keeper: keeperOf(m) }));
    if (!players.length) continue;
    rotas[side] = sideRota(players, all.filter((f) => f.teamA === side || f.teamB === side), plan, week, sides.indexOf(side) + 1);
  }
  return { sides, fixtures: all, rotas };
}

/** Minutes after kick-off at `at` (ms), on the game's own day; null without a kick-off time or on another day. */
export function minutesIn(date: string | undefined, kickoff: string | null | undefined, at: number) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(kickoff ?? '');
  if (!date || !m) return null;
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  const start = new Date(y, mo - 1, d, Number(m[1]), Number(m[2])).getTime();
  const out = (at - start) / 60_000;
  // Not today: nothing to be late for.
  return out < -12 * 60 || out > 12 * 60 ? null : out;
}

export interface LiveDay {
  /** The game on now (its clock is running), or null between games. */
  playing: Fixture | null;
  /** Minutes into the game on now. */
  elapsed: number | null;
  /** The games still to play after it, moved for running late. */
  ahead: CatchUp;
}

/**
 * Where the day is up to: the games saved so far are the first games of the plan, the game whose
 * clock is running is the next one, and what's left is moved on if the day is running late.
 */
export function liveDay(
  day: Day,
  plan: MatchPlan,
  gamesDone: number,
  clock: { startedAt: string | null; minutes: number; pausedAt?: string | null } | null,
  now: number,
  date?: string,
  kickoff?: string | null,
): LiveDay {
  const started = clock?.startedAt ? Date.parse(clock.startedAt) : NaN;
  // Paused: the game is still on, its clock stands still, and it ends later by however long it's been paused.
  const pausedAt = clock?.pausedAt ? Date.parse(clock.pausedAt) : NaN;
  const paused = Number.isFinite(started) && Number.isFinite(pausedAt);
  const endsAt = started + (clock?.minutes ?? 0) * 60_000 + (paused ? Math.max(0, now - pausedAt) : 0);
  const running = Number.isFinite(started) && (paused || now < endsAt);
  const playing = running ? (day.fixtures[gamesDone] ?? null) : null;
  const next = running ? gamesDone + 1 : gamesDone;
  // Whole minutes: the next game can't start before the minute it's due.
  const raw = minutesIn(date, kickoff, running ? endsAt : now);
  const at = raw == null ? null : Math.ceil(raw);
  const ahead =
    at == null
      ? { games: day.fixtures.slice(next), late: 0, dropped: 0, lastMinutes: null }
      : catchUp(day.fixtures, next, at, plan.pitchMinutes);
  return { playing, elapsed: running ? ((paused ? pausedAt : now) - started) / 60_000 : null, ahead };
}
