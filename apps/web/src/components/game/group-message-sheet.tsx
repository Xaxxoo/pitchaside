'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { SessionStatus } from '@pitchaside/shared';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { BallSpinner } from '@/components/skeleton';
import { buzz } from '@/components/motion';
import { useToast } from '@/components/toast';
import { getSessionVoting, type ISessionWithDetails, type SessionVoting } from '@/lib/api';
import { closeWords } from '@/components/ratings';
import { gameLink, groupInviteMessage, groupVoteMessage, openWhatsApp } from '@/lib/whatsapp';

/** What's being sent to the group: the link to say you're in (first call or last), or the vote (at full time or before it closes). */
export type SendKind = 'invite' | 'lastcall' | 'vote' | 'voteclosing';
export const SEND_KINDS: SendKind[] = ['invite', 'lastcall', 'vote', 'voteclosing'];

type Ready = { text: string; title: string; sub: string };
type Blocked = { title: string; sub: string; switchTo?: SendKind; switchLabel?: string };

/** "Saturday", or "today" / "tomorrow" when it's that close. */
function dayWord(date: string) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'long' });
}

/**
 * The message for the group chat, written and ready. Apps can't post in a WhatsApp group, so
 * this is the next best thing: see exactly what goes, one tap opens WhatsApp with it typed, pick
 * the group, send. Opened from the Friday 5pm and match-day 6:30am notices, at full time, and from
 * the notice before the vote closes.
 *
 * Says so plainly when there's nothing to send: the game was called off, the vote isn't open, or
 * everyone has voted already.
 */
