'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';

export default function SignUpPage() {
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    teamName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    country: '',
    state: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register({
        organizationName: form.teamName,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        country: form.country || undefined,
        state: form.state || undefined,
      });
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600";

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <Logo />
        <h1 className="mt-6 text-[28px] leading-tight font-extrabold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500">Start managing your pitch</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="teamName" className="block text-xs font-bold text-gray-700 mb-1.5">
            Team / Organization *
          </label>
          <input
            id="teamName"
            name="teamName"
            type="text"
            required
            value={form.teamName}
            onChange={handleChange}
            className={inputClass}
            placeholder="e.g. Sunday League FC"
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="country" className="block text-xs font-bold text-gray-700 mb-1.5">
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              value={form.country}
              onChange={handleChange}
              className={inputClass}
              placeholder="e.g. Nigeria"
            />
          </div>
          <div>
            <label htmlFor="state" className="block text-xs font-bold text-gray-700 mb-1.5">
              State
            </label>
            <input
              id="state"
              name="state"
              type="text"
              value={form.state}
              onChange={handleChange}
              className={inputClass}
              placeholder="e.g. Lagos"
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
          {submitting ? 'Creating account...' : 'Create Account'}
        </button>
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
