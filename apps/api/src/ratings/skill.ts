/**
 * Skill ratings from match results: Elo for teams.
 *
 * Every recorded game (sides + score) is replayed in order. Each side's strength is the
 * average rating of its players; the result against the expected result moves every player
 * on the side by the same amount. Sides are reshuffled every match day, which is what lets
 * this separate individuals over time.
 *
 * Kept pure (no database) so the maths can be tested on its own; RatingsService feeds it.
 */

/** A level an organiser can give a player before they've played, so balancing is fair from game one. */
export type PlayerLevel = 'beginner' | 'average' | 'good' | 'strong';
export const PLAYER_LEVELS: PlayerLevel[] = ['beginner', 'average', 'good', 'strong'];

export const LEVEL_START: Record<PlayerLevel, number> = { beginner: 1300, average: 1500, good: 1700, strong: 1900 };
export const DEFAULT_START = LEVEL_START.average;

/** New players settle quickly, then ratings steady. */
const K_NEW = 40;
const K_SETTLED = 20;
const SETTLED_AFTER = 8;
/** Ratings shown as provisional until a player has this many rated games. */
export const PROVISIONAL_UNDER = 3;

/** One game: who was on each side and the score. */
export interface SkillGame {
  sideA: string[];
  sideB: string[];
  scoreA: number;
  scoreB: number;
}

export interface Skill {
  rating: number;
  /** Games with a recorded score this rating has learned from. */
  games: number;
}

/** Bigger wins count a little more, with a cap so a 9–0 doesn't distort everything. */
function marginWeight(goalDifference: number) {
  return goalDifference <= 1 ? 1 : Math.min(2, 1 + 0.5 * Math.log(goalDifference));
}

/** Probability side A beats side B. */
export function expected(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * Replays `games` (oldest first) from each player's starting rating (`starts`, else
 * DEFAULT_START). Players who never appear in a game keep their starting rating.
 */
export function replaySkill(games: SkillGame[], starts: Map<string, number> = new Map()): Map<string, Skill> {
  const skill = new Map<string, Skill>();
  const get = (id: string) => {
    let s = skill.get(id);
    if (!s) skill.set(id, (s = { rating: starts.get(id) ?? DEFAULT_START, games: 0 }));
    return s;
  };
  for (const id of starts.keys()) get(id);

  for (const g of games) {
    if (!g.sideA.length || !g.sideB.length) continue;
    const a = g.sideA.map(get);
    const b = g.sideB.map(get);
    const avg = (side: Skill[]) => side.reduce((sum, s) => sum + s.rating, 0) / side.length;
    const expA = expected(avg(a), avg(b));
    const actualA = g.scoreA > g.scoreB ? 1 : g.scoreA < g.scoreB ? 0 : 0.5;
    const weight = marginWeight(Math.abs(g.scoreA - g.scoreB));

    // Work out every change from the ratings before this game, then apply them.
    const moves: [Skill, number][] = [
      ...a.map((s) => [s, weight * (actualA - expA)] as [Skill, number]),
      ...b.map((s) => [s, weight * (1 - actualA - (1 - expA))] as [Skill, number]),
    ];
    for (const [s, delta] of moves) {
      s.rating += (s.games < SETTLED_AFTER ? K_NEW : K_SETTLED) * delta;
      s.games += 1;
    }
  }
  return skill;
}

/** The skill rating on the card's 45–95 scale: 1300 → 60, 1500 → 70, 1700 → 80, 1900 → 90. */
export function cardRating(rating: number) {
  return Math.max(45, Math.min(95, Math.round(70 + (rating - DEFAULT_START) / 20)));
}
