'use client';

import type { Position } from '@pitchaside/shared';
import { POSITIONS } from '@/lib/positions';

/**
 * Where a player usually plays: four choices in pitch order, and Clear once one is picked.
 * Clean sheets and fair teams use it (keepers are shared out first).
 */
export function PositionPicker({
  value,
  onChange,
  label = 'Position',
  hint = 'Used for clean sheets and fair teams.',
}: {
  value: Position | null;
  onChange: (position: Position | null) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <fieldset>
      <div className="flex items-center justify-between mb-1.5 min-h-6">
        <span className="text-xs font-bold text-gray-700">{label}</span>
        {value ? (
          <button type="button" onClick={() => onChange(null)} className="-my-2 px-2 min-h-11 text-xs font-bold text-pitch-700">
            Clear
          </button>
        ) : (
          <span className="text-xs font-semibold text-gray-500">Not set</span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={label}>
        {POSITIONS.map((p) => {
          const on = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(p.value)}
              className={`min-h-11 text-xs font-bold rounded-xl border transition-colors ${
                on ? 'bg-ink text-volt-300 border-ink' : 'bg-white text-gray-700 border-gray-200 hover:border-ink'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </fieldset>
  );
}
