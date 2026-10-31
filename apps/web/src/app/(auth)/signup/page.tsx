'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { nextPath, useCarryRedirect } from '@/lib/after-sign-in';
import { useToast } from '@/components/toast';
import { Stepper } from '@/components/steps';
import { PasswordField } from '@/components/password-sign-in';
import { btnPrimary } from '@/components/buttons';
import { BallSpinner } from '@/components/skeleton';
import { SETUP_STEPS } from '@/lib/setup-steps';
import { http } from '@/lib/http';

export default function SignUpPage() {
  const router = useRouter();
  const carry = useCarryRedirect();
  const { register, registerPitchOwner } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ teamName: '', firstName: '', lastName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  // What they're here to do first: run games (a club and its first group) or list a pitch. Either
  // way it's one account; the other can be added later from inside the app.
  const [goal, setGoal] = useState<'games' | 'pitch'>('games');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('as') === 'pitch') setGoal('pitch');
  }, []);
  // Listing a pitch with an email that already plays or organises: say so as soon as it's typed
  const [emailStatus, setEmailStatus] = useState<'new' | 'player' | 'taken' | null>(null);
  const checked = useRef('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (e.target.name === 'email') setEmailStatus(null);
  }

  async function checkEmail() {
    const email = form.email.trim();
    if (goal !== 'pitch' || !/\S+@\S+\.\S+/.test(email) || email === checked.current) return;
    checked.current = email;
    try {
      setEmailStatus((await http.post<{ status: 'new' | 'player' | 'taken' }>('/auth/pitch-owner-email-check', { email })).status);
    } catch {
      // The server checks again on submit
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (goal === 'pitch') {
      try {
        await registerPitchOwner({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), password: form.password });
        // Their pitches: adding the first one waits for the email link (a pitch takes money)
        router.push(nextPath() ?? '/pitch-owner/dashboard');
      } catch (err: any) {
        toast.error(err.message || 'Sign up failed');
        setSubmitting(false);
      }
      return;
    }
    try {
      try {
        // Where to go once signed in (step 2), and no "check your inbox" in the middle of setting
        // up: the email is sent now, the reminder waits a day like "I'll do it later".
        sessionStorage.setItem('pa_after_signup', '1');
        localStorage.setItem('pitchaside_verify_email_later', String(Date.now()));
        // BVN/NIN waits until they next open the app, not in the middle of the three steps
        sessionStorage.setItem('pitchaside_identity_later', '1');
      } catch {
        // Storage blocked: they land on home and see the reminder; nothing breaks
      }
      await register({
        organizationName: form.teamName.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      // Back to the pitch they were booking, if that's what sent them; else on to step 2: the first group
      router.push(nextPath() ?? '/groups/new?setup=1');
    } catch (err: any) {
      try {
        sessionStorage.removeItem('pa_after_signup');
        sessionStorage.removeItem('pitchaside_identity_later');
        localStorage.removeItem('pitchaside_verify_email_later');
      } catch {
        // nothing to undo
      }
      toast.error(err.message || 'Sign up failed');
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <Logo />
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">Join PitchAside</h1>
        <p className="mt-1 text-sm text-gray-500">Run games, list your pitch, or both. One account.</p>
      </div>

      {/* What first: it decides the next step, not what the account can do */}
      <fieldset className="mb-5">
        <legend className="sr-only">What do you want to do first?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['games', 'Run games', 'Groups and money'],
              ['pitch', 'List a pitch', 'Take bookings'],
            ] as const
          ).map(([k, title, line]) => {
            const on = goal === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => { setGoal(k); setEmailStatus(null); checked.current = ''; }}
                className={`press min-h-[68px] rounded-2xl border-[1.5px] px-3 py-2.5 text-left transition-colors ${on ? 'bg-ink border-ink' : 'bg-white border-gray-200 hover:border-ink'}`}
              >
                <span className={`block text-[15px] font-bold ${on ? 'text-volt-300' : 'text-ink'}`}>{title}</span>
                <span className={`block text-[12px] truncate ${on ? 'text-white/70' : 'text-gray-500'}`}>{line}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* What it takes, before anything is asked: three steps, this is the first */}
      {goal === 'games' && <Stepper className="mb-6" labels={SETUP_STEPS} at={0} note="About a minute" />}

      <form onSubmit={handleSubmit} className="space-y-4">
        {goal === 'games' && (
        <div>
          <label htmlFor="teamName" className="block text-xs font-bold text-gray-700 mb-1.5">
            Club or team name
          </label>
          <input id="teamName" name="teamName" type="text" required minLength={2} value={form.teamName} onChange={handleChange} className={inputClass} placeholder="e.g. Lekki Ballers" />
          <p className="mt-1 text-[12px] text-gray-500">Your players see it on their invite.</p>
        </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-xs font-bold text-gray-700 mb-1.5">
              First name
            </label>
            <input id="firstName" name="firstName" type="text" required minLength={2} autoComplete="given-name" value={form.firstName} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-xs font-bold text-gray-700 mb-1.5">
              Last name
            </label>
            <input id="lastName" name="lastName" type="text" required minLength={1} autoComplete="family-name" value={form.lastName} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" value={form.email} onChange={handleChange} onBlur={checkEmail} className={inputClass} placeholder="you@example.com" />
          {goal === 'pitch' && emailStatus === 'player' && (
            <p className="mt-1 text-[12px] text-pitch-700 font-semibold">You play on PitchAside: use your player password.</p>
          )}
          {goal === 'pitch' && emailStatus === 'taken' && (
            <p className="mt-1 text-[12px] text-gray-600">
              You have an account.{' '}
              <Link href={`/signin?redirect=${encodeURIComponent('/my-pitches/new')}`} className="font-semibold text-pitch-700 underline">Sign in to add your pitch</Link>
            </p>
          )}
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={form.password}
          onChange={(v) => setForm({ ...form, password: v })}
          autoComplete="new-password"
          minLength={8}
          hint="8 characters or more."
        />

        <button type="submit" disabled={submitting || (goal === 'pitch' && emailStatus === 'taken')} className={`${btnPrimary} w-full disabled:opacity-40`}>
          {submitting && <BallSpinner />}
          {submitting ? 'Creating your account…' : goal === 'pitch' ? 'Next: add your pitch' : 'Next: your first group'}
        </button>
        <p className="text-center text-[12px] text-gray-500">Bank details and checks come later, when you need them.</p>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href={`/signin${carry}`} className="text-pitch-600 font-semibold hover:text-pitch-700">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-[13px] text-gray-500">Playing? Join from your group’s link.</p>
    </div>
  );
}
