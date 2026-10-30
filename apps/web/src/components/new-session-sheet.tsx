'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary } from '@/components/buttons';
import { useToast } from '@/components/toast';
import { prettyTime } from '@/components/player-ui';
import { DAYS, Select, Stepper, TIMES, chip, field, label } from '@/components/group/group-edit-sheet';
import { createSession, type IGroupWithMembers } from '@/lib/api';

const REPEATS = [
  { value: 'none', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const short = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
const long = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
/** How far ahead the day strip goes. */
const DAYS_AHEAD = 56;

/** The group's usual game day (Monday = 0), from "Every Saturday", "Saturdays" and the like; -1 if none. */
function usualDay(group?: IGroupWithMembers) {
  const said = (group?.schedule ?? '').toLowerCase();
  return DAYS.findIndex((d) => said.includes(d.toLowerCase()));
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks". */
function fromNow(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 14) return `in ${n} days`;
  return `in ${Math.round(n / 7)} weeks`;
}

/** The last date of a run, worked out the way the server makes the run (same date next month for monthly). */
function lastOfRun(start: string, repeat: string, count: number) {
  const d = new Date(`${start}T00:00:00Z`);
  if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + (count - 1) * 7);
  else if (repeat === 'biweekly') d.setUTCDate(d.getUTCDate() + (count - 1) * 14);
  else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + (count - 1));
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
}

/**
 * The days ahead as one row of tiles to swipe through, the group's usual day marked with a dot.
 * No "another day" box: every date for the next 8 weeks is right there.
 */
