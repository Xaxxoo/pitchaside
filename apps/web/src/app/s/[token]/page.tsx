'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '@/components/brand';
import { NightStadium, OffsideFlag } from '@/components/illustrations';
import { BallLoader, BallSpinner } from '@/components/skeleton';
import { PasswordField } from '@/components/password-sign-in';
import { btnPrimary } from '@/components/buttons';
import { peekSignInLink, signInWithLink } from '@/lib/player';

const input =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

/**
 * A sign-in link from the organiser (/s/<token>), for a player who couldn't get in: choose a
 * password (and give an email if the organiser never had one), and they're in. Once, for 24 hours.
 */
export default function SignInLinkPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<{ firstName: string; clubName: string | null; email: string | null } | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inAs, setInAs] = useState<string | null>(null);

  useEffect(() => {
    peekSignInLink(token)
      .then(setInfo)
      .catch((err) => setGone(err instanceof Error ? err.message : 'This link doesn’t work any more.'));
  }, [token]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signInWithLink(token, password, info?.email ? undefined : email.trim());
      setInAs(res.firstName);
      router.replace('/me?welcome=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      setBusy(false);
    }
  }

  if (inAs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader label={`You’re in, ${inAs}. Opening your PitchAside…`} />
      </div>
    );
  }

  if (gone) {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="w-full max-w-sm mx-auto text-center">
          <Logo />
          <OffsideFlag className="w-48 h-40 mx-auto mt-8 mb-2" />
          <h1 className="text-2xl font-extrabold text-ink">This link has run out</h1>
          <p className="mt-2 text-sm text-gray-500">It works once, for 24 hours. Ask your organiser to send a new one.</p>
          <Link href="/me/login" className="press mt-6 inline-flex items-center justify-center min-h-12 px-5 rounded-2xl border border-gray-200 bg-white text-[15px] font-bold text-ink hover:border-ink">
            Sign in another way
          </Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader label="Checking your link…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="w-full max-w-sm mx-auto">
        <div className="text-center mb-6">
          <Logo />
        </div>
        <div className="relative h-36 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker">
          <NightStadium className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-pitch-950 via-pitch-950/40 to-transparent" />
          <div className="absolute left-4 right-4 bottom-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300 truncate">{info.clubName ? `From ${info.clubName}` : 'From your organiser'}</p>
            <h1 className="font-display text-[26px] font-extrabold text-white leading-tight truncate">Hi {info.firstName}</h1>
          </div>
        </div>

        <form onSubmit={go} className="mt-6 bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-4">
          <div>
            <h2 className="text-xl font-extrabold text-ink">Choose a password</h2>
            <p className="text-sm text-gray-500 mt-1">
              {info.email ? (
                <>
                  Then you’re in. Next time, sign in with <span className="font-semibold text-ink">{info.email}</span>.
                </>
              ) : (
                'Add your email and a password, then you’re in.'
              )}
            </p>
          </div>
          {error && (
            <div role="alert" className="bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
          {!info.email && (
            <div>
              <label htmlFor="sl-email" className="block text-xs font-bold text-gray-700 mb-1.5">
                Your email
              </label>
              <input id="sl-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
            </div>
          )}
          <PasswordField id="sl-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} hint="8 characters or more." />
          <button type="submit" disabled={busy || password.length < 8 || (!info.email && !/^\S+@\S+\.\S+$/.test(email.trim()))} className={`${btnPrimary} w-full`}>
            {busy && <BallSpinner />}
            Save and go in
          </button>
        </form>
      </div>
    </div>
  );
}
