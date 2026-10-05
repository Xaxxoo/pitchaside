'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Avatar } from '@/components/ratings';
import { BallSpinner } from '@/components/skeleton';
import {
  addMatchGame,
  balanceLineup,
  deleteMatchGame,
  getLineup,
  saveLineup,
  type Lineup,
  type TeamKey,
} from '@/lib/api';

/** Bib colours for each side. */
export const TEAMS: Record<TeamKey, { name: string; swatch: string; soft: string; text: string }> = {
  A: { name: 'Orange', swatch: 'bg-kit-500', soft: 'bg-kit-400/15', text: 'text-white' },
  B: { name: 'Yellow', swatch: 'bg-sun-400', soft: 'bg-sun-400/20', text: 'text-ink' },
  C: { name: 'Blue', swatch: 'bg-[#3b82f6]', soft: 'bg-[#3b82f6]/10', text: 'text-white' },
  D: { name: 'White', swatch: 'bg-white border border-ink', soft: 'bg-chalk', text: 'text-ink' },
  E: { name: 'Green', swatch: 'bg-pitch-500', soft: 'bg-pitch-500/10', text: 'text-white' },
  F: { name: 'Red', swatch: 'bg-[#e5484d]', soft: 'bg-[#e5484d]/10', text: 'text-white' },
};
const KEYS = Object.keys(TEAMS) as TeamKey[];

function Swatch({ team, className = 'w-3 h-3 rounded-sm' }: { team: TeamKey; className?: string }) {
  return <span className={`${className} ${TEAMS[team].swatch} inline-block shrink-0`} aria-hidden />;
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="w-8 h-8 rounded-full bg-white/10 text-white font-bold hover:bg-white/20" aria-label={`${label} minus one`}>
        −
      </button>
      <span className="font-display text-4xl font-extrabold text-white tabular-nums w-10 text-center">{value}</span>
      <button onClick={() => onChange(Math.min(99, value + 1))} className="w-8 h-8 rounded-full bg-white/10 text-white font-bold hover:bg-white/20" aria-label={`${label} plus one`}>
        +
      </button>
    </div>
  );
}

function TeamPicker({ teams, value, onChange, exclude }: { teams: TeamKey[]; value: TeamKey; onChange: (t: TeamKey) => void; exclude?: TeamKey }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {teams.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          disabled={t === exclude}
          className={`w-7 h-7 rounded-full ${TEAMS[t].swatch} transition-transform disabled:opacity-20 ${
            value === t ? 'ring-2 ring-offset-2 ring-offset-ink ring-volt-400 scale-110' : ''
          }`}
          aria-label={TEAMS[t].name}
          aria-pressed={value === t}
        />
      ))}
    </div>
  );
}

