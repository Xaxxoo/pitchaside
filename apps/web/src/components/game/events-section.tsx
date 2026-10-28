'use client';

import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { Avatar } from '@/components/ratings';
import { BallSpinner } from '@/components/skeleton';
import { buzz } from '@/components/motion';
import type { Lineup, MatchEventKind, TeamKey } from '@/lib/api';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';
import { Swatch, shortName } from './teams-step';

type Member = Lineup['squad'][number];

const KINDS: { kind: MatchEventKind; label: string; mark: React.ReactNode }[] = [
  { kind: 'yellow', label: 'Yellow card', mark: <span className="w-3.5 h-[18px] rounded-[3px] bg-sun-400 border border-ink/20" aria-hidden /> },
  { kind: 'red', label: 'Red card', mark: <span className="w-3.5 h-[18px] rounded-[3px] bg-[#e5484d] border border-ink/20" aria-hidden /> },
  {
    kind: 'pen_miss',
    label: 'Missed penalty',
    // A ball with a line through it
    mark: (
      <svg className="w-[18px] h-[18px] text-kit-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
        <circle cx="12" cy="12" r="8" />
        <path strokeLinecap="round" d="M5 19 19 5" />
      </svg>
    ),
  },
  {
    kind: 'save',
    label: 'Save',
    mark: (
      <svg className="w-[18px] h-[18px] text-pitch-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15m.002 0h-.002" />
      </svg>
    ),
  },
];

/**
 * Cards, saves and missed penalties on match day: tap "+ Add", pick the player, then what it was.
 * Today's list below, newest first, each removable by whoever may (the organiser, or the captain
 * who added it). Cards and misses take a little off the rating; saves add a little.
 */
export function EventsSection({
  lineup,
  onAdd,
  onRemove,
  canRemove,
  busy,
}: {
  lineup: Lineup;
  onAdd: (playerId: string, kind: MatchEventKind) => Promise<void>;
  onRemove: (eventId: string) => Promise<void>;
  canRemove: (recordedBy: string | null | undefined) => boolean;
  busy: string | null;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Member | null>(null);
  const events = lineup.events ?? [];
  const byId = (id: string) => lineup.squad.find((m) => m.id === id);
  const teams = [...new Set(lineup.squad.map((m) => m.team))].sort((a, b) => (a ?? 'Z').localeCompare(b ?? 'Z'));
  const close = () => {
    setOpen(false);
    setWho(null);
  };

  return (
    <section aria-labelledby="events-title" className="mt-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 id="events-title" className="text-[13px] font-extrabold text-ink">
          Cards and saves <span className="text-gray-500 tabular-nums">· {events.length}</span>
        </h3>
        <button
          onClick={() => setOpen(true)}
          className="press min-h-11 px-3.5 rounded-full border border-gray-200 bg-white text-[13px] font-bold text-ink hover:border-ink"
        >
          + Add
        </button>
      </div>
      {events.length > 0 ? (
        <ul className="mt-1.5 bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
          {[...events].reverse().map((e) => {
            const m = byId(e.playerId);
            const k = KINDS.find((x) => x.kind === e.kind)!;
            return (
              <li key={e.id} className="flex items-center gap-3 min-h-14 pl-3 pr-1 py-1.5">
                <span className="relative shrink-0">
                  <Avatar name={m ? `${m.firstName} ${m.lastName}` : '?'} photoKey={m?.photoKey} className="w-9 h-9 text-[11px]" />
                  <span className="absolute -bottom-1 -right-1.5 flex">{k.mark}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-ink truncate">
                    {m ? shortName(m) : 'Someone'} · {k.label}
                  </span>
                  {e.recordedBy && <span className="block text-[12px] text-gray-500">Added by {e.recordedBy}</span>}
                </span>
                {canRemove(e.recordedBy) && (
                  <button
                    onClick={() => onRemove(e.id)}
                    disabled={!!busy}
                    aria-label={`Remove ${m ? shortName(m) : 'this'}'s ${k.label.toLowerCase()}`}
                    className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-kit-600"
                  >
                    {busy === e.id ? (
                      <BallSpinner className="w-4 h-4" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 px-1 text-[12px] text-gray-500">Cards, saves and missed penalties. Cards and misses take a little off a rating; saves add a little.</p>
      )}

      {open && (
        <Sheet titleId={titleId} onClose={close} align="left">
          <SheetTitle
            id={titleId}
            title={who ? `${shortName(who)}: what was it?` : 'Who was it?'}
            sub={who ? (who.team ? teamName(who.team as TeamKey, lineup.captains, lineup.bibs) : undefined) : 'A card, a save or a missed penalty. Tap the player.'}
            onClose={close}
          />
          {!who ? (
            teams.map((t) => (
              <div key={t ?? 'none'} className="mt-4">
                <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                  {t && <Swatch team={t as TeamKey} bibs={lineup.bibs} />}
                  {t ? teamName(t as TeamKey, lineup.captains, lineup.bibs) : 'No team'}
                  {t && <span className="sr-only">({bibOf(t as TeamKey, lineup.bibs).label})</span>}
                </p>
                <ul className="mt-1.5 grid grid-cols-3 gap-2">
                  {lineup.squad
                    .filter((m) => m.team === t)
                    .map((m) => (
                      <li key={m.id} className="min-w-0">
                        <button
                          onClick={() => setWho(m)}
                          className="press w-full flex flex-col items-center gap-1 min-h-[80px] px-1.5 py-2 rounded-2xl border-2 border-gray-100 bg-white hover:border-gray-300"
                        >
                          <Avatar name={`${m.firstName} ${m.lastName}`} photoKey={m.photoKey} className="w-9 h-9 text-[11px]" />
                          <span className="w-full truncate text-[13px] font-bold text-ink">{shortName(m)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          ) : (
            <div className="mt-4 grid gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  disabled={!!busy}
                  onClick={async () => {
                    buzz(8);
                    await onAdd(who.id, k.kind);
                    close();
                  }}
                  className="press flex items-center gap-3 min-h-14 px-4 rounded-2xl border border-gray-200 bg-white text-left text-[15px] font-bold text-ink hover:border-ink"
                >
                  <span className="w-5 flex justify-center">{k.mark}</span>
                  {k.label}
                </button>
              ))}
              <button onClick={() => setWho(null)} className="press min-h-11 text-[14px] font-bold text-gray-600 hover:text-ink">
                ← Pick someone else
              </button>
            </div>
          )}
        </Sheet>
      )}
    </section>
  );
}
