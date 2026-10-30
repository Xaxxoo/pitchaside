'use client';

import { useState } from 'react';
import { chip, label, Stepper } from '@/components/group/group-edit-sheet';

/** The lengths most pitches sell, as pills; anything else is "Other". */
const PRESETS = [30, 45, 60, 90, 120];
/** The API allows 15 minutes to 8 hours; four hours is plenty for a game. */
const MIN = 15;
const MAX = 240;

/** Whether a length can be saved. */
export const gameLengthOk = (m: number) => Number.isInteger(m) && m >= MIN && m <= MAX;

/** "30 min", "1 hour", "1½ hours", "2 hours", "50 min". */
export function gameLength(m: number) {
  if (m === 60) return '1 hour';
  if (m % 60 === 0) return `${m / 60} hours`;
  if (m % 60 === 30 && m > 60) return `${Math.floor(m / 60)}½ hours`;
  return `${m} min`;
}

/**
 * How long one game lasts: the common lengths as pills, and "Other" for anything else (say a
 * 50-minute game), which opens a minutes box in 5-minute steps.
 */
export function GameLengthPicker({ value, onChange, legend = 'Each game lasts' }: { value: number; onChange: (m: number) => void; legend?: string }) {
  const [other, setOther] = useState(!PRESETS.includes(value));
  return (
    <fieldset>
      <legend className={label}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((m) => (
          <button key={m} type="button" aria-pressed={!other && value === m} onClick={() => { setOther(false); onChange(m); }} className={chip(!other && value === m)}>
            {gameLength(m)}
          </button>
        ))}
        <button type="button" aria-pressed={other} onClick={() => setOther(true)} className={chip(other)}>
          Other
        </button>
      </div>
      {other && (
        <div className="mt-3 rounded-2xl bg-chalk px-4 py-3.5">
          <p id="game-minutes" className={label}>Minutes a game</p>
          <Stepper
            id="game-minutes-input"
            value={value}
            onChange={onChange}
            step={5}
            min={MIN}
            labelledBy="game-minutes"
            less="5 minutes less"
            more="5 minutes more"
          />
          {gameLengthOk(value) ? (
            <p className="text-[12px] text-gray-600 mt-2">Each game: {gameLength(value)}.</p>
          ) : (
            <p className="text-[12px] font-bold text-kit-600 mt-2">Pick between {MIN} minutes and {MAX / 60} hours.</p>
          )}
        </div>
      )}
    </fieldset>
  );
}
