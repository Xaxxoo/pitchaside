'use client';

import { useId, useMemo, useState } from 'react';
import type { MatchPlan } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { BallSpinner } from '@/components/skeleton';
import { btnPrimary } from '@/components/buttons';
import { savePlan, type Lineup, type TeamKey } from '@/lib/api';
import { teamName } from '@/lib/teams';
import { useToast } from '@/components/toast';
import { MAX_DRAW, buildDay, clockAt } from '@/lib/match-plan';
import { WS_DEFAULTS } from '@/lib/winner-stays';
import { SwitchRow } from '@/components/rsvp-toggle';

type Settings = Omit<MatchPlan, 'away'>;

/**
 * One setting on one row: what it is (and a short line on it) on the left, − value + on the right.
 * The same control for every number on the sheet, so nothing has to be learned twice.
 */
function Setting({
  id,
  label,
  hint,
  value,
  step = 1,
  min,
  max,
  unit,
  format = (v) => String(v),
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  step?: number;
  min: number;
  max: number;
  unit: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  // "Each game lasts: one minute less", so every button says which setting it changes
  const amount = step === 1 ? `one ${unit.replace(/s$/, '')}` : `${step} ${unit}`;
  const btn = 'press w-11 h-11 shrink-0 flex items-center justify-center text-ink disabled:opacity-30 hover:bg-chalk';
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p id={id} className="text-[14px] font-bold text-ink leading-tight">
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[12px] text-gray-500 truncate">{hint}</p>}
      </div>
      <div role="group" aria-labelledby={id} className="shrink-0 flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button type="button" aria-label={`${label}: ${amount} less`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} className={`${btn} border-r border-gray-200`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" d="M5 12h14" /></svg>
        </button>
        <span className="w-[76px] text-center font-display text-[16px] font-extrabold text-ink tabular-nums whitespace-nowrap" aria-live="polite">
          {format(value)}
        </span>
        <button type="button" aria-label={`${label}: ${amount} more`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} className={`${btn} border-l border-gray-200`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  );
}

/** A labelled group of settings, lines between the rows. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">{title}</h3>
      <div className="mt-1 divide-y divide-gray-100 border-b border-gray-100">{children}</div>
    </section>
  );
}

const hours = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}` : `${m} min`);
const mins = (m: number) => `${m} min`;

/**
 * Setting up the day: how long the pitch is booked, how long each game is, how many are on the
 * pitch, and how often to swap. A preview says what that makes before it's saved.
 */
export function PlanSetupSheet({
  sessionId,
  lineup,
  gameMinutes,
  onSaved,
  onClose,
}: {
  sessionId: string;
  lineup: Lineup;
  /** Today's timer length: the game length to start from with no plan yet. */
  gameMinutes: number;
  onSaved: (l: Lineup) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const toast = useToast();
  const start: Settings = lineup.plan ?? lineup.lastPlan ?? { pitchMinutes: 60, gameMinutes, onPitch: 5, swapMinutes: 0 };
  const [s, setS] = useState<Settings>(() => ({
    // A new plan gets its own draw, so the day doesn't start with the same sides every week
    // (last week's plan is only a starting point for the numbers). Changing a plan keeps its draw.
    draw: lineup.plan ? lineup.plan.draw : 1 + Math.floor(Math.random() * MAX_DRAW),
    format: start.format ?? 'schedule',
    pitchMinutes: start.pitchMinutes,
    gameMinutes: start.gameMinutes,
    onPitch: start.onPitch,
    swapMinutes: start.swapMinutes,
    firstMinutes: start.firstMinutes ?? WS_DEFAULTS.firstMinutes,
    firstTo: start.firstTo ?? WS_DEFAULTS.firstTo,
    twoAndOff: start.twoAndOff ?? WS_DEFAULTS.twoAndOff,
  }));
  const ws = s.format === 'winner_stays';
  // Winner stays needs someone waiting: not with 2 teams.
  const wsPossible = lineup.teamCount >= 3;
  // Once a score is in, the day's format is set.
  const formatLocked = !!lineup.plan && lineup.locked;
  const [saving, setSaving] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }));

  const day = useMemo(() => buildDay({ plan: s, teamCount: lineup.teamCount, date: lineup.date, squad: lineup.squad }), [s, lineup]);
  const sides = day.sides;
  const per = sides.map((t) => day.fixtures.filter((f) => f.teamA === t || f.teamB === t).length);
  const fewest = Math.min(...per);
  const most = Math.max(...per);
  const last = day.fixtures[day.fixtures.length - 1];
  const sizes = sides.map((t) => ({ t, n: lineup.squad.filter((m) => m.team === t).length }));
  const ends = clockAt(lineup.kickoff, s.pitchMinutes);
  const from = clockAt(lineup.kickoff, 0);

  // Things worth knowing before saving, said plainly.
  const notes: string[] = [];
  if (ws) {
    if (sides.length === 3) notes.push('With 3 teams, after a draw one of the two going off comes straight back on: only one team is waiting.');
    if (sides.length >= 5) notes.push(`With ${sides.length} teams there may not be time for every team to play every other.`);
  }
  if (!ws && sides.length > 2 && fewest !== most) notes.push(`Some teams play ${most} games and some ${fewest}: there isn’t time for everyone to play the same number.`);
  if (!ws && sides.length > 2 && day.fixtures.length < (sides.length * (sides.length - 1)) / 2) notes.push('Not every team plays every other team: the booking is too short.');
  if (!ws && last && last.minutes !== s.gameMinutes) notes.push(`The last game is ${last.minutes} min, to use the whole booking.`);
  const picked = sizes.filter((x) => x.n > 0);
  if (!picked.length) notes.push('Pick the teams to see each player’s swaps.');
  for (const { t, n } of picked) if (n < s.onPitch) notes.push(`${teamName(t as TeamKey, lineup.captains, lineup.bibs)} has ${n}, fewer than ${s.onPitch}: nobody sits out.`);
  if (picked.length > 1 && new Set(picked.map((x) => x.n)).size > 1) notes.push('The teams aren’t the same size, so players on bigger teams sit out more.');

  async function save(plan: Settings | null) {
    setSaving(plan ? 'save' : 'remove');
    setError(null);
    try {
      onSaved(await savePlan(sessionId, plan));
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The plan didn’t save. Try again.';
      setError(message);
      toast.error(message);
      setSaving(null);
    }
  }

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <div className="space-y-2">
          {/* Next to the button, so a failed save is never off-screen */}
          {error && (
            <p role="alert" className="flex items-start gap-1.5 px-1 text-[13px] leading-snug font-semibold text-kit-600">
              <svg className="w-4 h-4 mt-px shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3.5h.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
              {error}
            </p>
          )}
          <button
            onClick={() => save(ws ? s : { format: 'schedule', pitchMinutes: s.pitchMinutes, gameMinutes: s.gameMinutes, onPitch: s.onPitch, swapMinutes: s.swapMinutes, draw: s.draw })}
            disabled={!!saving || s.gameMinutes > s.pitchMinutes || (ws && !wsPossible)} className={`${btnPrimary} w-full`}>
            {saving === 'save' && <BallSpinner />}
            {lineup.plan ? 'Save the changes' : 'Save the plan'}
          </button>
          {lineup.plan && (
            <button onClick={() => save(null)} disabled={!!saving} className="press w-full min-h-11 rounded-2xl text-[14px] font-bold text-kit-600 hover:bg-kit-500/10 inline-flex items-center justify-center gap-2">
              {saving === 'remove' && <BallSpinner className="w-4 h-4" />}
              Remove the plan
            </button>
          )}
        </div>
      }
    >
      <SheetTitle
        id={titleId}
        title={lineup.plan ? 'Change the plan' : 'Plan the day'}
        sub="Games back to back till the booking ends, with fair swaps."
        onClose={onClose}
      />
      <div className="mt-5 space-y-5">
        {/* How the day is played: the rest of the sheet follows it */}
        <div>
          <h3 id={`${titleId}-format`} className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">
            How you play today
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={`${titleId}-format`}>
            {(
              [
                ['schedule', 'Everyone plays everyone', 'Games and times set now'],
                ['winner_stays', 'Winner stays', 'Each result picks who’s on'],
              ] as const
            ).map(([value, label, sub]) => {
              const on = s.format === value;
              const off = (value === 'winner_stays' && !wsPossible) || (formatLocked && !on);
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={off}
                  onClick={() => set({ format: value })}
                  className={`press h-full p-3 rounded-2xl border-2 text-left transition-colors disabled:opacity-45 ${
                    on ? 'bg-ink border-ink text-white' : 'bg-white border-gray-200 text-ink hover:border-ink'
                  }`}
                >
                  <span className={`flex w-5 h-5 rounded-full border-2 items-center justify-center ${on ? 'border-volt-300' : 'border-gray-300'}`} aria-hidden>
                    {on && <span className="w-2.5 h-2.5 rounded-full bg-volt-300" />}
                  </span>
                  <span className="block mt-2 text-[14px] font-bold leading-tight">{label}</span>
                  <span className={`block mt-1 text-[12px] leading-snug ${on ? 'text-white/70' : 'text-gray-500'}`}>{sub}</span>
                </button>
              );
            })}
          </div>
          {!wsPossible && <p className="mt-1.5 text-[12px] text-gray-500">Winner stays needs 3 teams or more.</p>}
          {formatLocked && <p className="mt-1.5 text-[12px] text-gray-500">The day has started, so this stays.</p>}
        </div>

        <Group title="The booking">
          <Setting
            id={`${titleId}-pitch`}
            label="Pitch booked for"
            hint={from && ends ? `${from} to ${ends}` : 'From kick-off'}
            value={s.pitchMinutes}
            step={15}
            min={15}
            max={300}
            unit="minutes"
            format={hours}
            onChange={(v) => set({ pitchMinutes: v, gameMinutes: Math.min(s.gameMinutes, v) })}
          />
        </Group>

        <Group title="Each game">
          {ws ? (
            <>
              <Setting
                id={`${titleId}-first`}
                label="First round"
                hint="Till every team has played"
                value={s.firstMinutes ?? WS_DEFAULTS.firstMinutes}
                min={1}
                max={Math.min(60, s.pitchMinutes)}
                unit="minutes"
                format={mins}
                onChange={(v) => set({ firstMinutes: v })}
              />
              <Setting
                id={`${titleId}-to`}
                label="Then off after"
                hint="Goals conceded"
                value={s.firstTo ?? WS_DEFAULTS.firstTo}
                min={1}
                max={5}
                unit="goals"
                onChange={(v) => set({ firstTo: v })}
              />
              <Setting
                id={`${titleId}-limit`}
                label="Or when time’s up"
                hint="The team ahead stays"
                value={s.gameMinutes}
                min={1}
                max={Math.min(60, s.pitchMinutes)}
                unit="minutes"
                format={mins}
                onChange={(v) => set({ gameMinutes: v })}
              />
            </>
          ) : (
            <Setting
              id={`${titleId}-game`}
              label="Each game lasts"
              hint="The timer is set to this"
              value={s.gameMinutes}
              min={1}
              max={Math.min(60, s.pitchMinutes)}
              unit="minutes"
              format={mins}
              onChange={(v) => set({ gameMinutes: v })}
            />
          )}
        </Group>
        {ws && (
          <SwitchRow
            checked={s.twoAndOff !== false}
            onChange={(v) => set({ twoAndOff: v })}
            title="Two wins in a row and off"
            sub="So one strong team can’t stay on all day."
          />
        )}

        <Group title="Players">
          <Setting
            id={`${titleId}-on`}
            label="Players a side"
            hint="Keeper included"
            value={s.onPitch}
            min={2}
            max={11}
            unit="players"
            onChange={(v) => set({ onPitch: v })}
          />
          <Setting
            id={`${titleId}-swap`}
            label="Swap players every"
            hint="Rotates who sits out"
            value={s.swapMinutes}
            min={0}
            max={30}
            unit="minutes"
            format={(v) => (v ? `${v} min` : 'Never')}
            onChange={(v) => set({ swapMinutes: v })}
          />
        </Group>

        {/* What that makes: the answer to everything above, on the dark pitch card */}
        <div className="relative overflow-hidden rounded-3xl bg-ink text-white p-4 shadow-lift" aria-live="polite">
          <div className="absolute inset-0 turf-stripes" aria-hidden />
          <div className="relative">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-volt-300">What that makes</p>
            {ws ? (
              <>
                <p className="mt-1 font-display text-[24px] leading-tight font-extrabold tabular-nums">
                  At least {Math.max(1, Math.floor(s.pitchMinutes / Math.max(s.gameMinutes, s.firstMinutes ?? 10)))} games
                </p>
                <ul className="mt-2 space-y-1 text-[13px] leading-snug text-white/80">
                  <li>First round: winner stays, loser off, whatever the score.</li>
                  <li>
                    Then: off after conceding {s.firstTo ?? WS_DEFAULTS.firstTo}, or when time’s up. Level, both off.
                  </li>
                  <li>The app says who’s on next after each score.{ends ? ` Last whistle ${ends}.` : ''}</li>
                </ul>
              </>
            ) : (
              <>
                <p className="mt-1 font-display text-[24px] leading-tight font-extrabold tabular-nums">
                  {day.fixtures.length} game{day.fixtures.length === 1 ? '' : 's'}
                  {sides.length > 2 && <span className="text-volt-300"> · {fewest === most ? most : `${fewest}–${most}`} each</span>}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-white/80">
                  {sides.length > 2 && day.fixtures.length > (sides.length * (sides.length - 1)) / 2
                    ? 'Everyone plays everyone, then round again.'
                    : sides.length > 2
                      ? 'Each game is a different pair of teams.'
                      : 'The same two teams, game after game.'}
                  {ends ? ` Last whistle ${ends}.` : ''}
                </p>
              </>
            )}
            {notes.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                {notes.map((n) => (
                  <li key={n} className="flex gap-2 text-[13px] leading-snug text-white">
                    <svg className="w-4 h-4 mt-px shrink-0 text-kit-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3.5h.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                    </svg>
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="text-[12px] leading-snug text-gray-500">
          Players say in their app if they’re happy in goal.{' '}
          {ws ? 'The last game ends when the booking does, whatever the score.' : 'Running late? The last game gets shorter so you still finish on time.'}
        </p>
      </div>
    </Sheet>
  );
}
