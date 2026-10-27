'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GameTimer } from '@pitchaside/shared';
import { savePlan, setPlanAway, setTimer, type Lineup } from '@/lib/api';
import type { MatchPlan } from '@pitchaside/shared';
import { buildDay, clockAt, liveDay, newDraw, type Day, type Side } from '@/lib/match-plan';
import { buildWsDay, wsLive, type WsDay } from '@/lib/winner-stays';
import { PlanSetupSheet } from './plan-setup-sheet';
import { DayPlanLive, WholePlanSheet, usePeople, type PlanLook } from './plan-view';
import { useToast } from '@/components/toast';
import { Swatch } from '@/components/game/teams-step';
import { teamName } from '@/lib/teams';

/**
 * How a plan's day starts, to tell a shuffle that changed nothing: with 3 or more sides, the
 * first game (a new pair should start); with 2 it's always the same game, so who sits out first.
 */
function startOf(day: Day & { ws?: WsDay['ws'] }) {
  const first = day.ws ? day.ws.on : day.fixtures[0] ? [day.fixtures[0].teamA, day.fixtures[0].teamB] : null;
  if (day.sides.length >= 3) return first ? [...first].sort().join('v') : '';
  return Object.entries(day.rotas)
    .map(([side, r]) => `${side}:${r?.games[0]?.spells[0]?.off.join(',') ?? ''}`)
    .sort()
    .join('|');
}

/** The clock as the plan follows it: the timer, and the server's time minus this phone's. */
export interface PlanClock {
  timer: GameTimer;
  offset: number;
}

/**
 * The day plan on match day's Teams and Scores steps. Before the day (and on Teams) it's a
 * summary with the whole plan a tap away; on Scores, while the day is on, it follows the games:
 * what's on, what's next, running late, and each side's swaps.
 *
 * The organiser sets it up and can mark anyone as gone early; a captain sees it and can mark
 * their own players. Without a plan, the organiser gets a card to make one; captains see nothing.
 */
