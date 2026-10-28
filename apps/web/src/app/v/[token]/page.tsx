'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { KeepHyphens, Logo } from '@/components/brand';
import { NightStadium, OffsideFlag, Trophy } from '@/components/illustrations';
import { BallLoader, BallSpinner } from '@/components/skeleton';
import { VoteClock, closeTime, closeWords } from '@/components/ratings';
import { groupVoteMessage, openWhatsApp } from '@/lib/whatsapp';
import { buzz } from '@/components/motion';
import { BallotSteps, type Picks } from '@/components/vote/ballot-steps';
import { getBallot, getVoteCard, getVoteResults, type Ballot, type VoteResults } from '@/lib/api';
import type { MatchCard } from '@/app/share/[token]/match-card';
import { VoteReveal } from '@/components/vote/vote-reveal';
import { PasswordSignIn } from '@/components/password-sign-in';
import { ShareCardButton, ShareIcon, shareIconLight } from '@/components/share-card';
import { getMyBallot, submitMyVotes, PlayerAuthError } from '@/lib/player';

/**
 * `notPlayer`: signed in, but not among the players who played this game. `done`: they've voted
 * (just now, or earlier and came back). `results`: the vote has closed, and anyone with the link
 * sees how it ended.
 */
type Stage = 'signin' | 'notPlayer' | 'ballot' | 'done' | 'results';

