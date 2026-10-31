'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand';
import { NightStadium } from '@/components/illustrations';
import { PasswordSignIn } from '@/components/password-sign-in';
import { SignInSwitch } from '@/components/signin-switch';
import { http, storeRefreshToken } from '@/lib/http';
import { btnSecondary } from '@/components/buttons';
import { Callout } from '@/components/callout';
import { KnownAccountPicker } from '@/components/known-account-picker';
import { knownAccounts, type KnownAccount } from '@/lib/known-accounts';
import { getPublicGroup } from '@/lib/api';
import { getClub } from '@/lib/player';

export default function PlayerLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Sent from the organiser sign-in when the email is a player's: keep what they typed.
  const [email, setEmail] = useState<string | null>(null);
  // Accounts this phone has used: offered by name, and the latest one filled in
  const [accounts, setAccounts] = useState<KnownAccount[]>([]);
  useEffect(() => {
    const known = knownAccounts();
    setAccounts(known);
    setEmail(new URLSearchParams(window.location.search).get('email') ?? known[0]?.email ?? '');
  }, []);
  const chosen = accounts.find((a) => a.email === email);

  function onSignedIn() {
    router.replace('/me');
  }

  /** The same details as an organiser's: open the organiser side instead of failing. */
  async function asOrganiser(email: string, password: string) {
    try {
      const res = await http.post<{ requires2FA?: boolean; refreshToken?: string }>('/auth/login', { email, password });
      if (res.requires2FA) {
        // Their code goes on the organiser sign-in.
        router.replace(`/signin?email=${encodeURIComponent(email)}`);
        return true;
      }
      storeRefreshToken(res.refreshToken);
      window.location.assign('/dashboard');
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="w-full max-w-sm mx-auto">
        <div className="relative h-36 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker">
          <NightStadium className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/40 to-transparent" />
          <p className="absolute left-4 bottom-3 font-display text-2xl font-extrabold text-white leading-tight">
            Your games, payments
            <br />& player card
          </p>
        </div>
        <div className="text-center mt-6 mb-6">
          <Logo />
        </div>
        <div className="mb-6">
          <SignInSwitch current="player" />
        </div>
        {error && <Callout tone="warn" live className="mb-3">{error}</Callout>}
        {email !== null && <KnownAccountPicker accounts={accounts} chosen={email} onPick={setEmail} />}
        {email !== null && <PasswordSignIn
          key={email}
          initialEmail={email}
          otherAccount={asOrganiser}
          title={chosen ? `Welcome back, ${chosen.firstName}` : 'Player sign in'}
          onSignedIn={onSignedIn}
        />}
        <JoinWithLink />
      </div>
    </div>
  );
}

/**
 * A player's account is made inside their group, from the group's link (so it lands in the right
 * club). New players without the link to hand can paste it here instead of hunting for it.
 */
function JoinWithLink() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const text = link.trim();
    // A full link (pitchaside.com/g/AbC12 or /join/AbC12), or just the code at the end of it.
    const path = text.match(/\/(g|join)\/([A-Za-z0-9_-]{4,})/);
    const code = path ? null : text.match(/^[A-Za-z0-9_-]{4,}$/)?.[0];
    if (path) return router.push(`/${path[1]}/${path[2]}`);
    if (!code) return setProblem('That doesn’t look like a group link. It looks like pitchaside.com/g/…. Ask your organiser to send it again.');
    // Just a code: a group's, or the club's
    if (await getPublicGroup(code).then(() => true, () => false)) return router.push(`/g/${code}`);
    if (await getClub(code).then(() => true, () => false)) return router.push(`/join/${code}`);
    setProblem('No group or club has that code. Ask your organiser to send the link again.');
  }

  return (
    <section aria-labelledby="new-here" className="mt-4 rounded-3xl bg-chalk p-4">
      <h2 id="new-here" className="text-sm font-extrabold text-ink">
        New here?
      </h2>
      <p className="mt-0.5 text-[13px] leading-snug text-gray-600">Players join through their group’s link. Paste the one your organiser sent.</p>
      <form onSubmit={join} className="mt-3 flex gap-2">
        <label htmlFor="group-link" className="sr-only">
          Group link
        </label>
        <input
          id="group-link"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setProblem(null);
          }}
          placeholder="pitchaside.com/g/…"
          autoComplete="off"
          autoCapitalize="none"
          className="min-w-0 flex-1 min-h-12 px-3.5 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
        />
        <button type="submit" disabled={!link.trim()} className={`${btnSecondary} shrink-0 px-5 disabled:opacity-50`}>
          Join
        </button>
      </form>
      {problem && (
        <Callout tone="warn" live className="mt-2">
          {problem}
        </Callout>
      )}
      {/* The same account can run games or list a pitch too */}
      <p className="mt-3 text-[13px] text-gray-600">
        Run games or own a pitch?{' '}
        <Link href="/signup" className="font-semibold text-pitch-700 hover:text-pitch-800">
          Sign up
        </Link>
      </p>
    </section>
  );
}
