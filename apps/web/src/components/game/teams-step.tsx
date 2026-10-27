'use client';

import { DayPlan } from '@/components/plan/day-plan';
import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { Avatar } from '@/components/ratings';
import { BallSpinner } from '@/components/skeleton';
import { buzz, stagger } from '@/components/motion';
import { balanceLineup, saveLineup, setGameBibs, type Lineup, type TeamKey } from '@/lib/api';
import { BibShirt } from '@/components/bib-shirt';
import { BibsSheet } from '@/components/bibs-sheet';
import type { Bibs } from '@pitchaside/shared';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';

const KEYS = Object.keys(TEAMS) as TeamKey[];
type Member = Lineup['squad'][number];

/** In the sheet and for screen readers: their nickname, else their full name. */
const shownName = (m: Member) => m.nickname || `${m.firstName} ${m.lastName}`;
/** On the narrow team columns: nickname, else first name and initial ("Chidi N."). */
export const shortName = (m: Pick<Member, 'nickname' | 'firstName' | 'lastName'>) => m.nickname || `${m.firstName} ${m.lastName.charAt(0)}.`;

export function Swatch({ team, bibs, className = 'w-3 h-3 rounded-sm' }: { team: TeamKey; bibs?: Bibs | null; className?: string }) {
  return <span className={`${className} inline-block shrink-0`} style={bibFill(team, bibs)} aria-hidden />;
}

/**
 * Step 2 of match day: split the squad into sides. One tap makes fair teams from everyone's
 * rating; after that, tap a player and pick their side (two taps) or make them captain. Sides sit
 * side by side, two to a row, so a whole squad fits on about one phone screen; anyone not on a
 * side comes first because that's what's left to do. Once a score is in the teams are locked,
 * except that someone who came late (not on a side yet) can still be put on one.
 */
