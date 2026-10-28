'use client';

import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { BallSpinner } from '@/components/skeleton';
import { BibShirt } from '@/components/bib-shirt';
import { Avatar } from '@/components/ratings';
import { buzz, stagger } from '@/components/motion';
import type { Ballot, TeamKey, VoteCategory } from '@/lib/api';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';

export type Picks = Partial<Record<VoteCategory, string | string[]>>;
type Player = Ballot['squad'][number];
type Step = 'potm' | 'mate' | 'vii' | 'awards';
type Line = 'DEF' | 'MID' | 'ATT';
/** A Best VII spot: the keeper, an outfield spot (by index), or the sub. */
type Spot = 'gk' | number | 'sub';

const short = (p: Player) => `${p.nickname || p.firstName} ${p.lastName.charAt(0)}.`;
const initials = (p: Player) => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
const STEP_NAME: Record<Step, string> = { potm: 'POTM', mate: 'Your team', vii: 'Best VII', awards: 'Awards' };
const full = (p: Player) => `${p.firstName} ${p.lastName}`;

/**
 * The post-match ballot in short steps, one pick and one button each: Player of the Match; the best
 * on your own team; your Best VII of the Day (six starters and a sub, some from other teams); then
 * any of the awards, each optional. Everyone is grouped by side, your team first, with their photo.
 */
