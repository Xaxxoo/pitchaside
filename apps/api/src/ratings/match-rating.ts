/**
 * The steady rating (proposed 28 Oct, not switched on yet): a match rating out of 10 for each
 * match day, and an OVR that moves only a little each match day, like a manager game's ability.
 *
 * Match rating: starts at 6.0. What the player did counts most (goals, assists, results while
 * on the pitch, clean sheets, saves; cards cost). Votes add a small bonus, the same for everyone
 * (VOTE_WEIGHT), and can move the card at most VOTE_MOVE_MAX a match day (decided 30 Oct with the
 * council: before, a new player's first votes counted in full and stuck to the card for weeks).
 *
 * OVR: starts where the organiser's level puts it, then each match day steps toward what that
 * day's match rating says, by at most MOVE_NEW points while new and MOVE_SETTLED after. One great
 * or awful day never swings a card.
 *
 * Kept pure (no database) so it can be tested and replayed on its own.
 */

export type Position = 'GK' | 'DEF' | 'MID' | 'ATT';
export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'ATT'];

export interface DayGame {
  sideA: string[];
  sideB: string[];
  scoreA: number;
  scoreB: number;
  keeperA?: string | null;
  keeperB?: string | null;
  /** Where people played in this game, when it was set. Anyone not in it plays their usual position. */
  positions?: Record<string, Position>;
}

export interface DayInput {
  games: DayGame[];
  goals: { scorerId: string; assistId?: string | null }[];
  saves?: Record<string, number>;
  yellow?: Record<string, number>;
  red?: Record<string, number>;
  /** Who put one in their own net (once per own goal), and missed penalties per player. */
  ownGoals?: string[];
  penMisses?: Record<string, number>;
  /** The group this match day was for: missing your group's days lowers the card a little (MISS_*). */
  groupId?: string;
  /** Vote results for the day (empty sets when nobody voted). */
  potm?: Set<string>;
  viiOfDay?: Set<string>;
  bestOnTeam?: Set<string>;
}

export interface DayLine {
  games: number;
  w: number;
  d: number;
  l: number;
  goals: number;
  assists: number;
  inGoal: number;
  keeperCleanSheets: number;
  conceded: number;
  cleanSheets: number;
  /** Clean-sheet credit summed over games, by the position played in each (see CLEAN_SHEET). */
  cleanSheetCredit: number;
  saves: number;
  yellow: number;
  red: number;
  ownGoals: number;
  penMisses: number;
  potm: boolean;
  vii: boolean;
  best: boolean;
}

export const BASE = 6;
/** Per goal / assist per game played, capped so a goal-hanger can't run away with it. */
const GOAL = 1.6;
const GOAL_CAP = 2.4;
const ASSIST = 1;
const ASSIST_CAP = 1.5;
/** Wins minus losses per game. */
const RESULT = 1;
/** Keeper: share of their games kept clean, saves, goals let in. */
const KEEPER_CS = 1.5;
const SAVE = 0.1;
const SAVE_CAP = 1;
const CONCEDED = 0.15;
/**
 * A clean sheet is the whole team's: everyone on the pitch gets some, defenders more, the keeper
 * most (KEEPER_CS). Worked out game by game from the position played in that game, so someone at
 * the back for one game and up front the next gets the defender's share only for the first.
 */
export const CLEAN_SHEET: Record<Exclude<Position, 'GK'> | 'unknown', number> = { DEF: 0.6, MID: 0.3, ATT: 0.15, unknown: 0.3 };
const YELLOW = 0.5;
const RED = 1.5;
/** An own goal, and a missed penalty: less than a red card, more than nothing. */
const OWN_GOAL = 0.6;
const PEN_MISS = 0.4;
/** Vote bonuses before they taper. */
const VOTE = { potm: 1, vii: 0.5, best: 0.3 } as const;

/**
 * Votes count this much of their bonus for every player, every match day (new players' votes used
 * to count in full and stuck to the card for weeks), and can move the card at most VOTE_MOVE_MAX a
 * match day: what a player did moves it; teammates' opinion nudges it.
 */
export const VOTE_WEIGHT = 0.6;
export const VOTE_MOVE_MAX = 1;
export function voteWeight() {
  return VOTE_WEIGHT;
}