export default function VotePage() {
  const { token } = useParams<{ token: string }>();
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [stage, setStage] = useState<Stage>('signin');
  const [voter, setVoter] = useState<{ playerId: string; firstName: string } | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [results, setResults] = useState<VoteResults | null>(null);
  // The day behind the results (Team of the Day, goals and assists), once the winners are out
  const [card, setCard] = useState<MatchCard | null>(null);
  useEffect(() => {
    if (results && !results.hidden && !card) getVoteCard(token).then(setCard).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Just sent their ballot, rather than coming back to one they sent before.
  const [justVoted, setJustVoted] = useState(false);
  // The ballot couldn't be fetched for a reason other than who they are (a dropped connection).
  const [loadFailed, setLoadFailed] = useState(false);

  async function loadMyBallot() {
    setBusy(true);
    setError(null);
    try {
      const v = await getMyBallot(token);
      setVoter({ playerId: v.playerId, firstName: v.firstName });
      setPicks(v.picks);
      // Already voted: show where it stands (and the winners, once it's closed), not step 1 again.
      if (v.picks.potm) {
        setResults(await getVoteResults(token).catch(() => null));
        setStage('done');
      } else {
        setStage('ballot');
      }
    } catch (err: any) {
      // Signed out: sign in. Signed in but didn't play: say so. Anything else is a connection
      // problem, not who they are, so it offers a retry instead.
      if (err instanceof PlayerAuthError) {
        setError(null);
        setStage('signin');
      } else if (err?.status === 403 || /played/i.test(err?.message ?? '')) {
        setError(err.message);
        setStage('notPlayer');
      } else {
        setLoadFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    getBallot(token)
      .then((b) => {
        setBallot(b);
        // Closed: the results are for everyone with the link, no sign-in needed.
        if (!b.open && !b.notYet) {
          getVoteResults(token).then(setResults).catch(() => setLoadFailed(true));
          setStage('results');
        } else {
          loadMyBallot();
        }
      })
      .catch(() => setInvalid(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onSignedIn() {
    await loadMyBallot();
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await submitMyVotes(token, picks);
      setResults(res);
      setJustVoted(true);
      setBallot((b) => (b ? { ...b, ballots: res.ballots } : b));
      setStage('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.message || 'Could not submit your votes');
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Logo />
          <OffsideFlag className="w-48 h-40 mx-auto mt-8 mb-2" />
          <h1 className="text-2xl font-extrabold text-ink mb-2">This vote link doesn&apos;t work</h1>
          <p className="text-sm text-gray-500">Ask your organiser to share it again from the game page.</p>
        </div>
      </div>
    );
  }

  if (!ballot) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader label="Collecting the ballots…" />
      </div>
    );
  }

  const matchDate = new Date(`${ballot.date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const header = (
    <div className="relative h-40 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker">
      <NightStadium className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/40 to-transparent" />
      <div className="absolute left-4 right-4 bottom-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Post-match vote · {matchDate}</p>
        <h1 className="font-display text-[26px] font-extrabold text-white leading-tight"><KeepHyphens text={ballot.groupName ?? ''} /></h1>
      </div>
      <span className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-white/90 text-ink tabular-nums">
          {ballot.ballots}/{ballot.squadSize} voted
        </span>
        {/* Only the last 3 hours show here: before that, the close time is on the ballot */}
        {ballot.open && ballot.closesAt && new Date(ballot.closesAt).getTime() - Date.now() <= 3 * 3_600_000 && <VoteClock closesAt={ballot.closesAt} />}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen px-4 py-6 pb-28">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 min-h-9">
          <Link
            href="/me"
            className="inline-flex items-center gap-1 pl-2 pr-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-full hover:text-ink hover:border-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            My PitchAside
          </Link>
          <Logo size="sm" />
        </div>
        {header}

        {loadFailed ? (
          <div className="mt-6 text-center bg-chalk rounded-3xl p-6" role="alert">
            <p className="font-display text-xl font-extrabold text-ink">The vote didn’t load</p>
            <p className="text-sm text-gray-600 mt-1">Check your connection and try again.</p>
            <button onClick={() => window.location.reload()} className="press mt-4 min-h-11 px-5 rounded-full bg-ink text-sm font-bold text-volt-300">
              Try again
            </button>
          </div>
        ) : stage === 'results' ? (
          results ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-[22px] font-extrabold text-ink">How the vote ended</h2>
                <ShareCardButton
                  token={token}
                  caption={`⚽ ${ballot.groupName} — match day. Who was Player of the Match?`}
                  label="Share the match card"
                  className={shareIconLight}
                >
                  <ShareIcon />
                </ShareCardButton>
              </div>
              <p className="text-[13px] text-gray-600 tabular-nums">
                {results.ballots} of {results.squadSize} voted{ballot.closesAt ? ` · closed ${closeTime(ballot.closesAt)}` : ''}
              </p>
              <div className="mt-4">
                {results.categories.some((c) => c.standings.length) ? (
                  <VoteReveal results={results} card={card} />
                ) : (
                  <p className="rounded-3xl bg-chalk px-5 py-6 text-center text-sm text-gray-600">Nobody voted in this game.</p>
                )}
              </div>
              <Link href="/me/games?tab=played" className="press mt-5 w-full min-h-12 flex items-center justify-center rounded-2xl border border-gray-200 bg-white text-[15px] font-bold text-ink hover:border-ink">
                Back to my games
              </Link>
            </div>
          ) : (
            <div className="py-10 flex justify-center">
              <BallSpinner className="w-8 h-8" />
            </div>
          )
        ) : !ballot.open && stage !== 'done' ? (
          <div className="mt-6 text-center bg-chalk rounded-3xl p-6 border border-gray-200">
            <p className="font-display text-xl font-extrabold text-ink">
              {ballot.notYet ? 'The vote opens at full time' : 'Voting has closed'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {ballot.notYet
                ? 'It opens when your organiser ends the game, for 36 hours.'
                : ballot.closesAt
                  ? `Closed ${closeTime(ballot.closesAt)}.`
                  : 'The results are in.'}
            </p>
          </div>
        ) : stage === 'notPlayer' ? (
          <div className="mt-6 text-center bg-chalk rounded-3xl p-6 border border-gray-200">
            <p className="font-display text-xl font-extrabold text-ink">This vote is for the players who played</p>
            <p className="text-sm text-gray-500 mt-1">
              {error ?? 'Only players who came to this game vote.'} You’ll vote after your next game.
            </p>
            <Link href="/me" className="mt-4 inline-flex items-center justify-center px-5 py-3 text-sm font-bold text-volt-300 bg-ink rounded-2xl hover:bg-pitch-900 transition-colors">
              Back to my PitchAside
            </Link>
          </div>
        ) : stage === 'signin' ? (
          <div className="mt-6 space-y-3">
            {error && <div className="bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">{error}</div>}
            {busy ? (
              <div className="py-10 flex justify-center">
                <BallSpinner className="w-8 h-8" />
              </div>
            ) : (
              <PasswordSignIn
                title="Vote on today’s game"
                subtitle="Player of the Match, your Best VII of the Day and any awards you want to give. About a minute. Sign in to vote."
                cta="Sign in & vote"
                onSignedIn={onSignedIn}
              />
            )}
          </div>
        ) : stage === 'ballot' && voter ? (
          <BallotSteps
            ballot={ballot}
            me={voter.playerId}
            firstName={voter.firstName}
            picks={picks}
            onPicks={setPicks}
            onSubmit={handleSubmit}
            busy={busy}
            error={error}
          />
        ) : (
          results && (
            <div className="mt-6">
              <div className="text-center">
                <Trophy className="w-40 h-32 mx-auto" />
                <h2 className="text-2xl font-extrabold text-ink mt-1">
                  {justVoted ? `Vote in. Cheers, ${voter?.firstName}!` : `You’ve voted, ${voter?.firstName}`}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {results.ballots} of {results.squadSize} have voted.{' '}
                  {results.hidden
                    ? `The winners show when the vote closes${ballot.closesAt ? `, ${closeTime(ballot.closesAt)}` : ''}.`
                    : 'Here’s how it ended.'}
                </p>
              </div>
              {!results.hidden && (
                <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-extrabold text-ink">How it ended</h3>
                <ShareCardButton
                  token={token}
                  caption={`⚽ ${ballot.groupName} — match day. Who was Player of the Match?`}
                  label="Share the match card"
                  className={shareIconLight}
                >
                  <ShareIcon />
                </ShareCardButton>
              </div>
              <div className="mt-2">
                <VoteReveal results={results} card={card} />
              </div>
                </>
              )}
              {/* Voted, and others haven't: a player can nudge the group chat too */}
              {ballot.open && results.hidden && results.ballots < results.squadSize && (
                <div className="mt-5 rounded-3xl bg-white border border-gray-100 shadow-card p-4 animate-rise">
                  <p className="text-[15px] font-bold text-ink">
                    {results.squadSize - results.ballots} still to vote
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-gray-600">A nudge in the group chat usually does it.</p>
                  <button
                    onClick={() => {
                      buzz(10);
                      openWhatsApp(
                        groupVoteMessage({
                          groupName: ballot.groupName ?? 'The group',
                          link: window.location.href.split('?')[0],
                          ballots: results.ballots,
                          squadSize: results.squadSize,
                          closes: ballot.closesAt ? closeWords(ballot.closesAt) : null,
                          closing: !!ballot.closesAt && new Date(ballot.closesAt).getTime() - Date.now() <= 3 * 3_600_000,
                        }),
                      );
                    }}
                    className="press mt-3 w-full min-h-12 rounded-2xl bg-white border border-gray-300 text-[15px] font-bold text-ink hover:border-ink inline-flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5 text-pitch-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.496A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.594-.822-6.343-2.2l-.444-.355-3.187 1.07 1.07-3.187-.355-.444A9.955 9.955 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                    </svg>
                    Nudge the group on WhatsApp
                  </button>
                </div>
              )}
              <Link
                href="/me"
                className="mt-5 w-full flex items-center justify-center py-3.5 text-sm font-bold text-volt-300 bg-ink rounded-2xl hover:bg-pitch-900 transition-colors"
              >
                Back to my PitchAside
              </Link>
              <button
                onClick={() => setStage('ballot')}
                disabled={!ballot.open}
                className="press mt-2 w-full min-h-11 text-sm font-bold text-gray-600 hover:text-ink disabled:hidden"
              >
                Change my vote
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
