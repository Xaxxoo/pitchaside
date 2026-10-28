'use client';

import { useId, useState } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { Avatar } from '@/components/ratings';
import { stagger } from '@/components/motion';
import { btnPrimary } from '@/components/buttons';
import type { Lineup, TeamKey } from '@/lib/api';
import { TEAMS, bibFill, bibOf, bibTint, teamName } from '@/lib/teams';
import { Swatch, shortName } from './teams-step';

type Member = Lineup['squad'][number];

/**
 * A goal for one side, on one screen: tap who scored, then (optional) who set it up, and the
 * button says what's saved ("Add goal: Emeka · 3–1"). Only that side's players. "Not sure who"
 * counts the goal without a name, so the score is never held up by it.
 */
export function ScorerSheet({
  team,
  against = null,
  lineup,
  onPick,
  onClose,
  allowUnnamed = true,
  scoreAfter,
}: {
  team: TeamKey;
  /** The other side in this game: an own goal is put in by one of theirs. */
  against?: TeamKey | null;
  lineup: Lineup;
  /** scorerId null: a goal nobody saw clearly. `ownGoal`: scorerId is the other side's player who put it in. */
  onPick: (goal: { scorerId: string | null; assistId: string | null; ownGoal?: boolean }) => void;
  onClose: () => void;
  /** Off when naming a goal already on the scoreboard. */
  allowUnnamed?: boolean;
  /** The score once this goal is in, e.g. "3–1", for the button. */
  scoreAfter?: string;
}) {
  const titleId = useId();
  const [scorer, setScorer] = useState<Member | null>(null);
  const [assist, setAssist] = useState<Member | null>(null);
  // An own goal: the list is the other side's players, and nobody set it up
  const [own, setOwn] = useState(false);
  const side = lineup.squad.filter((m) => m.team === (own && against ? against : team)).sort((a, b) => shortName(a).localeCompare(shortName(b)));
  const name = teamName(team, lineup.captains, lineup.bibs);

  const footer = (
    <div className="space-y-2">
      <button
        disabled={!scorer}
        onClick={() => scorer && onPick(own ? { scorerId: scorer.id, assistId: null, ownGoal: true } : { scorerId: scorer.id, assistId: assist?.id ?? null })}
        className={`${btnPrimary} w-full`}
      >
        {scorer
          ? `${own ? 'Add own goal' : 'Add goal'}: ${shortName(scorer)}${assist && !own ? ` (${shortName(assist)})` : ''}${scoreAfter ? ` · ${scoreAfter}` : ''}`
          : own
            ? 'Tap who put it in'
            : 'Tap who scored'}
      </button>
      {allowUnnamed && !scorer && !own && (
        <button
          onClick={() => onPick({ scorerId: null, assistId: null })}
          className="press w-full min-h-11 rounded-2xl text-[14px] font-bold text-gray-600 hover:text-ink"
        >
          Not sure who · just add the goal
        </button>
      )}
    </div>
  );

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left" footer={footer}>
      <SheetTitle
        id={titleId}
        title={own ? `Own goal for ${name}: who put it in?` : `Goal for ${name}: who scored?`}
        sub={own ? `Someone on ${against ? teamName(against, lineup.captains, lineup.bibs) : 'the other team'}. It isn’t their goal.` : 'Their goal goes on their record.'}
        onClose={onClose}
      />
      <ul className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Who scored">
        {side.map((m, i) => {
          const on = scorer?.id === m.id;
          return (
            <li key={m.id} className="animate-rise min-w-0" style={stagger(i, 25, 20)}>
              <button
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setScorer(on ? null : m);
                  if (assist?.id === m.id) setAssist(null);
                }}
                className={`press w-full flex flex-col items-center gap-1 min-h-[84px] px-1.5 py-2 rounded-2xl border-2 text-center transition-colors ${
                  on ? 'border-ink bg-volt-300 shadow-sticker' : 'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <Avatar name={`${m.firstName} ${m.lastName}`} photoKey={m.photoKey} className="w-9 h-9 text-[11px]" />
                <span className="w-full truncate text-[13px] font-bold text-ink">{shortName(m)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Quietly below the list: an own goal comes from the other side */}
      {against && (
        <button
          onClick={() => {
            setOwn(!own);
            setScorer(null);
            setAssist(null);
          }}
          className="press mt-3 min-h-11 px-1 text-[14px] font-bold text-pitch-700"
        >
          {own ? `← Back to ${name}’s players` : 'Own goal? Pick from the other team'}
        </button>
      )}

      {scorer && !own && side.length > 1 && (
        <section className="mt-5 animate-fade-in-up" aria-labelledby={`${titleId}-assist`}>
          <h3 id={`${titleId}-assist`} className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
            <Swatch team={team} bibs={lineup.bibs} />
            Who set it up? <span className="font-semibold text-gray-500">(optional)</span>
          </h3>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${titleId}-assist`}>
            {[null, ...side.filter((m) => m.id !== scorer.id)].map((m) => {
              const on = (assist?.id ?? null) === (m?.id ?? null);
              return (
                <button
                  key={m?.id ?? 'none'}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setAssist(m)}
                  className={`press inline-flex items-center gap-2 min-h-11 ${m ? 'pl-1' : 'pl-3.5'} pr-3.5 rounded-full border text-[13px] font-bold transition-colors ${
                    on ? 'border-ink bg-ink text-volt-300' : 'border-gray-200 bg-white text-ink hover:border-ink'
                  }`}
                >
                  {m && <Avatar name={`${m.firstName} ${m.lastName}`} photoKey={m.photoKey} className="w-8 h-8 text-[10px]" />}
                  {m ? shortName(m) : 'No assist'}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </Sheet>
  );
}
