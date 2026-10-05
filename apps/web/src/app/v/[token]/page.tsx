'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { KeepHyphens, Logo } from '@/components/brand';
import { NightStadium, OffsideFlag, Trophy } from '@/components/illustrations';
import { BallLoader, BallSpinner } from '@/components/skeleton';
import { Avatar, VoteResultsList, categoryMeta } from '@/components/ratings';
import { getBallot, type Ballot, type VoteCategory, type VoteResults } from '@/lib/api';
import { PasswordSignIn } from '@/components/password-sign-in';
import { ShareCardButton } from '@/components/share-card';
import { getMyBallot, submitMyVotes, PlayerAuthError } from '@/lib/player';

type Stage = 'signin' | 'ballot' | 'done';

export default function VotePage() {
  const { token } = useParams<{ token: string }>();
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [stage, setStage] = useState<Stage>('signin');
  const [voter, setVoter] = useState<{ playerId: string; firstName: string } | null>(null);
  const [picks, setPicks] = useState<Partial<Record<VoteCategory, string>>>({});
  const [results, setResults] = useState<VoteResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMyBallot() {
    setBusy(true);
    setError(null);
    try {
      const v = await getMyBallot(token);
      setVoter({ playerId: v.playerId, firstName: v.firstName });
      setPicks(v.picks);
      setStage('ballot');
    } catch (err: any) {
      // Signed out, or signed in as someone who didn't play: back to the sign-in step.
      setError(err instanceof PlayerAuthError ? null : err.message);
      setStage('signin');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    getBallot(token).then(setBallot).catch(() => setInvalid(true));
    // Try loading ballot with existing player session cookie
    loadMyBallot();
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
          <p className="text-sm text-gray-500">Ask your organiser to share it again from the session page.</p>
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
  const teammates = ballot.squad.filter((p) => p.id !== voter?.playerId);
  const input =
    'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  const header = (
    <div className="relative h-40 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker">
      <NightStadium className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/40 to-transparent" />
      <div className="absolute left-4 right-4 bottom-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Post-match vote · {matchDate}</p>
        <h1 className="font-display text-[26px] font-extrabold text-white leading-tight"><KeepHyphens text={ballot.groupName ?? ''} /></h1>
      </div>
      <span className="absolute top-3 right-3 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-white/90 text-ink tabular-nums">
        {ballot.ballots}/{ballot.squadSize} voted
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

        {!ballot.open && stage !== 'done' ? (
          <div className="mt-6 text-center bg-chalk rounded-3xl p-6 border border-gray-200">
            <p className="font-display text-xl font-extrabold text-ink">
              {ballot.notYet ? 'Voting opens on match day' : 'Voting has closed'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {ballot.notYet
                ? 'Come back after the final whistle.'
                : `Closed on ${new Date(ballot.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`}
            </p>
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
                title="Who were the stars?"
                subtitle="Six quick picks — they build everyone's player rating and the league table. Sign in to vote."
                cta="Sign in & vote"
                onSignedIn={onSignedIn}
              />
            )}
          </div>
        ) : stage === 'ballot' ? (
          <div className="mt-6 space-y-5">
            <p className="text-sm text-gray-600">
              Hey <span className="font-bold text-ink">{voter?.firstName}</span> — tap one teammate for each award.
            </p>
            {ballot.categories.map((c) => {
              const meta = categoryMeta[c.key];
              return (
                <section key={c.key} className="bg-white rounded-3xl border border-gray-100 shadow-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.tone}`}>
                      {meta.short}
                    </span>
                    <h2 className="text-base font-bold text-ink">{c.title}</h2>
                    {c.key === 'potm' && <span className="text-[10px] text-gray-500 ml-auto">required</span>}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {teammates.map((p) => {
                      const selected = picks[c.key] === p.id;
                      const name = `${p.firstName} ${p.lastName}`;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPicks({ ...picks, [c.key]: selected ? undefined : p.id })}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-1 py-2.5 transition-all ${
                            selected ? 'border-ink bg-volt-300 -translate-y-0.5 shadow-sticker' : 'border-gray-100 bg-white hover:border-gray-300'
                          }`}
                          aria-pressed={selected}
                        >
                          <Avatar name={name} className="w-10 h-10 text-xs" />
                          <span className="text-xs font-bold text-ink truncate max-w-full">{p.firstName}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {error && <div className="bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">{error}</div>}
            <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
              <button
                onClick={handleSubmit}
                disabled={busy || !picks.potm}
                className="w-full max-w-md mx-auto flex items-center justify-center gap-2 py-4 bg-ink text-volt-300 text-sm font-bold rounded-2xl shadow-lift hover:bg-pitch-900 transition-colors disabled:opacity-50"
              >
                {busy && <BallSpinner />}
                Submit {Object.values(picks).filter(Boolean).length}/{ballot.categories.length} votes
              </button>
            </div>
          </div>
        ) : (
          results && (
            <div className="mt-6">
              <div className="text-center">
                <Trophy className="w-40 h-32 mx-auto" />
                <h2 className="text-2xl font-extrabold text-ink mt-1">Votes in — cheers, {voter?.firstName}!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {results.ballots} of {results.squadSize} have voted. Here&apos;s how it stands.
                </p>
              </div>
              <div className="mt-5">
                <VoteResultsList results={results} />
              </div>
              <ShareCardButton
                token={token}
                caption={`⚽ ${ballot.groupName} — match day. Who were the stars? Have your say:`}
                className="mt-5 w-full py-3.5 text-sm font-bold text-white bg-[#25D366] rounded-2xl hover:brightness-95 transition"
              >
                Share the match card
              </ShareCardButton>
              <Link
                href="/me"
                className="mt-2 w-full flex items-center justify-center py-3.5 text-sm font-bold text-volt-300 bg-ink rounded-2xl hover:bg-pitch-900 transition-colors"
              >
                Back to my PitchAside
              </Link>
              <button
                onClick={() => setStage('ballot')}
                disabled={!ballot.open}
                className="mt-2 w-full py-3 text-sm font-semibold text-gray-500 hover:text-ink disabled:hidden"
              >
                Change my votes
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
