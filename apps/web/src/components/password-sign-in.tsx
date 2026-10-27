'use client';

import { useState } from 'react';
import { BallSpinner } from '@/components/skeleton';
import { Collapse } from '@/components/collapse';
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
  minLength,
  hint,
}: {
  required?: boolean;
  minLength?: number;
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
          minLength={minLength ?? (required ? 6 : undefined)}
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
  otherAccount,
}: {
  /**
   * When these details aren't a player's: try them as the other kind of account (an organiser)
   * and say whether that worked, so the right email and password never fail on the wrong page.
   */
  otherAccount?: (email: string, password: string) => Promise<boolean>;
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
      let res: Awaited<ReturnType<typeof loginWithPassword>>;
      try {
        res = await loginWithPassword(email.trim(), password);
      } catch (err) {
        if (password && otherAccount && (await otherAccount(email.trim(), password).catch(() => false))) return;
        throw err;
      }
      if ('needsPassword' in res) {
        // No player password yet, but they typed one: it may be their organiser password.
        if (password && otherAccount && (await otherAccount(email.trim(), password).catch(() => false))) return;
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
          ? 'Your organiser already added you. Two quick steps to sign in.'
          : 'Two quick steps.'
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
          {/* Step 1: the code, labelled as the code (not a password), with where it went */}
          <div>
            <label htmlFor="rp-code" className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <StepDot n={1} done={code.length === 6} />
              Code from your email
            </label>
            <p className="mt-1 ml-8 text-[12px] text-gray-500 truncate">
              Sent to <span className="font-semibold text-ink">{email.trim()}</span>
            </p>
            <input
              id="rp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${input} mt-2 text-center text-2xl tracking-[0.4em] font-mono placeholder:text-base placeholder:tracking-normal placeholder:font-sans`}
              placeholder="6-digit code"
            />
          </div>
          {/* Step 2 opens once the code is in, so the two are never mixed up */}
          <Collapse open={code.length === 6} id="rp-step2">
            <div className="pt-1">
              <p className="flex items-center gap-2 mb-1.5 text-[13px] font-bold text-ink">
                <StepDot n={2} done={password.length >= 8} />
                {newcomer ? 'Choose a password' : 'Choose a new password'}
              </p>
              <PasswordField id="rp-new" label="8 characters or more" value={password} onChange={setPassword} autoComplete="new-password" />
            </div>
          </Collapse>
          {button(code.length !== 6 ? 'Enter the code first' : newcomer ? 'Create password & sign in' : 'Save password & sign in', code.length !== 6 || password.length < 8)}
          <button type="button" onClick={() => sendCode()} disabled={busy} className="w-full text-xs font-semibold text-pitch-600">
            No email? Check spam, or send it again
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

/** A numbered step circle that turns to a tick once the step is done. */
function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[12px] font-extrabold transition-colors ${done ? 'bg-volt-300 text-ink' : 'bg-ink text-volt-300'}`}
    >
      {done ? (
        <svg className="w-3.5 h-3.5 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

export { PasswordField };