/** OVR: average form (6.9) points at 50, each point of form above it at 25 more (7.9 → 75). */
export const OVR_AVERAGE_DAY = 6.9;
const OVR_PER_POINT = 25;
export const MOVE_NEW = 4;
export const MOVE_SETTLED = 1;
/** Match days a player is "new" for. */
export const NEW_FOR = 6;
/** How far toward the day's target one match day goes, before the cap. */
const PULL = 0.3;
/**
 * A day counts in full for whoever played the most games that day; anyone else counts for their
 * share of that (a sub who played 2 of 8: a quarter). Days shorter than this many games count for
 * less for everyone (someone who played one game and went home).
 */
const FULL_DAY_GAMES = 3;

/**
 * Not turning up: after MISS_GRACE of their groups' match days missed in a row, each further one
 * takes MISS_STEP off the card, MISS_MAX at most since they last played (like a player out of the
 * side). Playing again stops it; form builds the card back. Never for someone who hasn't played yet.
 */
export const MISS_GRACE = 2;
export const MISS_STEP = 0.5;
export const MISS_MAX = 5;

export function emptyLine(): DayLine {
  return { games: 0, w: 0, d: 0, l: 0, goals: 0, assists: 0, inGoal: 0, keeperCleanSheets: 0, conceded: 0, cleanSheets: 0, cleanSheetCredit: 0, saves: 0, yellow: 0, red: 0, ownGoals: 0, penMisses: 0, potm: false, vii: false, best: false };
}

/**
 * What each player did on one match day. A keeper borrowed from another team gets the keeper's
 * credit (clean sheet, saves) for that game, but its result counts for nobody's record on them:
 * they weren't playing for their own side, and it isn't their win to keep.
 */
export function dayLines(day: DayInput, usual: Map<string, Position> = new Map()): Map<string, DayLine> {
  const lines = new Map<string, DayLine>();
  const get = (id: string) => {
    let l = lines.get(id);
    if (!l) lines.set(id, (l = emptyLine()));
    return l;
  };
  for (const g of day.games) {
    const sides = [
      { players: g.sideA, mine: g.scoreA, theirs: g.scoreB, keeper: g.keeperA, lentOut: g.keeperB },
      { players: g.sideB, mine: g.scoreB, theirs: g.scoreA, keeper: g.keeperB, lentOut: g.keeperA },
    ];
    for (const { players, mine, theirs, keeper, lentOut } of sides) {
      // Teams are by bib, so a borrowed keeper is listed with their own side: move them across.
      const borrowed = keeper && !players.includes(keeper) ? keeper : null;
      const onPitch = players.filter((id) => id !== lentOut);
      if (borrowed) onPitch.push(borrowed);
      for (const id of onPitch) {
        const l = get(id);
        l.games += 1;
        if (id !== borrowed) {
          if (mine > theirs) l.w += 1;
          else if (mine === theirs) l.d += 1;
          else l.l += 1;
        }
        if (id === keeper) {
          l.inGoal += 1;
          l.conceded += theirs;
          if (theirs === 0) l.keeperCleanSheets += 1;
        } else if (theirs === 0) {
          l.cleanSheets += 1;
          const pos = g.positions?.[id] ?? usual.get(id);
          l.cleanSheetCredit += CLEAN_SHEET[pos && pos !== 'GK' ? pos : 'unknown'];
        }
      }
    }
  }
  for (const goal of day.goals) {
    get(goal.scorerId).goals += 1;
    if (goal.assistId) get(goal.assistId).assists += 1;
  }
  for (const [id, n] of Object.entries(day.saves ?? {})) get(id).saves += n;
  for (const [id, n] of Object.entries(day.yellow ?? {})) get(id).yellow += n;
  for (const [id, n] of Object.entries(day.red ?? {})) get(id).red += n;
  for (const id of day.ownGoals ?? []) get(id).ownGoals += 1;
  for (const [id, n] of Object.entries(day.penMisses ?? {})) get(id).penMisses += n;
  for (const id of day.potm ?? []) get(id).potm = true;
  for (const id of day.viiOfDay ?? []) get(id).vii = true;
  for (const id of day.bestOnTeam ?? []) get(id).best = true;
  return lines;
}

/** The parts of a match rating, so a player can see why (shown as "+1.2 goals" etc.). */
export interface MatchRating {
  rating: number;
  parts: { goals: number; assists: number; results: number; keeping: number; cleanSheets: number; cards: number; mistakes: number; votes: number };
}