export function GroupMessageSheet({
  kind: first,
  session,
  link,
  inCount,
  places,
  when,
  justEnded,
  onClose,
}: {
  kind: SendKind;
  session: ISessionWithDetails;
  /** The group's link to say you're in (null while it loads, or if it didn't). */
  link: string | null;
  inCount: number;
  places?: number;
  /** "Sat 31 Oct · 8am". */
  when: string;
  /** Opened straight after End game: how many got the vote link already. */
  justEnded?: { came: number };
  onClose: () => void;
}) {
  const titleId = useId();
  const toast = useToast();
  const [kind, setKind] = useState<SendKind>(first);
  const isVote = kind === 'vote' || kind === 'voteclosing';
  const [voting, setVoting] = useState<SessionVoting | null | 'failed'>(null);
  const [step, setStep] = useState<'ready' | 'opened' | 'back'>('ready');
  const [copied, setCopied] = useState(false);
  const left = useRef(false);

  const loadVoting = useCallback(() => {
    setVoting(null);
    getSessionVoting(session.id)
      .then(setVoting)
      .catch(() => setVoting('failed'));
  }, [session.id]);
  useEffect(() => {
    if (isVote) loadVoting();
  }, [isVote, loadVoting]);

  // Back from WhatsApp: say it's done rather than leave the same buttons up.
  useEffect(() => {
    if (step !== 'opened') return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') left.current = true;
      else if (left.current) setStep('back');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [step]);

  const group = session.group?.name ?? 'Your group';
  const day = dayWord(session.date);
  let ready: Ready | null = null;
  let blocked: Blocked | null = null;
  let loading = false;
  let failed: (() => void) | null = null;

  if (!isVote) {
    if (session.status === SessionStatus.CANCELLED) blocked = { title: 'This game was called off', sub: 'There’s nothing to send to the group for it.' };
    else if (session.status === SessionStatus.COMPLETED)
      blocked = { title: 'This game has been played', sub: 'The link to say you’re in has done its job.', switchTo: 'vote', switchLabel: 'Send the vote link instead' };
    else if (!link) failed = () => window.location.reload();
    else {
      const full = !!places && inCount >= places;
      const placesLeft = places ? Math.max(0, places - inCount) : null;
      ready = {
        text: groupInviteMessage({ groupName: group, when, where: session.group?.location, inCount, places, link: gameLink(link, session.id), last: kind === 'lastcall' }),
        title: kind === 'lastcall' ? `Last call for ${day === 'today' || day === 'tomorrow' ? `${day}’s game` : day}` : `Send ${day}’s link to the group`,
        sub: full
          ? `It’s full (${places} of ${places}), so it asks anyone else to go on the waiting list.`
          : placesLeft !== null
            ? `${inCount} of ${places} in, ${placesLeft} place${placesLeft === 1 ? '' : 's'} left.`
            : `${inCount} in so far.`,
      };
    }
  } else if (voting === null) loading = true;
  else if (voting === 'failed') failed = loadVoting;
  else if (voting.notYet)
    blocked = {
      title: 'The vote opens at full time',
      sub: 'End the game and the vote link goes to everyone who played. Then send it to the group from here.',
      ...(session.status === SessionStatus.UPCOMING ? { switchTo: 'invite' as const, switchLabel: 'Send the link to say you’re in' } : {}),
    };
  else if (!voting.open) blocked = { title: 'Voting has closed', sub: `${voting.ballots} of ${voting.squadSize} voted. The results are on the Full time step.` };
  else if (kind === 'voteclosing' && voting.squadSize > 0 && voting.ballots >= voting.squadSize)
    blocked = { title: 'Everyone has voted', sub: `All ${voting.squadSize} who played have voted, so there’s no one left to chase.` };
  else {
    const closes = voting.closesAt ? closeWords(voting.closesAt) : null;
    const waiting = Math.max(0, voting.squadSize - voting.ballots);
    ready = {
      text: groupVoteMessage({ groupName: group, link: voting.link, ballots: voting.ballots, squadSize: voting.squadSize, closes, closing: kind === 'voteclosing' }),
      title:
        kind === 'voteclosing'
          ? `Voting closes ${closes ?? 'soon'}`
          : justEnded
            ? 'Full time! Send the vote to the group'
            : 'Send the vote link to the group',
      sub:
        kind === 'voteclosing'
          ? `${waiting} still to vote. One more nudge in the group usually does it.`
          : justEnded
            ? `The ${justEnded.came} who played have it already. Send it to the group so nobody misses it.`
            : `${voting.ballots} of ${voting.squadSize} have voted so far.`,
    };
  }

  function open() {
    if (!ready) return;
    buzz(10);
    openWhatsApp(ready.text);
    left.current = false;
    setStep('opened');
  }

  async function copy() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(ready.text);
      buzz(8);
      setCopied(true);
      toast.success('Message copied: paste it in the group');
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error('Couldn’t copy. Press and hold the message to copy it.');
    }
  }

  const footer = ready ? (
    step === 'ready' ? (
      <div className="flex gap-2">
        <button onClick={copy} className={`${btnSecondary} shrink-0 min-w-[7.5rem]`} aria-live="polite">
          <span key={String(copied)} className="inline-flex items-center gap-2 animate-pop-in">
            {copied ? <Tick className="w-4 h-4 text-pitch-600" /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
        <button onClick={open} className={`${btnPrimary} flex-1 whitespace-nowrap`}>
          <WhatsAppGlyph className="w-5 h-5" />
          Open WhatsApp
        </button>
      </div>
    ) : (
      <div className="flex gap-2">
        <button onClick={open} className={`${btnSecondary} shrink-0 min-w-[7.5rem] whitespace-nowrap`}>
          Open again
        </button>
        <button onClick={onClose} className={`${btnPrimary} flex-1`}>
          {step === 'back' ? 'Done, it’s sent' : 'Done'}
        </button>
      </div>
    )
  ) : blocked?.switchTo ? (
    <button
      onClick={() => {
        setKind(blocked!.switchTo!);
        setStep('ready');
      }}
      className={`${btnPrimary} w-full`}
    >
      {blocked.switchLabel}
    </button>
  ) : (
    <button onClick={onClose} className={`${btnSecondary} w-full`}>
      Close
    </button>
  );

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left" footer={footer}>
      <SheetTitle
        id={titleId}
        title={ready?.title ?? blocked?.title ?? (failed ? 'The message didn’t load' : isVote ? 'The vote link' : 'The link for the group')}
        sub={ready?.sub ?? blocked?.sub ?? (failed ? 'Check your connection and try again.' : undefined)}
        onClose={onClose}
      />

      {loading && (
        <div className="mt-4 rounded-3xl bg-pitch-50 p-3" aria-busy="true" aria-label="Writing the message">
          <div className="ml-auto w-[86%] rounded-2xl rounded-br-md bg-white/80 p-3.5 space-y-2">
            <div className="h-3 w-3/4 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-3 w-full rounded-full bg-gray-200 animate-pulse" />
            <div className="h-3 w-1/2 rounded-full bg-gray-200 animate-pulse" />
          </div>
        </div>
      )}

      {failed && (
        <button onClick={failed} className={`${btnSecondary} mt-4 w-full`}>
          Try again
        </button>
      )}

      {ready && (
        <>
          {/* Exactly what the group will see, as WhatsApp shows it */}
          <figure className="mt-4 rounded-3xl bg-pitch-50 p-3 chat-wallpaper" aria-label="The message">
            <div key={kind} className="ml-auto max-w-[92%] origin-bottom-right animate-pop-in rounded-2xl rounded-br-md bg-pitch-100 px-3.5 pt-2.5 pb-1.5 shadow-card select-text">
              <Message text={ready.text} />
              <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-pitch-700/70" aria-hidden>
                now
                <svg className={`w-4 h-3 ${step !== 'ready' ? 'text-pitch-600' : ''}`} viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m1 6.5 3.2 3.2L11 2.5M7 9.7 14 2.5" />
                </svg>
              </span>
            </div>
          </figure>

          {/* The three taps, ticking off as they're done */}
          <ol className="mt-4 grid grid-cols-3 gap-1.5" aria-label="How to send it">
            {['Open WhatsApp', 'Pick your group', 'Send'].map((label, i) => {
              const done = step === 'back' || (step === 'opened' && i === 0);
              const now = (step === 'ready' && i === 0) || (step === 'opened' && i === 1);
              return (
                <li
                  key={label}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center transition-colors duration-300 ${
                    done ? 'bg-volt-300/50' : now ? 'bg-chalk' : 'bg-white border border-gray-100'
                  }`}
                >
                  <span
                    key={`${label}-${done}`}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-extrabold tabular-nums ${done ? 'bg-ink text-volt-300 animate-pop-in' : now ? 'bg-ink text-white' : 'bg-gray-100 text-gray-500'}`}
                    aria-hidden
                  >
                    {done ? <Tick className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className={`text-[12px] leading-tight font-bold ${done || now ? 'text-ink' : 'text-gray-500'}`}>
                    {label}
                    {done && <span className="sr-only"> (done)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-[12px] leading-snug text-gray-500" role="status">
            {step === 'ready'
              ? 'WhatsApp doesn’t let apps post in groups, so it opens with this typed for you.'
              : step === 'opened'
                ? 'In WhatsApp: pick your group, then send.'
                : 'Didn’t go? Open it again, or copy it and paste it in the group.'}
          </p>
        </>
      )}
    </Sheet>
  );
}

/** The message's lines, with the link standing out as WhatsApp shows one. */
function Message({ text }: { text: string }) {
  return (
    <p className="text-[14px] leading-[1.45] text-ink whitespace-pre-line break-words [text-wrap:wrap]">
      {text.split(/(https?:\/\/\S+)/).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <span key={i} className="text-pitch-700 underline decoration-pitch-700/40 underline-offset-2 break-all">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function Tick({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  );
}

export function WhatsAppGlyph({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.496A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.594-.822-6.343-2.2l-.444-.355-3.187 1.07 1.07-3.187-.355-.444A9.955 9.955 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
    </svg>
  );
}
