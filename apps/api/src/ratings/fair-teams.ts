/**
 * Fair teams that change on every tap (Matt, 28 Oct: "once I shuffle once, that's all").
 *
 * Many splits are about as fair as each other. This tries lots of them, keeps the ones whose team
 * averages are within FAIR_SLACK of the fairest found, and picks one at random that isn't the
 * split already on the board. Captains and vice-captains stay on their side. Sides differ in size
 * by one at most. Pure, with the random source passed in, so it can be tested.
 */

export interface FairPlayer {
  id: string;
  /** On the card's scale. */
  strength: number;
  /** Where they are now (null: not on a side). */
  side: string | null;
  /** Captains and vices: they stay on `side`. */
  fixed: boolean;
}

/** A split counts as fair when its team averages are within this many points of the fairest one found. */
export const FAIR_SLACK = 2;
const TRIES = 400;
/** Fair splits to choose among before stopping early. */
const ENOUGH = 12;

export interface FairSplit {
  teams: Record<string, string>;
  /** Highest team average minus lowest, rounded. */
  gap: number;
  /** True when no other fair split exists (the same split came back). */
  onlyOne: boolean;
}

/** The split without its bib colours: who is with whom. Swapping two whole sides isn't a new split. */
function shape(teams: Record<string, string | null>, sides: string[]) {
  return sides
    .map((s) => Object.keys(teams).filter((id) => teams[id] === s).sort().join(','))
    .filter(Boolean)
    .sort()
    .join('|');
}

function gapOf(players: FairPlayer[], teams: Record<string, string>, sides: string[]) {
  const avgs = sides
    .map((s) => players.filter((p) => teams[p.id] === s))
    .filter((on) => on.length)
    .map((on) => on.reduce((a, p) => a + p.strength, 0) / on.length);
  return avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;
}

export function fairSplit(players: FairPlayer[], sides: string[], rand: () => number = Math.random): FairSplit {
  const fixed = players.filter((p) => p.fixed && p.side && sides.includes(p.side));
  const free = players.filter((p) => !fixed.includes(p));
  const current = Object.fromEntries(players.map((p) => [p.id, p.side]));
  const before = shape(current, sides);

  const once = (): Record<string, string> => {
    const teams: Record<string, string> = {};
    const size = new Map(sides.map((s) => [s, 0]));
    const total = new Map(sides.map((s) => [s, 0]));
    for (const p of fixed) {
      teams[p.id] = p.side!;
      size.set(p.side!, size.get(p.side!)! + 1);
      total.set(p.side!, total.get(p.side!)! + p.strength);
    }
    // Strongest first, with some jitter so near-equal players come out in a different order each time
    const jitter = 6 * rand() + 2;
    const order = [...free].map((p) => ({ p, k: p.strength + jitter * (rand() * 2 - 1) })).sort((a, b) => b.k - a.k);
    for (const { p } of order) {
      // The smallest side; level on size, the weakest; level on both, any of them
      const min = Math.min(...sides.map((s) => size.get(s)!));
      const open = sides.filter((s) => size.get(s) === min);
      const low = Math.min(...open.map((s) => total.get(s)!));
      const pick = open.filter((s) => total.get(s) === low);
      const s = pick[Math.floor(rand() * pick.length)];
      teams[p.id] = s;
      size.set(s, size.get(s)! + 1);
      total.set(s, total.get(s)! + p.strength);
    }
    // Tidy up: swap two free players on different sides while it narrows the gap (sizes don't change)
    const gapNow = () => {
      const avgs = sides.filter((x) => size.get(x)!).map((x) => total.get(x)! / size.get(x)!);
      return avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;
    };
    for (let pass = 0; pass < 3; pass++) {
      let better = false;
      for (const a of free) {
        for (const b of free) {
          const sa = teams[a.id], sb = teams[b.id];
          if (sa === sb || a.strength === b.strength) continue;
          const now = gapNow();
          const d = b.strength - a.strength;
          total.set(sa, total.get(sa)! + d);
          total.set(sb, total.get(sb)! - d);
          if (gapNow() < now - 0.01) {
            teams[a.id] = sb;
            teams[b.id] = sa;
            better = true;
          } else {
            total.set(sa, total.get(sa)! - d);
            total.set(sb, total.get(sb)! + d);
          }
        }
      }
      if (!better) break;
    }
    return teams;
  };

  const seen = new Map<string, { teams: Record<string, string>; gap: number }>();
  let best = Infinity;
  for (let i = 0; i < TRIES; i++) {
    const teams = once();
    const key = shape(teams, sides);
    if (seen.has(key)) continue;
    const gap = gapOf(players, teams, sides);
    seen.set(key, { teams, gap });
    best = Math.min(best, gap);
    // Enough fair choices to pick from: stop early (big squads)
    if (i >= 60 && [...seen.entries()].filter(([k, c]) => k !== before && c.gap <= best + FAIR_SLACK).length >= ENOUGH) break;
  }
  const all = [...seen.entries()];
  const fair = all.filter(([, c]) => c.gap <= best + FAIR_SLACK);
  const fresh = fair.filter(([key]) => key !== before);
  const pool = fresh.length ? fresh : fair;
  const [, chosen] = pool[Math.floor(rand() * pool.length)];
  return { teams: chosen.teams, gap: Math.round(chosen.gap), onlyOne: !fresh.length };
}
