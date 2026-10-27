/**
 * Who was in goal for each side of one short game. Anyone playing that day can keep goal for
 * either side: their own, or another team that borrowed them (in 5/6-a-side the keeper is often
 * someone lent by a team sitting out). Not recorded is fine: older games never were.
 */
export function checkKeepers(
  payments: { playerId: string; attendance?: string | null }[],
  keepers: { keeperA?: string | null; keeperB?: string | null },
): { keeperA?: string | null; keeperB?: string | null } {
  const playing = new Set(payments.filter((p) => p.attendance !== 'no_show').map((p) => p.playerId));
  for (const id of [keepers.keeperA, keepers.keeperB]) {
    if (id && !playing.has(id)) throw new Error('The keeper has to be someone playing today');
  }
  if (keepers.keeperA && keepers.keeperA === keepers.keeperB) throw new Error('One person can’t be in goal for both sides');
  const out: { keeperA?: string | null; keeperB?: string | null } = {};
  if (keepers.keeperA !== undefined) out.keeperA = keepers.keeperA || null;
  if (keepers.keeperB !== undefined) out.keeperB = keepers.keeperB || null;
  return out;
}

/** A keeper from another team (or no team) than the side they kept for: borrowed. */
export function borrowed(keeperTeam: string | null | undefined, side: string) {
  return keeperTeam !== side;
}
