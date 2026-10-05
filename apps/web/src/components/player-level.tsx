import type { PlayerLevel } from '@pitchaside/shared';

const LEVELS: { value: PlayerLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'average', label: 'Average' },
  { value: 'good', label: 'Good' },
  { value: 'strong', label: 'Strong' },
];

/**
 * How good a player is before they've played here. It seeds their skill rating so
 * "Balance by rating" is fair from the first game; results take over from there.
 */
export function PlayerLevelPicker({ value, onChange }: { value: PlayerLevel; onChange: (level: PlayerLevel) => void }) {
  return (
    <fieldset>
      <legend className="block text-xs font-bold text-gray-700 mb-1.5">Level</legend>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup">
        {LEVELS.map((l) => {
          const on = value === l.value;
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(l.value)}
              className={`py-2 text-xs font-bold rounded-xl border transition-colors ${
                on ? 'bg-ink text-volt-300 border-ink' : 'bg-white text-gray-700 border-gray-200 hover:border-ink'
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500 mt-1">Used to balance teams until they’ve played a few games; results take over after that.</p>
    </fieldset>
  );
}
