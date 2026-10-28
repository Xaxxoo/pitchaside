'use client';

import { PhoneHint, useTouched } from '@/components/phone-hint';
import { useState } from 'react';
import { BallSpinner } from '@/components/skeleton';
import { PasswordField } from '@/components/password-sign-in';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { checkSignupEmail, type PhoneMatch } from '@/lib/player';

export type SignupData = { email: string; firstName: string; lastName: string; phone?: string; password: string; phoneMatch?: 'yes' | 'no' };

const input =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

type Step = 'email' | 'details' | 'match';

/**
 * The one player sign-up, used by group links (/g) and club invite links (/join). Email first:
 * someone already on PitchAside goes to sign in (or gets a code if their organiser added them)
 * without filling in anything else. New people then give their name, WhatsApp number and a
 * password. If the number is already on a record in the club, they're asked "Are you Tunde B.?"
 * so the games and payments their organiser logged come with them.
 */
export function PlayerSignupForm({
  title = 'Join the group',
  subtitle = 'New or already on PitchAside, start with your email.',
  cta = 'Create my account',
  onSubmit,
  onSwitchToSignIn,
  onEmailChange,
  checkPhone,
}: {
  title?: string;
  subtitle?: string;
  cta?: string;
  onSubmit: (data: SignupData) => Promise<void>;
  /** The email is already on PitchAside: sign in with it (`code`: no password yet, email them a code). */
  onSwitchToSignIn: (email: string, needsCode?: boolean) => void;
  /** So the sign-in form can be pre-filled if they turn out to have an account. */
  onEmailChange?: (email: string) => void;
  /** Whether the number is already on a record in this club. */
  checkPhone: (phone: string) => Promise<PhoneMatch>;
}) {
  const [step, setStep] = useState<Step>('email');
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', password: '' });
  const phoneSeen = useTouched();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<NonNullable<PhoneMatch> | null>(null);

  const data = (phoneMatch?: 'yes' | 'no'): SignupData => ({
    email: form.email.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    phone: form.phone.trim() || undefined,
    password: form.password,
    ...(phoneMatch ? { phoneMatch } : {}),
  });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const checkEmail = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { status } = await checkSignupEmail(form.email.trim());
      if (status === 'new') setStep('details');
      else onSwitchToSignIn(form.email.trim(), status === 'code');
    });
  };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const found = form.phone.trim() ? await checkPhone(form.phone.trim()) : null;
      if (found) {
        setMatch(found);
        setStep('match');
        return;
      }
      await onSubmit(data());
    });
  };

  const answer = (phoneMatch: 'yes' | 'no') => run(() => onSubmit(data(phoneMatch)));

  const button = (label: string) => (
    <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
      {busy && <BallSpinner />}
      {label}
    </button>
  );

  const errorBox = error && (
    <div role="alert" className="bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">
      {error}
    </div>
  );

  if (step === 'match' && match) {
    return (
      <div className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-4 animate-fade-in-up">
        <div>
          <h2 className="text-xl font-extrabold text-ink">{match.free ? `Are you ${match.name}?` : 'Number already in use'}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {match.free
              ? 'Your organiser added them with this number. Yes keeps their history.'
              : `It’s on ${match.name}’s record (${match.email}). Is that you?`}
          </p>
        </div>
        {errorBox}
        {match.free ? (
          <div className="space-y-2">
            <button onClick={() => answer('yes')} disabled={busy} className={`${btnPrimary} w-full`}>
              {busy && <BallSpinner />}
              Yes, that’s me
            </button>
            <button onClick={() => answer('no')} disabled={busy} className={`${btnSecondary} w-full`}>
              No, I’m someone else
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button onClick={() => onSwitchToSignIn('')} disabled={busy} className={`${btnPrimary} w-full`}>
              Sign in with that email
            </button>
            <button onClick={() => answer('no')} disabled={busy} className={`${btnSecondary} w-full`}>
              {busy && <BallSpinner />}
              Not me · join as new
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep('details');
          }}
          className="w-full min-h-11 text-[13px] font-semibold text-gray-500 hover:text-ink"
        >
          Change my number
        </button>
      </div>
    );
  }

  if (step === 'email') {
    return (
      <form onSubmit={checkEmail} className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        {errorBox}
        <div>
          <label htmlFor="su-email" className="block text-xs font-bold text-gray-700 mb-1.5">Your email</label>
          <input
            id="su-email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => {
              setForm({ ...form, email: e.target.value });
              onEmailChange?.(e.target.value);
            }}
            className={input}
            placeholder="you@example.com"
          />
        </div>
        {button('Continue')}
      </form>
    );
  }

  return (
    <form onSubmit={submitDetails} className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-4 animate-fade-in-up">
      <div>
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        {/* The email they gave, with a way back: the rest is new-player details only */}
        <p className="mt-1 flex items-center gap-2 text-sm text-gray-500 min-w-0">
          <span className="truncate font-semibold text-ink">{form.email.trim()}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep('email');
            }}
            className="shrink-0 min-h-11 -my-3 px-1 text-[13px] font-bold text-pitch-700"
          >
            Change
          </button>
        </p>
      </div>
      {errorBox}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="su-first" className="block text-xs font-bold text-gray-700 mb-1.5">First name</label>
          <input id="su-first" required minLength={2} autoFocus autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="su-last" className="block text-xs font-bold text-gray-700 mb-1.5">Last name</label>
          <input id="su-last" required minLength={1} autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="su-phone" className="block text-xs font-bold text-gray-700 mb-1.5">WhatsApp number</label>
        <input
          id="su-phone"
          type="tel"
          required
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          onBlur={phoneSeen.onBlur}
          className={input}
          placeholder="0803 123 4567"
        />
        <PhoneHint value={form.phone} touched={phoneSeen.touched}>
          Finds you if your organiser already added you.
        </PhoneHint>
      </div>
      <PasswordField
        id="su-password"
        label="Password"
        value={form.password}
        onChange={(v) => setForm({ ...form, password: v })}
        autoComplete="new-password"
        minLength={8}
        hint="8 characters or more."
      />
      {button(cta)}
    </form>
  );
}
