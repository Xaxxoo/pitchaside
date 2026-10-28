'use client';

import { useId, useState } from 'react';
import type { Bibs, ContributionsVisibility } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { RsvpToggle } from '@/components/rsvp-toggle';
import { ContributionsVisibilityPicker } from '@/components/contributions-visibility';
import { prettyTime } from '@/components/player-ui';
import { frequencyOptions } from '@/lib/billing';
import { MatchDayFields } from '@/components/group/match-day-fields';
import { SECTION_ICONS, SEEN, SettingsSection, SettingsSections } from '@/components/group/settings-sections';

export interface GroupEditData {
  name: string;
  description: string;
  location: string;
  schedule: string;
  kickoffTime: string;
  targetPlayers: number;
  feePerPlayer: number;
  paymentType: string;
  requireRsvp: boolean;
  contributionsVisibility: ContributionsVisibility;
  /** How long each game lasts on match day, in minutes; the timer starts from this. */
  gameMinutes: number;
  /** Whether match day shows the game timer. */
  timerOn: boolean;

  /** What each side wears and is called; null for the default colours. */
  bibs: Bibs | null;

  /** 'local' or 'international'; read-only after creation. */
  scope?: string;
  /** 'NGN' or 'USD'. */
  currency?: string;
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Kick-off times on the half hour, early morning to late evening.
export const TIMES = Array.from({ length: 37 }, (_, i) => {
  const mins = 5 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});

export const label = 'block text-xs font-bold text-gray-700 mb-1.5';
export const field =
  'w-full min-h-12 px-3.5 bg-white border border-gray-200 rounded-xl text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';
export const chip = (on: boolean) =>
  `h-10 px-3 rounded-full border text-[13px] font-bold whitespace-nowrap transition-colors ${
    on ? 'bg-ink border-ink text-volt-300' : 'bg-white border-gray-200 text-gray-700 hover:border-ink'
  }`;

/** A native select with the field's padding and a chevron set in from the edge like the app's other icons. */
export function Select({ id, value, onChange, children }: { id: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} appearance-none pr-11 cursor-pointer`}>
        {children}
      </select>
      <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    </div>
  );
}

/**
 * A number you nudge or type: − and + sit inside the one field, so it reads as a single control.
 * `prefix` shows a unit (₦) before the number; `format` shows it grouped while not being edited.
 */
export function Stepper({
  id,
  value,
  onChange,
  step,
  min,
  prefix,
  labelledBy,
  less,
  more,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  prefix?: string;
  labelledBy: string;
  less: string;
  more: string;
}) {
  const btn =
    'w-12 shrink-0 flex items-center justify-center text-ink hover:bg-chalk disabled:text-gray-300 disabled:hover:bg-transparent transition-colors';
  return (
    <div className="flex h-12 rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:ring-4 focus-within:ring-volt-300/70 focus-within:border-pitch-600">
      <button type="button" aria-label={less} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))} className={`${btn} border-r border-gray-200`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-center gap-0.5">
        {prefix && (
          <span className="font-display text-lg font-extrabold text-gray-400" aria-hidden>
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          step={step}
          aria-labelledby={labelledBy}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value))))}
          style={{ width: `${Math.max(2, String(Number.isFinite(value) ? value : '').length) + 1}ch` }}
          className="min-w-0 bg-transparent text-center font-display text-lg font-extrabold text-ink tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <button type="button" aria-label={more} onClick={() => onChange(value + step)} className={`${btn} border-l border-gray-200`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
        </svg>
      </button>
    </div>
  );
}

/** "Every Saturday" → "Saturday"; anything else is a custom schedule. */
export function dayOf(schedule: string) {
  const m = /^every\s+(\w+)$/i.exec(schedule.trim());
  const d = m && DAYS.find((x) => x.toLowerCase() === m[1].toLowerCase());
  return d ?? (schedule.trim() ? 'other' : '');
}

/**
 * Changing a group's details, as a sheet like the rest of the app: tap to pick wherever there's a
 * short list (game day, kick-off, how players pay, common fees), steppers for numbers, and an
 * example in every empty field. Saves with the same update call as before.
 */
export function GroupEditSheet({
  initial,
  saving,
  onSave,
  onClose,
  onDelete,
}: {
  initial: GroupEditData;
  saving: boolean;
  onSave: (data: GroupEditData) => void;
  onClose: () => void;
  /** Delete the group (the caller asks first). Left out, there's no delete. */
  onDelete?: () => void;
}) {
  const titleId = useId();
  const [d, setD] = useState<GroupEditData>({ ...initial, feePerPlayer: Math.round(Number(initial.feePerPlayer)) });
  const [day, setDay] = useState(() => dayOf(initial.schedule));
  const set = (patch: Partial<GroupEditData>) => setD((x) => ({ ...x, ...patch }));
  const times = d.kickoffTime && !TIMES.includes(d.kickoffTime.slice(0, 5)) ? [d.kickoffTime.slice(0, 5), ...TIMES] : TIMES;
  const valid = d.name.trim().length > 0 && d.targetPlayers >= 2 && d.feePerPlayer >= 0 && d.gameMinutes >= 1 && d.gameMinutes <= 60;
  const freq = frequencyOptions.find((o) => o.value === d.paymentType);
  // Which settings section is open: one at a time, all closed to start
  const [open, setOpen] = useState<'money' | 'when' | 'day' | null>(null);
  const toggle = (k: 'money' | 'when' | 'day') => setOpen((o) => (o === k ? null : k));

  function pickDay(v: string) {
    setDay(v);
    if (v === 'other') set({ schedule: dayOf(initial.schedule) === 'other' ? initial.schedule : '' });
    else set({ schedule: v ? `Every ${v}` : '' });
  }

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <button onClick={() => onSave(d)} disabled={!valid || saving} className={`${btnPrimary} w-full disabled:opacity-40`}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      }
    >
      <SheetTitle id={titleId} title="Edit group" sub="Players see the name, pitch, day and fee." onClose={onClose} />

      <div className="mt-5 space-y-5">
        {/* What players see first: the name and the fee, always in view */}
        <div>
          <label htmlFor="g-name" className={label}>
            Group name
          </label>
          <input id="g-name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Saturday Ballers" className={field} />
        </div>
        <div>
          <span id="g-fee-label" className={label}>
            Fee per player
          </span>
          {d.scope === 'international' ? (
            <>
              <Stepper
                id="g-fee"
                labelledBy="g-fee-label"
                value={d.feePerPlayer}
                onChange={(v) => set({ feePerPlayer: v })}
                step={5}
                min={0}
                prefix="$"
                less="$5 less"
                more="$5 more"
              />
              <p className="mt-1.5 text-xs text-gray-500">Steps of $5, or type any amount.</p>
            </>
          ) : (
            <>
              <Stepper
                id="g-fee"
                labelledBy="g-fee-label"
                value={d.feePerPlayer}
                onChange={(v) => set({ feePerPlayer: v })}
                step={500}
                min={0}
                prefix="₦"
                less="₦500 less"
                more="₦500 more"
              />
              <p className="mt-1.5 text-xs text-gray-500">Steps of ₦500, or type any amount.</p>
            </>
          )}
        </div>

        {/* The rest in the same three sections as making a group, money first */}
        <SettingsSections inset="sheet">
          <SettingsSection
            id="g-money"
            icon={SECTION_ICONS.money}
            title="Money"
            summary={[d.scope === 'international' ? '$' : '₦', (freq?.label ?? 'Per game').toLowerCase(), SEEN[d.contributionsVisibility] ?? SEEN.private].join(' · ')}
            open={open === 'money'}
            onToggle={() => toggle('money')}
          >
            {d.scope && (
              <p className="text-xs text-gray-500">
                <b className="font-bold text-ink">{d.scope === 'international' ? 'International' : 'Nigeria'}</b> ·{' '}
                {d.scope === 'international' ? 'USDT or USDC in $' : 'bank transfer in ₦'} · set when made
              </p>
            )}
            <fieldset>
              <legend className={label}>How often do players pay?</legend>
              <div className="flex flex-wrap gap-2">
                {frequencyOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={d.paymentType === o.value}
                    onClick={() => set({ paymentType: o.value })}
                    className={chip(d.paymentType === o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {freq && <p className="mt-1.5 text-xs text-gray-500">{freq.hint}</p>}
            </fieldset>
            <ContributionsVisibilityPicker value={d.contributionsVisibility} onChange={(v) => set({ contributionsVisibility: v })} />
          </SettingsSection>

          <SettingsSection
            id="g-when"
            icon={SECTION_ICONS.when}
            title="When and where"
            summary={[`${d.targetPlayers} a game`, day && day !== 'other' ? `${day}s` : d.schedule.trim(), prettyTime(d.kickoffTime.slice(0, 5))].filter(Boolean).join(' · ')}
            open={open === 'when'}
            onToggle={() => toggle('when')}
          >
            <div>
              <span className={label} id="g-players-label">
                Players per game
              </span>
              <Stepper
                id="g-players"
                labelledBy="g-players-label"
                value={d.targetPlayers}
                onChange={(v) => set({ targetPlayers: v })}
                step={1}
                min={2}
                less="One fewer player"
                more="One more player"
              />
              <p className="mt-1.5 text-xs text-gray-500">How many play each game; the squad can be bigger.</p>
            </div>
            <fieldset>
              <legend className={label}>Game day</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((x) => (
                  <button key={x} type="button" aria-pressed={day === x} onClick={() => pickDay(x)} className={chip(day === x)}>
                    {x.slice(0, 3)}
                  </button>
                ))}
                <button type="button" aria-pressed={day === 'other'} onClick={() => pickDay('other')} className={chip(day === 'other')}>
                  Other
                </button>
              </div>
              {day === 'other' && (
                <input
                  aria-label="Schedule"
                  value={d.schedule}
                  onChange={(e) => set({ schedule: e.target.value })}
                  placeholder="e.g. Every other Sunday"
                  className={`${field} mt-2`}
                />
              )}
            </fieldset>
            <div>
              <label htmlFor="g-time" className={label}>
                Kick-off
              </label>
              <Select id="g-time" value={d.kickoffTime.slice(0, 5)} onChange={(v) => set({ kickoffTime: v })}>
                <option value="">Not set</option>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {prettyTime(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="g-pitch" className={label}>
                Pitch
              </label>
              <input
                id="g-pitch"
                value={d.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="e.g. Teslim Balogun, Surulere"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="g-desc" className={label}>
                Description <span className="font-semibold text-gray-500">(optional)</span>
              </label>
              <textarea
                id="g-desc"
                rows={2}
                value={d.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="e.g. Friendly 5-a-side, all levels welcome"
                className={`${field} py-3 leading-snug resize-none`}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="g-day"
            icon={SECTION_ICONS.day}
            title="Match day"
            summary={[d.timerOn ? `${d.gameMinutes}-min games` : 'No timer', d.requireRsvp ? 'players confirm' : 'no confirming'].join(' · ')}
            open={open === 'day'}
            onToggle={() => toggle('day')}
          >
            <RsvpToggle checked={d.requireRsvp} onChange={(v) => set({ requireRsvp: v })} />
            <MatchDayFields value={d} onChange={set} />
          </SettingsSection>
        </SettingsSections>

        {onDelete && (
          <div className="pt-1">
            <button onClick={onDelete} className="press -mx-2 w-[calc(100%+1rem)] flex items-center min-h-12 px-2 rounded-xl text-[15px] font-semibold text-kit-600 hover:bg-kit-500/10">
              Delete group
            </button>
            <p className="text-xs leading-snug text-gray-500">Removes the group, its games and their payment records. Its players stay in All players.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

