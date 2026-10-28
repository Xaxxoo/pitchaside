/**
 * The attributes on the player card (Matt, 27 Oct: "all attributes are 45"). Each one starts from
 * the card's own number and moves only on evidence:
 * - SHO from goals per game, PAS from assists per game, GK from saves per game, each against the
 *   club and counting for more as games build up;
 * - every ability also from teammates' award nominations (awardLift, never down).
 * An ability with no evidence at all is null and the card leaves it out, so a box never shows a
 * made-up number. Pure, so it can be tested on its own.
 */

export type Ability = 'SHO' | 'PAS' | 'TEC' | 'DEF' | 'IQ' | 'PHY' | 'MOV' | 'GK';
export const CARD_ABILITIES: Ability[] = ['SHO', 'PAS', 'TEC', 'DEF', 'IQ', 'PHY', 'MOV', 'GK'];

export interface AttributeRow {
  games: number;
  goals: number;
  assists: number;
  saves?: number;
  awardLift?: Partial<Record<Ability, number>>;
}

/** Points per spread (standard deviation) above or below the club on a stat, and the most a stat moves an attribute. */
const PER_SPREAD = 8;
const STAT_CAP = 12;
/** Games before a stat counts for half its weight. */
const STAT_PRIOR = 3;
/** A stat needs this many games from the player before it says anything. */
const MIN_GAMES = 2;

const STATS: Partial<Record<Ability, (r: AttributeRow) => number>> = {
  SHO: (r) => r.goals,
  PAS: (r) => r.assists,
  GK: (r) => r.saves ?? 0,
};

export function cardAttributes(card: number, me: AttributeRow, club: AttributeRow[]): Record<Ability, number | null> {
  const played = club.filter((r) => r.games > 0);
  const out = {} as Record<Ability, number | null>;
  for (const a of CARD_ABILITIES) {
    let lift = 0;
    let evidence = false;
    const stat = STATS[a];
    if (stat && me.games >= MIN_GAMES) {
      const rates = played.map((r) => stat(r) / r.games);
      const mean = rates.reduce((x, y) => x + y, 0) / Math.max(1, rates.length);
      const sd = Math.sqrt(rates.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, rates.length));
      // Goalkeeping only for someone who has made saves: nobody else's GK says anything
      const counts = a === 'GK' ? stat(me) > 0 : sd > 0;
      if (counts && sd > 0) {
        const z = (stat(me) / me.games - mean) / sd;
        const shrink = me.games / (me.games + STAT_PRIOR);
        lift += Math.max(-STAT_CAP, Math.min(STAT_CAP, PER_SPREAD * z * shrink));
        evidence = true;
      }
    }
    const votes = me.awardLift?.[a];
    if (votes !== undefined) {
      lift += votes;
      evidence = true;
    }
    out[a] = evidence ? Math.max(30, Math.min(99, Math.round(card + lift))) : null;
  }
  return out;
}
