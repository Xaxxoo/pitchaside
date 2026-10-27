'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { KeepHyphens, Logo } from '@/components/brand';
import { NightStadium, OffsideFlag, Trophy } from '@/components/illustrations';
import { BallLoader, BallSpinner } from '@/components/skeleton';
import { PayIntoCard } from '@/components/account-card';
import { PasswordSignIn } from '@/components/password-sign-in';
import { PlayerSignupForm, type SignupData } from '@/components/player-signup-form';
import { formatCurrency, getPublicGroup, invitedBy, type PublicGroup } from '@/lib/api';
import { frequencyShort } from '@/lib/billing';
import { getPlayerGame, getPlayerHome, joinAsPlayer, signupFromLink, type JoinResult } from '@/lib/player';
import { knownAccounts, type KnownAccount } from '@/lib/known-accounts';
import { AccountRow, KnownAccountPicker } from '@/components/known-account-picker';
import { PaymentType } from '@pitchaside/shared';

type Stage = 'signup' | 'signin' | 'joined';

export default function GroupLinkPage() {
  const { code } = useParams<{ code: string }>();
  const [group, setGroup] = useState<PublicGroup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<Stage>('signup');
  const [signedIn, setSignedIn] = useState(false);
  // Who is signed in on this phone now, and the other player accounts it has used (names and
  // emails only): the link offers them by name instead of a blank form.
  const [me, setMe] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const [accounts, setAccounts] = useState<KnownAccount[]>([]);
  // Already in this group: they go straight in, never through joining again.
  const [openingAs, setOpeningAs] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const router = useRouter();
  // From a game's QR code (/g/<code>?game=<id>): the game they're here for.
  const [game, setGame] = useState<string | null>(null);
  const [goingToGame, setGoingToGame] = useState(false);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('game');
    setGame(wanted);
    const known = knownAccounts();
    setAccounts(known);
    // Been here before with an account: lead with signing in (by name), not a new sign-up form.
    if (known.length) {
      setStage('signin');
      setLastEmail(known[0].email);
    }
    const groupLoad = getPublicGroup(code);
    groupLoad.then(setGroup).catch(() => setNotFound(true));
    // Signed in already (the session cookie): who as, and whether they're in this group
    getPlayerHome()
      .then(async (home) => {
        setSignedIn(true);
        setMe({ firstName: home.player.firstName, lastName: home.player.lastName, email: home.player.email });
        setAccounts(knownAccounts());
        if (wanted) {
          // Already in the group: straight to the game. Not in it yet: they join below first.
          setGoingToGame(true);
          try {
            await getPlayerGame(wanted);
            router.replace(`/me/games/${wanted}`);
          } catch {
            setGoingToGame(false);
          }
          return;
        }
        const g = await groupLoad.catch(() => null);
        if (g?.groupId && home.groups.some((x) => x.id === g.groupId)) {
          setOpeningAs(home.player.firstName);
          router.replace(`/me?group=${g.groupId}`);
        }
      })
      .catch(() => setSignedIn(false));
  }, [code]);

  function done(res: JoinResult) {
    // From a game's QR code: on to that game, where they say they're in and see what to pay.
    if (game) {
      setGoingToGame(true);
      router.replace(`/me/games/${game}?welcome=1`);
      return;
    }
    // They were in the group all along: open it, rather than a "you're already in" stop.
    if (res.alreadyMember) {
      setOpeningAs(res.firstName);
      router.replace(`/me?group=${res.groupId}`);
      return;
    }
    setJoined(res);
    setStage('joined');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function joinSignedIn() {
    setBusy(true);
    setError(null);
    try {
      done(await joinAsPlayer(code, game));
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
      done(await signupFromLink(code, data, game));
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

  if (!group || goingToGame || openingAs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader
          label={
            goingToGame
              ? 'Taking you to the game…'
              : openingAs && group
                ? `You’re already in ${group.groupName}, ${openingAs}. Opening it…`
                : 'Opening the dressing room…'
          }
        />
      </div>
    );
  }

  // The accounts to offer by name: the one signed in first, then the others this phone has used
  const others = accounts.filter((a) => a.email !== me?.email?.trim().toLowerCase());
  const chosenAccount = accounts.find((a) => a.email === lastEmail);
  const useAccount = (email: string) => {
    setError(null);
    setSignedIn(false);
    setLastEmail(email);
    setStage('signin');
  };

  if (stage === 'joined' && joined) {
    // Per game: nothing is owed until they say they're in for a game, so send them to the games.
    // Dues groups: they owe the period's dues now, so show how to pay.
    const perGame = joined.paymentType === PaymentType.PER_SESSION;
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="w-full max-w-sm mx-auto">
          <div className="text-center">
            <Logo />
            <Trophy className="w-48 h-40 mx-auto mt-6" />
            <h1 className="text-3xl font-extrabold text-ink mt-1 text-balance">
              {joined.alreadyMember ? `You’re already in, ${joined.firstName}` : `Welcome, ${joined.firstName}!`}
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              {joined.alreadyMember ? 'You’re a member of' : 'You’ve joined'} <span className="font-bold text-ink">{joined.groupName}</span>.{' '}
              {perGame ? 'Say “I’m in” for a game, and pay once you’re in.' : 'Here’s how to pay your dues.'}
            </p>
          </div>

          {perGame ? (
            <div className="mt-6 rounded-3xl bg-white border border-gray-100 shadow-card p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">Your payment code</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="font-display text-2xl font-extrabold tracking-wider text-ink">{joined.paymentRef}</span>
                <CopyButton text={joined.paymentRef} />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                When you pay for a game, put this code in the transfer description. That’s how {joined.groupName} knows it’s you.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <PayIntoCard
                  account={joined.account}
                  fee={joined.feePerPlayer}
                  paymentType={joined.paymentType}
                  reference={joined.paymentRef}
                  claim={{ groupId: joined.groupId, amount: joined.feePerPlayer }}
                />
              </div>
              <ol className="mt-6 space-y-3">
                {[
                  <>Transfer <span className="font-bold text-ink">{formatCurrency(joined.feePerPlayer)}</span> to the account above.</>,
                  <>Put your payment code <span className="font-bold text-ink">{joined.paymentRef}</span> in the transfer description.</>,
                  <>That&apos;s it: your organiser sees you as paid automatically.</>,
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                    <span className="w-6 h-6 rounded-full bg-ink text-volt-300 text-xs font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          <Link
            href="/me?welcome=1"
            className="mt-8 w-full flex items-center justify-center gap-2 py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-2xl hover:bg-pitch-900 transition-colors"
          >
            {perGame ? 'See the next game →' : 'Open my PitchAside →'}
          </Link>
          <p className="mt-3 text-xs text-gray-500 text-center">Your games, what you owe, your player card and the table.</p>
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
              {game ? 'Join to play this game' : invitedBy(group) ? `${invitedBy(group)} invites you` : 'You’ve been called up'}
            </p>
            <h1 className="font-display text-[26px] font-extrabold text-white leading-tight"><KeepHyphens text={group.groupName} /></h1>
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
              <h2 className="text-xl font-extrabold text-ink">Join {group.groupName}</h2>
              {/* Which account joins, said by name, so someone with two picks the right one */}
              {me && <AccountRow name={`${me.firstName} ${me.lastName}`} email={me.email} current />}
              <button
                onClick={joinSignedIn}
                disabled={busy}
                className="w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <BallSpinner />}
                {game ? 'Join and see the game' : me ? `Join as ${me.firstName}` : `Join ${group.groupName}`}
              </button>
              {others.length > 0 && (
                <div className="pt-1">
                  <p className="text-[12px] font-bold text-gray-500">Or use another account on this phone</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {others.map((a) => (
                      <li key={a.email}>
                        <AccountRow name={[a.firstName, a.lastName].filter(Boolean).join(' ')} email={a.email} onPick={() => useAccount(a.email)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={() => useAccount('')} className="w-full min-h-11 text-[13px] font-semibold text-gray-500 hover:text-ink">
                {others.length ? 'A different account' : 'Not you? Use another account'}
              </button>
            </div>
          ) : stage === 'signin' ? (
            <>
            {/* Accounts this phone has used: one tap fills the email, so they only type the password */}
            <KnownAccountPicker accounts={accounts} chosen={lastEmail} onPick={(email) => { setError(null); setLastEmail(email); }} />
            <PasswordSignIn
              key={chosenAccount?.email ?? 'other'}
              title={chosenAccount ? `Welcome back, ${chosenAccount.firstName}` : 'Welcome back'}
              subtitle={game ? `Sign in and we'll take you to the game.` : `Sign in and you're in ${group.groupName}.`}
              cta={game ? 'Sign in and see the game' : `Sign in & join`}
              initialEmail={lastEmail}
              onSignedIn={onSignedIn}
              footer={
                <button onClick={() => { setError(null); setStage('signup'); }} className="w-full min-h-11 text-[13px] font-semibold text-gray-500 hover:text-ink">
                  New to PitchAside? Create an account
                </button>
              }
            />
            </>
          ) : (
            <>
            <button
              onClick={() => {
                setError(null);
                setStage('signin');
              }}
              className="press mb-3 w-full min-h-12 flex items-center justify-between gap-3 px-4 rounded-2xl bg-chalk text-left"
            >
              <span className="text-[14px] font-bold text-ink">Already play on PitchAside?</span>
              <span className="shrink-0 text-[14px] font-bold text-pitch-700">Sign in ›</span>
            </button>
            <PlayerSignupForm
              subtitle={
                game
                  ? `Sign up once and you're in ${group.groupName}, then straight to the game. Next time, this code takes you right there.`
                  : "Create your PitchAside account — you'll get your payment code straight after."
              }
              cta={game ? 'Join and see the game' : 'Join the group'}
              onSubmit={signup}
              onEmailChange={setLastEmail}
              onSwitchToSignIn={() => {
                setError(null);
                setStage('signin');
              }}
            />
            </>
          )}
        </div>

      </div>
    </div>
  );
}

/** Copies a code and says so in place. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          },
          () => {},
        )
      }
      className="shrink-0 h-10 px-4 rounded-xl bg-ink text-volt-300 text-sm font-bold hover:bg-pitch-900"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

