'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { FormHero, FormShell, formCardClass } from '@/components/form-hero';
import { KitLine } from '@/components/illustrations';
import { useToast } from '@/components/toast';
import { createGroup } from '@/lib/api';
import { useCurrentGroup } from '@/lib/current-group';
import { PaymentType, type ContributionsVisibility, type GroupScope } from '@pitchaside/shared';
import { frequencyOptions, currencySymbol } from '@/lib/billing';
import { ContributionsVisibilityPicker } from '@/components/contributions-visibility';
import { RsvpToggle } from '@/components/rsvp-toggle';
import { MatchDayFields, type MatchDay } from '@/components/group/match-day-fields';
import { DEFAULT_GAME_MINUTES } from '@pitchaside/shared';
import { SECTION_ICONS, SEEN, SettingsSection, SettingsSections } from '@/components/group/settings-sections';
import { prettyTime } from '@/components/player-ui';
import { CalloutIcon } from '@/components/callout';
import { Stepper } from '@/components/steps';
import { SETUP_STEPS } from '@/lib/setup-steps';

type Errors = Record<string, string>;
type SectionKey = 'when' | 'day' | 'money';

/** A choice card, the same for every pick-one on this form. */
const OPTION =
  'flex flex-col h-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300';

function validate(form: FormData): Errors | null {
  const errors: Errors = {};
  const name = (form.get('name') as string).trim();
  const targetPlayers = Number(form.get('targetPlayers'));
  const feeInput = String(form.get('feePerPlayer') ?? '').trim();
  const feePerPlayer = Number(feeInput);

  if (!name) errors.name = 'Group name is required';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters';

  if (!targetPlayers || targetPlayers < 1) errors.targetPlayers = 'Must have at least 1 player';

  // No pre-filled amount: organisers always type their own fee.
  if (!feeInput) errors.feePerPlayer = 'Enter what each player pays';
  else if (isNaN(feePerPlayer) || feePerPlayer < 0) errors.feePerPlayer = 'Fee cannot be negative';

  return Object.keys(errors).length ? errors : null;
}

