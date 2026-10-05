'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormHero, FormShell, formCardClass } from '@/components/form-hero';
import { KitLine } from '@/components/illustrations';
import { BallSpinner } from '@/components/skeleton';
import { usePlayerProfile } from '@/components/player-shell';
import { startGroup } from '@/lib/player';

/** A player becomes an organiser: new club, same person. */
export default function StartGroupPage() {
  const router = useRouter();
  const { profile } = usePlayerProfile();
  const [form, setForm] = useState({ clubName: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile?.organiser) {
    router.replace('/me/profile');
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await startGroup(form);
      // Full load so the organiser app picks up the new cookie session.
      window.location.href = '/groups/new';
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const input =
    'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <FormShell>
      <FormHero
        eyebrow="New club"
        title="Start your group"
        subtitle="You'll run it from the Organising side — and keep playing from here."
        art={<KitLine className="w-full h-auto" />}
      />
      <form onSubmit={submit} className={formCardClass}>
        {error && <div className="bg-kit-400/10 border border-kit-400/40 text-kit-600 text-sm rounded-xl px-4 py-3">{error}</div>}
        <div>
          <label htmlFor="clubName" className="block text-xs font-bold text-gray-700 mb-1.5">
            Club / team name
          </label>
          <input
            id="clubName"
            required
            minLength={2}
            value={form.clubName}
            onChange={(e) => setForm({ ...form, clubName: e.target.value })}
            className={input}
            placeholder="e.g. Yaba Ballers"
          />
        </div>
        <p className="text-xs text-gray-500 -mb-1">
          Organising involves money, so your organiser side gets its own password.
          {profile ? (
            <>
              {' '}
              You’ll sign in to it as <span className="font-bold text-ink">{profile.player.email}</span>, under your name, {profile.player.firstName} {profile.player.lastName}.
            </>
          ) : null}
        </p>
        <div>
          <label htmlFor="password" className="block text-xs font-bold text-gray-700 mb-1.5">
            Organiser password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={input}
            placeholder="At least 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <BallSpinner />}
          Create my club
        </button>
      </form>
    </FormShell>
  );
}
