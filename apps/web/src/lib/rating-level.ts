/**
 * The card's number in words, the same in both apps and on the share card (Matt, 28 Oct): up to
 * 54 Squad player, 55–64 Regular, 65–74 Key player, 75–84 Star, 85 and up Legend.
 */
export const LEVELS = [
  { name: 'Squad player', from: 0 },
  { name: 'Regular', from: 55 },
  { name: 'Key player', from: 65 },
  { name: 'Star', from: 75 },
  { name: 'Legend', from: 85 },
] as const;

export type Level = (typeof LEVELS)[number]['name'];

/** The level a card number sits in, and the next one up with how far it is (null at the top). */
export function levelOf(ovr: number) {
  const n = Math.round(ovr);
  let at = 0;
  LEVELS.forEach((l, i) => n >= l.from && (at = i));
  const next = LEVELS[at + 1];
  return { name: LEVELS[at].name as Level, index: at, next: next ? { name: next.name as Level, from: next.from, gap: next.from - n } : null };
}
