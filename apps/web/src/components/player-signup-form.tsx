'use client';

import { useState } from 'react';
import { BallSpinner } from '@/components/skeleton';
import { PasswordField } from '@/components/password-sign-in';

export type SignupData = { email: string; firstName: string; lastName: string; phone?: string; password: string };

const input =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

/**
 * The one player sign-up form: email, first name, last name, password and an
 * optional phone number. Used by group links (/g) and club invite links (/join).
 */
export function PlayerSignupForm({
  title = 'Join the squad',
  subtitle = 'Create your PitchAside account.',
  cta = 'Create my account',
  onSubmit,
  onSwitchToSignIn,
  onEmailChange,
}: {
  title?: string;
  subtitle?: string;
  cta?: string;
  onSubmit: (data: SignupData) => Promise<void>;
  onSwitchToSignIn: () => void;
  /** So the sign-in form can be pre-filled if they turn out to have an account. */
  onEmailChange?: (email: string) => void;
}) {
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-3xl border-2 border-ink shadow-sticker p-5 space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>
      <div>
        <label htmlFor="su-email" className="block text-xs font-bold text-gray-700 mb-1.5">Email *</label>
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="su-first" className="block text-xs font-bold text-gray-700 mb-1.5">First name *</label>
          <input id="su-first" required minLength={2} autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={input} />
        </div>
        <div>
          <label htmlFor="su-last" className="block text-xs font-bold text-gray-700 mb-1.5">Last name *</label>
          <input id="su-last" required minLength={2} autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="su-phone" className="block text-xs font-bold text-gray-700 mb-1.5">
          Phone number <span className="text-gray-500 font-medium">(optional)</span>
        </label>
        <input
          id="su-phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={input}
          placeholder="0803 123 4567"
        />
        <p className="text-[11px] text-gray-500 mt-1">So your organiser can reach you. If they already added you by number, this links you to your record.</p>
      </div>
      <PasswordField
        id="su-password"
        label="Password *"
        value={form.password}
        onChange={(v) => setForm({ ...form, password: v })}
        autoComplete="new-password"
        hint="At least 8 characters. You'll sign in with your email and this password."
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <BallSpinner />}
        {cta}
      </button>
      <button type="button" onClick={onSwitchToSignIn} className="w-full text-xs font-semibold text-gray-500 hover:text-ink">
        Already on PitchAside? Sign in
      </button>
    </form>
  );
}
