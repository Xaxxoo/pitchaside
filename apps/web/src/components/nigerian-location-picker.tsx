'use client';

import { useState, useEffect } from 'react';
import { getNigerianStates, type NigerianStateData } from '@/lib/api';
import { field, label } from '@/components/group/group-edit-sheet';

interface NigerianLocationPickerProps {
  state?: string;
  city?: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  className?: string;
  /** Marks both as required (*). */
  required?: boolean;
}

export function NigerianLocationPicker({
  state,
  city,
  onStateChange,
  onCityChange,
  className,
  required = true,
}: NigerianLocationPickerProps) {
  const [states, setStates] = useState<NigerianStateData[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    getNigerianStates()
      .then(setStates)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const s = states.find((s) => s.name === state);
    setCities(s?.cities ?? []);
  }, [state, states]);

  // The app's text box look (group-edit-sheet field), with room on the right for the chevron.
  const selectClass = `${field} appearance-none pr-10 cursor-pointer truncate`;
  const mark = required ? ' *' : '';

  return (
    <div className={`grid grid-cols-2 gap-3 ${className ?? ''}`}>
      <div>
        <label htmlFor="state" className={label}>
          State{mark}
        </label>
        <div className="relative">
          <select
            id="state"
            value={state ?? ''}
            onChange={(e) => {
              onStateChange(e.target.value);
              onCityChange('');
            }}
            className={selectClass}
          >
            <option value="">Select state</option>
            {states.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
      <div>
        <label htmlFor="city" className={label}>
          City{mark}
        </label>
        <div className="relative">
          <select
            id="city"
            value={city ?? ''}
            onChange={(e) => onCityChange(e.target.value)}
            className={selectClass}
            disabled={!cities.length}
          >
            <option value="">Select city</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
