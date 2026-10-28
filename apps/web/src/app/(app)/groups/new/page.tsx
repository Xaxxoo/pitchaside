'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
type SectionKey = 'when' | 'day' | 'money';

/** A choice card, the same for every pick-one on this form. */
const OPTION =
  'flex flex-col h-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300';

const ICONS = {
  // A calendar
  when: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  // A stopwatch
  day: 'M12 6v6l3.5 2M12 2.25h-2m2 0h2M12 21a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z',
  // A banknote
  money: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
};

/** Who sees the kitty, as a few words for the Money summary. */
const SEEN: Record<string, string> = { private: 'kitty private', totals: 'totals shown', names: 'names shown' };

/** "20:00" → "8pm", "19:30" → "7:30pm". */
function formatKickoff(t?: string) {
  const m = /^(\d{2}):(\d{2})/.exec(t ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  const hour = h % 12 || 12;
  return `${hour}${m[2] === '00' ? '' : `:${m[2]}`}${h < 12 ? 'am' : 'pm'}`;
}

/** One settings section: a row saying what's set, that opens to change it. */
function Section({ id, icon, title, summary, open, onToggle, children }: { id: string; icon: string; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={open ? 'bg-chalk/50' : undefined}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="press w-full min-h-16 flex items-center gap-3 px-5 sm:px-7 py-3 text-left">
        <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${open ? 'bg-ink text-volt-300' : 'bg-chalk text-pitch-700'}`} aria-hidden>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink">{title}</span>
          <span className="block text-[12px] text-gray-500 truncate">{summary}</span>
        </span>
        <svg className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <Collapse open={open} id={id}>
        <div className="px-5 sm:px-7 pb-5 pt-1 space-y-4">{children}</div>
      </Collapse>
    </div>
  );
}

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

      <form ref={formRef} onSubmit={handleSubmit} onChange={readForm} className={formCardClass}>
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




        {/* Everything else already has a good default. Three short sections, like things together,
            each saying what's set; one opens at a time so the form never runs on. Money first,
            straight under the fee it belongs with. */}
        <div>
          <p className="mb-1.5 text-xs font-bold text-gray-700">
            Settings <span className="font-medium text-gray-500">· set already, change any time</span>
          </p>
          {/* Edge to edge across the card, lines between: one less box around boxes */}
          <div className="-mx-5 sm:-mx-7 border-y border-gray-200 divide-y divide-gray-200">
            <Section
              id="new-group-money"
              icon={ICONS.money}
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
                      <input type="radio" name="scope" value={o.value} checked={scope === o.value} onChange={() => setScope(o.value)} className="peer sr-only" />
                      <span className={OPTION}>
                        <span className="text-sm font-bold text-ink">{o.label}</span>
                        <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {/* What really happens: the account isn't opened here, it's opened from home with BVN and NIN */}
                {scope === 'local' && <p className="mt-1.5 text-xs text-gray-500">You’ll open its bank account from home.</p>}
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
            </Section>

            <Section
              id="new-group-when"
              icon={ICONS.when}
              title="When and where"
              summary={[`${snap.targetPlayers || 10} a game`, snap.schedule?.trim(), formatKickoff(snap.kickoffTime)].filter(Boolean).join(' · ')}
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
            </Section>

            <Section
              id="new-group-day"
              icon={ICONS.day}
              title="Match day"
              summary={[matchDay.timerOn ? `${matchDay.gameMinutes}-min games` : 'No timer', snap.requireRsvp === 'on' ? 'players confirm' : 'no confirming'].join(' · ')}
              open={open === 'day'}
              onToggle={() => toggle('day')}
            >
              <RsvpToggle name="requireRsvp" checked />
              <MatchDayFields value={matchDay} onChange={(patch) => setMatchDay((m) => ({ ...m, ...patch }))} idPrefix="new" isNew />
            </Section>

          </div>
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
