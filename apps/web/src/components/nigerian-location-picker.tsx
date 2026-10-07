'use client';

import { useState, useEffect } from 'react';
import { getNigerianStates, type NigerianStateData } from '@/lib/api';

interface NigerianLocationPickerProps {
  state?: string;
  city?: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  className?: string;
}

export function NigerianLocationPicker({ state, city, onStateChange, onCityChange, className }: NigerianLocationPickerProps) {
  const [states, setStates] = useState<NigerianStateData[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    getNigerianStates().then(setStates).catch(() => {});
  }, []);

  useEffect(() => {
    const s = states.find((s) => s.name === state);
    setCities(s?.cities ?? []);
  }, [state, states]);

  const selectClass = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 bg-white';

  return (
    <div className={`grid grid-cols-2 gap-3 ${className ?? ''}`}>
      <div>
        <label htmlFor="state" className="block text-xs font-bold text-gray-700 mb-1.5">
          State *
        </label>
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
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="city" className="block text-xs font-bold text-gray-700 mb-1.5">
          City *
        </label>
        <select
          id="city"
          value={city ?? ''}
          onChange={(e) => onCityChange(e.target.value)}
          className={selectClass}
          disabled={!cities.length}
        >
          <option value="">Select city</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
