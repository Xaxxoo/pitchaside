'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/brand';
import { NightStadium, OffsideFlag, Trophy } from '@/components/illustrations';
import { BallLoader, BallSpinner } from '@/components/skeleton';
import { PayIntoCard } from '@/components/account-card';
import { PasswordSignIn } from '@/components/password-sign-in';
import { PlayerSignupForm, type SignupData } from '@/components/player-signup-form';
import { formatCurrency, getPublicGroup, type PublicGroup } from '@/lib/api';
import { frequencyShort } from '@/lib/billing';
import { getPlayerHome, joinAsPlayer, signupFromLink, type JoinResult } from '@/lib/player';

type Stage = 'signup' | 'signin' | 'joined';

export default function GroupLinkPage() {
  const { code } = useParams<{ code: string }>();
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<Stage>('signup');
  const [signedIn, setSignedIn] = useState(false);
  const [lastEmail, setLastEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);

  useEffect(() => {
    // Check if user has a valid player session via cookie
    getPlayerHome()
      .then(() => setSignedIn(true))
      .catch(() => setSignedIn(false));
    getPublicGroup(code)
      .then(setGroup)
      .catch(() => setNotFound(true));
  }, [code]);

  function done(res: JoinResult) {
    setJoined(res);
    setStage('joined');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function joinSignedIn() {
    setBusy(true);
    setError(null);
    try {
      done(await joinAsPlayer(code));
    } catch (err: any) {
      setError(err.message);
      setSignedIn(false);
    } finally {
      setBusy(false);
    }
  }

  /** Existing PitchAside player signed in on this page: add them to the group. */
  async function onSignedIn() {
    setSignedIn(true);
    await joinSignedIn();
  }

  async function signup(data: SignupData) {
    setError(null);
    try {
      done(await signupFromLink(code, data));
    } catch (err: any) {
      setError(err.message);
      // Email already has an account: send them to sign in instead.
      if (/sign in/i.test(err.message)) setStage('signin');
    }
  }

  const input =
    'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Logo />
          <OffsideFlag className="w-48 h-40 mx-auto mt-8 mb-2" />
          <h1 className="text-2xl font-extrabold text-ink mb-2">Link not found</h1>
          <p className="text-sm text-gray-500">This group link is no longer valid. Ask your organiser for the latest link.</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader label="Opening the dressing room…" />
      </div>
    );
  }

  if (stage === 'joined' && joined) {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center">
            <Logo />
            <Trophy className="w-48 h-40 mx-auto mt-6" />
            <h1 className="text-3xl font-extrabold text-ink mt-1">
              {joined.alreadyMember ? `Welcome back, ${joined.firstName}!` : `You're in, ${joined.firstName}!`}
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              {joined.alreadyMember ? 'You’re already in' : 'You’ve joined'} <span className="font-bold text-ink">{joined.groupName}</span>.
              Here&apos;s how to pay.
            </p>
          </div>

          <div className="mt-6">
            <PayIntoCard account={joined.account} fee={joined.feePerPlayer} paymentType={joined.paymentType} reference={joined.paymentRef} />
          </div>

          <ol className="mt-6 space-y-3">
            {[
              <>Transfer <span className="font-bold text-ink">{formatCurrency(joined.feePerPlayer)}</span> to the account above.</>,
              <>Put <span className="font-bold text-ink">{joined.paymentRef}</span> in the narration.</>,
              <>That&apos;s it — your organiser sees you as paid automatically.</>,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 rounded-full bg-ink text-volt-300 text-xs font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>

          <Link
            href="/me"
            className="mt-8 w-full flex items-center justify-center gap-2 py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-2xl hover:bg-pitch-900 transition-colors"
          >
            Open my PitchAside →
          </Link>
          <p className="mt-3 text-xs text-gray-400 text-center">Your games, what you owe, your player card and the table.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-6">
          <Logo />
        </div>

        <div className="relative h-40 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker">
          <NightStadium className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/40 to-transparent" />
          <div className="absolute left-4 right-4 bottom-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">
              {group.organizationName ? `${group.organizationName} invites you` : 'You’ve been called up'}
            </p>
            <h1 className="font-display text-[26px] font-extrabold text-white leading-tight">{group.groupName}</h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          {group.schedule && (
            <span className="px-2.5 py-1 rounded-full bg-chalk border border-gray-200 font-semibold text-gray-700">{group.schedule}</span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-chalk border border-gray-200 font-semibold text-gray-700 tabular-nums">
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} · {group.targetPlayers} per game
          </span>
          <span className="px-2.5 py-1 rounded-full bg-volt-300 border border-volt-400 font-bold text-ink tabular-nums">
            {formatCurrency(group.feePerPlayer)} {frequencyShort(group.paymentType)}
          </span>
        </div>
        {group.description && <p className="text-sm text-gray-600 mt-3">{group.description}</p>}

        <div className="mt-6">
          {error && (
            <div className="mb-3 bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {signedIn ? (
            <div className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-3">
              <h2 className="text-xl font-extrabold text-ink">Join the squad</h2>
              <p className="text-sm text-gray-500">You&apos;re already signed in to PitchAside.</p>
              <button
                onClick={joinSignedIn}
                disabled={busy}
                className="w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <BallSpinner />}
                Join {group.groupName}
              </button>
              <button onClick={() => setSignedIn(false)} className="w-full text-xs font-semibold text-gray-500 hover:text-ink">
                Not you? Use another account
              </button>
            </div>
          ) : stage === 'signin' ? (
            <PasswordSignIn
              title="Welcome back"
              subtitle={`Sign in and we'll add you to ${group.groupName}.`}
              cta={`Sign in & join`}
              initialEmail={lastEmail}
              onSignedIn={onSignedIn}
              footer={
                <button onClick={() => { setError(null); setStage('signup'); }} className="w-full text-xs font-semibold text-gray-500 hover:text-ink">
                  New to PitchAside? Create an account
                </button>
              }
            />
          ) : (
            <PlayerSignupForm
              subtitle="Create your PitchAside account — you'll get your payment reference straight after."
              cta="Join & get payment details"
              onSubmit={signup}
              onEmailChange={setLastEmail}
              onSwitchToSignIn={() => {
                setError(null);
                setStage('signin');
              }}
            />
          )}
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold text-gray-500 mb-2 text-center">Already a member? Pay here</p>
          <PayIntoCard account={group.account} fee={group.feePerPlayer} paymentType={group.paymentType} />
        </div>
      </div>
    </div>
  );
}
