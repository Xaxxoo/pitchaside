'use client';

import { retryKeys } from '@/lib/retry-keys';
import { useCallback, useEffect, useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { BallSpinner } from '@/components/skeleton';
import { buzz, stagger } from '@/components/motion';
import { addGoal, addMatchEvent, addMatchGame, deleteGoal, deleteMatchEvent, deleteMatchGame, updateMatchGame, type GoalInput, type Lineup, type MatchEventKind, type MatchGame, type TeamKey } from '@/lib/api';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';
import { Swatch, shortName } from './teams-step';
import { ScorerSheet } from './scorer-sheet';
import { EventsSection } from './events-section';
import { GameTimer, type TimerApi } from '@/components/game-timer';
import { Avatar } from '@/components/ratings';
import { btnPrimary } from '@/components/buttons';
import { useToast } from '@/components/toast';
import { getTimer, setTimer } from '@/lib/api';
import { DayPlan, type PlanClock } from '@/components/plan/day-plan';
import { fixtures } from '@/lib/match-plan';
import { decidedEarly, winnerStays } from '@/lib/winner-stays';

const KEYS = Object.keys(TEAMS) as TeamKey[];

export interface ScoresApi {
  addGame: (
    sessionId: string,
    game: { teamA: TeamKey; teamB: TeamKey; scoreA: number; scoreB: number; goals?: GoalInput[]; seconds?: number; keeperA?: string | null; keeperB?: string | null; satOut?: string[] },
  ) => Promise<Lineup>;
  deleteGame: (sessionId: string, gameId: string) => Promise<Lineup>;
  /** Correct a saved game's score: the organiser's only. */
  updateGame?: (sessionId: string, gameId: string, change: { scoreA?: number; scoreB?: number; keeperA?: string | null; keeperB?: string | null; satOut?: string[] }) => Promise<Lineup>;
  addGoal: (sessionId: string, gameId: string, goal: GoalInput) => Promise<Lineup>;
  deleteGoal: (sessionId: string, goalId: string) => Promise<Lineup>;
  addEvent: (sessionId: string, event: { playerId: string; kind: MatchEventKind }) => Promise<Lineup>;
  deleteEvent: (sessionId: string, eventId: string) => Promise<Lineup>;
}

const ORGANISER: ScoresApi = retryKeys(
  { addGame: addMatchGame, deleteGame: deleteMatchGame, updateGame: updateMatchGame, addGoal, deleteGoal, addEvent: addMatchEvent, deleteEvent: deleteMatchEvent },
  ['addGame', 'addGoal', 'addEvent'],
);

const ORGANISER_TIMER: TimerApi = { load: getTimer, save: setTimer };

/**
 * Step 3 of match day: each short game's score. A scoreboard with big − and + for each side
 * (two teams are fixed; with more, tap a side's name to pick who's playing), then the games so
 * far and today's table. The first score locks the teams, and the page says so before it's saved.
 * Tapping + asks who scored and who set it up (two taps, or "Not sure who"); a saved game's
 * scorers can be named or corrected afterwards by tapping it.
 */
export function ScoresStep({
  sessionId,
  lineup,
  dateLabel,
  onLineup,
  onError,
  onPickTeams,
  api = ORGANISER,
  timer = ORGANISER_TIMER,
  timerOn = true,
  timerWatch = false,
  canRemove = () => true,
  ended = false,
  planRole = 'organiser',
  planAway,
  myTeam,
}: {
  sessionId: string;
  lineup: Lineup;
  /** "Sat 24 Oct", for "Scores open on …". */
  dateLabel: string;
  onLineup: (l: Lineup) => void;
  onError: (message: string) => void;
  onPickTeams: () => void;
  /** Where scores are saved: the organiser's routes, or a captain's from the player app. */
  api?: ScoresApi;
  /** The match-day clock: the organiser's routes, or a captain's. */
  timer?: TimerApi;
  /** Show the clock: while the day is on, not after full time. */
  timerOn?: boolean;
  /** Only watch the clock (captains): it shows once the organiser starts it. */
  timerWatch?: boolean;
  /** Whether this person can delete a score or a scorer someone recorded ("Ada (captain)"). */
  canRemove?: (recordedBy: string | null | undefined) => boolean;
  /** Full time: the results come first and adding a game is folded away. */
  ended?: boolean;
  /** Who's looking at the day plan: the organiser sets it up, a captain follows it. */
  planRole?: 'organiser' | 'captain';
  /** A captain's route for "left early" in the plan. */
  planAway?: (sessionId: string, playerId: string, at: number | null) => Promise<Lineup>;
  /** A captain's own side, first in the plan's swaps. */
  myTeam?: TeamKey | null;
}) {
  const sideTitle = useId();
  const teams = KEYS.slice(0, lineup.teamCount);
  // `keepers`: who's in goal for each team, as picked on this phone (null: not recorded). A team not
  // in it yet takes whoever kept for it in its last game.
  const [draft, setDraft] = useState({
    teamA: 'A' as TeamKey,
    teamB: 'B' as TeamKey,
    scoreA: 0,
    scoreB: 0,
    goals: [] as GoalInput[],
    keepers: {} as Partial<Record<TeamKey, string | null>>,
    // Who sat this game out on each side (empty: everyone played). Starts empty each game: subs rotate.
    out: {} as Partial<Record<TeamKey, string[]>>,
  });
  // The game being played is kept on this phone until it's saved: a refresh, a lost signal or
  // leaving the page doesn't wipe a score that was never sent.
  const draftKey = `pa_score_draft_${sessionId}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const kept = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
      if (kept && typeof kept.scoreA === 'number' && typeof kept.scoreB === 'number' && Array.isArray(kept.goals)) setDraft({ keepers: {}, out: {}, ...kept });
    } catch {
      // Nothing kept: start from 0–0.
    }
    setRestored(true);
  }, [draftKey]);
  const unsaved = draft.scoreA + draft.scoreB > 0 || draft.goals.length > 0;
  useEffect(() => {
    if (!restored) return;
    try {
      if (unsaved) localStorage.setItem(draftKey, JSON.stringify(draft));
      else localStorage.removeItem(draftKey);
    } catch {
      // Not kept: the warning below still stands.
    }
  }, [draft, draftKey, unsaved, restored]);
  // Closing the page with a score that isn't saved: the browser asks first.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  // The clock as the day plan follows it; a new key loads it again after the plan sets it.
  const [clock, setClock] = useState<PlanClock | null>(null);
  const [clockKey, setClockKey] = useState(0);
  const onTimer = useCallback((t: PlanClock['timer'], offset: number) => setClock({ timer: t, offset }), []);
  // With a plan, the score box starts on the plan's next game (until a goal is added to it):
  // the fixed list, or for winner stays the two sides the app has on from the results so far.
  const ws =
    lineup.plan?.format === 'winner_stays'
      ? winnerStays((Object.keys(TEAMS) as TeamKey[]).slice(0, lineup.teamCount), lineup.plan, lineup.games)
      : null;
  const nextFixture = ws
    ? ws.on && !ws.over
      ? { n: ws.played.length, teamA: ws.on[0], teamB: ws.on[1] }
      : undefined
    : lineup.plan
      ? fixtures(lineup.teamCount, lineup.plan)[lineup.games.length]
      : undefined;
  // Winner stays, after the first round: a side that has conceded enough goes off now.
  const offNow = ws && lineup.plan ? decidedEarly(ws, lineup.plan, draft.scoreA, draft.scoreB) : null;
  useEffect(() => {
    if (!restored || unsaved || !nextFixture) return;
    setDraft((d) => (d.teamA === nextFixture.teamA && d.teamB === nextFixture.teamB ? d : { ...d, teamA: nextFixture.teamA, teamB: nextFixture.teamB }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, nextFixture?.n, nextFixture?.teamA, nextFixture?.teamB]);
  // Asking who scored: for the game being played (`side`) or for one already saved (`gameId`).
  const [scoring, setScoring] = useState<{ team: TeamKey; side?: 'teamA' | 'teamB'; gameId?: string } | null>(null);
  // A saved game whose scorers are open.
  const [editing, setEditing] = useState<string | null>(null);
  const gamesTitle = useId();
  const [choosing, setChoosing] = useState<'teamA' | 'teamB' | null>(null);
  // Picking who's in goal: for a side of the game being played, or of a game already saved.
  const [keeperFor, setKeeperFor] = useState<{ team: TeamKey; side: 'teamA' | 'teamB'; gameId?: string } | null>(null);
  // "Who played this game?": a side of the game being played, or of a saved one
  const [playedFor, setPlayedFor] = useState<{ team: TeamKey; gameId?: string } | null>(null);
  const keeperTitle = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MatchGame | null>(null);
  const toast = useToast();
  // Changing a saved game's score, in its sheet: the new numbers until they're saved.
  const [newScore, setNewScore] = useState<{ id: string; scoreA: number; scoreB: number } | null>(null);
  async function saveScore() {
    if (!newScore || !api.updateGame) return;
    setBusy(`score-${newScore.id}`);
    try {
      onLineup(await api.updateGame(sessionId, newScore.id, { scoreA: newScore.scoreA, scoreB: newScore.scoreB }));
      setNewScore(null);
      toast.success('Score changed');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The score didn’t save. Try again.');
    } finally {
      setBusy(null);
    }
  }
  // After full time: the score box for a game that was missed, opened on request.
  const [adding, setAdding] = useState(false);
  const onSides = lineup.squad.filter((m) => m.team).length;

  if (!lineup.scoresOpen) {
    return (
      <div className="py-12 text-center">
        <p className="text-[15px] font-bold text-ink">Scores open on match day</p>
        <p className="mt-1 text-sm text-gray-600">Come back on {dateLabel} to add each game’s score.</p>
      </div>
    );
  }
  if (!onSides) {
    return (
      <div className="py-12 text-center">
        <p className="text-[15px] font-bold text-ink">Pick the teams first</p>
        <p className="mt-1 text-sm text-gray-600">Each score counts for the players on the two teams.</p>
        <button onClick={onPickTeams} className="press mt-4 min-h-12 px-5 rounded-2xl bg-ink text-volt-300 text-[15px] font-bold">
          Pick teams
        </button>
      </div>
    );
  }

  const name = (t: TeamKey) => teamName(t, lineup.captains, lineup.bibs);
  const who = (id: string | null | undefined) => {
    const m = id ? lineup.squad.find((x) => x.id === id) : null;
    return m ? shortName(m) : 'Someone';
  };
  /** Their face: photo once they've added one, else their initials. */
  const face = (id: string | null | undefined, className: string) => {
    const m = id ? lineup.squad.find((x) => x.id === id) : null;
    return <Avatar name={m ? `${m.firstName} ${m.lastName}` : '?'} photoKey={m?.photoKey} className={className} />;
  };
  /** "Ada (Chidi), Bisi": a side's scorers, with who set each one up. */
  const scorersLine = (goals: GoalInput[]) => goals.map((g) => `${who(g.scorerId)}${g.ownGoal ? ' (own goal)' : g.assistId ? ` (${who(g.assistId)})` : ''}`).join(', ');
  const valid = teams.includes(draft.teamA) && teams.includes(draft.teamB) && draft.teamA !== draft.teamB;

  /** Who kept goal for a team in its last saved game: the starting guess for its next one. */
  const lastKeeper = (t: TeamKey) => {
    for (let i = lineup.games.length - 1; i >= 0; i--) {
      const g = lineup.games[i];
      if (g.teamA === t) return g.keeperA ?? null;
      if (g.teamB === t) return g.keeperB ?? null;
    }
    return null;
  };
  const keeperOf = (t: TeamKey) => {
    const id = draft.keepers[t] !== undefined ? draft.keepers[t]! : lastKeeper(t);
    // Taken off the game since: not recorded, rather than a name nobody can find
    return id && lineup.squad.some((m) => m.id === id) ? id : null;
  };
  /** Everyone on a team today. */
  const members = (t: TeamKey) => lineup.squad.filter((m) => m.team === t);
  /** Who's sitting the game being played out for a team: on it, and not its keeper. */
  const outOf = (t: TeamKey) => (draft.out?.[t] ?? []).filter((id) => members(t).some((m) => m.id === id) && id !== keeperOf(t));
  /** A saved game's line for one side: "All 7 played" or "2 sat out". */
  const playedLine = (t: TeamKey, out: string[]) => {
    const mine = out.filter((id) => members(t).some((m) => m.id === id)).length;
    return mine ? `${mine} sat out` : `All ${members(t).length} played`;
  };
  /** A keeper from another team (or none): borrowed. */
  const borrowedBy = (id: string | null | undefined, t: TeamKey) => !!id && lineup.squad.find((m) => m.id === id)?.team !== t;

  /**
   * How long the game lasted, from the clock: started for this game (not one long gone) and up to
   * now or its whistle. Left out when the clock wasn't used, and its time limit counts instead.
   */
  function playedSeconds() {
    const started = clock?.timer.startedAt ? Date.parse(clock.timer.startedAt) : NaN;
    if (!clock || !Number.isFinite(started)) return undefined;
    // Paused: it stood still at the pause, so that's as far as it got.
    const pausedAt = clock.timer.pausedAt ? Date.parse(clock.timer.pausedAt) : NaN;
    const now = Number.isFinite(pausedAt) ? pausedAt : Date.now() + clock.offset;
    const ends = started + clock.timer.minutes * 60_000;
    if (now - ends > 15 * 60_000) return undefined;
    return Math.max(0, Math.round((Math.min(now, ends) - started) / 1000));
  }

  async function save() {
    setBusy('save');
    try {
      const { teamA, teamB, scoreA, scoreB, goals } = draft;
      const satOut = [...outOf(teamA), ...outOf(teamB)];
      onLineup(await api.addGame(sessionId, { teamA, teamB, scoreA, scoreB, goals, seconds: playedSeconds(), keeperA: keeperOf(draft.teamA), keeperB: keeperOf(draft.teamB), ...(satOut.length ? { satOut } : {}) }));
      buzz([12, 40, 18]);
      // Who's in goal carries on to the next game (the same team usually keeps the same keeper)
      setDraft((d) => ({ ...d, scoreA: 0, scoreB: 0, goals: [], out: {}, keepers: { ...d.keepers, [d.teamA]: keeperOf(d.teamA), [d.teamB]: keeperOf(d.teamB) } }));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The score didn’t save. Try again.');
    } finally {
      setBusy(null);
    }
  }

  /** A goal for the game being played: the score goes up, and the scorer is noted if known. */
  function goalFor(side: 'teamA' | 'teamB', goal: { scorerId: string | null; assistId: string | null; ownGoal?: boolean }) {
    buzz(6);
    const score = side === 'teamA' ? 'scoreA' : 'scoreB';
    setDraft((d) => ({
      ...d,
      [score]: Math.min(99, d[score] + 1),
      goals: goal.scorerId ? [...d.goals, { team: d[side], scorerId: goal.scorerId, assistId: goal.assistId, ...(goal.ownGoal ? { ownGoal: true } : {}) }] : d.goals,
    }));
  }

  async function nameScorer(gameId: string, goal: GoalInput) {
    setBusy(`goal-${gameId}`);
    try {
      onLineup(await api.addGoal(sessionId, gameId, goal));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function unnameScorer(goalId: string) {
    setBusy(goalId);
    try {
      onLineup(await api.deleteGoal(sessionId, goalId));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(g: MatchGame) {
    setRemoving(null);
    setBusy(g.id);
    try {
      onLineup(await api.deleteGame(sessionId, g.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That didn’t delete. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const Side = ({ side }: { side: 'teamA' | 'teamB' }) => {
    const t = draft[side];
    const score = side === 'teamA' ? 'scoreA' : 'scoreB';
    const value = draft[score];
    const sideGoals = draft.goals.filter((g) => g.team === t);
    // One fewer: the last named scorer goes too, if every goal had a name.
    const minus = () => {
      buzz(6);
      setDraft((d) => {
        const next = Math.max(0, d[score] - 1);
        const mine = d.goals.filter((g) => g.team === t);
        const drop = mine.length > next ? mine[mine.length - 1] : null;
        return { ...d, [score]: next, goals: drop ? d.goals.filter((g) => g !== drop) : d.goals };
      });
    };
    const hasPlayers = lineup.squad.some((m) => m.team === t);
    return (
      <div className="min-w-0 flex flex-col items-center gap-2">
        <button
          onClick={() => teams.length > 2 && setChoosing(side)}
          disabled={teams.length <= 2}
          className="press max-w-full min-h-11 inline-flex items-center gap-1.5 px-3 rounded-full bg-white/10 text-[13px] font-bold text-white disabled:cursor-default"
          aria-label={teams.length > 2 ? `${name(t)}: change team` : undefined}
        >
          <Swatch team={t} bibs={lineup.bibs} className="w-3.5 h-3.5 rounded" />
          <span className="truncate">{name(t)}</span>
          {teams.length > 2 && (
            <svg className="w-3.5 h-3.5 shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          )}
        </button>
        <span className="font-display text-[56px] leading-none font-extrabold text-white tabular-nums" aria-live="polite" aria-label={`${name(t)} ${value}`}>
          {value}
        </span>
        <button
          onClick={() => (hasPlayers ? setScoring({ team: t, side }) : goalFor(side, { scorerId: null, assistId: null }))}
          aria-label={`Goal for ${name(t)}`}
          className="press w-full min-h-12 rounded-2xl bg-white text-[15px] font-bold text-ink hover:bg-chalk"
        >
          + Goal
        </button>
        <button
          onClick={minus}
          disabled={value === 0}
          aria-label={`Take a goal off ${name(t)}`}
          className="press min-h-11 px-3 rounded-full text-[13px] font-bold text-white/70 hover:text-white disabled:opacity-30"
        >
          − Take one off
        </button>
        <KeeperChip
          keeper={keeperOf(t)}
          borrowed={borrowedBy(keeperOf(t), t)}
          name={who}
          face={face}
          onClick={() => setKeeperFor({ team: t, side })}
          label={`In goal for ${name(t)}`}
        />
        {/* Who played: everyone unless marked; a sub who sat this one out counts for less */}
        {members(t).length > 1 && (
          <button
            onClick={() => setPlayedFor({ team: t })}
            aria-label={`Who played for ${name(t)}: ${outOf(t).length ? `${outOf(t).length} sat out` : 'everyone'}. Change`}
            className={`press max-w-full min-h-11 px-3 rounded-full text-[12px] font-bold hover:bg-white/10 ${outOf(t).length ? 'text-volt-300' : 'text-white/70'}`}
          >
            {outOf(t).length ? `${outOf(t).length} sat out` : `All ${members(t).length} played`}
          </button>
        )}
        {sideGoals.length > 0 && (
          <ul className="max-w-full flex flex-col items-center gap-1 text-[12px] leading-snug font-semibold text-white/80">
            {sideGoals.map((g, n) => (
              <li key={n} className="flex items-center gap-1.5 max-w-full">
                {face(g.scorerId, 'w-5 h-5 text-[8px]')}
                <span className="min-w-0 truncate">
                  {who(g.scorerId)}
                  {g.ownGoal ? <span className="text-white/55"> (own goal)</span> : g.assistId && <span className="text-white/55"> ({who(g.assistId)})</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const entry = (
    <>
      <div className="rounded-3xl bg-ink turf-stripes p-4">
        <p className="text-center text-[12px] font-bold text-white/60">Game {lineup.games.length + 1}</p>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-1">
          <Side side="teamA" />
          <span className="pt-[60px] font-display text-2xl font-extrabold text-white/30" aria-hidden>
            –
          </span>
          <Side side="teamB" />
        </div>
        {offNow && (
          <p className="mt-4 rounded-2xl bg-volt-300 px-3 py-2.5 text-[14px] leading-snug font-bold text-ink" role="status">
            {name(draft[offNow])} have conceded {lineup.plan?.firstTo ?? 2}: they go off. Save the game.
          </p>
        )}
        {unsaved && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-kit-500/15 border border-kit-500/40 px-3 py-2.5 text-[13px] leading-snug text-white" role="status">
            <span className="mt-1 w-2 h-2 shrink-0 rounded-full bg-kit-500 animate-pulse" aria-hidden />
            <span>
              <b>Not saved yet.</b> Goals stay on this phone until you tap Save. Save when this game ends, before the next one starts.
            </span>
          </p>
        )}
        <button
          onClick={save}
          disabled={!!busy || !valid}
          className={`press ${unsaved ? 'mt-2' : 'mt-4'} w-full min-h-12 rounded-2xl bg-volt-400 text-ink text-[15px] font-bold hover:bg-volt-300 disabled:opacity-50 inline-flex items-center justify-center gap-2`}
        >
          {busy === 'save' && <BallSpinner className="w-4 h-4" />}
          Save game: {name(draft.teamA)} {draft.scoreA}–{draft.scoreB} {name(draft.teamB)}
        </button>
        {!lineup.locked && <p className="mt-2 text-center text-[12px] text-white/60">Saving the first score locks the teams.</p>}
      </div>

    </>
  );
  const events = (
    <>
      <EventsSection
        lineup={lineup}
        busy={busy}
        canRemove={canRemove}
        onAdd={async (playerId, kind) => {
          setBusy('event');
          try {
            onLineup(await api.addEvent(sessionId, { playerId, kind }));
          } catch (err) {
            onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
          } finally {
            setBusy(null);
          }
        }}
        onRemove={async (eventId) => {
          setBusy(eventId);
          try {
            onLineup(await api.deleteEvent(sessionId, eventId));
          } catch (err) {
            onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
          } finally {
            setBusy(null);
          }
        }}
      />

    </>
  );
  const results = (
    <>
      {lineup.games.length > 0 && (
        <>
          <h3 className="mt-5 px-1 text-[13px] font-extrabold text-ink">Today’s table</h3>
          <div className="mt-1.5 bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
            <div className="grid grid-cols-[1fr_repeat(4,26px)_34px_36px] gap-1 px-3.5 py-2 bg-gray-50 text-[11px] font-extrabold text-gray-500">
              <span>Team</span>
              <span className="text-center">P</span>
              <span className="text-center">W</span>
              <span className="text-center">D</span>
              <span className="text-center">L</span>
              <span className="text-center">GD</span>
              <span className="text-right">{lineup.tablePerGame ? 'Pts/G' : 'Pts'}</span>
            </div>
            {lineup.standings.map((r) => (
              <div
                key={r.team}
                className={`grid grid-cols-[1fr_repeat(4,26px)_34px_36px] gap-1 items-center px-3.5 min-h-11 border-t border-gray-100 text-[14px] ${
                  lineup.teamOfTheDay === r.team ? 'bg-volt-100' : ''
                }`}
              >
                <span className="min-w-0 flex items-center gap-2 font-bold text-ink">
                  <Swatch team={r.team} bibs={lineup.bibs} />
                  <span className="truncate">{name(r.team)}</span>
                </span>
                {[r.p, r.w, r.d, r.l].map((v, i) => (
                  <span key={i} className="text-center text-gray-600 tabular-nums">
                    {v}
                  </span>
                ))}
                <span className="text-center text-gray-600 tabular-nums">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</span>
                <span className="text-right font-display font-extrabold text-ink tabular-nums">{lineup.tablePerGame ? (r.ppg ?? 0).toFixed(1) : r.pts}</span>
              </div>
            ))}
            {lineup.tablePerGame && (
              <p className="px-3.5 py-2 border-t border-gray-100 text-[12px] leading-snug text-gray-500">Winner stays: ranked by points per game, as teams play different numbers of games.</p>
            )}
            {lineup.teamOfTheDay && (
              <p className="px-3.5 py-2.5 border-t border-gray-100 text-[13px] font-bold text-pitch-700">
                🏆 Team of the Day so far: {name(lineup.teamOfTheDay)}
              </p>
            )}
          </div>
          <h3 className="mt-5 px-1 text-[13px] font-extrabold text-ink">
            Games today <span className="text-gray-500 tabular-nums">· {lineup.games.length}</span>
          </h3>
          <ol className="mt-1.5 space-y-2">
            {lineup.games.map((g, i) => (
              <li key={g.id} className="relative bg-white rounded-3xl border border-gray-100 shadow-card animate-rise" style={stagger(Math.min(i, 10), 25, 0)}>
                <button
                  onClick={() => setEditing(g.id)}
                  aria-label={`Game ${i + 1}: ${name(g.teamA)} ${g.scoreA}, ${name(g.teamB)} ${g.scoreB}. Scorers`}
                  className="press w-full min-h-12 pl-4 pr-12 py-3 rounded-3xl text-left hover:bg-chalk/60"
                >
                  <span className="block text-[11px] font-extrabold text-gray-500">GAME {i + 1} · FULL TIME</span>
                  <span className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <span className="min-w-0 flex items-center gap-1.5 text-[15px] font-bold text-ink">
                      <Swatch team={g.teamA} bibs={lineup.bibs} />
                      <span className="truncate">{name(g.teamA)}</span>
                    </span>
                    <span className="font-display text-[26px] leading-none font-extrabold text-ink tabular-nums">
                      {g.scoreA}–{g.scoreB}
                    </span>
                    <span className="min-w-0 flex items-center justify-end gap-1.5 text-[15px] font-bold text-ink">
                      <span className="truncate">{name(g.teamB)}</span>
                      <Swatch team={g.teamB} bibs={lineup.bibs} />
                    </span>
                  </span>
                  <span className={`mt-1.5 flex items-center gap-1.5 text-[12px] leading-snug ${g.goals.length || !(g.scoreA + g.scoreB) ? 'text-gray-600' : 'font-bold text-pitch-700'}`}>
                    {g.goals.length > 0 && (
                      <span className="flex -space-x-1.5 shrink-0" aria-hidden>
                        {g.goals.slice(0, 4).map((x, n) => (
                          <span key={n} className="rounded-full ring-2 ring-white">
                            {face(x.scorerId, 'w-5 h-5 text-[8px]')}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="min-w-0 truncate">
                      {g.goals.length ? scorersLine(g.goals) : g.scoreA + g.scoreB ? 'Tap to name the scorers ›' : 'No goals'}
                    </span>
                  </span>
                </button>
                {canRemove(g.recordedBy) && (
                  <button
                    onClick={() => setRemoving(g)}
                    disabled={!!busy}
                    className="absolute top-1.5 right-1.5 w-11 h-11 flex items-center justify-center rounded-full text-gray-400 hover:text-kit-600"
                    aria-label={`Delete game ${i + 1}`}
                  >
                    {busy === g.id ? (
                      <BallSpinner className="w-4 h-4" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                )}
              </li>
            ))}
          </ol>

        </>
      )}

    </>
  );
  const scorersToday = (
    <>
      {lineup.games.some((g) => g.goals.length) && (() => {
        // Today's scorers: goals, then assists, from every game so far.
        const tally = new Map<string, { goals: number; assists: number }>();
        for (const g of lineup.games)
          for (const goal of g.goals) {
            const s = tally.get(goal.scorerId) ?? { goals: 0, assists: 0 };
            s.goals++;
            tally.set(goal.scorerId, s);
            if (goal.assistId) {
              const a = tally.get(goal.assistId) ?? { goals: 0, assists: 0 };
              a.assists++;
              tally.set(goal.assistId, a);
            }
          }
        const rows = [...tally.entries()].sort((a, b) => b[1].goals - a[1].goals || b[1].assists - a[1].assists || who(a[0]).localeCompare(who(b[0])));
        return (
          <>
            <h3 className="mt-5 px-1 text-[13px] font-extrabold text-ink">Scorers today</h3>
            <div className="mt-1.5 bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
              <div className="grid grid-cols-[1fr_52px_52px] gap-1 px-3.5 py-2 bg-gray-50 text-[11px] font-extrabold text-gray-500">
                <span>Player</span>
                <span className="text-center">Goals</span>
                <span className="text-center">Assists</span>
              </div>
              {rows.map(([id, r]) => (
                <div key={id} className="grid grid-cols-[1fr_52px_52px] gap-1 items-center px-3.5 min-h-11 border-t border-gray-100 text-[14px]">
                  <span className="min-w-0 flex items-center gap-2">
                    {face(id, 'w-7 h-7 text-[10px]')}
                    <span className="min-w-0 truncate font-bold text-ink">{who(id)}</span>
                  </span>
                  <span className="text-center font-display font-extrabold text-ink tabular-nums">{r.goals}</span>
                  <span className="text-center text-gray-600 tabular-nums">{r.assists}</span>
                </div>
              ))}
            </div>
          </>
        );
      })()}

    </>
  );

  return (
    <section aria-label="Scores">
      {ended ? (
        <>
          {/* After full time, the results lead: who scored, each game, the table. Adding a game
              that was missed is still there, folded behind one quiet button. */}
          {lineup.games.length === 0 && (
            <div className="rounded-3xl bg-chalk px-5 py-6 text-center">
              <p className="text-[15px] font-bold text-ink">No scores were added</p>
              <p className="mt-1 text-[13px] text-gray-600">Add the games from today if you have them.</p>
            </div>
          )}
          <div className="[&>h3:first-child]:mt-0">{scorersToday}</div>
          {results}
          {events}
          {adding ? (
            <div className="mt-5">{entry}</div>
          ) : (
            <button onClick={() => setAdding(true)} className="press mt-5 w-full min-h-12 rounded-2xl bg-white border border-gray-300 text-[15px] font-bold text-ink hover:border-ink">
              + Add a game you missed
            </button>
          )}
        </>
      ) : (
        <>
          {/* The day plan, then the match-day clock, above the score box while the day is on */}
          {timerOn && (
            <div className="mb-3 empty:hidden">
              <DayPlan
                sessionId={sessionId}
                lineup={lineup}
                onLineup={onLineup}
                role={planRole}
                live
                clock={clock}
                onClockChanged={() => setClockKey((k) => k + 1)}
                onAway={planAway ? (playerId, at) => planAway(sessionId, playerId, at) : undefined}
                myTeam={myTeam}
              />
            </div>
          )}
          {timerOn && (
            // Captains only watch the clock: its light-on-dark strip needs the dark card behind it.
            <div className={`mb-3 empty:hidden ${timerWatch ? 'rounded-2xl bg-ink' : ''}`}>
              <GameTimer key={clockKey} sessionId={sessionId} api={timer} watch={timerWatch} onError={onError} onTimer={onTimer} />
            </div>
          )}
          {entry}
          {events}
          {results}
          {scorersToday}
        </>
      )}

      {scoring && (
        <ScorerSheet
          team={scoring.team}
          against={
            scoring.side
              ? draft[scoring.side === 'teamA' ? 'teamB' : 'teamA']
              : (() => {
                  const g = lineup.games.find((x) => x.id === scoring.gameId);
                  return g ? (g.teamA === scoring.team ? g.teamB : g.teamA) : null;
                })()
          }
          lineup={lineup}
          allowUnnamed={!scoring.gameId}
          scoreAfter={
            scoring.side ? (scoring.side === 'teamA' ? `${draft.scoreA + 1}–${draft.scoreB}` : `${draft.scoreA}–${draft.scoreB + 1}`) : undefined
          }
          onClose={() => setScoring(null)}
          onPick={(goal) => {
            const s = scoring;
            setScoring(null);
            if (s.side) goalFor(s.side, goal);
            else if (s.gameId && goal.scorerId) nameScorer(s.gameId, { team: s.team, scorerId: goal.scorerId, assistId: goal.assistId, ...(goal.ownGoal ? { ownGoal: true } : {}) });
          }}
        />
      )}

      {editing && !scoring && (() => {
        const g = lineup.games.find((x) => x.id === editing);
        if (!g) return null;
        const n = lineup.games.indexOf(g) + 1;
        const draftScore = newScore?.id === g.id ? newScore : null;
        const changed = !!draftScore && (draftScore.scoreA !== g.scoreA || draftScore.scoreB !== g.scoreB);
        const close = () => {
          setEditing(null);
          setNewScore(null);
        };
        return (
          <Sheet
            titleId={gamesTitle}
            onClose={close}
            align="left"
            footer={
              changed ? (
                <button onClick={saveScore} disabled={busy === `score-${g.id}`} className={`${btnPrimary} w-full`}>
                  {busy === `score-${g.id}` ? 'Saving…' : `Save score: ${name(g.teamA)} ${draftScore!.scoreA}–${draftScore!.scoreB} ${name(g.teamB)}`}
                </button>
              ) : undefined
            }
          >
            <SheetTitle id={gamesTitle} title={`Game ${n}: ${name(g.teamA)} ${g.scoreA}–${g.scoreB} ${name(g.teamB)}`} sub="Who scored, and who set it up." onClose={close} />
            {api.updateGame && (
              <section className="mt-4 rounded-2xl bg-chalk p-3" aria-label="Change the score">
                <p className="text-[13px] font-extrabold text-ink">Change the score</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['scoreA', 'scoreB'] as const).map((k) => {
                    const t = k === 'scoreA' ? g.teamA : g.teamB;
                    const value = draftScore ? draftScore[k] : g[k];
                    const named = g.goals.filter((x) => x.team === t).length;
                    const set = (v: number) => setNewScore({ id: g.id, scoreA: g.scoreA, scoreB: g.scoreB, ...draftScore, [k]: v });
                    return (
                      <div key={k} className="rounded-xl bg-white border border-gray-100 p-2">
                        <p className="flex items-center gap-1.5 min-w-0 text-[12px] font-bold text-gray-600">
                          <Swatch team={t} bibs={lineup.bibs} />
                          <span className="truncate">{name(t)}</span>
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <button
                            onClick={() => set(value - 1)}
                            disabled={value <= named}
                            aria-label={`One goal fewer for ${name(t)}`}
                            className="press w-11 h-11 rounded-full border border-gray-200 text-lg font-bold text-ink disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="font-display text-[28px] font-extrabold text-ink tabular-nums" aria-live="polite">
                            {value}
                          </span>
                          <button
                            onClick={() => set(Math.min(99, value + 1))}
                            aria-label={`One goal more for ${name(t)}`}
                            className="press w-11 h-11 rounded-full border border-gray-200 text-lg font-bold text-ink"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {g.goals.length > 0 && <p className="mt-2 text-[12px] leading-snug text-gray-500">To go below the scorers named, take a scorer off below first.</p>}
              </section>
            )}
            {([
              [g.teamA, g.scoreA],
              [g.teamB, g.scoreB],
            ] as [TeamKey, number][]).map(([t, score]) => {
              const goals = g.goals.filter((x) => x.team === t);
              return (
                <div key={t} className="mt-4">
                  <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                    <Swatch team={t} bibs={lineup.bibs} />
                    {name(t)} · {score} goal{score === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-1">
                    {goals.map((goal) => (
                      <li key={goal.id} className="flex items-center gap-2.5 min-h-12 py-1.5 border-b border-gray-100">
                        {face(goal.scorerId, 'w-9 h-9 text-[11px]')}
                        <span className="flex-1 min-w-0">
                          <span className="block text-[15px] font-bold text-ink truncate">
                            {who(goal.scorerId)}
                            {goal.ownGoal ? <span className="font-semibold text-gray-600"> · own goal</span> : goal.assistId && <span className="font-semibold text-gray-600"> · set up by {who(goal.assistId)}</span>}
                          </span>
                          {goal.recordedBy && <span className="block text-[12px] text-gray-500">Added by {goal.recordedBy}</span>}
                        </span>
                        {canRemove(goal.recordedBy) && (
                        <button
                          onClick={() => unnameScorer(goal.id)}
                          disabled={!!busy}
                          aria-label={`Remove ${who(goal.scorerId)}'s goal`}
                          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-kit-600"
                        >
                          {busy === goal.id ? (
                            <BallSpinner className="w-4 h-4" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {goals.length < score ? (
                    <button
                      onClick={() => setScoring({ team: t, gameId: g.id })}
                      disabled={!!busy}
                      className="press mt-2 w-full min-h-11 rounded-2xl border border-dashed border-gray-300 text-[14px] font-bold text-ink hover:border-ink"
                    >
                      {busy === `goal-${g.id}` ? 'Saving…' : `Name a scorer · ${score - goals.length} not named`}
                    </button>
                  ) : (
                    score === 0 && <p className="mt-1 text-[13px] text-gray-500">No goals</p>
                  )}
                  {(() => {
                    const side = t === g.teamA ? 'teamA' : 'teamB';
                    const k = (side === 'teamA' ? g.keeperA : g.keeperB) ?? null;
                    const line = k ? (
                      <>
                        <b className="font-semibold text-gray-700">{who(k)}</b> in goal{borrowedBy(k, t) ? ' (borrowed)' : ''}
                      </>
                    ) : (
                      'Keeper not added'
                    );
                    // One quiet line under the goals: the organiser can fix it, a captain just sees it
                    return (
                      <div className="mt-1 flex items-center gap-2 min-h-11 text-[13px] text-gray-500">
                        <GloveIcon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{line}</span>
                        {api.updateGame && (
                          <button
                            onClick={() => setKeeperFor({ team: t, side, gameId: g.id })}
                            disabled={!!busy}
                            className="press shrink-0 min-h-11 px-2 -mr-2 text-[13px] font-bold text-pitch-700"
                          >
                            {busy === `keeper-${g.id}` ? 'Saving…' : k ? 'Change' : 'Add'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {members(t).length > 1 && (() => {
                    // Who played it: everyone unless someone was marked as sitting it out
                    return (
                      <div className="flex items-center gap-2 min-h-11 text-[13px] text-gray-500">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                        </svg>
                        <span className="flex-1 min-w-0 truncate">{playedLine(t, g.satOut ?? [])}</span>
                        {api.updateGame && (
                          <button
                            onClick={() => setPlayedFor({ team: t, gameId: g.id })}
                            disabled={!!busy}
                            className="press shrink-0 min-h-11 px-2 -mr-2 text-[13px] font-bold text-pitch-700"
                          >
                            {busy === `played-${g.id}` ? 'Saving…' : 'Change'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </Sheet>
        );
      })()}

      {playedFor && (() => {
        const t = playedFor.team;
        const saved = playedFor.gameId ? lineup.games.find((x) => x.id === playedFor.gameId) : null;
        const keeper = saved ? (saved.teamA === t ? saved.keeperA : saved.keeperB) ?? null : keeperOf(t);
        const out = saved ? (saved.satOut ?? []).filter((id) => members(t).some((m) => m.id === id)) : outOf(t);
        const close = () => setPlayedFor(null);
        return (
          <WhoPlayedSheet
            title={`Who played for ${name(t)}?`}
            players={members(t).map((m) => ({ id: m.id, name: shortName(m), face: face(m.id, 'w-9 h-9 text-[11px]') }))}
            keeper={keeper}
            out={out}
            busy={!!saved && busy === `played-${saved.id}`}
            onClose={close}
            onDone={async (next) => {
              if (!saved) {
                setDraft((d) => ({ ...d, out: { ...d.out, [t]: next } }));
                return close();
              }
              if (!api.updateGame) return close();
              // The other side's sat-out players stay as they were
              const other = (saved.satOut ?? []).filter((id) => !members(t).some((m) => m.id === id));
              setBusy(`played-${saved.id}`);
              try {
                onLineup(await api.updateGame(sessionId, saved.id, { satOut: [...other, ...next] }));
                close();
              } catch (err) {
                onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
              } finally {
                setBusy(null);
              }
            }}
          />
        );
      })()}

      {keeperFor && (() => {
        const t = keeperFor.team;
        const saved = keeperFor.gameId ? lineup.games.find((x) => x.id === keeperFor.gameId) : null;
        const current = saved ? (keeperFor.side === 'teamA' ? saved.keeperA : saved.keeperB) ?? null : keeperOf(t);
        // The other side's keeper in the same game can't keep for this one too
        const otherTeam = saved ? (keeperFor.side === 'teamA' ? saved.teamB : saved.teamA) : keeperFor.side === 'teamA' ? draft.teamB : draft.teamA;
        const otherKeeper = saved ? (keeperFor.side === 'teamA' ? saved.keeperB : saved.keeperA) ?? null : keeperOf(otherTeam);
        const playing = lineup.squad;
        const own = playing.filter((m) => m.team === t);
        const others = playing.filter((m) => m.team !== t);
        const close = () => setKeeperFor(null);
        const pick = async (id: string | null) => {
          if (saved) {
            if (!api.updateGame) return;
            setBusy(`keeper-${saved.id}`);
            try {
              onLineup(await api.updateGame(sessionId, saved.id, keeperFor.side === 'teamA' ? { keeperA: id } : { keeperB: id }));
              close();
            } catch (err) {
              onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
            } finally {
              setBusy(null);
            }
            return;
          }
          buzz(8);
          setDraft((d) => ({ ...d, keepers: { ...d.keepers, [t]: id } }));
          close();
        };
        const Row = ({ m }: { m: (typeof playing)[number] }) => {
          const theirs = m.team && m.team !== t ? m.team : null;
          const elsewhere = m.id === otherKeeper;
          return (
            <li>
              <button
                onClick={() => pick(m.id)}
                disabled={elsewhere || !!busy}
                aria-pressed={current === m.id}
                className={`press w-full flex items-center gap-3 min-h-14 px-3 py-2 rounded-2xl border text-left disabled:opacity-40 ${
                  current === m.id ? 'border-ink bg-chalk' : 'border-gray-100 bg-white hover:border-ink'
                }`}
              >
                {face(m.id, 'w-9 h-9 text-[11px]')}
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-ink truncate">{shortName(m)}</span>
                  {(theirs || elsewhere) && (
                    <span className="flex items-center gap-1.5 text-[12px] text-gray-500 truncate">
                      {theirs && <Swatch team={theirs} bibs={lineup.bibs} />}
                      {elsewhere ? `In goal for ${name(otherTeam)}` : `From ${name(theirs!)}`}
                    </span>
                  )}
                </span>
                {current === m.id && <span className="shrink-0 text-[12px] font-extrabold text-pitch-700">In goal</span>}
              </button>
            </li>
          );
        };
        return (
          <Sheet titleId={keeperTitle} onClose={close} align="left">
            <SheetTitle id={keeperTitle} title={`Who’s in goal for ${name(t)}?`} sub="Anyone playing today. A keeper from another team counts as borrowed." onClose={close} />
            {own.length > 0 && (
              <>
                <p className="mt-4 flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                  <Swatch team={t} bibs={lineup.bibs} />
                  {name(t)}
                </p>
                <ul className="mt-1.5 space-y-1.5">{own.map((m) => <Row key={m.id} m={m} />)}</ul>
              </>
            )}
            {others.length > 0 && (
              <>
                <p className="mt-4 text-[13px] font-extrabold text-ink">Borrowed from another team</p>
                <ul className="mt-1.5 space-y-1.5">{others.map((m) => <Row key={m.id} m={m} />)}</ul>
              </>
            )}
            <button
              onClick={() => pick(null)}
              disabled={!!busy}
              aria-pressed={current === null}
              className={`press mt-4 w-full min-h-12 px-3 rounded-2xl border text-left text-[14px] font-bold ${current === null ? 'border-ink bg-chalk text-ink' : 'border-dashed border-gray-300 text-gray-600 hover:border-ink'}`}
            >
              Not recorded
            </button>
          </Sheet>
        );
      })()}

      {choosing && (
        <Sheet titleId={sideTitle} onClose={() => setChoosing(null)} align="left">
          <SheetTitle id={sideTitle} title="Who’s playing?" sub={choosing === 'teamA' ? 'The team on the left' : 'The team on the right'} onClose={() => setChoosing(null)} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {teams.map((t, i) => {
              const other = choosing === 'teamA' ? draft.teamB : draft.teamA;
              const taken = t === other;
              return (
                <button
                  key={t}
                  disabled={taken}
                  onClick={() => {
                    // A different team on that side: its goals so far weren't theirs.
                    setDraft((d) => ({ ...d, [choosing]: t, goals: d.goals.filter((x) => x.team !== d[choosing]) }));
                    setChoosing(null);
                  }}
                  className={`press animate-rise flex items-center gap-2.5 min-h-14 px-3 rounded-2xl border text-left disabled:opacity-40 ${
                    draft[choosing] === t ? 'border-ink bg-chalk' : 'border-gray-200 hover:border-ink'
                  }`}
                  style={stagger(i, 30, 20)}
                >
                  <Swatch team={t} bibs={lineup.bibs} className="w-5 h-5 rounded-md" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-ink truncate">{name(t)}</span>
                    {taken && <span className="block text-[12px] text-gray-500">On the other side</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      <ConfirmDialog
        open={!!removing}
        title="Delete this score?"
        message={
          removing
            ? `${name(removing.teamA)} ${removing.scoreA}–${removing.scoreB} ${name(removing.teamB)} comes off today’s table and everyone’s record.${
                lineup.games.length === 1 ? ' With no scores left, the teams can be changed again.' : ''
              }`
            : ''
        }
        confirmLabel="Delete score"
        cancelLabel="Keep it"
        variant="danger"
        onConfirm={() => removing && remove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

/** A keeper's glove. */
function GloveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 21h8v-3l2-3V8a1.5 1.5 0 0 0-3 0v3V5a1.5 1.5 0 0 0-3 0v5V4a1.5 1.5 0 0 0-3 0v6V6a1.5 1.5 0 0 0-3 0v8l2 4Z" />
    </svg>
  );
}

/**
 * Who's in goal for a side of the game being played: their face and name (or a prompt), one tap
 * to change. A keeper from another team says so, in words.
 */
function KeeperChip({
  keeper,
  borrowed,
  name,
  face,
  onClick,
  label,
}: {
  keeper: string | null;
  borrowed: boolean;
  name: (id: string) => string;
  face: (id: string, className: string) => React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label}: ${keeper ? `${name(keeper)}${borrowed ? ', borrowed' : ''}` : 'not recorded'}. Change`}
      className="press max-w-full min-h-11 inline-flex items-center gap-1.5 pl-1.5 pr-3 rounded-full border border-white/15 text-[12px] font-bold text-white hover:bg-white/10"
    >
      {keeper ? face(keeper, 'w-6 h-6 text-[9px]') : <GloveIcon className="w-5 h-5 text-white/60" />}
      {/* "Borrowed" on its own small line, so it never squeezes the keeper's name */}
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate">{keeper ? name(keeper) : 'Who’s in goal?'}</span>
        {keeper && borrowed && <span className="block text-[10px] font-extrabold uppercase tracking-wide text-volt-300">Borrowed</span>}
      </span>
    </button>
  );
}

/**
 * Who played a game for one side: everyone ticked to start, tap anyone who sat the whole game out.
 * The keeper played it, so they can't be untick. Done saves it (for a saved game, straight away).
 */
function WhoPlayedSheet({
  title,
  players,
  keeper,
  out: initial,
  busy,
  onClose,
  onDone,
}: {
  title: string;
  players: { id: string; name: string; face: React.ReactNode }[];
  keeper: string | null;
  out: string[];
  busy: boolean;
  onClose: () => void;
  onDone: (out: string[]) => void;
}) {
  const titleId = useId();
  const [out, setOut] = useState<string[]>(initial);
  const playing = players.length - out.length;
  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <button onClick={() => onDone(out)} disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? 'Saving…' : `Done · ${playing} of ${players.length} played`}
        </button>
      }
    >
      <SheetTitle id={titleId} title={title} sub="Tap anyone who sat this whole game out." onClose={onClose} />
      <ul className="mt-4 space-y-1.5">
        {players.map((p) => {
          const played = !out.includes(p.id);
          const inGoal = p.id === keeper;
          return (
            <li key={p.id}>
              <button
                onClick={() => {
                  buzz(6);
                  setOut((o) => (played ? [...o, p.id] : o.filter((x) => x !== p.id)));
                }}
                disabled={inGoal || busy}
                aria-pressed={played}
                className={`press w-full flex items-center gap-3 min-h-14 px-3 py-2 rounded-2xl border text-left ${played ? 'border-gray-100 bg-white hover:border-ink' : 'border-dashed border-gray-300 bg-chalk'} disabled:cursor-default`}
              >
                <span className={played ? '' : 'opacity-40'}>{p.face}</span>
                <span className={`flex-1 min-w-0 truncate text-[15px] font-bold ${played ? 'text-ink' : 'text-gray-500 line-through decoration-gray-400'}`}>{p.name}</span>
                <span className={`shrink-0 text-[12px] font-extrabold ${inGoal ? 'text-pitch-700' : played ? 'text-pitch-700' : 'text-gray-500'}`}>{inGoal ? 'In goal' : played ? 'Played' : 'Sat out'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