export function matchRating(l: DayLine, votesWeight: number): MatchRating | null {
  if (!l.games) return null;
  const per = (n: number) => n / l.games;
  const parts = {
    goals: Math.min(GOAL_CAP, GOAL * per(l.goals)),
    assists: Math.min(ASSIST_CAP, ASSIST * per(l.assists)),
    results: RESULT * per(l.w - l.l),
    keeping: l.inGoal ? KEEPER_CS * (l.keeperCleanSheets / l.inGoal) - CONCEDED * (l.conceded / l.inGoal) + Math.min(SAVE_CAP, SAVE * l.saves) : 0,
    cleanSheets: per(l.cleanSheetCredit),
    cards: -(YELLOW * l.yellow + RED * l.red),
    mistakes: -(OWN_GOAL * l.ownGoals + PEN_MISS * l.penMisses),
    votes: votesWeight * ((l.potm ? VOTE.potm : 0) + (l.vii ? VOTE.vii : 0) + (l.best ? VOTE.best : 0)),
  };
  const raw = BASE + Object.values(parts).reduce((a, b) => a + b, 0);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    rating: round(Math.max(3, Math.min(10, raw))),
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v)])) as MatchRating['parts'],
  };
}

export interface Steady {
  /** Kept to one decimal inside; the card shows it rounded. */
  ovr: number;
  days: number;
  last: number | null;
  /** Recent form: the average match rating, newer days counting more (FORM_WEIGHT once settled). */
  form: number | null;
  /** The same form without the vote bonus: how far the card goes on what they did alone. */
  formNoVotes?: number | null;
  /** Their groups' match days missed in a row, and how much that has taken off since they last played. */
  missed?: number;
  drift?: number;
}

export function ovrTarget(rating: number) {
  return Math.max(30, Math.min(95, 50 + (rating - OVR_AVERAGE_DAY) * OVR_PER_POINT));
}

/** Once settled, the newest match day is this share of a player's form. */
export const FORM_WEIGHT = 0.2;

/**
 * One match day's step for one player. Form takes in the day (a plain average at first, then the
 * newest day counts FORM_WEIGHT); the OVR steps toward what that form is worth, capped, and less
 * for a short day. Aiming at form, not the one day, is what stops a lucky hat-trick swinging it.
 */
export function stepOvr(s: Steady, rating: number, games: number, target: (form: number) => number = ovrTarget, dayMost = FULL_DAY_GAMES, votes = 0): Steady {
  // Their share of the day: games played against the most anyone played (FULL_DAY_GAMES at least)
  const share = Math.min(1, games / Math.max(dayMost, FULL_DAY_GAMES));
  const w = Math.max(FORM_WEIGHT, 1 / (s.days + 1)) * share;
  const fold = (f: number | null | undefined, r: number) => (f == null ? r : f + (r - f) * w);
  const form = fold(s.form, rating);
  const formNoVotes = fold(s.formNoVotes ?? s.form, rating - votes);
  const cap = s.days < NEW_FOR ? MOVE_NEW : MOVE_SETTLED;
  const clamp = (n: number, c: number) => Math.max(-c, Math.min(c, n));
  // What they did moves the card up to the cap; votes add at most VOTE_MOVE_MAX on top, all within the cap
  const stats = target(formNoVotes);
  const move = clamp(clamp(PULL * (stats - s.ovr), cap) + clamp(PULL * (target(form) - stats), VOTE_MOVE_MAX), cap) * share;
  return {
    ovr: Math.round((s.ovr + move) * 10) / 10,
    days: s.days + 1,
    last: rating,
    form: Math.round(form * 100) / 100,
    formNoVotes: Math.round(formNoVotes * 100) / 100,
    missed: 0,
    drift: 0,
  };
}

/**
 * Replays match days (oldest first). `starts`: each player's starting OVR (from the level their
 * organiser gave them, else 50). Players who miss a day keep their OVR: missing isn't playing badly.
 */
/**
 * Attackers score more than defenders whatever their level, so a match rating is read against
 * what players in that position usually get in this club (all match days so far): the OVR steps
 * toward form measured that way. With POSITION_FAIRNESS at 1 the gap is taken out fully.
 */