export function TeamsStep({
  sessionId,
  lineup,
  onLineup,
  onError,
  onDone,
}: {
  sessionId: string;
  lineup: Lineup;
  onLineup: (l: Lineup) => void;
  onError: (message: string) => void;
  /** Moves on to scores, once everyone is on a side. */
  onDone?: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<Member | null>(null);
  const [bibsOpen, setBibsOpen] = useState(false);
  const teams = KEYS.slice(0, lineup.teamCount);
  const locked = lineup.locked;
  const unpicked = lineup.squad.filter((m) => !m.team);
  const picked = lineup.squad.length - unpicked.length;

  async function run(key: string, fn: () => Promise<Lineup>) {
    setBusy(key);
    try {
      onLineup(await fn());
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const move = (m: Member, team: TeamKey | null) => {
    setMoving(null);
    buzz(8);
    run(m.id, () => saveLineup(sessionId, { teams: { [m.id]: team } }));
  };
  // Stays open if it doesn't save, so their picks aren't lost.
  const saveBibs = async (bibs: Bibs | null) => {
    setBusy('bibs');
    try {
      onLineup(await setGameBibs(sessionId, bibs));
      setBibsOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'The bibs didn’t save. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const captain = (m: Member, team: TeamKey, on: boolean) => {
    setMoving(null);
    run(m.id, () => saveLineup(sessionId, { captains: { [team]: on ? m.id : null } }));
  };
  const vice = (m: Member, team: TeamKey, on: boolean) => {
    setMoving(null);
    run(m.id, () => saveLineup(sessionId, { vices: { [team]: on ? m.id : null } }));
  };

  const avg = (team: TeamKey) => {
    const rated = lineup.squad.filter((m) => m.team === team && m.ovr != null);
    return rated.length ? Math.round(rated.reduce((s, m) => s + (m.ovr ?? 0), 0) / rated.length) : null;
  };

  if (lineup.squad.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[15px] font-bold text-ink">No one to put in teams yet</p>
        <p className="mt-1 text-sm text-gray-600">Players who are in for this game show up here.</p>
      </div>
    );
  }

  // Locked: only someone not on a side yet (they came late) can still be placed.
  const fixed = (m: Member) => locked && !!m.team;
  const Row = ({ m, i }: { m: Member; i: number }) => (
    <li className="animate-rise" style={stagger(Math.min(i, 12), 18, 0)}>
      <button
        onClick={() => setMoving(m)}
        disabled={fixed(m) || !!busy}
        aria-label={`${shownName(m)}${m.captain ? ', captain' : m.vice ? ', vice-captain' : ''}${m.paid === 'unpaid' ? ', not paid yet' : ''}${fixed(m) ? '' : m.team ? ': move' : ': put on a side'}`}
        title={`${m.firstName} ${m.lastName}`}
        className="press w-full flex items-center gap-2 min-h-11 px-2 py-1 text-left rounded-xl hover:bg-white/70 disabled:hover:bg-transparent disabled:cursor-default"
      >
        <Avatar name={`${m.firstName} ${m.lastName}`} photoKey={m.photoKey} className="w-7 h-7 text-[10px]" />
        <span className="flex-1 min-w-0" aria-hidden>
          <span className="flex items-center gap-1">
            <span className="text-[14px] font-bold text-ink truncate">{shortName(m)}</span>
            {m.captain && <span className="shrink-0 w-4 h-4 rounded-full bg-ink text-volt-300 text-[9px] font-extrabold leading-4 text-center">C</span>}
            {m.vice && <span className="shrink-0 h-4 px-1 rounded-full bg-white border border-ink text-ink text-[9px] font-extrabold leading-[14px] text-center">VC</span>}
          </span>
          {m.paid === 'unpaid' && <span className="block text-[11px] font-semibold leading-tight text-amber-700">Not paid</span>}
        </span>
        {busy === m.id ? (
          <BallSpinner className="w-3.5 h-3.5" />
        ) : (
          m.ovr != null && (
            <span className="shrink-0 text-[11px] font-extrabold text-gray-500 tabular-nums" aria-hidden>
              {m.ovr}
            </span>
          )
        )}
      </button>
    </li>
  );

  return (
    <section aria-label="Teams">
      {/* How many sides, and the one-tap split */}
      <div className="rounded-3xl bg-ink turf-stripes p-4 text-white">
        {locked ? (
          <p className="flex items-start gap-2 text-[13px] leading-snug text-white/80">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-volt-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            <span>
              <b className="text-white">{lineup.teamCount} teams, locked.</b> Scores are in and each one counts for the players on these teams. Delete
              the scores to change the teams. Someone who came late can still go on a side: tap them.
            </span>
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-bold text-white/80" id="team-count">
                Teams
              </p>
              <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1" role="radiogroup" aria-labelledby="team-count">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={lineup.teamCount === n}
                    onClick={() => run('count', () => saveLineup(sessionId, { teamCount: n }))}
                    disabled={!!busy}
                    className={`press w-10 h-10 rounded-lg text-[15px] font-extrabold tabular-nums transition-colors ${
                      lineup.teamCount === n ? 'bg-volt-400 text-ink' : 'text-white/70 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                buzz(12);
                run('balance', () => balanceLineup(sessionId));
              }}
              disabled={!!busy}
              className="press mt-3 w-full min-h-12 rounded-2xl bg-volt-400 text-ink text-[15px] font-bold hover:bg-volt-300 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {busy === 'balance' ? <BallSpinner className="w-4 h-4" /> : <span aria-hidden>✦</span>}
              {picked ? `Remake ${lineup.teamCount} fair teams` : `Make ${lineup.teamCount} fair teams`}
            </button>
            <p className="mt-2 text-[12px] leading-snug text-white/60">
              Fair by rating; captains stay on their side. Tap a player to move them or make them captain or vice-captain.
            </p>
          </>
        )}
      </div>

      {/* What each side wears today: allowed after scores too, it only changes how they look */}
      <button
        onClick={() => setBibsOpen(true)}
        disabled={!!busy}
        className="press mt-2 w-full min-h-12 flex items-center gap-3 px-3 rounded-2xl bg-white border border-gray-200 text-left hover:border-ink"
      >
        <span className="flex -space-x-2 shrink-0">
          {teams.map((t) => (
            <BibShirt key={t} team={t} bibs={lineup.bibs} className="w-7 h-7" />
          ))}
        </span>
        <span className="flex-1 min-w-0 truncate text-[14px] font-bold text-ink">Bibs and names</span>
        <span className="shrink-0 text-[13px] font-bold text-pitch-700">Change</span>
      </button>

      {unpicked.length > 0 && (
        <div className="mt-4">
          <h3 className="px-1 text-[13px] font-extrabold text-ink">
            {locked ? 'Came late, not on a side yet' : 'Not on a team yet'} <span className="text-gray-500 tabular-nums">· {unpicked.length}</span>
          </h3>
          {locked && (
            <p className="px-1 mt-0.5 text-[12px] leading-snug text-gray-600">Tap to put them on a side. Only the games saved after that count for them.</p>
          )}
          <ul className="mt-1.5 grid grid-cols-2 gap-x-1 p-1.5 bg-white rounded-3xl border border-dashed border-gray-300">
            {unpicked.map((m, i) => (
              <Row key={m.id} m={m} i={i} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {teams.map((t) => {
          const members = lineup.squad
            .filter((m) => m.team === t)
            .sort((a, b) => Number(b.captain) - Number(a.captain) || Number(!!b.vice) - Number(!!a.vice) || shortName(a).localeCompare(shortName(b)));
          const a = avg(t);
          const best = lineup.teamOfTheDay === t;
          return (
            <div key={t} className="min-w-0 rounded-3xl p-1.5" style={bibTint(t, lineup.bibs)}>
              <h3 className="px-2 pt-1.5 pb-1">
                <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                  <Swatch team={t} bibs={lineup.bibs} className="w-3.5 h-3.5 rounded" />
                  <span className="truncate">{teamName(t, lineup.captains, lineup.bibs)}</span>
                  {best && (
                    <span className="shrink-0" title="Team of the Day">
                      🏆<span className="sr-only">, Team of the Day</span>
                    </span>
                  )}
                </span>
                <span className="block text-[11px] font-semibold text-gray-600 tabular-nums">
                  {lineup.captains[t] || bibOf(t, lineup.bibs).name ? `${bibOf(t, lineup.bibs).label} · ` : ''}
                  {members.length} player{members.length === 1 ? '' : 's'}
                  {a != null ? ` · avg ${a}` : ''}
                </span>
              </h3>
              {members.length ? (
                <ul>
                  {members.map((m, i) => (
                    <Row key={m.id} m={m} i={i} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-3 text-[12px] text-gray-500">No one yet</p>
              )}
            </div>
          );
        })}
      </div>

      {!locked && onDone && unpicked.length === 0 && lineup.scoresOpen && (
        <button onClick={onDone} className="press mt-4 w-full min-h-12 rounded-2xl bg-white border border-gray-300 text-[15px] font-bold text-ink hover:border-ink">
          Teams done · add scores
        </button>
      )}

      {/* The day plan: games to fill the booking and the swaps, from these teams */}
      <div className="mt-4">
        <DayPlan sessionId={sessionId} lineup={lineup} onLineup={onLineup} />
      </div>

      {moving && (
        <Sheet titleId={titleId} onClose={() => setMoving(null)} align="left">
          <SheetTitle
            id={titleId}
            title={shownName(moving)}
            sub={
              moving.team
                ? `On ${teamName(moving.team, lineup.captains, lineup.bibs)}${moving.captain ? ', captain' : moving.vice ? ', vice-captain' : ''}`
                : locked
                  ? 'Came late. Once on a side they stay there; only the games saved after this count for them.'
                  : 'Not on a team yet'
            }
            onClose={() => setMoving(null)}
          />
          <p className="mt-4 text-[13px] font-bold text-gray-600">{moving.team ? 'Move to' : 'Put on'}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {teams.map((t, i) => {
              const here = moving.team === t;
              const size = lineup.squad.filter((m) => m.team === t).length;
              return (
                <button
                  key={t}
                  onClick={() => !here && move(moving, t)}
                  aria-current={here || undefined}
                  className={`press animate-rise flex items-center gap-2.5 min-h-14 px-3 rounded-2xl border text-left ${
                    here ? 'border-ink bg-chalk' : 'border-gray-200 hover:border-ink'
                  }`}
                  style={stagger(i, 30, 20)}
                >
                  <Swatch team={t} bibs={lineup.bibs} className="w-5 h-5 rounded-md" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-ink truncate">{teamName(t, lineup.captains, lineup.bibs)}</span>
                    <span className="block text-[12px] text-gray-500 tabular-nums">{here ? 'On it now' : `${size} player${size === 1 ? '' : 's'}`}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <ul className="mt-3 -mx-2">
            {moving.team && (
              <li>
                <button
                  onClick={() => captain(moving, moving.team!, !moving.captain)}
                  className="press w-full text-left px-2 py-3 rounded-2xl hover:bg-chalk"
                >
                  <span className="block text-[15px] font-bold text-ink">{moving.captain ? 'Not captain' : `Make captain of ${teamName(moving.team, lineup.captains, lineup.bibs)}`}</span>
                  <span className="block text-[13px] leading-snug text-gray-600">
                    {moving.captain ? `${teamName(moving.team, lineup.captains, lineup.bibs)} goes back to ${bibOf(moving.team, lineup.bibs).name ?? 'its bib colour'}.` : bibOf(moving.team, lineup.bibs).name
                      ? `The team keeps its name, ${bibOf(moving.team, lineup.bibs).name}.`
                      : `The team goes by their name: Team ${moving.nickname || moving.firstName}.`}
                    {!moving.captain && ' They get a message and keep the score on match day.'}
                  </span>
                </button>
              </li>
            )}
            {moving.team && !moving.captain && (
              <li>
                <button onClick={() => vice(moving, moving.team!, !moving.vice)} className="press w-full text-left px-2 py-3 rounded-2xl hover:bg-chalk">
                  <span className="block text-[15px] font-bold text-ink">
                    {moving.vice ? 'Not vice-captain' : `Make vice-captain of ${teamName(moving.team, lineup.captains, lineup.bibs)}`}
                  </span>
                  <span className="block text-[13px] leading-snug text-gray-600">
                    {moving.vice
                      ? 'They stop keeping the score.'
                      : `Keeps the score with the captain, in case the captain is busy playing. They get a message.${
                          lineup.squad.some((m) => m.vice && m.team === moving.team) ? ' Takes over from the current vice-captain.' : ''
                        }`}
                  </span>
                </button>
              </li>
            )}
            {moving.team && (
              <li>
                <button onClick={() => move(moving, null)} className="press w-full text-left px-2 py-3 rounded-2xl hover:bg-chalk">
                  <span className="block text-[15px] font-bold text-ink">Take off the teams</span>
                  <span className="block text-[13px] leading-snug text-gray-600">They stay in the game, just not on a side yet.</span>
                </button>
              </li>
            )}
          </ul>
        </Sheet>
      )}

      {bibsOpen && (
        <BibsSheet
          title="Bibs for this game"
          sub="Only this game. The group’s usual bibs stay as they are."
          current={lineup.bibs}
          shown={lineup.teamCount}
          saving={busy === 'bibs'}
          resetLabel="Use the group’s usual bibs"
          onSave={saveBibs}
          onReset={() => saveBibs(null)}
          onClose={() => setBibsOpen(false)}
        />
      )}
    </section>
  );
}
