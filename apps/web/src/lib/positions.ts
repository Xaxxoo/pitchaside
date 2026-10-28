import type { Position } from '@pitchaside/shared';

/** Positions in pitch order, with the words used everywhere: full, and short for narrow rows. */
export const POSITIONS: { value: Position; label: string; short: string }[] = [
  { value: 'GK', label: 'Keeper', short: 'GK' },
  { value: 'DEF', label: 'Defence', short: 'DEF' },
  { value: 'MID', label: 'Midfield', short: 'MID' },
  { value: 'ATT', label: 'Attack', short: 'ATT' },
];

export const positionLabel = (p: Position | null | undefined) => POSITIONS.find((x) => x.value === p)?.label ?? null;
export const positionShort = (p: Position | null | undefined) => POSITIONS.find((x) => x.value === p)?.short ?? null;
/** For sorting a team: keeper first, attack last, not said at the end. */
export const positionOrder = (p: Position | null | undefined) => {
  const i = POSITIONS.findIndex((x) => x.value === p);
  return i < 0 ? POSITIONS.length : i;
};