export default function NewGroupPage() {
  const router = useRouter();
  const { setGroupId } = useCurrentGroup();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [scope, setScope] = useState<GroupScope>('local');
  const [fee, setFee] = useState('');
  // Switching between ₦ and $ empties the fee: 1500 means something very different in each.
  const [feeCleared, setFeeCleared] = useState(false);
  function pickScope(next: GroupScope) {
    if (next === scope) return;
    setScope(next);
    if (fee) {
      setFee('');
      setFeeCleared(true);
    }
  }
  // Which settings section is open: one at a time, all closed to start
  const [open, setOpen] = useState<SectionKey | null>(null);
  const toggle = (k: SectionKey) => setOpen((o) => (o === k ? null : k));
  // What's set right now, read from the form, for each section's one-line summary
  const formRef = useRef<HTMLFormElement>(null);
  const [snap, setSnap] = useState<Record<string, string>>({});
  const readForm = () => formRef.current && setSnap(Object.fromEntries(new FormData(formRef.current)) as Record<string, string>);
  useEffect(() => {
    readForm();
  }, []);
  // Straight from signing up: step 2 of 3, and on to adding players after
  const [setup, setSetup] = useState(false);
  useEffect(() => setSetup(new URLSearchParams(window.location.search).get('setup') === '1'), []);
  // How match day runs: set here so a new group starts the way it plays. All of it can change later in settings.
  const [matchDay, setMatchDay] = useState<MatchDay>({ timerOn: true, gameMinutes: DEFAULT_GAME_MINUTES, bibs: null });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const validationErrors = validate(form);
    if (validationErrors) {
      setErrors(validationErrors);
      if (validationErrors.targetPlayers) setOpen('when');
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const group = await createGroup({
        name: (form.get('name') as string).trim(),
        description: (form.get('description') as string) || undefined,
        location: (form.get('location') as string) || undefined,
        schedule: (form.get('schedule') as string) || undefined,
        kickoffTime: (form.get('kickoffTime') as string) || undefined,
        targetPlayers: Number(form.get('targetPlayers')),
        feePerPlayer: Number(form.get('feePerPlayer')),
        paymentType: form.get('paymentType') as PaymentType,
        requireRsvp: form.get('requireRsvp') === 'on',
        contributionsVisibility: form.get('contributionsVisibility') as ContributionsVisibility,
        timerOn: matchDay.timerOn,
        gameMinutes: matchDay.gameMinutes,
        ...(matchDay.bibs ? { bibs: matchDay.bibs } : {}),
        scope,
      });
      // Home shows what's next for a new group: its bank account, then its first game.
      setGroupId(group.id);
      router.push(setup ? `/squad?group=${group.id}&add=1` : '/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group');
      setSubmitting(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 ${
      errors[field] ? 'border-kit-500' : 'border-gray-200'
    }`;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Groups" />
      <FormShell>
      <FormHero
        eyebrow="New squad"
        title={setup ? 'Your first group' : 'New group'}
        subtitle="Name and fee. Change the rest any time."
        art={<KitLine className="w-full h-auto" />}
        progress={setup ? <Stepper labels={SETUP_STEPS} at={1} note="Then add players" /> : undefined}
      />

      {/* noValidate: our own check runs and opens the folded row with the mistake (the browser can't point at it) */}
      <form ref={formRef} onSubmit={handleSubmit} onChange={readForm} noValidate className={formCardClass}>
        <div>
          <label htmlFor="name" className="block text-xs font-bold text-gray-700 mb-1.5">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="e.g. Sunday League"
            className={inputClass('name')}
          />
          {errors.name && <p className="text-xs text-kit-600 mt-1">{errors.name}</p>}
        </div>




          <div>
            <label htmlFor="feePerPlayer" className="block text-xs font-bold text-gray-700 mb-1.5">
              Fee per player ({currencySymbol(scope)})
            </label>
            <input
              id="feePerPlayer"
              name="feePerPlayer"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={scope === 'local' ? 'e.g. 1500' : 'e.g. 10'}
              value={fee}
              onChange={(e) => {
                setFee(e.target.value);
                setFeeCleared(false);
              }}
              className={inputClass('feePerPlayer')}
            />
            {errors.feePerPlayer && <p className="text-xs text-kit-600 mt-1">{errors.feePerPlayer}</p>}
            {feeCleared && !errors.feePerPlayer && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-kit-600" role="status">
                <CalloutIcon tone="warn" className="w-3.5 h-3.5" />
                Fee cleared: type it again in {currencySymbol(scope)}.
              </p>
            )}
          </div>
        {/* Common fees, one tap each: still the organiser's choice, never filled in for them */}
        {scope === 'local' && (
          <div className="-mt-1 flex flex-wrap gap-2" role="group" aria-label="Common fees">
            {[1000, 1500, 2000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setFee(String(n));
                  setFeeCleared(false);
                }}
                aria-pressed={Number(fee) === n}
                className={`press min-h-11 px-3.5 rounded-full border text-[13px] font-bold tabular-nums transition-colors ${
                  Number(fee) === n ? 'border-ink bg-ink text-volt-300' : 'border-gray-200 bg-white text-ink hover:border-ink'
                }`}
              >
                ₦{n.toLocaleString('en-NG')}
              </button>
            ))}
          </div>
        )}




        {/* Everything else already has a good default. Three short sections, like things together,
            each saying what's set; one opens at a time so the form never runs on. Money first,
            straight under the fee it belongs with. */}
        <div>
          <p className="mb-1.5 text-xs font-bold text-gray-700">
            Settings <span className="font-medium text-gray-500">· set already, change any time</span>
          </p>
          <SettingsSections inset="card">
            <SettingsSection
              id="new-group-money"
              icon={SECTION_ICONS.money}
              title="Money"
              summary={[currencySymbol(scope), (frequencyOptions.find((o) => o.value === snap.paymentType)?.label ?? 'Per game').toLowerCase(), SEEN[snap.contributionsVisibility] ?? SEEN.private].join(' · ')}
              open={open === 'money'}
              onToggle={() => toggle('money')}
            >
              <fieldset>
                <legend className="block text-xs font-bold text-gray-700 mb-1.5">Where are your players?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'local' as const, label: 'Nigeria', hint: 'Bank transfer in ₦' },
                    { value: 'international' as const, label: 'International', hint: 'USDT or USDC in $' },
                  ]).map((o) => (
                    <label key={o.value} className="block cursor-pointer">
                      <input type="radio" name="scope" value={o.value} checked={scope === o.value} onChange={() => pickScope(o.value)} className="peer sr-only" />
                      <span className={OPTION}>
                        <span className="text-sm font-bold text-ink">{o.label}</span>
                        <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {feeCleared && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-kit-600">
                    <CalloutIcon tone="warn" className="w-3.5 h-3.5" />
                    The fee above was cleared: enter it in {currencySymbol(scope)}.
                  </p>
                )}
                {/* Where the money goes, said as it really happens: a Nigerian group's bank account is opened
                    from home with BVN and NIN (not here); international payments go to the organiser's own
                    wallet and each one is matched by hand. */}
                <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white border border-gray-200 px-3 py-2.5">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-ink text-volt-300 flex items-center justify-center font-display font-extrabold text-sm" aria-hidden>
                    {currencySymbol(scope)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-ink">{scope === 'local' ? 'Its own Payrep bank account' : 'Your USDT/USDC wallet'}</span>
                    <span className="block text-xs text-gray-500">{scope === 'local' ? 'Open it from home with BVN and NIN.' : 'You match each payment yourself.'}</span>
                  </span>
                </div>
              </fieldset>
              {/* Five choices as one row of chips; what the picked one means sits on one line under them */}
              <fieldset>
                <legend className="block text-xs font-bold text-gray-700 mb-1.5">How often do players pay?</legend>
                <div className="flex flex-wrap gap-2">
                  {frequencyOptions.map((o) => (
                    <label key={o.value} className="block cursor-pointer">
                      <input type="radio" name="paymentType" value={o.value} defaultChecked={o.value === PaymentType.PER_SESSION} className="peer sr-only" />
                      <span className="flex items-center min-h-11 px-3.5 rounded-full border-2 border-gray-200 bg-white text-[13px] font-bold text-ink transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300">
                        {o.label}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-500" aria-live="polite">
                  {frequencyOptions.find((o) => o.value === (snap.paymentType ?? PaymentType.PER_SESSION))?.hint}
                </p>
              </fieldset>
              <ContributionsVisibilityPicker name="contributionsVisibility" />
            </SettingsSection>

            <SettingsSection
              id="new-group-when"
              icon={SECTION_ICONS.when}
              title="When and where"
              summary={[`${snap.targetPlayers || 10} a game`, snap.schedule?.trim(), prettyTime(snap.kickoffTime)].filter(Boolean).join(' · ')}
              open={open === 'when'}
              onToggle={() => toggle('when')}
            >
              <div>
                <label htmlFor="targetPlayers" className="block text-xs font-bold text-gray-700 mb-1.5">
                  Players per game
                </label>
                <input id="targetPlayers" name="targetPlayers" type="number" inputMode="numeric" min={1} defaultValue={10} className={inputClass('targetPlayers')} />
                {errors.targetPlayers && <p className="text-xs text-kit-600 mt-1">{errors.targetPlayers}</p>}
              </div>
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label htmlFor="schedule" className="block text-xs font-bold text-gray-700 mb-1.5">
                      Day
                    </label>
                    <input id="schedule" name="schedule" type="text" placeholder="e.g. Sundays" className="w-full min-w-0 px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="kickoffTime" className="block text-xs font-bold text-gray-700 mb-1.5">
                      Kick-off
                    </label>
                    <input id="kickoffTime" name="kickoffTime" type="time" defaultValue="20:00" className="w-full min-w-0 px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 appearance-none" />
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">Reminders go out the evening before and 2 hours before.</p>
              </div>
              <div>
                <label htmlFor="location" className="block text-xs font-bold text-gray-700 mb-1.5">
                  Pitch
                </label>
                <input id="location" name="location" type="text" placeholder="e.g. Teslim Balogun, Surulere" className="w-full min-w-0 px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
              </div>
              <div>
                <label htmlFor="description" className="block text-xs font-bold text-gray-700 mb-1.5">
                  Description <span className="font-medium text-gray-500">(optional)</span>
                </label>
                <textarea id="description" name="description" rows={2} placeholder="e.g. Bring a dark and a light top" className="w-full min-w-0 px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 resize-none" />
              </div>
            </SettingsSection>

            <SettingsSection
              id="new-group-day"
              icon={SECTION_ICONS.day}
              title="Match day"
              summary={[matchDay.timerOn ? `${matchDay.gameMinutes}-min games` : 'No timer', snap.requireRsvp === 'on' ? 'players confirm' : 'no confirming'].join(' · ')}
              open={open === 'day'}
              onToggle={() => toggle('day')}
            >
              <RsvpToggle name="requireRsvp" checked />
              <MatchDayFields value={matchDay} onChange={(patch) => setMatchDay((m) => ({ ...m, ...patch }))} idPrefix="new" isNew />
            </SettingsSection>

          </SettingsSections>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : setup ? 'Next: add your players' : 'Create group'}
        </button>
      </form>
      </FormShell>
    </div>
  );
}
