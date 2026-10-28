'use client';

import { Avatar } from '@/components/ratings';
import { Callout } from '@/components/callout';
import { useId, useState, type CSSProperties } from 'react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { WhatsAppGlyph } from '@/components/game/group-message-sheet';
import { buzz, stagger } from '@/components/motion';
import { endGame, formatCurrency, type ISessionWithDetails } from '@/lib/api';
import { gameTally, playerState, leftToPay } from '@/lib/game-player';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Full time, in one sheet: who came (everyone who said they were in, ticked; untick no-shows),
 * what that leaves to collect, then the game ends and only the players who came get the vote link.
 */
export function EndGameSheet({
  session,
  coveredByDues,
  onEnded,
  onSendToGroup,
  onClose,
}: {
  session: ISessionWithDetails;
  coveredByDues: boolean;
  onEnded: (s: ISessionWithDetails) => void;
  /** Full time: the vote link for the group chat too (the players who came already have it). */
  onSendToGroup?: (s: ISessionWithDetails) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  // Anyone already marked as not coming stays off; everyone else starts ticked.
  const squad = (session.payments ?? []).filter((p) => p.attendance !== 'no_show');
  const [away, setAway] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ISessionWithDetails | null>(null);

  const came = squad.filter((p) => !away.has(p.id));
  const stillToPay = came.filter((p) => playerState(p, coveredByDues).owes);
  const owed = stillToPay.reduce((n, p) => n + leftToPay(p), 0);
  const fullName = (p: (typeof squad)[number]) => (p.player ? `${p.player.firstName} ${p.player.lastName}` : 'Player');
  const name = (p: (typeof squad)[number]) => p.player?.nickname || fullName(p);

  function toggle(id: string) {
    buzz(8);
    setAway((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const ended = await endGame(session.id, [...away]);
      buzz([12, 40, 18]);
      setDone(ended);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const tally = gameTally(done.payments ?? [], coveredByDues);
    return (
      <Sheet
        titleId={titleId}
        onClose={() => onEnded(done)}
        footer={
          onSendToGroup && tally.playing >= 2 ? (
            <div className="flex gap-2">
              <button onClick={() => onEnded(done)} className={`${btnSecondary} shrink-0 w-[36%]`}>
                Done
              </button>
              <button onClick={() => onSendToGroup(done)} className={`${btnPrimary} flex-1`}>
                <WhatsAppGlyph className="w-5 h-5" />
                Send to the group
              </button>
            </div>
          ) : (
            <button onClick={() => onEnded(done)} className={`${btnPrimary} w-full`}>
              Done
            </button>
          )
        }
      >
        <div className="flex flex-col items-center text-center pt-2">
          <svg viewBox="0 0 64 64" className="w-20 h-20" aria-hidden>
            <circle cx="32" cy="32" r="29" fill="var(--color-volt-300)" className="animate-pop-in" />
            <path
              d="M19 33 L28 42 L46 23"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="44"
              className="animate-ring-draw"
              style={{ '--ring-from': 44, animationDelay: '180ms' } as CSSProperties}
            />
          </svg>
          <h2 id={titleId} className="mt-3 font-display text-2xl font-extrabold text-ink animate-rise" style={stagger(1, 80, 120)}>
            Game ended
          </h2>
          <ul className="mt-4 w-full space-y-2 text-left">
            {[
              tally.playing > 0 && `Vote link sent to the ${plural(tally.playing, 'player')} who came`,
              tally.toPay > 0 ? `${formatCurrency(tally.toPayAmount)} still to collect from ${plural(tally.toPay, 'player')}` : 'Everyone who came has paid',
              tally.noShows > 0 && `${plural(tally.noShows, 'player')} didn’t come: nothing to pay`,
            ]
              .filter(Boolean)
              .map((line, i) => (
                <li
                  key={String(line)}
                  className="animate-rise flex items-start gap-2.5 rounded-2xl bg-chalk px-3.5 py-3 text-[15px] font-semibold text-ink"
                  style={stagger(i + 2, 90, 160)}
                >
                  <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-pitch-600" aria-hidden />
                  {line}
                </li>
              ))}
          </ul>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        <div className="space-y-2.5">
          <p className="text-[13px] leading-snug text-gray-700" aria-live="polite">
            <span className="font-bold text-ink tabular-nums">{came.length} came</span>
            {away.size > 0 && <span className="tabular-nums">, {away.size} didn’t</span>}
            {'. '}
            {coveredByDues
              ? 'The game is covered by dues.'
              : stillToPay.length
                ? `${formatCurrency(owed)} still to collect from ${plural(stillToPay.length, 'player')}.`
                : 'Everyone who came has paid.'}
          </p>
          {error && (
            <Callout tone="warn" live>
              {error}
            </Callout>
          )}
          <button onClick={finish} disabled={busy} className={`${btnPrimary} w-full disabled:opacity-50`}>
            {busy ? 'Ending…' : came.length ? `End game · vote link to ${came.length}` : 'End game'}
          </button>
        </div>
      }
    >
      <SheetTitle id={titleId} title="Who came?" sub="Untick anyone who said they were in and didn’t show. They won’t owe anything." onClose={onClose} />
      {squad.length === 0 ? (
        <Callout tone="info" className="mt-5" title="No one said they were in">
          There’s nothing to settle. Ending the game closes it.
        </Callout>
      ) : (
        <ul className="mt-4 -mx-1 space-y-1.5" aria-label="Players who said they were in">
          {squad.map((p, i) => {
            const on = !away.has(p.id);
            const state = playerState(p, coveredByDues);
            return (
              <li key={p.id} className="animate-rise" style={stagger(i, 25, 60)}>
                <button
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  className={`press w-full flex items-center gap-3 min-h-14 px-3 py-2 rounded-2xl text-left transition-colors duration-200 ${
                    on ? 'bg-white border border-gray-100' : 'bg-chalk border border-transparent'
                  }`}
                >
                  <span className={`shrink-0 transition-[filter,opacity] duration-200 ${on ? '' : 'grayscale opacity-50'}`} aria-hidden>
                    <Avatar name={fullName(p)} photoKey={p.player?.photoKey} className="w-10 h-10 text-sm" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[15px] font-bold transition-colors ${on ? 'text-ink' : 'text-gray-500 line-through decoration-gray-400'}`}>{name(p)}</span>
                    <span className="block text-[13px] text-gray-500">{on ? state.label : 'Didn’t come · nothing to pay'}</span>
                  </span>
                  <span
                    className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-colors duration-200 ${on ? 'bg-ink text-volt-300' : 'border-2 border-gray-300'}`}
                    aria-hidden
                  >
                    {on && (
                      <svg key="tick" className="w-4 h-4 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
