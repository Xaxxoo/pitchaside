'use client';

import { useEffect, useState } from 'react';
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
import { Collapse } from '@/components/collapse';
import { Stepper } from '@/components/steps';
import { SETUP_STEPS } from '@/lib/setup-steps';

type Errors = Record<string, string>;

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
  const [more, setMore] = useState(false);
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
      if (validationErrors.targetPlayers) setMore(true);
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

      <form onSubmit={handleSubmit} className={formCardClass}>
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
              placeholder="e.g. 1500"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={inputClass('feePerPlayer')}
            />
            {errors.feePerPlayer && <p className="text-xs text-kit-600 mt-1">{errors.feePerPlayer}</p>}
          </div>
        {/* Common fees, one tap each: still the organiser's choice, never filled in for them */}
        {scope === 'local' && (
          <div className="-mt-1 flex flex-wrap gap-2" role="group" aria-label="Common fees">
            {[1000, 1500, 2000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFee(String(n))}
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




        {/* Everything else has a good default: folded away, open it to change any of it */}
        <div className="rounded-2xl border border-gray-200">
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            aria-controls="new-group-more"
            className="press w-full min-h-12 flex items-center justify-between gap-3 px-3.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-ink">More settings</span>
              <span className="block text-[12px] text-gray-500 truncate">{scope === 'local' ? 'Nigeria' : 'International'} · 10 a game · 8pm · pay per game</span>
            </span>
            <svg className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${more ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <Collapse open={more} id="new-group-more">
            <div className="px-3.5 pb-4 space-y-4">
        <fieldset>
          <legend className="block text-xs font-bold text-gray-700 mb-1.5">Where are your players?</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'local' as const, label: 'Nigeria', hint: 'Bank transfer in ₦' },
              { value: 'international' as const, label: 'International', hint: 'USDT or USDC in $' },
            ]).map((o) => (
              <label key={o.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value={o.value}
                  checked={scope === o.value}
                  onChange={() => setScope(o.value)}
                  className="peer sr-only"
                />
                <span className="flex flex-col h-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300">
                  <span className="text-sm font-bold text-ink">{o.label}</span>
                  <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
            <label htmlFor="targetPlayers" className="block text-xs font-bold text-gray-700 mb-1.5">
              Players per game
            </label>
            <input
              id="targetPlayers"
              name="targetPlayers"
              type="number"
              min={1}
              defaultValue={10}
              className={inputClass('targetPlayers')}
            />
            {errors.targetPlayers && <p className="text-xs text-kit-600 mt-1">{errors.targetPlayers}</p>}
          </div>
        <div className="grid grid-cols-[1fr_148px] gap-3">
          <div>
            <label htmlFor="schedule" className="block text-xs font-bold text-gray-700 mb-1.5">
              Schedule
            </label>
            <input
              id="schedule"
              name="schedule"
              type="text"
              placeholder="e.g. Every Sunday"
              className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
            />
          </div>
          <div>
            <label htmlFor="kickoffTime" className="block text-xs font-bold text-gray-700 mb-1.5">
              Kick-off
            </label>
            <input id="kickoffTime" name="kickoffTime" type="time" defaultValue="20:00" className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-gray-500">Players get reminders the evening before and 2 hours before.</p>
        <div className="flex items-start gap-3 rounded-2xl bg-chalk border border-gray-200 p-3.5">
          <div className="w-8 h-8 rounded-lg bg-ink text-volt-300 flex items-center justify-center shrink-0 font-display font-extrabold text-sm">{currencySymbol(scope)}</div>
          {scope === 'international' ? (
            <p className="text-xs text-gray-600 leading-relaxed">
              We&apos;ll create <span className="font-bold text-ink">USDT/USDC wallet addresses</span> for this group on multiple chains (Polygon, Base, Tron).
              Players send stablecoins and transfers are matched to them automatically. You&apos;ll also get a link to share for players to join.
            </p>
          ) : (
            <p className="text-xs text-gray-600 leading-relaxed">
              We&apos;ll open a dedicated <span className="font-bold text-ink">Payrep MFB account</span> for this group. Players pay into it and
              transfers are matched to them automatically. You&apos;ll also get a link to share for players to join.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="location" className="block text-xs font-bold text-gray-700 mb-1.5">
            Pitch Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            placeholder="e.g. Teslim Balogun Stadium, Surulere"
            className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-xs font-bold text-gray-700 mb-1.5">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Optional description"
            className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 resize-none"
          />
        </div>
        <fieldset>
          <legend className="block text-xs font-bold text-gray-700 mb-1.5">How often do players pay?</legend>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {frequencyOptions.map((o) => (
              <label key={o.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="paymentType"
                  value={o.value}
                  defaultChecked={o.value === PaymentType.PER_SESSION}
                  className="peer sr-only"
                />
                <span className="flex flex-col h-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300">
                  <span className="text-sm font-bold text-ink">{o.label}</span>
                  <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-4">
          <legend className="block text-sm font-bold text-ink mb-2">Match day</legend>
          <MatchDayFields value={matchDay} onChange={(patch) => setMatchDay((m) => ({ ...m, ...patch }))} idPrefix="new" />
        </fieldset>
        <RsvpToggle name="requireRsvp" checked />

        <ContributionsVisibilityPicker name="contributionsVisibility" />
            </div>
          </Collapse>
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
