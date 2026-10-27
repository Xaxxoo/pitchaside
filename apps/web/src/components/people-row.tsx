'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ratings';

/** `short` is what they go by in a line of names (nickname, else first name). */
export type Face = { id: string; name: string; short?: string; photoKey?: string | null; me?: boolean };

/**
 * "Ada", "Ada and Tobi", "Ada, Tobi +3": the first names of who a row is about, short enough for
 * one line beside the faces at 360px.
 */
export function namesLine(people: { name: string; short?: string; me?: boolean }[], shown = 2, total = people.length) {
  const first = (p: { name: string; short?: string; me?: boolean }) => (p.me ? 'You' : p.short || p.name.split(' ')[0]);
  const names = people.slice(0, shown).map(first);
  const more = total - names.length;
  if (more > 0) return `${names.join(', ')} +${more}`;
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Overlapping faces (photos, else initials), the first few of a group, with "+N" for the rest. */
export function FaceStack({
  people,
  total,
  max = 4,
  onDark = false,
  showMore = true,
}: {
  people: Face[];
  total?: number;
  max?: number;
  onDark?: boolean;
  /** Off where the words beside the faces already give the count ("Ada, Tobi +15"). */
  showMore?: boolean;
}) {
  const shown = people.slice(0, max);
  const more = showMore ? Math.max(0, (total ?? people.length) - shown.length) : 0;
  // Each face sits on a ring in the card's own colour, so the overlaps cut clean.
  const ring = onDark ? 'ring-[2.5px] ring-[#123a22]' : 'ring-[2.5px] ring-white';
  return (
    <span className="flex items-center -space-x-1.5 shrink-0" aria-hidden>
      {shown.map((p, i) => (
        <span key={p.id} className={`relative rounded-full ${ring} ${p.me ? (onDark ? 'outline outline-2 outline-offset-1 outline-volt-400' : 'outline outline-2 outline-offset-1 outline-ink') : ''}`} style={{ zIndex: shown.length - i }}>
          <Avatar name={p.name} photoKey={p.photoKey} className="w-8 h-8 text-[11px]" />
        </span>
      ))}
      {more > 0 && (
        <span
          className={`${ring} w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold tabular-nums ${
            onDark ? 'bg-white/15 text-white' : 'bg-chalk text-ink'
          }`}
        >
          +{more > 99 ? '99' : more}
        </span>
      )}
    </span>
  );
}

/**
 * The people a card is about right now, as faces and a line in words: who's in, who still owes,
 * who's still to vote, who won. Opens what it's about when `href` is set; `action` sits on the right.
 */
export function PeopleRow({
  people,
  total,
  title,
  sub,
  href,
  action,
  onDark = false,
  className = '',
}: {
  people: Face[];
  /** How many in all, when `people` is only the first few. */
  total?: number;
  title: string;
  sub?: string;
  href?: string;
  action?: React.ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <FaceStack people={people} total={total} onDark={onDark} showMore={false} />
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] font-bold leading-snug truncate ${onDark ? 'text-white' : 'text-ink'}`}>{title}</span>
        {sub && <span className={`block text-[12px] leading-snug truncate ${onDark ? 'text-white/65' : 'text-gray-600'}`}>{sub}</span>}
      </span>
    </>
  );
  const chevron = (
    <svg className={`w-3.5 h-3.5 shrink-0 ${onDark ? 'text-white/45' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {href ? (
        <Link
          href={href}
          className={`press flex-1 min-w-0 flex items-center gap-3 min-h-12 -mx-1.5 px-1.5 rounded-xl transition-colors ${onDark ? 'hover:bg-white/[0.06]' : 'hover:bg-chalk'}`}
        >
          {body}
          {!action && chevron}
        </Link>
      ) : (
        <div className="flex-1 min-w-0 flex items-center gap-3 min-h-12">{body}</div>
      )}
      {action}
    </div>
  );
}