export const POSITION_FAIRNESS = 1;
/** Days of a position's history needed before it's trusted; less is blended toward no change. */
const POSITION_PRIOR = 20;

/**
 * Where form puts the card, measured against the club like the old card is: the club's average
 * form is 50 and each spread (standard deviation) above it is CLUB_SPREAD more, so the best players
 * in any club reach the 80s. Until there are CLUB_MIN players with settled form, the fixed scale
 * (ovrTarget) is used. It only ever sets where a player is heading: the card itself still moves
 * only on days they play, by the capped steps.
 */
export const CLUB_SPREAD = 18;
const CLUB_MIN = 6;
const SETTLED_FORM_DAYS = 3;
function clubTarget(forms: number[]) {
  if (forms.length < CLUB_MIN) return ovrTarget;
  const mean = forms.reduce((a, b) => a + b, 0) / forms.length;
  const sd = Math.sqrt(forms.reduce((a, b) => a + (b - mean) ** 2, 0) / forms.length) || 1;
  return (form: number) => Math.max(30, Math.min(95, 50 + (CLUB_SPREAD * (form - mean)) / Math.max(sd, 0.15)));
}

export function replaySteady(
  days: DayInput[],
  starts: Map<string, number> = new Map(),
  positions: Map<string, Position> = new Map(),
  onDay?: (index: number, lines: Map<string, DayLine>, ratings: Map<string, MatchRating>, after: Map<string, Steady>) => void,
): Map<string, Steady> {
  const out = new Map<string, Steady>();
  for (const [id, ovr] of starts) out.set(id, { ovr, days: 0, last: null, form: null });
  const history = new Map<string, { sum: number; n: number }>();
  const all = { sum: 0, n: 0 };
  // The groups each player has played in: missing one of their days counts against them
  const groupsOf = new Map<string, Set<string>>();
  days.forEach((day, i) => {
    const lines = dayLines(day, positions);
    const ratings = new Map<string, MatchRating>();
    const dayMost = Math.max(0, ...[...lines.values()].map((l) => l.games));
    // The club's settled form before today, so everyone today is measured against the same thing
    const target = clubTarget([...out.values()].filter((x) => x.form !== null && x.days >= SETTLED_FORM_DAYS).map((x) => x.form!));
    for (const [id, l] of lines) {
      const s = out.get(id) ?? { ovr: starts.get(id) ?? 50, days: 0, last: null, form: null };
      const mr = matchRating(l, voteWeight());
      if (!mr) continue;
      ratings.set(id, mr);
      // Their usual position (a day in goal counts as GK): how far its average sits from everyone's
      const pos = l.inGoal * 2 >= l.games ? 'GK' : (positions.get(id) ?? 'unknown');
      const h = history.get(pos);
      const gap = h && all.n ? ((h.sum / h.n - all.sum / all.n) * h.n) / (h.n + POSITION_PRIOR) : 0;
      out.set(id, stepOvr(s, mr.rating - POSITION_FAIRNESS * gap, l.games, target, dayMost, mr.parts.votes));
    }
    // Learn from today only after rating everyone, so the order players are listed in doesn't matter
    for (const [id, mr] of ratings) {
      const l = lines.get(id)!;
      const pos = l.inGoal * 2 >= l.games ? 'GK' : (positions.get(id) ?? 'unknown');
      const h = history.get(pos) ?? { sum: 0, n: 0 };
      history.set(pos, { sum: h.sum + mr.rating, n: h.n + 1 });
      all.sum += mr.rating;
      all.n += 1;
    }
    // Their group played and they weren't there: a little off once they've missed a few in a row
    if (day.groupId && lines.size) {
      for (const [id, s] of out) {
        if (ratings.has(id) || !groupsOf.get(id)?.has(day.groupId)) continue;
        const missed = (s.missed ?? 0) + 1;
        const drift = s.drift ?? 0;
        const step = missed > MISS_GRACE ? Math.min(MISS_STEP, MISS_MAX - drift) : 0;
        out.set(id, { ...s, ovr: Math.round((s.ovr - step) * 10) / 10, missed, drift: drift + step });
      }
      for (const id of ratings.keys()) groupsOf.set(id, (groupsOf.get(id) ?? new Set()).add(day.groupId));
    }
    onDay?.(i, lines, ratings, out);
  });
  return out;
}
