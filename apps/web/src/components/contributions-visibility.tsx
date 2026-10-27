'use client';

import type { ContributionsVisibility } from '@pitchaside/shared';

const OPTIONS: { value: ContributionsVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Private', hint: 'Only organisers see the kitty' },
  { value: 'totals', label: 'Totals', hint: 'How much is in and how many paid' },
  { value: 'names', label: 'Totals + names', hint: 'Players see who has paid too' },
];

/** "What players can see" of the group's contributions. Used on create and edit group forms. */
export function ContributionsVisibilityPicker({
  value,
  onChange,
  name,
}: {
  value?: ContributionsVisibility;
  onChange?: (v: ContributionsVisibility) => void;
  /** Set for uncontrolled use inside a <form>. */
  name?: string;
}) {
  return (
    <fieldset>
      <legend className="block text-xs font-bold text-gray-700 mb-1.5">What players can see of contributions</legend>
      {/* One option per row, so each says what it means on one line instead of four */}
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name ?? 'contributionsVisibility'}
              value={o.value}
              {...(onChange
                ? { checked: (value ?? 'private') === o.value, onChange: () => onChange(o.value) }
                : { defaultChecked: (value ?? 'private') === o.value })}
              className="peer sr-only"
            />
            <span className="group flex items-center gap-3 min-h-14 px-3 py-2 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300 peer-checked:[&_.dot]:border-ink peer-checked:[&_.dot]:border-[6px]">
              <span className="dot w-5 h-5 shrink-0 rounded-full border-2 border-gray-300 bg-white transition-all" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{o.label}</span>
                <span className="block text-xs text-gray-600 truncate">{o.hint}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
