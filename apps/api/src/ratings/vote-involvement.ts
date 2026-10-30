/**
 * Who teammates can pick for Player of the Match and Best on your team (decided 30 Oct with Matt,
 * after the council): someone who was on the pitch long enough to judge. The vote judges how well
 * they played; this only asks whether they were there.
 *
 * They can be picked if they played half their team's games or more, or the day shows them on the
 * pitch: in goal for a game (their own team's or one they were borrowed for), a goal, an assist or
 * a save. Everyone who can be picked counts in full; a vote for anyone else counts nothing.
 *
 * Games, not minutes: the timer isn't always used, and "Played 5 of 6" reads the same every week.
 * Clean sheets aren't a way in (a 0–0 in a 10-minute set is common): they count in the rating.
 * Kept pure so it can be tested on its own; RatingsService feeds it.
 */

/** One player's day: games played of the games they could have played, and what shows them on the pitch. */
export interface Involvement {
  /** Their side's games they played, plus games they kept goal for another side. */
  played: number;
  /** Their side's games, plus games they kept goal for another side. */
  of: number;
  /** Games in goal (their own side's and borrowed), goals (not own goals), assists and saves. */
  inGoal: number;
  goals: number;
  assists: number;
  saves: number;
}

export function emptyInvolvement(): Involvement {
  return { played: 0, of: 0, inGoal: 0, goals: 0, assists: 0, saves: 0 };
}

/** Whether a vote for them counts: half their games or more, or seen on the pitch. Unknown counts. */
export function canBePicked(x: Involvement | undefined | null) {
  if (!x || x.of <= 0) return true;
  if (x.inGoal > 0 || x.goals > 0 || x.assists > 0 || x.saves > 0) return true;
  return x.played * 2 >= x.of;
}

/**
 * Whether a pick can stand: someone who can be picked, unless nobody in the list can be (then any
 * pick goes through so the ballot can still be sent, and it counts nothing).
 */
export function pickable(id: string, candidates: string[], inv: Map<string, Involvement>) {
  return canBePicked(inv.get(id)) || candidates.every((c) => !canBePicked(inv.get(c)));
}

/** What a vote for them is worth: all of it, or nothing. */
export function voteWorth(x: Involvement | undefined | null) {
  return canBePicked(x) ? 1 : 0;
}
