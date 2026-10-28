'use client';

import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { useToast } from '@/components/toast';
import type { RatingMode } from '@/lib/api';

const OPTIONS: { mode: RatingMode; name: string; line: string; detail: string }[] = [
  {
    mode: 'steady',
    name: 'Steady',
    line: 'Moves a little each match day',
    detail: 'A match rating out of 10 every match day, mostly from goals, assists, clean sheets and results. One great or bad day never swings it.',
  },
  {
    mode: 'classic',
    name: 'Classic',
    line: 'Where each player ranks in the club',
    detail: '40% goals and assists, 40% votes, 20% results, against everyone else. It can jump after one game, and moves when others play.',
  },
];

/**
 * The organiser's one line on the Stats page: how the club's ratings are worked out, and a sheet
 * to change it. It's a club setting: every group and both apps show the same number.
 */
export function RatingModeRow({ mode, onChange }: { mode: RatingMode; onChange: (mode: RatingMode) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.mode === mode)!;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press mt-2 w-full min-h-12 flex items-center gap-3 px-3.5 rounded-2xl bg-white border border-gray-200 text-left hover:border-ink"
      >
        <span className="flex-1 min-w-0 truncate text-[14px] text-gray-600">
          Rating: <b className="text-ink">{current.name}</b>
        </span>
        <span className="shrink-0 text-[13px] font-bold text-pitch-700">Change</span>
      </button>
      {open && <RatingModeSheet mode={mode} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

function RatingModeSheet({ mode, onChange, onClose }: { mode: RatingMode; onChange: (mode: RatingMode) => Promise<unknown>; onClose: () => void }) {
  const titleId = useId();
  const toast = useToast();
  const [pick, setPick] = useState<RatingMode>(mode);
  const [busy, setBusy] = useState(false);
  const chosen = OPTIONS.find((o) => o.mode === pick)!;

  const save = async () => {
    if (pick === mode) return onClose();
    setBusy(true);
    try {
      await onChange(pick);
      toast.success(`Ratings are ${chosen.name.toLowerCase()} now, in every group and the player app`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t change it. Try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <button onClick={save} disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? 'Saving…' : pick === mode ? 'Keep it' : `Switch to ${chosen.name}`}
        </button>
      }
    >
      <SheetTitle id={titleId} title="How ratings work" sub="For every group in your club, in both apps. Switch back any time: nothing is lost." onClose={onClose} />
      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">How ratings work</legend>
        {OPTIONS.map((o) => (
          <label key={o.mode} className="block cursor-pointer">
            <input type="radio" name="rating-mode" value={o.mode} checked={pick === o.mode} onChange={() => setPick(o.mode)} className="peer sr-only" />
            <span className="block rounded-3xl border-2 border-gray-200 bg-white px-4 py-3 transition-colors peer-checked:border-ink peer-checked:bg-volt-300/40 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-ink">{o.name}</span>
                {o.mode === mode && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-volt-300">Now</span>}
              </span>
              <span className="block mt-0.5 text-[13px] font-semibold text-gray-700">{o.line}</span>
              <span className="block mt-1 text-[12px] leading-snug text-gray-600">{o.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Sheet>
  );
}