/** Match day: split the squad into 2–6 coloured sides, record each short game, crown the Team of the Day. */
export function LineupCard({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ teamA: TeamKey; teamB: TeamKey; scoreA: number; scoreB: number }>({
    teamA: 'A',
    teamB: 'B',
    scoreA: 0,
    scoreB: 0,
  });

  const load = useCallback(() => getLineup(sessionId).then(setLineup).catch(() => {}), [sessionId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!lineup || lineup.squad.length === 0) return null;
  const teams = KEYS.slice(0, lineup.teamCount);

  async function run(key: string, fn: () => Promise<Lineup>, ok?: string) {
    setBusy(key);
    try {
      setLineup(await fn());
      if (ok) toast.success(ok);
    } catch (err: any) {
      toast.error(err.message || 'Could not save');
    } finally {
      setBusy(null);
    }
  }

  const assign = (playerId: string, team: TeamKey | null) => {
    setPicking(null);
    run(playerId, () => saveLineup(sessionId, { teams: { [playerId]: team } }));
  };

  const avg = (team: TeamKey) => {
    const rated = lineup.squad.filter((m) => m.team === team && m.ovr != null);
    return rated.length ? Math.round(rated.reduce((s, m) => s + (m.ovr ?? 0), 0) / rated.length) : null;
  };
  const unpicked = lineup.squad.filter((m) => !m.team);

  const Chip = ({ m }: { m: Lineup['squad'][number] }) => (
    <div className="rounded-xl bg-white border border-gray-100">
      <button
        onClick={() => setPicking(picking === m.id ? null : m.id)}
        disabled={busy === m.id}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        <Avatar name={`${m.firstName} ${m.lastName}`} className="w-7 h-7 text-[10px]" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{m.firstName}</span>
        {m.paid === 'paid' && <span className="text-[10px] font-extrabold text-pitch-600" title="Paid for this game">✓</span>}
        {m.paid === 'unpaid' && (
          <span className="w-2 h-2 rounded-full bg-kit-500 shrink-0" title="Hasn't paid for this game">
            <span className="sr-only">Hasn't paid</span>
          </span>
        )}
        {busy === m.id ? (
          <BallSpinner className="w-3.5 h-3.5" />
        ) : (
          m.ovr != null && <span className="text-[10px] font-extrabold text-gray-500 tabular-nums">{m.ovr}</span>
        )}
      </button>
      {picking === m.id && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
          {teams.map((t) => (
            <button
              key={t}
              onClick={() => assign(m.id, t)}
              className={`w-7 h-7 rounded-full ${TEAMS[t].swatch} ${m.team === t ? 'ring-2 ring-offset-1 ring-ink' : ''}`}
              aria-label={`Move to ${TEAMS[t].name}`}
            />
          ))}
          {m.team && (
            <button onClick={() => assign(m.id, null)} className="text-[11px] font-semibold text-gray-500 hover:text-ink ml-1">
              Unpick
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <section className="mb-6 bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
      <div className="bg-ink turf-stripes px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Match day</p>
            <p className="font-display text-lg font-extrabold text-white leading-tight">Teams on the day</p>
          </div>
          <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1" role="radiogroup" aria-label="Number of teams">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => run('count', () => saveLineup(sessionId, { teamCount: n }))}
                disabled={!!busy}
                className={`w-8 h-8 rounded-lg text-sm font-extrabold transition-colors ${
                  lineup.teamCount === n ? 'bg-volt-400 text-ink' : 'text-white/70 hover:text-white'
                }`}
                aria-pressed={lineup.teamCount === n}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-3">
          <p className="text-xs text-white/60">Tap a player to move them. Every game counts towards their <span className="whitespace-nowrap">W-D-L</span>.</p>
          <button
            onClick={() => run('balance', () => balanceLineup(sessionId), `Split into ${lineup.teamCount} balanced teams`)}
            disabled={!!busy}
            className="shrink-0 px-3 py-2 text-xs font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy === 'balance' ? <BallSpinner className="w-3.5 h-3.5" /> : '✦'} Balance by rating
          </button>
        </div>
      </div>

      {/* Sides */}
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {teams.map((t) => {
            const members = lineup.squad.filter((m) => m.team === t);
            return (
              <div key={t} className={`rounded-2xl p-2.5 ${TEAMS[t].soft}`}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-extrabold text-ink">
                    <Swatch team={t} />
                    {TEAMS[t].name} · {members.length}
                    {lineup.teamOfTheDay === t && <span title="Team of the Day">🏆</span>}
                  </span>
                  {avg(t) != null && <span className="text-[10px] font-bold text-gray-500">avg {avg(t)}</span>}
                </div>
                <div className="space-y-1.5">
                  {members.map((m) => (
                    <Chip key={m.id} m={m} />
                  ))}
                  {members.length === 0 && <p className="text-xs text-gray-500 px-1 py-2">Nobody yet</p>}
                </div>
              </div>
            );
          })}
        </div>
        {unpicked.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5">Not picked ({unpicked.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {unpicked.map((m) => (
                <Chip key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}
        {lineup.squad.some((m) => m.paid === 'unpaid') && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-full bg-kit-500" aria-hidden /> Hasn’t paid for this game
          </p>
        )}
      </div>

      {/* Games */}
      <div className="border-t border-gray-100 p-4">
        <h3 className="text-base font-extrabold text-ink mb-3">Games</h3>

        <div className="rounded-2xl bg-ink turf-stripes p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            <div className="flex flex-col items-center gap-2">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${TEAMS[draft.teamA].swatch} ${TEAMS[draft.teamA].text}`}>
                {TEAMS[draft.teamA].name}
              </span>
              <Stepper label={TEAMS[draft.teamA].name} value={draft.scoreA} onChange={(v) => setDraft({ ...draft, scoreA: v })} />
              <TeamPicker teams={teams} value={draft.teamA} exclude={draft.teamB} onChange={(t) => setDraft({ ...draft, teamA: t })} />
            </div>
            <span className="font-display text-2xl font-extrabold text-white/30 mt-9">–</span>
            <div className="flex flex-col items-center gap-2">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${TEAMS[draft.teamB].swatch} ${TEAMS[draft.teamB].text}`}>
                {TEAMS[draft.teamB].name}
              </span>
              <Stepper label={TEAMS[draft.teamB].name} value={draft.scoreB} onChange={(v) => setDraft({ ...draft, scoreB: v })} />
              <TeamPicker teams={teams} value={draft.teamB} exclude={draft.teamA} onChange={(t) => setDraft({ ...draft, teamB: t })} />
            </div>
          </div>
          <button
            onClick={() =>
              run('game', async () => {
                const l = await addMatchGame(sessionId, draft);
                setDraft({ ...draft, scoreA: 0, scoreB: 0 });
                return l;
              }, 'Game recorded')
            }
            disabled={!!busy || !teams.includes(draft.teamA) || !teams.includes(draft.teamB) || draft.teamA === draft.teamB}
            className="mt-4 w-full py-2.5 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy === 'game' && <BallSpinner />}
            Add game
          </button>
        </div>

        {lineup.games.length > 0 && (
          <ol className="mt-3 space-y-1.5">
            {lineup.games.map((g, i) => (
              <li key={g.id} className="flex items-center gap-2 rounded-xl bg-chalk px-3 py-2">
                <span className="text-[10px] font-extrabold text-gray-500 w-5 tabular-nums">{i + 1}</span>
                <span className="flex-1 flex items-center justify-end gap-1.5 text-sm font-bold text-ink">
                  {TEAMS[g.teamA].name}
                  <Swatch team={g.teamA} />
                </span>
                <span className="font-display text-base font-extrabold text-ink tabular-nums px-1">
                  {g.scoreA}–{g.scoreB}
                </span>
                <span className="flex-1 flex items-center gap-1.5 text-sm font-bold text-ink">
                  <Swatch team={g.teamB} />
                  {TEAMS[g.teamB].name}
                </span>
                <button
                  onClick={() => run(`del-${g.id}`, () => deleteMatchGame(sessionId, g.id))}
                  disabled={!!busy}
                  className="text-gray-300 hover:text-kit-600 px-1"
                  aria-label="Delete game"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}

        {lineup.games.length > 0 && (
          <div className="mt-4 rounded-2xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-[1fr_repeat(5,28px)_36px] gap-1 px-3 py-2 bg-gray-50 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
              <span>Today</span>
              <span className="text-center">P</span>
              <span className="text-center">W</span>
              <span className="text-center">D</span>
              <span className="text-center">L</span>
              <span className="text-center">GD</span>
              <span className="text-right">Pts</span>
            </div>
            {lineup.standings.map((r) => (
              <div
                key={r.team}
                className={`grid grid-cols-[1fr_repeat(5,28px)_36px] gap-1 items-center px-3 py-2 border-t border-gray-100 text-sm ${
                  lineup.teamOfTheDay === r.team ? 'bg-volt-100' : ''
                }`}
              >
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Swatch team={r.team} />
                  {TEAMS[r.team].name}
                  {lineup.teamOfTheDay === r.team && <span className="text-[10px] font-extrabold uppercase tracking-wider text-pitch-700">Team of the Day</span>}
                </span>
                {[r.p, r.w, r.d, r.l].map((v, i) => (
                  <span key={i} className="text-center text-gray-500 tabular-nums">{v}</span>
                ))}
                <span className="text-center text-gray-500 tabular-nums">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</span>
                <span className="text-right font-display font-extrabold text-ink tabular-nums">{r.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
