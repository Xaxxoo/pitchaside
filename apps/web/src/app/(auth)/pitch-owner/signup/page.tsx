'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { http } from '@/lib/http';

type EmailStatus = 'new' | 'player' | 'taken' | null;

export default function PitchOwnerSignUpPage() {
  const router = useRouter();
  const { registerPitchOwner } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>(null);
  const [checking, setChecking] = useState(false);
  const lastCheckedEmail = useRef('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    // Reset email status when email changes.
    if (e.target.name === 'email' && emailStatus !== null) {
      setEmailStatus(null);
    }
  }

  async function checkEmail() {
    const email = form.email.trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) return;
    if (email === lastCheckedEmail.current) return;
    lastCheckedEmail.current = email;
    setChecking(true);
    try {
      const res = await http.post<{ status: 'new' | 'player' | 'taken' }>(
        '/auth/pitch-owner-email-check',
        { email },
      );
      setEmailStatus(res.status);
    } catch {
      // Silently ignore — the server-side check will catch it on submit.
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await registerPitchOwner({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
      });
      router.push('/pitch-owner/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }

  const isPlayer = emailStatus === 'player';

  const inputClass =
    'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Logo />
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">
          {isPlayer ? 'Add Pitch Owner Access' : 'Register as a Pitch Owner'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isPlayer
            ? 'Your player account was found — enter your password to continue'
            : 'List your pitches and receive bookings'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email first so the blur check can adapt the rest of the form */}
        <div>
          <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
            Email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            onBlur={checkEmail}
            className={inputClass}
            placeholder="you@example.com"
          />
          {checking && (
            <p className="mt-1 text-xs text-gray-400">Checking...</p>
          )}
          {emailStatus === 'taken' && (
            <p className="mt-1 text-xs text-gray-600">
              You already have an account.{' '}
              <Link href={`/signin?redirect=${encodeURIComponent('/my-pitches/new')}`} className="font-semibold text-pitch-700 underline">
                Sign in to add your pitch
              </Link>
            </p>
          )}
          {isPlayer && (
            <p className="mt-1.5 text-xs text-pitch-600 font-medium">
              Welcome back! Enter your player password to add pitch owner access.
            </p>
          )}
        </div>

        {!isPlayer && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-xs font-bold text-gray-700 mb-1.5">
                  First Name *
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  value={form.firstName}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-xs font-bold text-gray-700 mb-1.5">
                  Last Name *
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  value={form.lastName}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-bold text-gray-700 mb-1.5">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                className={inputClass}
                placeholder="+234..."
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-1.5">
            {isPlayer ? 'Player Password *' : 'Password *'}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={handleChange}
            className={inputClass}
            placeholder={isPlayer ? 'Your existing player password' : 'At least 8 characters'}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || emailStatus === 'taken'}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {submitting
            ? isPlayer
              ? 'Upgrading account...'
              : 'Creating account...'
            : isPlayer
              ? 'Add Pitch Owner Access'
              : 'Create Pitch Owner Account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/signin" className="text-pitch-600 font-semibold hover:text-pitch-700">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        Organise games instead?{' '}
        <Link href="/signup" className="text-pitch-600 font-semibold hover:text-pitch-700">
          Sign up as organiser
        </Link>
      </p>
    </div>
  );
}
