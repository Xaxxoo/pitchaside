'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { http } from '@/lib/http';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const inputClass = "w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600";

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Logo />
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">Invalid or missing reset token.</p>
          <Link
            href="/forgot-password"
            className="text-sm text-pitch-600 font-semibold hover:text-pitch-700"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
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
          <h2 className="text-lg font-bold text-gray-900 mb-2">Password reset</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your password has been updated successfully.
          </p>
          <Link
            href="/signin"
            className="inline-block py-3 px-8 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await http.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || 'Reset failed. Please request a new link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Logo />
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">Set new password</h1>
        <p className="mt-1 text-sm text-gray-500">Enter your new password below</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-1.5">
            New Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-xs font-bold text-gray-700 mb-1.5">
            Confirm Password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm flex justify-center">
          <BallSpinner className="w-10 h-10" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