export function DayPlan({
  sessionId,
  lineup,
  onLineup,
  role = 'organiser',
  live = false,
  clock = null,
  onClockChanged,
  onAway,
  myTeam,
}: {
  sessionId: string;
  lineup: Lineup;
  onLineup: (l: Lineup) => void;
  role?: 'organiser' | 'captain';
  /** On the Scores step while the day is on: follow the games. */
  live?: boolean;
  clock?: PlanClock | null;
  /** The organiser set the timer from the plan: the clock should load again. */
  onClockChanged?: () => void;
  /** A captain's own route for "left early"; the organiser's is used otherwise. */
  onAway?: (playerId: string, at: number | null) => Promise<Lineup>;
  myTeam?: Side | null;
}) {
  const toast = useToast();
  const [setting, setSetting] = useState(false);
  const [open, setOpen] = useState(false);
  const people = usePeople(lineup.squad);
  const plan = lineup.plan ?? null;
  const isWs = plan?.format === 'winner_stays';
  const day = useMemo(() => {
    if (!plan) return null;
    const input = { plan, teamCount: lineup.teamCount, date: lineup.date, squad: lineup.squad };
    return plan.format === 'winner_stays' ? buildWsDay(input, lineup.games) : buildDay(input);
  }, [plan, lineup.teamCount, lineup.date, lineup.squad, lineup.games]);
  const ws = day && 'ws' in day ? (day as WsDay).ws : undefined;
  const look: PlanLook = { captains: lineup.captains, bibs: lineup.bibs, kickoff: lineup.kickoff };

  // The clock ticks the plan on: every second while a game runs (for the swaps), else now and then.
  const [now, setNow] = useState(() => Date.now());
  const started = clock?.timer.startedAt ? Date.parse(clock.timer.startedAt) : NaN;
  // Paused counts as on: the game isn't over, it's just stood still.
  const running = Number.isFinite(started) && (!!clock?.timer.pausedAt || Date.now() + (clock?.offset ?? 0) < started + (clock?.timer.minutes ?? 0) * 60_000);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), running ? 1000 : 20_000);
    return () => window.clearInterval(id);
  }, [running]);

  const state =
    day && plan
      ? ws
        ? wsLive(day as WsDay, clock?.timer ?? null, now + (clock?.offset ?? 0))
        : liveDay(day, plan, lineup.games.length, clock?.timer ?? null, now + (clock?.offset ?? 0), lineup.date, lineup.kickoff)
      : null;

  const build = (p: MatchPlan) => {
    const input = { plan: p, teamCount: lineup.teamCount, date: lineup.date, squad: lineup.squad };
    return p.format === 'winner_stays' ? buildWsDay(input, lineup.games) : buildDay(input);
  };
  // Shuffle: only before the first game starts, and only when there's something to mix (with 2
  // sides the game is always the same: only who sits out first can change).
  const [shuffling, setShuffling] = useState(false);
  const [undo, setUndo] = useState<{ draw: number | undefined } | null>(null);
  const underway = lineup.games.length > 0 || running;
  const canShuffle =
    role === 'organiser' && !!plan && !!day && !underway && (day.sides.length >= 3 || Object.values(day.rotas).some((r) => r?.games.some((g) => g.spells.some((sp) => sp.off.length))));

  /** A new draw; or back to `to` (Undo), where null is the plain order. */
  async function shuffle(to?: number | null) {
    if (!plan || !day || shuffling) return;
    const was = plan.draw;
    const draw = to !== undefined ? to : newDraw(was, (_, b) => startOf(build({ ...plan, draw: b }) as Day) === startOf(day as Day));
    setShuffling(true);
    try {
      const { away: _away, keepers: _keepers, ...rest } = plan;
      // null clears the draw (sent as is: left out, the server keeps the one it has).
      const next = await savePlan(sessionId, { ...rest, draw: draw as number });
      onLineup(next);
      setUndo(to === undefined ? { draw: was } : null);
      if (to === undefined) {
        const d = next.plan ? build(next.plan) : null;
        const first = d && ('ws' in d && (d as WsDay).ws ? (d as WsDay).ws.on : d.fixtures[0] ? [d.fixtures[0].teamA, d.fixtures[0].teamB] : null);
        toast.success(first ? `Shuffled: ${teamName(first[0], lineup.captains, lineup.bibs)} v ${teamName(first[1], lineup.captains, lineup.bibs)} start` : 'Shuffled');
      } else toast.success('Back to the order before');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The shuffle didn’t save. Try again.');
    } finally {
      setShuffling(false);
    }
  }

  async function away(playerId: string, at: number | null) {
    try {
      onLineup(await (onAway ? onAway(playerId, at) : setPlanAway(sessionId, playerId, at)));
      const who = people.get(playerId)?.name ?? 'They';
      toast.success(at === null ? `${who} is back in the swaps` : `${who} is out of the swaps from the next game`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    }
  }

  if (!plan || !day) {
    // A server from before day plans sends no `plan` at all (not even null): nothing to offer yet.
    if (role !== 'organiser' || lineup.plan === undefined) return null;
    return (
      <>
        <section aria-label="Day plan" className="rounded-3xl bg-white border border-dashed border-gray-300 p-4">
          <p className="text-[15px] font-bold text-ink">Plan the day</p>
          <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
            Games back to back until the booking ends, and swaps every few minutes so everyone gets the same time and a turn in goal.
          </p>
          <button onClick={() => setSetting(true)} className="press mt-3 w-full min-h-12 rounded-2xl bg-white border border-gray-300 text-[15px] font-bold text-ink hover:border-ink">
            Plan the day
          </button>
        </section>
        {setting && <PlanSetupSheet sessionId={sessionId} lineup={lineup} gameMinutes={clock?.timer.minutes ?? 7} onSaved={onLineup} onClose={() => setSetting(false)} />}
      </>
    );
  }

  const per = day.sides.map((t) => day.fixtures.filter((f) => f.teamA === t || f.teamB === t).length);
  const from = clockAt(lineup.kickoff, 0);
  const to = clockAt(lineup.kickoff, plan.pitchMinutes);
  const canAway = (side: Side) => role === 'organiser' || side === myTeam;
  const first = ws ? ws.on : day.fixtures[0] ? ([day.fixtures[0].teamA, day.fixtures[0].teamB] as [Side, Side]) : null;

  // Undo and Shuffle, on the dark summary card or the white match-day card.
  const shuffleButtons = (dark: boolean) => (
    <>
      {undo && !underway && !shuffling && (
        <button
          onClick={() => shuffle(undo.draw ?? null)}
          className={`press shrink-0 min-h-11 px-2.5 rounded-xl text-[13px] font-bold ${dark ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-ink'}`}
        >
          Undo
        </button>
      )}
      {canShuffle && (
        <button
          onClick={() => shuffle()}
          disabled={shuffling}
          aria-label="Shuffle: a different pair of teams starts, and different players sit out first"
          className={`press shrink-0 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-[13px] font-bold disabled:opacity-60 ${
            dark ? 'bg-white/10 text-volt-300 hover:bg-white/15' : 'bg-white border border-gray-300 text-ink hover:border-ink'
          }`}
        >
          <svg className={`w-4 h-4 ${shuffling ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          Shuffle
        </button>
      )}
    </>
  );

  return (
    <>
      {live && state ? (
        <DayPlanLive
          day={day}
          plan={plan}
          ws={ws}
          live={state}
          gamesDone={lineup.games.length}
          look={look}
          people={people}
          myTeam={myTeam}
          clockMinutes={clock?.timer.minutes ?? null}
          onSetClock={
            role === 'organiser'
              ? async (minutes) => {
                  try {
                    await setTimer(sessionId, { minutes });
                    onClockChanged?.();
                    toast.success(`Timer set to ${minutes} min`);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'The timer didn’t change. Try again.');
                  }
                }
              : undefined
          }
          onOpen={() => setOpen(true)}
          shuffle={
            canShuffle ? (
              <div className="mt-3 flex items-center gap-1 border-t border-gray-100 pt-2">
                <p className="flex-1 min-w-0 text-[13px] leading-snug text-gray-600">{undo ? 'Shuffled. Not this one?' : 'Want a different start?'}</p>
                {shuffleButtons(false)}
              </div>
            ) : undefined
          }
        />
      ) : (
        <section aria-label="Day plan" className="rounded-3xl bg-ink turf-stripes p-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-white/60">Day plan</p>
              <p className="mt-0.5 font-display text-[22px] leading-tight font-extrabold tabular-nums">
                {isWs ? 'Winner stays' : `${day.fixtures.length} games`}
                {from && to && <span className="block text-[15px] text-white/70">{from} to {to}</span>}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-white/75">
                {isWs
                  ? `First round ${plan.firstMinutes ?? 10}\u00a0min · then first to concede ${plan.firstTo ?? 2} or ${plan.gameMinutes}\u00a0min${plan.twoAndOff !== false ? ' · two wins and off' : ''} · `
                  : day.sides.length > 2 && `Each team plays ${Math.min(...per) === Math.max(...per) ? per[0] : `${Math.min(...per)}–${Math.max(...per)}`} · `}
                {isWs ? '' : `${plan.gameMinutes}\u00a0min games · `}
                {plan.onPitch} on the pitch
                {plan.swapMinutes ? ` · swaps every ${plan.swapMinutes}\u00a0min` : ''}
              </p>
            </div>
            {role === 'organiser' && (
              <button onClick={() => setSetting(true)} className="press shrink-0 -mr-1 min-h-11 px-3 rounded-xl text-[13px] font-bold text-volt-300 hover:bg-white/10">
                Change
              </button>
            )}
          </div>
          {first && !underway && (
            <div className="mt-3 rounded-2xl bg-white/10 px-3 py-2" aria-live="polite">
              <div className="flex items-center gap-1 min-h-11">
                <p className="flex-1 min-w-0 text-[12px] font-bold text-white/60">{isWs ? 'On first' : 'First up'}</p>
                {shuffleButtons(true)}
              </div>
              {/* Its own line, so long team names wrap rather than get cut off */}
              <p key={plan.draw ?? 0} className="pb-1 animate-pop-in text-[15px] leading-snug font-bold text-white">
                <Swatch team={first[0]} bibs={lineup.bibs} className="w-3 h-3 rounded-sm mr-1.5 align-[-1px]" />
                {teamName(first[0], lineup.captains, lineup.bibs)}
                <span className="font-semibold text-white/60"> v </span>
                <Swatch team={first[1]} bibs={lineup.bibs} className="w-3 h-3 rounded-sm mr-1.5 align-[-1px]" />
                {teamName(first[1], lineup.captains, lineup.bibs)}
              </p>
            </div>
          )}
          <button onClick={() => setOpen(true)} className="press mt-3 w-full min-h-12 rounded-2xl bg-white text-ink text-[15px] font-bold hover:bg-chalk">
            {isWs ? 'See the games so far and swaps' : 'See the games and swaps'}
          </button>
        </section>
      )}

      {open && (
        <WholePlanSheet
          day={day}
          plan={plan}
          ws={ws}
          live={live ? state : null}
          gamesDone={lineup.games.length}
          results={lineup.games}
          look={look}
          people={people}
          myTeam={myTeam}
          canAway={lineup.scoresOpen ? canAway : undefined}
          onAway={lineup.scoresOpen ? away : undefined}
          onEdit={
            role === 'organiser'
              ? () => {
                  setOpen(false);
                  setSetting(true);
                }
              : undefined
          }
          onClose={() => setOpen(false)}
        />
      )}
      {setting && <PlanSetupSheet sessionId={sessionId} lineup={lineup} gameMinutes={plan.gameMinutes} onSaved={onLineup} onClose={() => setSetting(false)} />}
    </>
  );
}
