const SIDES = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * A lineup change asked for once scores are in. The sides are what the games were played by, so
 * the only change allowed is putting someone who isn't on a side yet (they came late) onto one.
 * Gives who goes where, 'locked' for any other change, or 'ended' after full time.
 */
export function lateArrivals(
  session: { status: string; teamCount: number; payments?: { playerId: string; team: string | null }[] | null },
  input: { teamCount?: number; teams?: Record<string, string | null>; captains?: Record<string, string | null>; vices?: Record<string, string | null> },
): Record<string, string> | 'locked' | 'ended' {
  if (input.teamCount !== undefined && input.teamCount !== session.teamCount) return 'locked';
  if (Object.keys(input.captains ?? {}).length || Object.keys(input.vices ?? {}).length) return 'locked';
  const sides = new Set(SIDES.slice(0, session.teamCount));
  const placed: Record<string, string> = {};
  for (const [playerId, team] of Object.entries(input.teams ?? {})) {
    const p = session.payments?.find((x) => x.playerId === playerId);
    if (!p || p.team === team) continue;
    if (p.team || !team || !sides.has(team)) return 'locked';
    placed[playerId] = team;
  }
  if (Object.keys(placed).length && session.status !== 'upcoming') return 'ended';
  return placed;
}

/**
 * Whether a game counts for a player: unless they joined their side after it was saved, were
 * marked as sitting it out, or had left before it started (`leftAt`, from "left early").
 * `startedAt`: when the game kicked off (its save time less how long it lasted).
 */
export function playedIn(
  payment: { playerId?: string; joinedSideAt?: Date | null } | null | undefined,
  game: { createdAt: Date; satOut?: string[] | null },
  left?: { leftAt: number; startedAt: number } | null,
) {
  if (payment?.joinedSideAt && new Date(game.createdAt).getTime() < new Date(payment.joinedSideAt).getTime()) return false;
  if (payment?.playerId && game.satOut?.includes(payment.playerId)) return false;
  return !left || left.startedAt < left.leftAt;
}
