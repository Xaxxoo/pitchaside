'use client';

import { useId, useState } from 'react';
import type { Position } from '@pitchaside/shared';
import { setMyPosition } from '@/lib/player';
import { POSITIONS } from '@/lib/positions';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';

/**
 * Where they usually play, saved straight away for every club they play in. Picking keeper also
 * tells the day plan they're happy in goal.
 */
export function PositionSetting({ value, onSaved }: { value: Position | null | undefined; onSaved?: () => void }) {
  const id = useId();
  const toast = useToast();
  const [current, setCurrent] = useState<Position | null>(value ?? null);
  const [saving, setSaving] = useState<Position | null | undefined>(undefined);

  async function pick(next: Position | null) {
    if (next === current || saving !== undefined) return;
    const before = current;
    setCurrent(next);
    setSaving(next);
    try {
      await setMyPosition(next);
      onSaved?.();
      toast.success(next ? `Saved: ${POSITIONS.find((p) => p.value === next)!.label.toLowerCase()}` : 'Position cleared');
    } catch (err) {
      setCurrent(before);
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setSaving(undefined);
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p id={id} className="text-[15px] font-bold text-ink">
          Your position
        </p>
        {current ? (
          <button onClick={() => pick(null)} disabled={saving !== undefined} className="press -my-2 px-2 min-h-11 text-[13px] font-bold text-pitch-700">
            Clear
          </button>
        ) : (
          <span className="text-[13px] font-semibold text-gray-500">Not set</span>
        )}
      </div>
      <p className="text-[13px] leading-snug text-gray-600">Used for clean sheets and fair teams.</p>
      <div className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-labelledby={id}>
        {POSITIONS.map((p) => {
          const on = current === p.value;
          return (
            <button
              key={p.value}
              role="radio"
              aria-checked={on}
              onClick={() => pick(p.value)}
              className={`press min-h-12 rounded-2xl border text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
                on ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-ink hover:border-ink'
              }`}
            >
              {saving === p.value && <BallSpinner className="w-3.5 h-3.5" />}
              {p.label}
            </button>
          );
        })}
      </div>
      {current === 'GK' && <p className="mt-2 text-[12px] text-gray-600">As a keeper, the day plan puts you in goal first.</p>}
    </div>
  );
}
