/**
 * Best VII of the Day from the votes: a keeper, the outfield starters, then the sub.
 *
 * The keeper is whoever got the most keeper picks (ballots since 29 Oct have a keeper slot that
 * only takes someone who was in goal). The rest are the most picked as starters, a sub pick
 * counting half, leaving out the keeper. Keeper picks for anyone else don't put them in the side:
 * there's one keeper. Days voted before the keeper slot just have no keeper: the seven most picked.
 *
 * Kept pure (no database) so it can be tested on its own.
 */
export const SEVEN = 7;

export interface SevenVote {
  category: string;
  nomineeId: string;
}

export interface BestSeven {
  /** In order: the keeper (when there is one), the outfield starters, the sub last. */
  ids: string[];
  keeper: string | null;
  /** Picks each of them got (keeper picks for the keeper, starter and sub picks for the rest). */
  picks: Map<string, number>;
}

export function bestSeven(votes: SevenVote[]): BestSeven {
  const gk = new Map<string, number>();
  const score = new Map<string, number>();
  const picks = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) ?? 0) + n);
  for (const v of votes) {
    if (v.category === 'vii_gk') bump(gk, v.nomineeId, 1);
    else if (v.category === 'vii' || v.category === 'vii_sub') {
      bump(score, v.nomineeId, v.category === 'vii' ? 1 : 0.5);
      bump(picks, v.nomineeId, 1);
    }
  }
  // Most keeper picks; a tie goes to whoever was picked more overall, then a steady order.
  const keeper =
    [...gk.entries()].sort((a, b) => b[1] - a[1] || (score.get(b[0]) ?? 0) - (score.get(a[0]) ?? 0) || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const rest = [...score.entries()]
    .filter(([id]) => id !== keeper)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, keeper ? SEVEN - 1 : SEVEN)
    .map(([id]) => id);
  if (keeper) picks.set(keeper, gk.get(keeper)!);
  return { ids: keeper ? [keeper, ...rest] : rest, keeper, picks };
}
