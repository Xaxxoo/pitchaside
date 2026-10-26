'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { Logo } from '@/components/brand';
import { UserRole } from '@pitchaside/shared';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, validate2FA, user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [twoFA, setTwoFA] = useState<{ required: boolean; challenge: string }>({ required: false, challenge: '' });
  const [code, setCode] = useState('');

  // Already logged in as super admin — go straight to the dashboard.
  if (user?.role === UserRole.SUPER_ADMIN) {
    router.replace('/admin');
    return null;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await login(form.email.trim(), form.password);
      if (result.requires2FA) {
        setTwoFA({ required: true, challenge: result.challenge });
      } else {
        // login() sets the user in context — check the role from /auth/me
        const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
        if (me.role !== UserRole.SUPER_ADMIN) {
          toast.error('This login is for PitchAside staff only.');
          return;
        }
        router.push('/admin');
      }
    } catch (err: any) {
      toast.error(err.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handle2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await validate2FA(twoFA.challenge, code);
      const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
      if (me.role !== UserRole.SUPER_ADMIN) {
        toast.error('This login is for PitchAside staff only.');
        return;
      }
      router.push('/admin');
    } catch (err: any) {
      toast.error(err.message || 'Invalid 2FA code');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  if (twoFA.required) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-lift p-8">
          <div className="text-center mb-8">
            <Logo />
            <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">Two-Factor Authentication</h1>
            <p className="mt-1 text-sm text-gray-500">Enter the 6-digit code from your authenticator app</p>
          </div>

          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-xs font-bold text-gray-700 mb-1.5">
                Authentication Code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} text-center tracking-[0.3em] font-mono`}
                placeholder="000000"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setTwoFA({ required: false, challenge: '' }); setCode(''); }}
              className="w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lift p-8">
        <div className="text-center mb-6">
          <Logo />
          <span className="inline-block mt-3 text-[10px] font-extrabold uppercase tracking-[0.16em] px-2.5 py-1 rounded-md bg-volt-400 text-ink">
            HQ · Admin
          </span>
        </div>
        <div className="text-center mb-6">
          <h1 className="text-[28px] leading-tight font-extrabold text-ink">Staff sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to the PitchAside admin dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className={inputClass}
              placeholder="you@pitchaside.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={form.password}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
