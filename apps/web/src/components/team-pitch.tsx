'use client';

import type { Position } from '@pitchaside/shared';
import { Avatar } from '@/components/ratings';
import { POSITIONS } from '@/lib/positions';

export interface PitchPlayer {
  id: string;
  /** Full name, for the face and screen readers. */
  name: string;
  /** What fits under the face: nickname or first name. */
  short: string;
  position?: Position | null;
  photoKey?: string | null;
  captain?: boolean;
  vice?: boolean;
  me?: boolean;
  /** With onTap: false leaves this face plain (they can't be moved). */
  tappable?: boolean;
}

/** Attack at the top, keeper at the bottom, as a team sheet reads. */
const ROWS: Position[] = ['ATT', 'MID', 'DEF', 'GK'];

/** "Keeper + 2-1-2" from who plays where; "2-1-2" with no keeper; null when there's no shape to show. */
export function formationOf(players: Pick<PitchPlayer, 'position'>[]) {
  const n = (p: Position) => players.filter((x) => x.position === p).length;
  const lines = (['DEF', 'MID', 'ATT'] as Position[]).map(n);
  const used = lines.filter(Boolean);
  // One outfield line ("12") isn't a shape: the header shows the head count instead.
  if (used.length === 1) return null;
  if (!used.length) return n('GK') && n('GK') === players.length ? 'Keeper only' : null;
  return n('GK') ? `Keeper + ${used.join('-')}` : used.join('-');
}

/**
 * One team on a small pitch: faces in rows by position, attack at the top, keeper at the bottom,
 * with the formation over it and anyone without a position listed under it (never left off).
 */
export function TeamPitch({
  title,
  swatch,
  players,
  tone,
  onTap,
  dark = false,
  badge,
  empty,
}: {
  title: string;
  /** Beside the title, e.g. the Team of the Day trophy. */
  badge?: React.ReactNode;
  /** What to do when the side has no one yet. */
  empty?: string;
  swatch: React.ReactNode;
  players: PitchPlayer[];
  tone?: React.CSSProperties;
  /** Where tapping a face does something (move them): the face becomes a button. */
  onTap?: (id: string) => boolean | void;
  /** On a dark card (the player app's match day): light text around the pitch. */
  dark?: boolean;
}) {
  const taps = (x: PitchPlayer) => !!onTap && x.tappable !== false;
  const anyTap = players.some(taps);
  const placed = ROWS.map((p) => ({ p, list: players.filter((x) => x.position === p) })).filter((r) => r.list.length);
  const loose = players.filter((x) => !x.position);
  const shape = formationOf(players);
  return (
    <figure className="min-w-0 rounded-3xl p-2" style={tone}>
      <figcaption className="flex items-center gap-1.5 px-1.5 pt-1 pb-2 min-w-0">
        {swatch}
        <span className={`text-[14px] font-extrabold truncate ${dark ? 'text-white' : 'text-ink'}`}>{title}</span>
        {badge}
        <span className={`ml-auto shrink-0 text-[12px] font-bold tabular-nums ${dark ? 'text-white/60' : 'text-gray-600'}`}>{shape ?? `${players.length} player${players.length === 1 ? '' : 's'}`}</span>
      </figcaption>
      {!players.length && (
        <p className={`mx-0.5 mb-0.5 rounded-2xl border border-dashed px-2.5 py-2.5 text-[12px] leading-snug ${dark ? 'border-white/20 text-white/70' : 'border-ink/20 text-gray-600'}`}>
          <b className={`block ${dark ? 'text-white' : 'text-ink'}`}>No one yet</b>
          {empty}
        </p>
      )}
      {placed.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-pitch-600 px-2 py-3" role={anyTap ? undefined : 'img'} aria-label={anyTap ? undefined : `${title}: ${placed.map((r) => `${POSITIONS.find((x) => x.value === r.p)!.label} ${r.list.map((x) => x.short).join(', ')}`).join('; ')}`}>
          <span className="absolute inset-0 turf-stripes opacity-60" aria-hidden />
          {/* Pitch lines: halfway, centre circle, the box at the keeper's end */}
          <span className="absolute left-0 right-0 top-0 h-px bg-white/30" aria-hidden />
          <span className="absolute left-1/2 -top-8 w-16 h-16 -translate-x-1/2 rounded-full border border-white/30" aria-hidden />
          <span className="absolute left-1/2 bottom-0 w-2/5 h-10 -translate-x-1/2 border border-b-0 border-white/30" aria-hidden />
          <ol className="relative space-y-3">
            {placed.map((r) => (
              <li key={r.p} className="flex flex-wrap justify-center gap-x-2 gap-y-2">
                {r.list.map((x) => {
                  const tap = taps(x);
                  const Tag = tap ? 'button' : 'span';
                  return (
                  <Tag
                    key={x.id}
                    {...(tap ? { type: 'button' as const, onClick: () => onTap!(x.id), 'aria-label': `Move ${x.name}, ${POSITIONS.find((p) => p.value === x.position)?.label}` } : anyTap ? {} : { 'aria-hidden': true })}
                    className={`flex flex-col items-center w-[60px] min-w-0 ${tap ? 'press rounded-xl py-0.5 hover:bg-white/10' : ''}`}
                  >
                    <span className="relative">
                      <Avatar name={x.name} photoKey={x.photoKey} className={`w-9 h-9 text-[11px] ring-2 ${x.me ? 'ring-volt-300' : 'ring-white/80'}`} />
                      {(x.captain || x.vice) && (
                        <span className="absolute -top-1 -right-1.5 min-w-4 h-4 px-0.5 rounded-full bg-ink text-volt-300 text-[8px] font-extrabold leading-4 text-center">{x.captain ? 'C' : 'VC'}</span>
                      )}
                    </span>
                    <span className="mt-1 max-w-full truncate rounded-md bg-ink/55 px-1 text-[11px] font-bold text-white leading-[16px]">{x.me ? 'You' : x.short}</span>
                  </Tag>
                  );
                })}
              </li>
            ))}
          </ol>
        </div>
      )}
      {loose.length > 0 && (
        <p className={`mt-2 px-1.5 text-[12px] leading-snug ${dark ? 'text-white/70' : 'text-gray-600'}`}>
          <b className={dark ? 'text-white' : 'text-ink'}>{placed.length ? 'No position yet: ' : 'No positions set yet: '}</b>
          {loose.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ', '}
              {taps(x) ? (
                <button type="button" onClick={() => onTap!(x.id)} aria-label={`Move ${x.name}`} className={`font-semibold underline decoration-dotted underline-offset-2 min-h-8 ${dark ? 'text-volt-300' : 'text-pitch-700'}`}>
                  {x.me ? 'You' : x.short}
                </button>
              ) : x.me ? 'You' : x.short}
            </span>
          ))}
        </p>
      )}
    </figure>
  );
}
