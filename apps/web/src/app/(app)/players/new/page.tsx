'use client';

import { PhoneHint, useTouched } from '@/components/phone-hint';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { FormHero, FormShell, formCardClass } from '@/components/form-hero';
import { Player, Ball, palette, skins } from '@/components/illustrations';
import { useToast } from '@/components/toast';
import { addMember, createPlayer, getGroups, type IGroupWithMembers } from '@/lib/api';
import { PlayerLevelPicker } from '@/components/player-level';
import { PositionPicker } from '@/components/position-picker';
import { SettingsSection, SettingsSections } from '@/components/group/settings-sections';
import { positionLabel } from '@/lib/positions';

const LEVEL_LABEL: Record<string, string> = { beginner: 'Beginner', average: 'Average', good: 'Good', strong: 'Strong' };

const ICONS = {
  // A shirt
  pitch: 'M9 3 4.5 5.25 2.25 9.75l3 1.5V21h13.5v-9.75l3-1.5-2.25-4.5L15 3a3 3 0 0 1-6 0Z',
  // An envelope
  email: 'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
};
import type { PlayerLevel, Position } from '@pitchaside/shared';

type Errors = Record<string, string>;

function validate(form: FormData): Errors | null {
  const errors: Errors = {};
  const firstName = (form.get('firstName') as string).trim();
  const lastName = (form.get('lastName') as string).trim();
  const email = (form.get('email') as string).trim();

  if (!firstName) errors.firstName = 'First name is required';
  else if (firstName.length < 2) errors.firstName = 'Must be at least 2 characters';

  if (!lastName) errors.lastName = 'Last name is required';
  else if (lastName.length < 2) errors.lastName = 'Must be at least 2 characters';

  // A number WhatsApp can't open is said under the box, not refused: it can be fixed later.

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';

  return Object.keys(errors).length ? errors : null;
}

export default function NewPlayerPage() {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [phone, setPhone] = useState('');
  const phoneSeen = useTouched();
  const [groups, setGroups] = useState<IGroupWithMembers[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [level, setLevel] = useState<PlayerLevel>('average');
  const [position, setPosition] = useState<Position | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  // Which of the later rows is open: one at a time, both closed to start
  const [open, setOpen] = useState<'pitch' | 'email' | null>(null);

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
      // Never hide a mistake in a folded row
      if (validationErrors.email) setOpen('email');
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const player = await createPlayer({
        firstName: (form.get('firstName') as string).trim(),
        lastName: (form.get('lastName') as string).trim(),
        nickname: (form.get('nickname') as string).trim() || undefined,
        email: (form.get('email') as string).trim() || undefined,
        phone: (form.get('phone') as string).trim() || undefined,
        level,
        ...(position ? { position } : {}),
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
        eyebrow="Players"
        title="Add a player"
        subtitle="Name, number and group. The rest can wait."
        art={
          <svg viewBox="0 0 160 150" className="w-full h-auto" aria-hidden>
            <Player x={78} y={146} scale={0.92} pose="celebrate" kit={palette.kit} skin={skins[0]} hair="afro" number={23} numberColor={palette.white} />
            <Ball x={138} y={132} r={12} spin={10} />
          </svg>
        }
      />

      {/* noValidate: our own check runs and opens a folded row to show its message; the browser's
          wouldn't, and can't point at a field that's folded away */}
      <form onSubmit={handleSubmit} noValidate className={formCardClass}>
        {/* What's needed at the pitch: who, how to reach them, which group */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-xs font-bold text-gray-700 mb-1.5">
              First name
            </label>
            <input id="firstName" name="firstName" type="text" className={inputClass('firstName')} />
            {errors.firstName && <p className="text-xs text-kit-600 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label htmlFor="lastName" className="block text-xs font-bold text-gray-700 mb-1.5">
              Last name
            </label>
            <input id="lastName" name="lastName" type="text" className={inputClass('lastName')} />
            {errors.lastName && <p className="text-xs text-kit-600 mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="block text-xs font-bold text-gray-700 mb-1.5">
            WhatsApp number <span className="text-gray-500 font-medium">(optional)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="0803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={phoneSeen.onBlur}
            className={inputClass('phone')}
          />
          {!errors.phone && <PhoneHint value={phone} touched={phoneSeen.touched}>For reminders and their app link.</PhoneHint>}
          {errors.phone && <p className="text-xs text-kit-600 mt-1">{errors.phone}</p>}
        </div>

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
                    className={`press min-h-11 px-3.5 text-sm font-bold rounded-full border transition-colors ${
                      on ? 'bg-ink text-volt-300 border-ink' : 'bg-white text-gray-700 border-gray-200 hover:border-ink'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {g.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {groupIds.length ? 'They’ll get a payment code in each one.' : 'In no group, they won’t owe anything yet.'}
            </p>
          </fieldset>
        )}

        {/* The rest can wait: two rows that say what's set and open to change it */}
        <SettingsSections inset="card">
          <SettingsSection
            id="new-player-pitch"
            icon={ICONS.pitch}
            title="On the pitch"
            summary={[nickname.trim() && `“${nickname.trim()}”`, LEVEL_LABEL[level], positionLabel(position) ?? 'any position'].filter(Boolean).join(' · ')}
            open={open === 'pitch'}
            onToggle={() => setOpen((o) => (o === 'pitch' ? null : 'pitch'))}
          >
            <div>
              <label htmlFor="nickname" className="block text-xs font-bold text-gray-700 mb-1.5">
                Nickname <span className="text-gray-500 font-medium">(optional)</span>
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                maxLength={24}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="What they’re called on the pitch"
                className={inputClass('nickname')}
              />
            </div>
            <PlayerLevelPicker value={level} onChange={setLevel} />
            <PositionPicker value={position} onChange={setPosition} />
          </SettingsSection>
          <SettingsSection
            id="new-player-email"
            icon={ICONS.email}
            title="Email"
            summary={email.trim() || 'For sign-in and receipts; can wait'}
            open={open === 'email'}
            onToggle={() => setOpen((o) => (o === 'email' ? null : 'email'))}
          >
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
                Email <span className="text-gray-500 font-medium">(optional)</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass('email')}
              />
              {errors.email ? (
                <p className="text-xs text-kit-600 mt-1">{errors.email}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">What they sign in with; reminders and receipts go here.</p>
              )}
            </div>
          </SettingsSection>
        </SettingsSections>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Adding…' : 'Add player'}
        </button>
      </form>
      </FormShell>
    </div>
  );
}
