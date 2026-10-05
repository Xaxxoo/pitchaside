'use client';

import { useState } from 'react';
import { BallSpinner } from '@/components/skeleton';
import { loginWithPassword, requestCode, resetPassword } from '@/lib/player';

type Step = 'login' | 'forgot' | 'reset';

const input =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  required = true,
  hint,
}: {
  required?: boolean;
  hint?: string;
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required={required}
          minLength={required ? 6 : undefined}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${input} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-bold text-gray-500 hover:text-ink"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Email + password sign-in for players. "Forgot password" and a first password
 * (for players their organiser added) both go through a 6-digit code sent to
 * their email.
 */
export function PasswordSignIn({
  title = 'Sign in',
  subtitle = 'Use your email and password.',
  cta = 'Sign in',
  onSignedIn,
  footer,
  initialEmail = '',
}: {
  /** Pre-fill, e.g. when sign-up found the email already has an account. */
  initialEmail?: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  onSignedIn: (firstName: string) => void | Promise<void>;
  footer?: React.ReactNode;
}) {
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  /** Set when the account has no password yet: the reset step then reads as a welcome. */
  const [newcomer, setNewcomer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function emailCode() {
    const res = await requestCode(email.trim());
    setDevCode(res.devCode);
    setPassword('');
    setCode('');
    setStep('reset');
  }

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await loginWithPassword(email.trim(), password);
      if ('needsPassword' in res) {
        // Their organiser added them: prove the email is theirs, then choose a password.
        setNewcomer(res.firstName);
        await emailCode();
        return;
      }
      await onSignedIn(res.firstName);
    });
  };

  const sendCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    run(emailCode);
  };

  const reset = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await resetPassword(email.trim(), code, password);
      await onSignedIn(res.firstName);
    });
  };

  const heading =
    step === 'login' ? title : newcomer && step === 'reset' ? `Welcome, ${newcomer}!` : 'Reset your password';
  const sub =
    step === 'forgot'
      ? 'We’ll email you a 6-digit code.'
      : step === 'reset'
        ? newcomer
          ? `Your organiser already added you. Enter the code we emailed to ${email.trim()} and choose a password.`
          : `Enter the code we emailed to ${email.trim()} and choose a new password.`
        : subtitle;

  const button = (label: string, disabled = false) => (
    <button
      type="submit"
      disabled={busy || disabled}
      className="w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {busy && <BallSpinner />}
      {label}
    </button>
  );

  return (
    <div className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-ink">{heading}</h2>
        <p className="text-sm text-gray-500 mt-1">{sub}</p>
      </div>

      {error && (
        <div role="alert" className="bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {step === 'login' && (
        <form onSubmit={login} className="space-y-3">
          <div>
            <label htmlFor="si-email" className="block text-xs font-bold text-gray-700 mb-1.5">
              Email
            </label>
            <input
              id="si-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
              placeholder="you@example.com"
            />
          </div>
          <PasswordField
            id="si-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required={false}
            hint="Added by your organiser and never signed in? Leave it blank — we’ll email you a code to set one."
          />
          {button(cta, !validEmail)}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNewcomer('');
              setStep('forgot');
            }}
            className="w-full text-xs font-semibold text-gray-500 hover:text-ink"
          >
            Forgot password?
          </button>
        </form>
      )}

      {step === 'forgot' && (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
            placeholder="you@example.com"
            aria-label="Email"
          />
          {button('Email me a code', !validEmail)}
          <button type="button" onClick={() => setStep('login')} className="w-full text-xs font-semibold text-gray-500 hover:text-ink">
            Back to sign in
          </button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={reset} className="space-y-3">
          {devCode && (
            <p className="text-xs rounded-xl bg-sky-300/30 border border-dashed border-sky-300 px-3 py-2 text-ink">
              Test mode — no email was sent. Your code is <span className="font-mono font-bold">{devCode}</span>
            </p>
          )}
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={`${input} text-center text-2xl tracking-[0.5em] font-mono`}
            placeholder="••••••"
            aria-label="6-digit code"
          />
          <PasswordField id="rp-new" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          {button(newcomer ? 'Create password & continue' : 'Reset password & sign in', code.length !== 6 || password.length < 8)}
          <button type="button" onClick={() => sendCode()} disabled={busy} className="w-full text-xs font-semibold text-pitch-600">
            Email the code again
          </button>
          <button type="button" onClick={() => setStep('login')} className="w-full text-xs font-semibold text-gray-500 hover:text-ink">
            Back to sign in
          </button>
        </form>
      )}

      {footer}
    </div>
  );
}

export { PasswordField };
