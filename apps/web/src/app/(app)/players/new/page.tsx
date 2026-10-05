'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { FormHero, FormShell, formCardClass } from '@/components/form-hero';
import { Player, Ball, palette, skins } from '@/components/illustrations';
import { useToast } from '@/components/toast';
import { addMember, createPlayer, getGroups, type IGroupWithMembers } from '@/lib/api';
import { PlayerLevelPicker } from '@/components/player-level';
import type { PlayerLevel } from '@pitchaside/shared';

type Errors = Record<string, string>;

function validate(form: FormData): Errors | null {
  const errors: Errors = {};
  const firstName = (form.get('firstName') as string).trim();
  const lastName = (form.get('lastName') as string).trim();
  const phone = (form.get('phone') as string).trim();
  const email = (form.get('email') as string).trim();

  if (!firstName) errors.firstName = 'First name is required';
  else if (firstName.length < 2) errors.firstName = 'Must be at least 2 characters';

  if (!lastName) errors.lastName = 'Last name is required';
  else if (lastName.length < 2) errors.lastName = 'Must be at least 2 characters';

  if (phone && (!/^[+\d]/.test(phone) || phone.length < 7)) errors.phone = 'Enter a valid phone number (min 7 characters)';

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';

  return Object.keys(errors).length ? errors : null;
}

export default function NewPlayerPage() {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [groups, setGroups] = useState<IGroupWithMembers[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [level, setLevel] = useState<PlayerLevel>('average');

  useEffect(() => {
    getGroups()
      .then((gs) => {
        setGroups(gs);
        // One group: they're almost certainly joining it.
        if (gs.length === 1) setGroupIds([gs[0].id]);
      })
      .catch(() => {});
  }, []);

  function toggleGroup(groupId: string) {
    setGroupIds((ids) => (ids.includes(groupId) ? ids.filter((x) => x !== groupId) : [...ids, groupId]));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const validationErrors = validate(form);
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const player = await createPlayer({
        firstName: (form.get('firstName') as string).trim(),
        lastName: (form.get('lastName') as string).trim(),
        email: (form.get('email') as string).trim() || undefined,
        phone: (form.get('phone') as string).trim() || undefined,
        level,
      });
      // Registering adds them to the club; groups are separate memberships.
      const added = await Promise.allSettled(groupIds.map((groupId) => addMember(groupId, { playerId: player.id })));
      if (added.some((r) => r.status === 'rejected')) {
        toast.error('Player registered, but not added to every group — add them from the group page');
      }
      router.push('/players');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register player');
      setSubmitting(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 ${
      errors[field] ? 'border-kit-500' : 'border-gray-200'
    }`;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Players" />
      <FormShell>
      <FormHero
        tone="sky"
        eyebrow="New signing"
        title="Register Player"
        subtitle="Add their contact details so you can track games and payments."
        art={
          <svg viewBox="0 0 160 150" className="w-full h-auto" aria-hidden>
            <Player x={78} y={146} scale={0.92} pose="celebrate" kit={palette.kit} skin={skins[0]} hair="afro" number={23} numberColor={palette.white} />
            <Ball x={138} y={132} r={12} spin={10} />
          </svg>
        }
      />

      <form onSubmit={handleSubmit} className={formCardClass}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-xs font-bold text-gray-700 mb-1.5">
              First Name *
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              className={inputClass('firstName')}
            />
            {errors.firstName && <p className="text-xs text-kit-600 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label htmlFor="lastName" className="block text-xs font-bold text-gray-700 mb-1.5">
              Last Name *
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              className={inputClass('lastName')}
            />
            {errors.lastName && <p className="text-xs text-kit-600 mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="name@example.com"
            className={inputClass('email')}
          />
          {errors.email ? (
            <p className="text-xs text-kit-600 mt-1">{errors.email}</p>
          ) : (
            <p className="text-[11px] text-gray-500 mt-1">
              What they&apos;ll sign in with, and where reminders and receipts go. You can add it later.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="block text-xs font-bold text-gray-700 mb-1.5">
            Phone <span className="text-gray-500 font-medium">(optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+234..."
            className={inputClass('phone')}
          />
          {errors.phone && <p className="text-xs text-kit-600 mt-1">{errors.phone}</p>}
        </div>

        <PlayerLevelPicker value={level} onChange={setLevel} />

        {groups.length > 0 && (
          <fieldset>
            <legend className="block text-xs font-bold text-gray-700 mb-1.5">Groups</legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const on = groupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleGroup(g.id)}
                    className={`px-3 py-1.5 text-sm font-bold rounded-full border transition-colors ${
                      on ? 'bg-ink text-volt-300 border-ink' : 'bg-white text-gray-700 border-gray-200 hover:border-ink'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {g.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {groupIds.length ? 'They’ll get a payment reference in each group you pick.' : 'Not in any group yet — they won’t get dues until you add them to one.'}
            </p>
          </fieldset>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Registering...' : 'Register Player'}
        </button>
      </form>
      </FormShell>
    </div>
  );
}
