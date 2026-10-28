'use client';

import { useState } from 'react';
import { DEFAULT_BIBS, type Bibs } from '@pitchaside/shared';
import { BibShirt } from '@/components/bib-shirt';
import { BibsSheet } from '@/components/bibs-sheet';
import { SwitchRow } from '@/components/rsvp-toggle';
import { Stepper, label } from '@/components/group/group-edit-sheet';
import { teamName } from '@/lib/teams';
import type { TeamKey } from '@/lib/api';

const SIDES = Object.keys(DEFAULT_BIBS) as TeamKey[];

export interface MatchDay {
  /** Whether match day shows the game timer, for the organiser, captains and players. */
  timerOn: boolean;
  /** How long each game lasts, in minutes; the timer starts from this. */
  gameMinutes: number;
  /** What each side wears and is called; null for the default colours. */
  bibs: Bibs | null;
}

/**
 * How match day runs, the same when setting a group up and editing it: the timer (on or off, and
 * how long a game lasts) and the bibs the sides wear, with names if the teams keep them.
 */
export function MatchDayFields({
  value,
  onChange,
  idPrefix = 'g',
  isNew = false,
}: {
  value: MatchDay;
  onChange: (patch: Partial<MatchDay>) => void;
  idPrefix?: string;
  /** A group being made: no games played yet, so no note about past games. */
  isNew?: boolean;
}) {
  const [bibsOpen, setBibsOpen] = useState(false);
  const id = (s: string) => `${idPrefix}-${s}`;

  return (
    <>
      <div className="space-y-3">
        <SwitchRow
          checked={value.timerOn}
          onChange={(timerOn) => onChange({ timerOn })}
          title="Match timer"
          sub="A countdown on every phone in the game. Off if the pitch keeps time."
        />
        {value.timerOn && (
          <div>
            <span className={label} id={id('length-label')}>
              Each game lasts
            </span>
            <Stepper
              id={id('length')}
              labelledBy={id('length-label')}
              value={value.gameMinutes}
              onChange={(v) => onChange({ gameMinutes: Math.min(60, v) })}
              step={1}
              min={1}
              less="One minute less"
              more="One minute more"
            />
            <p className="mt-1.5 text-xs text-gray-500">Minutes. You can change it on the day.</p>
          </div>
        )}
      </div>

      {/* What the sides wear */}
      <div>
        <span className={label} id={id('bibs-label')}>
          Bibs and team names
        </span>
        <button
          type="button"
          aria-labelledby={`${id('bibs-label')} ${id('bibs-now')}`}
          onClick={() => setBibsOpen(true)}
          className="press w-full min-h-14 flex items-center gap-3 px-3 bg-white border border-gray-200 rounded-xl text-left hover:border-ink"
        >
          <span className="flex -space-x-2 shrink-0">
            {SIDES.slice(0, 4).map((s) => (
              <BibShirt key={s} team={s} bibs={value.bibs} className="w-8 h-8" />
            ))}
          </span>
          {/* The shirts show the colours; the names are for screen readers */}
          <span id={id('bibs-now')} className="flex-1 min-w-0 text-[14px] font-semibold text-ink">
            <span aria-hidden>4 sides</span>
            <span className="sr-only">{SIDES.slice(0, 4).map((s) => teamName(s, undefined, value.bibs)).join(', ')}</span>
          </span>
          <span className="shrink-0 text-[13px] font-bold text-pitch-700">Change</span>
        </button>
        {!isNew && <p className="mt-1.5 text-xs text-gray-500">Games already played keep theirs. One game can change on its Teams step.</p>}
      </div>

      {bibsOpen && (
        <BibsSheet
          title="Bibs and team names"
          sub="The colours your group owns, and names if your teams keep them."
          current={value.bibs}
          shown={4}
          more
          saving={false}
          saveLabel="Use these bibs"
          resetLabel={value.bibs ? 'Back to the usual colours' : undefined}
          onSave={(bibs) => {
            onChange({ bibs });
            setBibsOpen(false);
          }}
          onReset={() => {
            onChange({ bibs: null });
            setBibsOpen(false);
          }}
          onClose={() => setBibsOpen(false)}
        />
      )}
    </>
  );
}
