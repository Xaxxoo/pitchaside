'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '@/components/brand';
import { OffsideFlag, NightStadium, JerseyBadge } from '@/components/illustrations';
import { BallLoader, BallSpinner } from '@/components/skeleton';
import { PasswordSignIn } from '@/components/password-sign-in';
import { PlayerSignupForm, type SignupData } from '@/components/player-signup-form';
import { useToast } from '@/components/toast';
import { formatCurrency } from '@/lib/api';
import { frequencyShort } from '@/lib/billing';
import {
  getClub,
  getPlayerProfile,
  isPlayerSignedIn,
  joinAsPlayer,
  joinClubAsPlayer,
  signupFromClubLink,
  type ClubGroup,
} from '@/lib/player';

type Stage = 'signup' | 'signin' | 'pick';

/**
 * The club's one invite link: create an account (or sign in), join the club,
 * then pick the groups you play in. Lands in the player app.
 */
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();

  const [club, setClub] = useState<{ clubName: string; groups: ClubGroup[] } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [stage, setStage] = useState<Stage>('signup');
  const [firstName, setFirstName] = useState('');
  const [lastEmail, setLastEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Group picking
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    isPlayerSignedIn().then(setSignedIn);
    getClub(code)
      .then(setClub)
      .catch(() => setInvalid(true));
  }, [code]);

  /** In the club: straight home if there's nothing to pick, otherwise pick groups. */
  async function inClub(name: string) {
    setFirstName(name);
    const groups = club?.groups ?? [];
    if (!groups.length) {
      toast.success(`Welcome to ${club?.clubName}, ${name}!`);
      router.replace('/me');
      return;
    }
    const profile = await getPlayerProfile().catch(() => null);
    const already = new Set(profile?.clubs.flatMap((c) => c.groups.map((g) => g.id)) ?? []);
    setMine(already);
    const open = groups.filter((g) => !already.has(g.id));
    if (!open.length) {
      toast.success(`You're already in every ${club?.clubName} group`);
      router.replace('/me');
      return;
    }
    // One group to choose from: tick it for them.
    setPicked(open.length === 1 ? new Set([open[0].id]) : new Set());
    setStage('pick');
  }

  async function signup(data: SignupData) {
    setError(null);
    try {
      const res = await signupFromClubLink(code, data);
      await inClub(res.firstName);
    } catch (err: any) {
      setError(err.message);
      // Email already has an account: send them to sign in instead.
      if (/sign in/i.test(err.message)) setStage('signin');
    }
  }

  async function joinSignedIn() {
    setError(null);
    setBusy(true);
    try {
      const res = await joinClubAsPlayer(code);
      setSignedIn(false);
      await inClub(res.firstName);
    } catch (err: any) {
      setError(err.message);
      setSignedIn(await isPlayerSignedIn());
    } finally {
      setBusy(false);
    }
  }

  async function onSignedIn() {
    await joinSignedIn();
  }

  async function joinPicked() {
    if (!club) return;
    setError(null);
    setBusy(true);
    try {
      const chosen = club.groups.filter((g) => picked.has(g.id));
      for (const g of chosen) await joinAsPlayer(g.code);
      toast.success(
        chosen.length === 1 ? `You're in ${chosen[0].name}, ${firstName}!` : `You're in ${chosen.length} groups, ${firstName}!`,
      );
      // Pay tab has their reference and the account to pay into.
      router.replace('/me/pay');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Logo />
          <div className="mt-8">
            <OffsideFlag className="w-48 h-40 mx-auto mb-2" />
            <h1 className="text-2xl font-extrabold text-ink mb-2">Invalid invite link</h1>
            <p className="text-sm text-gray-500">
              This invite link is not valid. Please ask your organiser for the latest link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <BallLoader label="Checking your invite…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo />
        </div>
        <div className="relative h-36 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker mb-6">
          <NightStadium className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/40 to-transparent" />
          <div className="absolute left-4 right-4 bottom-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">
              {stage === 'pick' ? `Welcome, ${firstName}` : 'You’ve been called up'}
            </p>
            <h1 className="font-display text-2xl font-extrabold text-white leading-tight truncate">
              {stage === 'pick' ? 'Where do you play?' : `Join ${club.clubName}`}
            </h1>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {stage === 'pick' ? (
          <div className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5">
            <h2 className="text-xl font-extrabold text-ink">Pick your groups</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">Tick every {club.clubName} group you play in. You can join more later.</p>
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Groups</legend>
              {club.groups.map((g) => {
                const member = mine.has(g.id);
                const on = member || picked.has(g.id);
                return (
                  <label
                    key={g.id}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-3 transition-colors ${
                      member
                        ? 'border-gray-100 bg-chalk cursor-default'
                        : on
                          ? 'border-ink bg-volt-100 cursor-pointer'
                          : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={member}
                      onChange={() => toggle(g.id)}
                    />
                    <JerseyBadge label={g.name.charAt(0).toUpperCase()} name={g.name} className="w-11 h-11 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-ink truncate">{g.name}</span>
                      <span className="block text-xs text-gray-500 truncate">
                        {g.schedule || g.kickoffTime || `${g.memberCount} players`}
                      </span>
                      <span className="block text-xs font-bold text-pitch-700 mt-0.5">
                        {formatCurrency(g.feePerPlayer)} {frequencyShort(g.paymentType)}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        on ? 'bg-ink border-ink text-volt-300' : 'border-gray-300'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    {member && <span className="sr-only">You’re already in this group</span>}
                  </label>
                );
              })}
            </fieldset>
            <button
              onClick={joinPicked}
              disabled={busy || picked.size === 0}
              className="mt-4 w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <BallSpinner />}
              {picked.size > 1 ? `Join ${picked.size} groups` : 'Join & get payment details'}
            </button>
            <button
              onClick={() => router.replace('/me')}
              className="mt-2 w-full py-2 text-xs font-semibold text-gray-500 hover:text-ink"
            >
              Skip for now
            </button>
          </div>
        ) : signedIn ? (
          <div className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-3">
            <h2 className="text-xl font-extrabold text-ink">Join the squad</h2>
            <p className="text-sm text-gray-500">You&apos;re already signed in to PitchAside.</p>
            <button
              onClick={joinSignedIn}
              disabled={busy}
              className="w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <BallSpinner />}
              Join {club.clubName}
            </button>
            <button onClick={() => setSignedIn(false)} className="w-full text-xs font-semibold text-gray-500 hover:text-ink">
              Not you? Use another account
            </button>
          </div>
        ) : stage === 'signin' ? (
          <PasswordSignIn
            title="Welcome back"
            subtitle={`Sign in and we'll add you to ${club.clubName}.`}
            cta="Sign in & join"
            initialEmail={lastEmail}
            onSignedIn={onSignedIn}
            footer={
              <button
                onClick={() => {
                  setError(null);
                  setStage('signup');
                }}
                className="w-full text-xs font-semibold text-gray-500 hover:text-ink"
              >
                New to PitchAside? Create an account
              </button>
            }
          />
        ) : (
          <PlayerSignupForm
            subtitle="Create your PitchAside account to see your games, pay and vote."
            cta="Join the squad"
            onSubmit={signup}
            onEmailChange={setLastEmail}
            onSwitchToSignIn={() => {
              setError(null);
              setStage('signin');
            }}
          />
        )}
      </div>
    </div>
  );
}