function DayStrip({ value, onChange, usual, labelledBy, centreKey }: { value: string; onChange: (v: string) => void; usual: number; labelledBy: string; centreKey: string }) {
  const days = useMemo(
    () =>
      Array.from({ length: DAYS_AHEAD }, (_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );
  const ref = useRef<HTMLDivElement>(null);
  // Bring the picked day into view when the sheet opens or the group changes (not on every tap)
  useEffect(() => {
    const row = ref.current;
    const on = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && on) row.scrollLeft = on.offsetLeft - row.clientWidth / 2 + on.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey]);

  return (
    <div ref={ref} role="group" aria-labelledby={labelledBy} className="-mx-6 px-6 flex gap-2 overflow-x-auto snap-x scroll-px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d, i) => {
        const on = iso(d) === value;
        const usualOne = usual >= 0 && (d.getDay() + 6) % 7 === usual;
        return (
          <button
            key={iso(d)}
            type="button"
            aria-pressed={on}
            aria-label={`${long(d)}${i === 0 ? ', today' : ''}${usualOne ? ', usual game day' : ''}`}
            onClick={() => onChange(iso(d))}
            className={`press snap-start shrink-0 w-14 h-[84px] rounded-2xl border flex flex-col items-center justify-center transition-colors ${
              on ? 'bg-ink border-ink text-white' : 'bg-white border-gray-200 text-ink hover:border-ink'
            }`}
          >
            <span className={`text-[11px] font-bold uppercase tracking-wide ${on ? 'text-volt-300' : 'text-gray-500'}`}>{i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className="font-display text-[22px] font-extrabold leading-none mt-1 tabular-nums">{d.getDate()}</span>
            <span className={`text-[11px] mt-0.5 ${on ? 'text-white/70' : 'text-gray-500'}`}>{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
            <span className={`mt-1 w-1.5 h-1.5 rounded-full ${usualOne ? (on ? 'bg-volt-300' : 'bg-pitch-600') : 'bg-transparent'}`} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** The next three dates on the group's game day (from today), or the next three days if it has none. */
function nextGameDays(group?: IGroupWithMembers) {
  const want = usualDay(group); // Monday = 0
  const out: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; out.length < 3 && i < 21; i++) {
    const c = new Date(d);
    c.setDate(d.getDate() + i);
    if (want < 0 ? i > 0 : (c.getDay() + 6) % 7 === want) out.push(c);
  }
  return out;
}

/**
 * Schedule a game (or a run of them) without opening the group first: tap the group, tap the next
 * game day, kick-off is the group's usual time. Another date or a repeat is one more tap.
 */
export function NewSessionSheet({ groups, onClose }: { groups: IGroupWithMembers[]; onClose: () => void }) {
  const titleId = useId();
  const router = useRouter();
  const toast = useToast();
  const [groupId, setGroupId] = useState(groups.length === 1 ? groups[0].id : '');
  const group = groups.find((g) => g.id === groupId);
  const usual = usualDay(group);
  const [date, setDate] = useState(() => (groups.length === 1 ? iso(nextGameDays(groups[0])[0]) : ''));
  // Starts at the group's usual kick-off; players are told it and reminded 2 hours before.
  const [time, setTime] = useState(groups.length === 1 ? (groups[0].kickoffTime ?? '').slice(0, 5) : '');
  const [repeat, setRepeat] = useState('none');
  const [count, setCount] = useState(4);
  const [creating, setCreating] = useState(false);
  const repeating = repeat !== 'none';
  const times = time && !TIMES.includes(time) ? [time, ...TIMES] : TIMES;

  function pickGroup(id: string) {
    const g = groups.find((x) => x.id === id);
    setGroupId(id);
    setTime((g?.kickoffTime ?? '').slice(0, 5));
    setDate(iso(nextGameDays(g)[0]));
  }

  async function create() {
    if (!groupId || !date) return;
    setCreating(true);
    try {
      const session = await createSession({
        groupId,
        date,
        kickoffTime: time || undefined,
        recurrenceType: repeating ? repeat : undefined,
        recurrenceCount: repeating ? count : undefined,
      });
      toast.success(repeating ? `${count} games scheduled` : 'Game scheduled');
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The game wasn’t scheduled. Try again.');
      setCreating(false);
    }
  }

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <button onClick={create} disabled={!groupId || !date || creating} className={`${btnPrimary} w-full disabled:opacity-40`}>
          {creating ? 'Scheduling…' : repeating ? `Schedule ${count} games` : 'Schedule game'}
        </button>
      }
    >
      <SheetTitle
        id={titleId}
        title="New game"
        sub={
          !group
            ? 'Pick the group, then the day.'
            : group.requireRsvp
              ? 'Players say they’re in from the game link, and pay once they’ve played.'
              : 'Everyone in the group is on it and pays once they’ve played.'
        }
        onClose={onClose}
      />

      <div className="mt-5 space-y-5">
        {groups.length > 1 && (
          <fieldset>
            <legend className={label}>Group</legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button key={g.id} type="button" aria-pressed={groupId === g.id} onClick={() => pickGroup(g.id)} className={chip(groupId === g.id)}>
                  {g.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {group && (
          <>
            <div>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span id={`${titleId}-day`} className="text-xs font-bold text-gray-700">
                  Day
                </span>
                {usual >= 0 && (
                  <span className="flex items-center gap-1.5 text-[12px] text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-pitch-600" aria-hidden />
                    Usual: {DAYS[usual]}s
                  </span>
                )}
              </div>
              <DayStrip value={date} onChange={setDate} usual={usual} labelledBy={`${titleId}-day`} centreKey={groupId} />
              {date && (
                <p className="mt-2 text-[13px] font-semibold text-ink" aria-live="polite">
                  {long(new Date(`${date}T00:00:00`))} <span className="font-medium text-gray-500">· {fromNow(new Date(`${date}T00:00:00`))}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${titleId}-time`} className={label}>
                Kick-off
              </label>
              <Select id={`${titleId}-time`} value={time} onChange={setTime}>
                <option value="">Not set</option>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {prettyTime(t)}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-gray-500">Players are told now and reminded 2 hours before.</p>
            </div>

            <fieldset>
              <legend className={label}>Repeat</legend>
              {/* One bar split four ways: always one row, and plainly one choice */}
              <div className="grid grid-cols-4 gap-1 p-1 rounded-full border border-gray-200 bg-white">
                {REPEATS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={repeat === r.value}
                    onClick={() => setRepeat(r.value)}
                    className={`press min-h-11 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors ${
                      repeat === r.value ? 'bg-ink text-volt-300' : 'text-gray-700 hover:bg-chalk'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {repeating && (
                <div className="mt-3">
                  <span id={`${titleId}-count`} className={label}>
                    How many games
                  </span>
                  <Stepper id={`${titleId}-count-input`} labelledBy={`${titleId}-count`} value={count} onChange={(v) => setCount(Math.min(52, v))} step={1} min={2} less="One fewer game" more="One more game" />
                  {date && (
                    <p className="mt-1.5 text-xs text-gray-500" aria-live="polite">
                      {short(new Date(`${date}T00:00:00`))} to {lastOfRun(date, repeat, count)}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          </>
        )}
      </div>
    </Sheet>
  );
}
