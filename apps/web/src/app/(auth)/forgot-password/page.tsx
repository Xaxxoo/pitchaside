'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useState } from 'react';
import { http } from '@/lib/http';
import { useToast } from '@/components/toast';

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await http.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      toast.error(err.message || 'Could not send reset email. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo />
        </div>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-volt-300 text-ink border-2 border-ink shadow-sticker flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            If an account exists with that email, we&apos;ve sent a password reset link.
          </p>
          <Link
            href="/signin"
            className="text-sm text-pitch-600 font-semibold hover:text-pitch-700"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Logo />
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">Forgot password?</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your email and we&apos;ll send a reset link
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            placeholder="you@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Remember your password?{' '}
        <Link href="/signin" className="text-pitch-600 font-semibold hover:text-pitch-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