export function BallotSteps({
  ballot,
  me,
  firstName,
  picks,
  onPicks,
  onSubmit,
  busy,
  error,
}: {
  ballot: Ballot;
  me: string;
  firstName: string;
  picks: Picks;
  onPicks: (p: Picks) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const sheetId = useId();
  const [step, setStep] = useState<Step>('potm');
  const [awardOpen, setAwardOpen] = useState<VoteCategory | null>(null);

  const others = ballot.squad.filter((p) => p.id !== me);
  const myTeam = ballot.squad.find((p) => p.id === me)?.team ?? null;
  const keys = [...new Set(others.map((p) => p.team))].sort((x, y) =>
    x === myTeam ? -1 : y === myTeam ? 1 : x === null ? 1 : y === null ? -1 : x.localeCompare(y),
  );
  const sides = keys.map((key) => ({
    key,
    mine: !!key && key === myTeam,
    label: key ? (teamName(key, ballot.captains, ballot.bibs) === bibOf(key, ballot.bibs).label ? bibOf(key, ballot.bibs).label : `${bibOf(key, ballot.bibs).label} · ${teamName(key, ballot.captains, ballot.bibs)}`) : keys.length > 1 ? 'No team' : 'Who played',
    players: others.filter((p) => p.team === key),
  }));
  const byId = (id: unknown) => others.find((p) => p.id === id);
  const mates = myTeam && ballot.categories.some((c) => c.key === 'teammate') ? others.filter((p) => p.team === myTeam) : [];
  const steps: Step[] = ['potm', ...(mates.length ? (['mate'] as const) : []), ...(ballot.vii ? (['vii'] as const) : []), 'awards'];
  const at = steps.indexOf(step);

  /*
   * Best VII: a pitch in shape, Keeper + 2-1-2 and a sub. The keeper spot takes only someone who
   * was in goal today; with nobody to pick there it's six outfield spots, 2-2-2. Tap a spot, then
   * a player; the next empty spot is picked for you.
   */
  const keepers = (ballot.vii?.keepers ?? []).filter((id) => id !== me && byId(id));
  const hasKeeper = keepers.length > 0;
  const lines: Line[] = hasKeeper ? ['DEF', 'DEF', 'MID', 'ATT', 'ATT'] : ['DEF', 'DEF', 'MID', 'MID', 'ATT', 'ATT'];
  const keeper = hasKeeper && typeof picks.vii_gk === 'string' && keepers.includes(picks.vii_gk) ? picks.vii_gk : null;
  const raw = Array.isArray(picks.vii) ? picks.vii : [];
  // One entry per outfield spot, '' while empty
  const outfield = lines.map((_, i) => (raw[i] && byId(raw[i]) && raw[i] !== keeper ? raw[i] : ''));
  const starters = outfield.filter(Boolean);
  const sub = typeof picks.vii_sub === 'string' && byId(picks.vii_sub) && picks.vii_sub !== keeper && !starters.includes(picks.vii_sub) ? picks.vii_sub : null;
  const seven = [...(keeper ? [keeper] : []), ...starters, ...(sub ? [sub] : [])];
  const spots = (hasKeeper ? 1 : 0) + lines.length + 1;
  const firstEmpty = (k: string | null, of: string[], sb: string | null): Spot | null =>
    hasKeeper && !k ? 'gk' : of.findIndex((x) => !x) >= 0 ? of.findIndex((x) => !x) : !sb ? 'sub' : null;
  const [chosen, setChosen] = useState<Spot | null>(null);
  // The spot being filled: the one tapped, else the first empty one
  const spot: Spot | null = chosen !== null && (chosen === 'gk' ? hasKeeper && !keeper : chosen === 'sub' ? !sub : !outfield[chosen]) ? chosen : firstEmpty(keeper, outfield, sub);
  const fromElsewhere = seven.filter((id) => {
    const t = byId(id)?.team;
    return !!myTeam && !!t && t !== myTeam;
  }).length;
  const elsewhereAvailable = others.filter((p) => !!myTeam && p.team && p.team !== myTeam).length;
  const needElsewhere = ballot.vii ? Math.min(ballot.vii.minOtherTeams, elsewhereAvailable) : 0;
  const viiDone = !ballot.vii || (seven.length === spots && fromElsewhere >= needElsewhere);

  const awardKeys = ballot.awards.map((a) => a.key);
  const awardsPicked = awardKeys.filter((k) => typeof picks[k] === 'string' && byId(picks[k]));

  function togglePotm(id: string) {
    buzz(6);
    onPicks({ ...picks, potm: id });
  }
  function toggleMate(id: string) {
    buzz(6);
    onPicks({ ...picks, teammate: picks.teammate === id ? undefined : id });
  }
  /** The Best VII as the server takes it: keeper, outfield spots in order, sub. */
  const sevenPicks = (k: string | null, of: string[], sb: string | null): Picks => ({ ...picks, vii_gk: k ?? undefined, vii: of, vii_sub: sb ?? undefined });
  /** Take someone off their spot, and make that spot the one to fill next. */
  function takeOff(id: string) {
    buzz(6);
    if (id === keeper) {
      setChosen('gk');
      onPicks(sevenPicks(null, outfield, sub));
    } else if (id === sub) {
      setChosen('sub');
      onPicks(sevenPicks(keeper, outfield, null));
    } else {
      const i = outfield.indexOf(id);
      setChosen(i);
      onPicks(sevenPicks(keeper, outfield.map((x) => (x === id ? '' : x)), sub));
    }
  }
  function pickSeven(id: string) {
    if (!ballot.vii) return;
    if (seven.includes(id)) return takeOff(id);
    if (spot === null) return;
    buzz(6);
    let [k, of, sb] = [keeper, [...outfield], sub];
    if (spot === 'gk') k = id;
    else if (spot === 'sub') sb = id;
    else of[spot] = id;
    setChosen(null);
    onPicks(sevenPicks(k, of, sb));
  }

  const LINE_NAME: Record<Line, string> = { DEF: 'Defence', MID: 'Midfield', ATT: 'Attack' };
  const spotName = (x: Spot) => (x === 'gk' ? 'Keeper' : x === 'sub' ? 'Sub' : LINE_NAME[lines[x]]);
  const nextLabel = (to: Step) => (to === 'mate' ? 'Next: best on your team' : to === 'vii' ? 'Next: your Best VII' : 'Next: awards');

  /** A player as the ballot shows them: their face with a small bib in their side's colour, else the bib with their initials. */
  const face = (p: Player, size: 'lg' | 'sm' = 'lg') =>
    p.photoKey ? (
      <span className="relative inline-flex">
        <Avatar name={full(p)} photoKey={p.photoKey} className={size === 'lg' ? 'w-12 h-12 text-[13px]' : 'w-9 h-9 text-[11px]'} />
        <span className="absolute -bottom-1 -right-2 rounded-full bg-white p-0.5 shadow-card" aria-hidden>
          <BibShirt team={p.team} bibs={ballot.bibs} className={size === 'lg' ? 'w-5 h-5 block' : 'w-4 h-4 block'} />
        </span>
      </span>
    ) : (
      <BibShirt team={p.team} bibs={ballot.bibs} label={initials(p)} className={size === 'lg' ? 'w-12 h-12' : 'w-9 h-9'} />
    );

  /** One player to tap: their face (or bib) and name. `mark` shows when picked: a tick, or their Best VII spot. */
  const chip = (p: Player, selected: boolean, onTap: () => void, mark: string | null = null, disabled = false) => (
    <li key={p.id} className="min-w-0">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${p.nickname ? `${full(p)}, “${p.nickname}”` : full(p)}${p.team ? `, ${bibOf(p.team, ballot.bibs).label}` : ''}${mark && selected ? `, ${mark}` : ''}`}
        onClick={onTap}
        disabled={disabled && !selected}
        className={`press relative w-full flex flex-col items-center gap-1 min-h-[96px] px-1.5 pt-2.5 pb-2 rounded-2xl border-2 text-center transition-colors disabled:opacity-40 ${
          selected ? 'border-ink bg-volt-300 shadow-sticker' : 'border-gray-100 bg-white hover:border-gray-300'
        }`}
      >
        {face(p)}
        <span className="w-full truncate text-[13px] font-bold text-ink leading-tight">{short(p)}</span>
        {/* Missed some of their side's games: voters see it before they pick */}
        {p.of != null && p.of > 0 && p.played != null && p.played < p.of && (
          <span className="w-full truncate text-[11px] font-semibold text-gray-500 leading-tight tabular-nums">
            Played {p.played} of {p.of}
          </span>
        )}
        {selected && (
          <span className="absolute top-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-full bg-ink text-volt-300 text-[11px] font-extrabold leading-6 text-center animate-pop-in" aria-hidden>
            {mark ?? '✓'}
          </span>
        )}
      </button>
    </li>
  );

  const bySide = (render: (p: Player) => React.ReactNode, only?: (p: Player) => boolean, first?: (p: Player) => boolean) =>
    sides.map((side) => {
      const players = side.players.filter((p) => !only || only(p)).sort((a, b) => (first ? Number(first(b)) - Number(first(a)) : 0));
      if (!players.length) return null;
      return (
        <section key={side.key ?? 'all'} aria-label={side.label} className="mt-3.5">
          <h3 className="flex items-center gap-2 mb-1.5 text-[13px] font-bold text-gray-700">
            {side.key && <span className="w-3 h-3 rounded-sm shrink-0" style={bibFill(side.key as TeamKey, ballot.bibs)} aria-hidden />}
            {side.label}
            {side.mine && <span className="text-[11px] font-semibold text-gray-500">· your team</span>}
          </h3>
          <ul className="grid grid-cols-3 gap-2">{players.map(render)}</ul>
        </section>
      );
    });

  /** One spot on the Best VII pitch: the player in it (tap to take off), else an empty shirt to tap. */
  const spotButton = (x: Spot) => {
    const id = x === 'gk' ? keeper : x === 'sub' ? sub : outfield[x as number];
    const p = id ? byId(id) : undefined;
    const now = spot === x;
    return (
      <button
        key={String(x)}
        type="button"
        onClick={() => (p ? takeOff(p.id) : setChosen(x))}
        aria-pressed={now}
        aria-label={p ? `${spotName(x)}: ${full(p)}. Tap to take off` : `${spotName(x)}: empty${now ? ', picking now' : ''}`}
        className={`press w-[76px] min-h-[76px] flex flex-col items-center justify-center gap-1 rounded-2xl text-white ${now ? 'bg-white/10 ring-2 ring-volt-300' : ''}`}
      >
        {p ? <span className="animate-pop-in">{face(p)}</span> : <BibShirt empty label={x === 'gk' ? 'GK' : ''} className={`w-11 h-11 ${now ? 'text-volt-300' : 'text-white/60'}`} />}
        <span className={`max-w-full truncate px-1.5 rounded-md text-[11px] font-bold ${p ? 'bg-ink' : now ? 'text-volt-300' : 'text-white/70'}`}>{p ? short(p) : spotName(x)}</span>
      </button>
    );
  };

  let button: { label: string; disabled: boolean; onClick: () => void };
  if (step === 'potm') {
    button = {
      label: picks.potm ? nextLabel(steps[at + 1]) : 'Pick Player of the Match',
      disabled: !picks.potm,
      onClick: () => setStep(steps[at + 1]),
    };
  } else if (step === 'mate') {
    button = {
      label: picks.teammate ? nextLabel(steps[at + 1]) : 'Pick the best on your team',
      disabled: !picks.teammate,
      onClick: () => setStep(steps[at + 1]),
    };
  } else if (step === 'vii') {
    const left = spots - seven.length;
    button = {
      label: left > 0 ? `Pick ${left} more` : fromElsewhere < needElsewhere ? `Pick ${needElsewhere} from other teams` : nextLabel('awards'),
      disabled: !viiDone,
      // Sent in the shape the server takes: no keeper pick when there's no keeper spot
      onClick: () => {
        onPicks(sevenPicks(keeper, outfield, sub));
        setStep('awards');
      },
    };
  } else {
    button = {
      label: awardsPicked.length ? `Send my vote · ${awardsPicked.length} award${awardsPicked.length === 1 ? '' : 's'}` : 'Send my vote',
      disabled: busy,
      onClick: onSubmit,
    };
  }

  return (
    // Room at the bottom so the last lines never sit under the pinned button.
    <div className="mt-6 pb-28">
      {/* The numbered dots say which step this is; Back only when there's a step to go back to */}
      {at > 0 && (
        <button onClick={() => setStep(steps[at - 1])} className="press -ml-1 mb-1 h-11 px-1 inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-ink">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
      )}
      <p className="sr-only" aria-live="polite">
        Step {at + 1} of {steps.length}: {STEP_NAME[step]}
      </p>
      {/* Where they are in the vote: a numbered dot per step on one line, done ones ticked (and a
          tap back), the current one lit, labels centred under their dots on a single line */}
      <ol className="mt-1 mb-6 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Steps">
        {steps.map((s, i) => {
          const done = i < at;
          const now = i === at;
          const dot = (
            <span
              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-extrabold tabular-nums transition-colors ${
                done ? 'bg-ink text-volt-300' : now ? 'bg-volt-300 text-ink ring-2 ring-ink' : 'bg-white text-gray-400 border-2 border-gray-200'
              }`}
              aria-hidden
            >
              {done ? '✓' : i + 1}
            </span>
          );
          const label = (
            <span className={`whitespace-nowrap text-[12px] font-bold ${now ? 'text-ink' : done ? 'text-gray-600' : 'text-gray-400'}`}>
              {STEP_NAME[s]}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          );
          return (
            <li key={s} aria-current={now ? 'step' : undefined} className="relative flex flex-col items-center gap-1.5 min-w-0">
              {/* The line to the next dot: ink once this step is done */}
              {i < steps.length - 1 && (
                <span className={`absolute top-4 left-1/2 w-full h-0.5 -translate-y-1/2 ${done ? 'bg-ink' : 'bg-gray-200'}`} aria-hidden />
              )}
              {done ? (
                <button type="button" onClick={() => setStep(s)} className="press flex flex-col items-center gap-1.5 min-h-11" aria-label={`Back to ${STEP_NAME[s]}`}>
                  {dot}
                  {label}
                </button>
              ) : (
                <>
                  {dot}
                  {label}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {step === 'potm' && (
        <>
          <h2 className="font-display text-2xl font-extrabold text-ink">Player of the Match</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Hey <span className="font-bold text-ink">{firstName}</span>, who was best on the pitch? One pick.
          </p>
          <div role="radiogroup" aria-label="Player of the Match">
            {bySide((p) => chip(p, picks.potm === p.id, () => togglePotm(p.id)))}
          </div>
        </>
      )}

      {step === 'mate' && myTeam && (
        <>
          <h2 id="best-mate" className="font-display text-2xl font-extrabold text-ink">
            Best on your team
          </h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Who was the best of your {teamName(myTeam, ballot.captains, ballot.bibs)} teammates? One pick, and it can’t be you.
          </p>
          <ul className="mt-3.5 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="best-mate">
            {mates.map((p) => chip(p, picks.teammate === p.id, () => toggleMate(p.id)))}
          </ul>
        </>
      )}

      {step === 'vii' && ballot.vii && (
        <>
          <h2 className="font-display text-2xl font-extrabold text-ink">Your Best VII</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            {hasKeeper ? 'A keeper, five outfield and a sub.' : 'Six outfield players and a sub.'}
            {needElsewhere > 0 && ` At least ${needElsewhere} from other teams.`}
          </p>
          {/* The seven on a pitch in shape, attack at the top: tap a spot to fill it, a face to take them off */}
          <div className="relative mt-3 rounded-3xl bg-pitch-700 turf-stripes border-[3px] border-ink overflow-hidden px-2 pt-3 pb-3">
            <span className="absolute left-1/2 -top-10 w-20 h-20 -ml-10 rounded-full border-2 border-white/25" aria-hidden />
            <span className="absolute left-1/2 bottom-0 w-2/5 h-12 -translate-x-1/2 border-2 border-b-0 border-white/25" aria-hidden />
            <ol className="relative space-y-1" aria-label="Your Best VII">
              {(['ATT', 'MID', 'DEF'] as Line[]).map((line) => (
                <li key={line} className="flex justify-center gap-1">
                  {lines.map((l, i) => (l === line ? spotButton(i) : null))}
                </li>
              ))}
              {hasKeeper && (
                <li className="flex justify-center">
                  {spotButton('gk')}
                </li>
              )}
            </ol>
            <div className="relative mt-2 flex items-center gap-2 rounded-2xl bg-ink/40 px-2 py-1.5">
              <span className="shrink-0 text-[11px] font-extrabold text-white/80">SUB</span>
              <button
                onClick={() => (sub ? takeOff(sub) : setChosen('sub'))}
                aria-label={sub ? `Sub: ${full(byId(sub)!)}. Tap to take off` : `Sub: empty${spot === 'sub' ? ', picking now' : ''}`}
                aria-pressed={spot === 'sub'}
                className={`press flex-1 min-h-11 flex items-center gap-2 rounded-xl px-1 text-left text-white ${spot === 'sub' ? 'ring-2 ring-volt-300' : ''}`}
              >
                {sub ? (
                  <>
                    {face(byId(sub)!, 'sm')}
                    <span className="truncate text-[13px] font-bold">{short(byId(sub)!)}</span>
                  </>
                ) : (
                  <>
                    <BibShirt empty label="7" className="w-9 h-9 text-white/60" />
                    <span className={`text-[12px] font-bold ${spot === 'sub' ? 'text-volt-300' : 'text-white/60'}`}>{spot === 'sub' ? 'Pick your sub below' : 'Tap to pick your sub'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[13px] font-semibold text-gray-600 tabular-nums truncate" aria-live="polite">
            {seven.length} of {spots} picked
            {needElsewhere > 0 && (
              <span className={fromElsewhere >= needElsewhere ? 'text-pitch-700' : 'text-amber-700'}>
                {' '}
                · {fromElsewhere} from other teams{fromElsewhere < needElsewhere ? ` (${needElsewhere} needed)` : ''}
              </span>
            )}
          </p>
          {spot !== null && (
            <p className="mt-3 text-[15px] font-extrabold text-ink truncate" aria-live="polite">
              {spot === 'gk'
                ? ballot.vii.keepersFrom === 'goal'
                  ? 'Keeper: who was in goal today'
                  : 'Keeper: who played in goal today'
                : `${spotName(spot)}: pick a player`}
            </p>
          )}
          {bySide(
            (p) => {
              const i = outfield.indexOf(p.id);
              const mark = p.id === keeper ? 'GK' : p.id === sub ? 'Sub' : i >= 0 ? LINE_NAME[lines[i]].slice(0, 3).toUpperCase() : null;
              return chip(p, mark !== null, () => pickSeven(p.id), mark, spot === null);
            },
            // The keeper spot lists only those in goal; outfield spots list everyone, that line first
            spot === 'gk' ? (p) => keepers.includes(p.id) || seven.includes(p.id) : undefined,
            typeof spot === 'number' ? (p) => p.position === lines[spot] : undefined,
          )}
        </>
      )}

      {step === 'awards' && (
        <>
          <h2 className="font-display text-2xl font-extrabold text-ink">Awards</h2>
          <p className="text-sm text-gray-600 mt-0.5">Optional. Pick any you saw clearly and skip the rest. An award counts once 3 people pick the same player.</p>
          <p className="mt-3 text-[13px] font-semibold text-gray-600 tabular-nums" aria-live="polite">
            {awardsPicked.length ? `${awardsPicked.length} picked` : 'None picked yet'}
          </p>
          <ul className="mt-2 bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
            {ballot.awards.map((a, i) => {
              const who = typeof picks[a.key] === 'string' ? byId(picks[a.key]) : undefined;
              const full3 = awardsPicked.length >= ballot.maxAwards && !who;
              return (
                <li key={a.key} className="animate-rise" style={stagger(i, 25, 0)}>
                  <button
                    onClick={() => setAwardOpen(a.key)}
                    disabled={full3}
                    className="press w-full flex items-center gap-3 px-4 min-h-16 py-2.5 text-left hover:bg-chalk/70 disabled:hover:bg-transparent disabled:cursor-default"
                  >
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[15px] font-bold ${full3 ? 'text-gray-400' : 'text-ink'}`}>{a.title}</span>
                      <span className="block text-[12px] leading-snug text-gray-500">{a.hint}</span>
                    </span>
                    {who ? (
                      <span className="shrink-0 inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full bg-volt-300 text-[13px] font-bold text-ink">
                        <Avatar name={full(who)} photoKey={who.photoKey} className="w-6 h-6 text-[9px]" />
                        {short(who)}
                      </span>
                    ) : (
                      <span className={`shrink-0 text-[13px] font-bold ${full3 ? 'text-gray-300' : 'text-pitch-700'}`}>Pick</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-4 text-xs text-gray-500">You can&apos;t pick yourself. The winners show when the vote closes.</p>
      {error && <div className="mt-3 bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      <div className="fixed bottom-0 inset-x-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-white via-white to-transparent">
        <button
          onClick={() => {
            button.onClick();
            if (step !== 'awards') window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          disabled={button.disabled}
          className="w-full max-w-md mx-auto flex items-center justify-center gap-2 h-14 bg-ink text-volt-300 text-[15px] font-bold rounded-2xl shadow-lift hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {busy && step === 'awards' && <BallSpinner />}
          {button.label}
        </button>
      </div>

      {awardOpen && (() => {
        const a = ballot.awards.find((x) => x.key === awardOpen)!;
        const current = picks[awardOpen];
        return (
          <Sheet titleId={sheetId} onClose={() => setAwardOpen(null)} align="left">
            <SheetTitle id={sheetId} title={a.title} sub={a.hint} onClose={() => setAwardOpen(null)} />
            <div className="pb-1">
              {bySide((p) =>
                chip(p, current === p.id, () => {
                  buzz(6);
                  onPicks({ ...picks, [awardOpen]: current === p.id ? undefined : p.id });
                  setAwardOpen(null);
                }),
              )}
            </div>
            {current && (
              <button
                onClick={() => {
                  onPicks({ ...picks, [awardOpen]: undefined });
                  setAwardOpen(null);
                }}
                className="press mt-4 w-full min-h-12 rounded-2xl border border-gray-300 text-[15px] font-bold text-ink hover:border-ink"
              >
                Clear this award
              </button>
            )}
          </Sheet>
        );
      })()}
    </div>
  );
}
