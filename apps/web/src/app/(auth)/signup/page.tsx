'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { Steps } from '@/components/steps';
import { PasswordField } from '@/components/password-sign-in';
import { btnPrimary } from '@/components/buttons';
import { BallSpinner } from '@/components/skeleton';
import { SETUP_STEPS } from '@/lib/setup-steps';

export default function SignUpPage() {
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ teamName: '', firstName: '', lastName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      try {
        // Where to go once signed in (step 2), and no "check your inbox" in the middle of setting
        // up: the email is sent now, the reminder waits a day like "I'll do it later".
        sessionStorage.setItem('pa_after_signup', '1');
        localStorage.setItem('pitchaside_verify_email_later', String(Date.now()));
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
      // Straight on to step 2: the first group
      router.push('/groups/new?setup=1');
    } catch (err: any) {
      try {
        sessionStorage.removeItem('pa_after_signup');
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
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">Run your games on PitchAside</h1>
        <p className="mt-1 text-sm text-gray-500">Who’s in, who’s paid and the table, in one place.</p>
      </div>

      {/* What it takes, before anything is asked: three steps, this is the first */}
      <div className="mb-5 rounded-3xl bg-white border border-gray-100 shadow-card p-4">
        <Steps heading="Ready in about a minute" note="Step 1 of 3" steps={SETUP_STEPS} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="teamName" className="block text-xs font-bold text-gray-700 mb-1.5">
            Club or team name
          </label>
          <input id="teamName" name="teamName" type="text" required minLength={2} value={form.teamName} onChange={handleChange} className={inputClass} placeholder="e.g. Lekki Ballers" />
          <p className="mt-1 text-[12px] text-gray-500">Your players see it on their invite.</p>
        </div>

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
          <input id="email" name="email" type="email" required autoComplete="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="you@example.com" />
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

        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
          {submitting && <BallSpinner />}
          {submitting ? 'Creating your account…' : 'Next: your first group'}
        </button>
        <p className="text-center text-[12px] text-gray-500">Bank details and checks come later, when you need them.</p>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/signin" className="text-pitch-600 font-semibold hover:text-pitch-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
