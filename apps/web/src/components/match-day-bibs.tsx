'use client';

import { useEffect, useState } from 'react';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';
import { BallSpinner } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LiveDot } from '@/components/motion';
import type { TeamKey } from '@/lib/api';
import { getGameLineup, getGameTimer, pickBib, type GameLineup, type GamePaid } from '@/lib/player';
import { GameTimer, type TimerApi } from '@/components/game-timer';
import { Avatar } from '@/components/ratings';
import { Collapse } from '@/components/collapse';

const WATCH: TimerApi = { load: getGameTimer };

const KEYS = Object.keys(TEAMS) as TeamKey[];

function PaidTag({ paid }: { paid: GamePaid | null }) {
  if (!paid) return null;
  if (paid === 'paid') return <span className="text-[10px] font-extrabold text-volt-300">✓ Paid</span>;
  if (paid === 'waived') return <span className="text-[10px] font-bold text-white/60">Free</span>;
  return <span className="text-[10px] font-extrabold text-sun-400">To pay</span>;
}

/**
 * Match day on the player's game card: tap the team you're in — by captain once the organiser has
 * named one, else by bib colour — then follow the day live: the table, each game's score and who
 * scored, cards and saves. It checks for new scores every 30 seconds while the screen is open.
 */
export function MatchDayBibs({ sessionId, live = false }: { sessionId: string; live?: boolean }) {
  const toast = useToast();
  const [lineup, setLineup] = useState<GameLineup | null>(null);
  const [saving, setSaving] = useState<TeamKey | null>(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  // A captain switching sides is asked first: the armband stays with the side they leave.
  const [switching, setSwitching] = useState<TeamKey | null>(null);

  useEffect(() => {
    const load = () => getGameLineup(sessionId).then(setLineup).catch(() => undefined);
    load();
    if (!live) return;
    // Scores come in from the organiser's and captains' phones: look again while it's being watched.
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [sessionId, live]);

  if (!lineup) return null;
  const teams = KEYS.slice(0, lineup.teamCount);

  const me = lineup.squad.find((p) => p.me);
  const amCaptain = !!me?.captain || !!me?.vice;
  const what = me?.captain ? 'captain' : 'vice-captain';

  /**
   * Their own side again does nothing: clearing it used to drop a captain's armband (and their
   * "Keep the score") without a word. A captain picking another side is asked first.
   */
  function choose(team: TeamKey) {
    if (lineup?.myTeam === team) return;
    if (amCaptain) setSwitching(team);
    else save(team);
  }

  async function save(next: TeamKey) {
    setSwitching(null);
    setSaving(next);
    try {
      setLineup(await pickBib(sessionId, next));
      toast.success(lineup?.captains[next] ? `Bib saved: ${teamName(next, lineup.captains, lineup.bibs)}` : `Bib saved: ${teamName(next, undefined, lineup?.bibs)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your team");
    } finally {
      setSaving(null);
    }
  }

  const byTeam = (t: TeamKey | null) => lineup.squad.filter((p) => p.team === t);
  const sidesNow = teams.filter((t) => byTeam(t).length);
  const noBib = byTeam(null);

  const myTeam = lineup.myTeam;
  // Games are already saved and they aren't on a side: they came late and pick once.
  const late = !myTeam && !!lineup.live?.games.length;
  return (
    <div className="mt-4 rounded-2xl bg-white/[0.07] p-3.5 space-y-3 text-white">
      <ConfirmDialog
        open={!!switching}
        variant="danger"
        title={`Stop being ${what}?`}
        message={`You're ${what} of ${myTeam ? teamName(myTeam, lineup.captains, lineup.bibs) : 'your side'} today. Moving to ${
          switching ? teamName(switching, lineup.captains, lineup.bibs) : 'another team'
        } means you stop being ${what} and can't keep the score. The organiser can pick you again.`}
        confirmLabel={`Move and stop being ${what}`}
        cancelLabel={`Stay ${what}`}
        onConfirm={() => switching && save(switching)}
        onCancel={() => setSwitching(null)}
      />
      {lineup.bibsOpen ? (
        <div>
          {late ? (
            <div className="mb-2">
              <p className="text-[13px] font-bold text-white">Came late? Pick the side you’re joining</p>
              <p className="mt-0.5 text-[12px] leading-snug text-white/70">The scores are in, so this is once: you stay on that side, and only the games from now count for you.</p>
            </div>
          ) : (
            <p className="text-[13px] font-bold text-white mb-2">{Object.keys(lineup.captains).length || lineup.bibs && Object.values(lineup.bibs).some((b) => b?.name) ? 'Which team are you in?' : 'Which bib are you in?'}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => {
              const mine = lineup.myTeam === t;
              return (
                <button
                  key={t}
                  onClick={() => choose(t)}
                  disabled={!!saving}
                  aria-pressed={mine}
                  className={`flex items-center gap-2 min-h-11 pl-2 pr-3.5 rounded-full text-[13px] font-bold transition-colors disabled:opacity-60 ${
                    mine ? 'bg-volt-400 text-ink' : 'bg-white/10 text-white border border-white/15 hover:border-white/40'
                  }`}
                >
                  {saving === t ? <BallSpinner /> : <span className="w-5 h-5 rounded-full" style={bibFill(t, lineup.bibs)} aria-hidden />}
                  {teamName(t, lineup.captains, lineup.bibs)}
                </button>
              );
            })}
          </div>
        </div>
      ) : lineup.live?.games.length ? null : (
        <p className="text-xs text-white/70">
          {lineup.bibsClosed ? 'Teams are set: the scores are in.' : 'Picking your team opens on match day.'}
        </p>
      )}

      {/* The clock, once whoever runs the day starts it */}
      {live && <GameTimer sessionId={sessionId} api={WATCH} watch />}


      {lineup.live && lineup.live.games.length > 0 && <Live live={lineup.live} captains={lineup.captains} bibs={lineup.bibs} myTeam={lineup.myTeam} />}


      {/* The teams fold into one line: the card stays short, and a tap shows everyone */}
      {lineup.squad.some((p) => p.team) && (
        <button
          type="button"
          onClick={() => setTeamsOpen((o) => !o)}
          aria-expanded={teamsOpen}
          aria-controls={`${sessionId}-teams`}
          className="press w-full min-h-12 flex items-center gap-2.5 -mx-1 px-1 rounded-xl text-left hover:bg-white/[0.06]"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-bold text-white">{teamsOpen ? 'Hide the teams' : 'See the teams'}</span>
            <span className="block text-[12px] font-semibold text-white/65 truncate tabular-nums">
              {sidesNow.length <= 2
                ? sidesNow.map((t) => `${teamName(t, lineup.captains, lineup.bibs)} ${byTeam(t).length}`).join(' · ')
                : `${sidesNow.length} teams · ${lineup.squad.filter((p) => p.team).length} players`}
            </span>
          </span>
          <span className="shrink-0 flex -space-x-1" aria-hidden>
            {sidesNow.map((t) => (
              <span key={t} className="w-3.5 h-3.5 rounded-full ring-2 ring-[#123a22]" style={bibFill(t, lineup.bibs)} />
            ))}
          </span>
          <svg className={`w-4 h-4 shrink-0 text-white/60 transition-transform duration-300 ${teamsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}
      {lineup.squad.some((p) => p.team) && (
        <Collapse open={teamsOpen} id={`${sessionId}-teams`}>
        <div className="space-y-2 pb-1">
          {teams
            .filter((t) => byTeam(t).length)
            .map((t) => (
              <div key={t}>
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-white/60 mb-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={bibFill(t, lineup.bibs)} aria-hidden />
                  {teamName(t, lineup.captains, lineup.bibs)} · {byTeam(t).length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {byTeam(t).map((p, i) => (
                    <span key={`${p.name}-${i}`} className="inline-flex items-center gap-1.5 bg-white/10 rounded-full pl-0.5 pr-2.5 py-0.5">
                      <Avatar name={p.name} photoKey={p.photoKey} className="w-6 h-6 text-[9px]" />
                      <span className={`text-xs ${p.me ? 'font-extrabold text-volt-300' : 'font-semibold text-white'}`}>{p.me ? 'You' : p.name}</span>
                      {p.captain && <span className="text-[10px] font-extrabold text-volt-300">(C)</span>}
                      {p.vice && <span className="text-[10px] font-extrabold text-volt-300">(VC)</span>}
                      <PaidTag paid={p.paid} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          {noBib.length > 0 && (
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/60 mb-1">No team yet · {noBib.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {noBib.map((p, i) => (
                  <span key={`${p.name}-${i}`} className="inline-flex items-center gap-1.5 bg-white/[0.06] rounded-full pl-0.5 pr-2.5 py-0.5">
                    <Avatar name={p.name} photoKey={p.photoKey} className="w-6 h-6 text-[9px]" />
                    <span className={`text-xs ${p.me ? 'font-extrabold text-volt-300' : 'font-semibold text-white/80'}`}>{p.me ? 'You' : p.short ?? p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        </Collapse>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { yellow: 'Yellow card', red: 'Red card', save: 'Save' };

/**
 * The day so far: the teams' table (your side marked), then each game newest first with its
 * score and who scored, then cards and saves. Team colour is always written beside the swatch.
 */
function Live({
  live,
  captains,
  bibs,
  myTeam,
}: {
  live: NonNullable<GameLineup['live']>;
  captains: GameLineup['captains'];
  bibs: GameLineup['bibs'];
  myTeam: TeamKey | null;
}) {
  const played = live.table.rows.filter((r) => r.p > 0);
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="flex items-center gap-2 text-[13px] font-bold text-white">
        <LiveDot className="bg-volt-400" />
        The day so far · {live.games.length} game{live.games.length === 1 ? '' : 's'}
      </p>

      <table className="w-full text-[13px] tabular-nums">
        <caption className="sr-only">Today’s table</caption>
        <thead>
          <tr className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/50">
            <th className="text-left font-extrabold pb-1">Team</th>
            <th className="w-7 text-center font-extrabold pb-1">P</th>
            <th className="w-6 text-center font-extrabold pb-1">W</th>
            <th className="w-6 text-center font-extrabold pb-1">D</th>
            <th className="w-6 text-center font-extrabold pb-1">L</th>
            <th className="w-10 text-right font-extrabold pb-1">{live.table.perGame ? 'Pts/G' : 'Pts'}</th>
          </tr>
        </thead>
        <tbody>
          {played.map((r) => (
            <tr key={r.team} className={r.team === myTeam ? 'text-volt-300' : 'text-white'}>
              <td className="py-1">
                <span className="flex items-center gap-1.5 min-w-0 font-bold">
                  <span className="w-2.5 h-2.5 shrink-0 rounded-sm" style={bibFill(r.team, bibs)} aria-hidden />
                  <span className="truncate">{teamName(r.team, captains, bibs)}</span>
                  {r.team === myTeam && <span className="text-[10px] font-extrabold">· you</span>}
                  {live.table.teamOfTheDay === r.team && <span aria-label="leading">🏆</span>}
                </span>
              </td>
              <td className="text-center">{r.p}</td>
              <td className="text-center">{r.w}</td>
              <td className="text-center">{r.d}</td>
              <td className="text-center">{r.l}</td>
              <td className="text-right font-display font-extrabold tabular-nums">{live.table.perGame ? (r.ppg ?? 0).toFixed(1) : r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ol className="space-y-1.5">
        {[...live.games].reverse().map((g, i) => {
          // Each goal with the scorer's face: "Ada (Tobi)", the one who set it up in brackets.
          const scorers = (team: TeamKey, right: boolean) => (
            <span className={`flex flex-col gap-1 ${right ? 'items-end' : 'items-start'}`}>
              {g.goals
                .filter((x) => x.team === team && x.scorer)
                .map((x, n) => (
                  <span key={n} className={`flex items-center gap-1 max-w-full ${right ? 'flex-row-reverse text-right' : ''}`}>
                    <Avatar name={x.scorer!} photoKey={x.scorerPhoto} className="w-5 h-5 text-[8px]" />
                    <span className="min-w-0 truncate">
                      {x.mine ? 'You' : x.scorer}
                      {x.assist && <span className="text-white/50"> ({x.assist})</span>}
                    </span>
                  </span>
                ))}
            </span>
          );
          return (
            <li key={g.id} className="rounded-xl bg-white/[0.06] px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/50">Game {live.games.length - i}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[14px] font-bold text-white">
                <span className="flex-1 min-w-0 truncate text-right">{teamName(g.teamA, captains, bibs)}</span>
                <span className="shrink-0 font-display text-[18px] font-extrabold tabular-nums">
                  {g.scoreA} – {g.scoreB}
                </span>
                <span className="flex-1 min-w-0 truncate">{teamName(g.teamB, captains, bibs)}</span>
              </p>
              {g.goals.some((x) => x.scorer) && (
                <div className="mt-1.5 grid grid-cols-2 gap-3 text-[11px] text-white/75">
                  {scorers(g.teamA, true)}
                  {scorers(g.teamB, false)}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {live.events.some((e) => e.name) && (
        <ul className="flex flex-wrap gap-1.5 text-[12px] text-white/75">
          {live.events
            .filter((e) => e.name)
            .map((e, n) => (
              <li key={n} className="inline-flex items-center gap-1.5 bg-white/[0.06] rounded-full pl-0.5 pr-2.5 py-0.5">
                <Avatar name={e.name!} photoKey={e.photoKey} className="w-5 h-5 text-[8px]" />
                <span>
                  {e.mine ? 'You' : e.name} · {KIND_LABEL[e.kind]}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
