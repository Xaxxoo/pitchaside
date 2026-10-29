'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';

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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
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

  const inputClass =
    'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Logo />
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">
          Register as a Pitch Owner
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          List your pitches and receive bookings
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            className={inputClass}
            placeholder="you@example.com"
          />
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

        <div>
          <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-1.5">
            Password *
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
            placeholder="At least 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Creating account...' : 'Create Pitch Owner Account'}
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
