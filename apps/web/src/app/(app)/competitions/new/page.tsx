'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/components/back-button';
import { FormHero, FormShell, formCardClass } from '@/components/form-hero';
import { Trophy } from '@/components/illustrations';
import { NigerianLocationPicker } from '@/components/nigerian-location-picker';
import { useToast } from '@/components/toast';
import { createCompetition } from '@/lib/api';
import { CompetitionFormat, CompetitionScope, CompetitionVisibility } from '@pitchaside/shared';

type Errors = Record<string, string>;

function validate(form: FormData, scope: string): Errors | null {
  const errors: Errors = {};
  const name = (form.get('name') as string).trim();
  if (!name) errors.name = 'Competition name is required';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters';

  if (!form.get('format')) errors.format = 'Pick a format';
  if (!form.get('scope')) errors.scope = 'Pick a scope';

  if ((scope === 'state' || scope === 'city') && !form.get('state')) {
    errors.state = 'State is required';
  }
  if (scope === 'city' && !form.get('city')) {
    errors.city = 'City is required';
  }

  const maxTeams = Number(form.get('maxTeams'));
  if (maxTeams && (maxTeams < 2 || maxTeams > 256)) errors.maxTeams = 'Between 2 and 256';

  return Object.keys(errors).length ? errors : null;
}

export default function NewCompetitionPage() {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [scope, setScope] = useState<string>('nationwide');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const validationErrors = validate(form, scope);
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const comp = await createCompetition({
        name: (form.get('name') as string).trim(),
        description: (form.get('description') as string) || undefined,
        format: form.get('format') as CompetitionFormat,
        scope: scope as CompetitionScope,
        state: selectedState || undefined,
        city: selectedCity || undefined,
        visibility: form.get('visibility') as CompetitionVisibility,
        entryFee: Number(form.get('entryFee')) || 0,
        maxTeams: Number(form.get('maxTeams')) || 32,
        minPlayersPerTeam: Number(form.get('minPlayersPerTeam')) || 5,
        maxPlayersPerTeam: Number(form.get('maxPlayersPerTeam')) || 25,
        registrationDeadline: (form.get('registrationDeadline') as string) || undefined,
        startDate: (form.get('startDate') as string) || undefined,
        endDate: (form.get('endDate') as string) || undefined,
        rules: (form.get('rules') as string) || undefined,
      });
      router.push(`/competitions/${comp.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create competition');
      setSubmitting(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 ${
      errors[field] ? 'border-kit-500' : 'border-gray-200'
    }`;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Cups" />
      <FormShell>
        <FormHero
          eyebrow="New tournament"
          title="Create Cup"
          subtitle="Set up a knockout or league competition. Teams register and pay, you manage fixtures and results."
          art={<Trophy className="w-full h-auto" />}
        />

        <form onSubmit={handleSubmit} className={formCardClass}>
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-xs font-bold text-gray-700 mb-1.5">Competition Name *</label>
            <input id="name" name="name" type="text" placeholder="e.g. Surulere 5-a-side Cup" className={inputClass('name')} />
            {errors.name && <p className="text-xs text-kit-600 mt-1">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-xs font-bold text-gray-700 mb-1.5">Description</label>
            <textarea id="description" name="description" rows={2} placeholder="Optional details about the competition" className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 resize-none" />
          </div>

          {/* Format */}
          <fieldset>
            <legend className="block text-xs font-bold text-gray-700 mb-1.5">Format *</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: CompetitionFormat.KNOCKOUT, label: 'Knockout', hint: 'Single elimination bracket' },
                { value: CompetitionFormat.LEAGUE, label: 'League', hint: 'Round-robin, everyone plays everyone' },
              ].map((o) => (
                <label key={o.value} className="cursor-pointer">
                  <input type="radio" name="format" value={o.value} className="peer sr-only" />
                  <span className="flex flex-col h-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300">
                    <span className="text-sm font-bold text-ink">{o.label}</span>
                    <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {errors.format && <p className="text-xs text-kit-600 mt-1">{errors.format}</p>}
          </fieldset>

          {/* Scope */}
          <fieldset>
            <legend className="block text-xs font-bold text-gray-700 mb-1.5">Scope *</legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: CompetitionScope.NATIONWIDE, label: 'Nationwide' },
                { value: CompetitionScope.STATE, label: 'State' },
                { value: CompetitionScope.CITY, label: 'City' },
              ].map((o) => (
                <label key={o.value} className="cursor-pointer">
                  <input type="radio" name="scope" value={o.value} defaultChecked={o.value === 'nationwide'} onChange={() => { setScope(o.value); setSelectedState(''); setSelectedCity(''); }} className="peer sr-only" />
                  <span className="flex items-center justify-center px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-sm font-bold text-ink transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300">
                    {o.label}
                  </span>
                </label>
              ))}
            </div>
            {errors.scope && <p className="text-xs text-kit-600 mt-1">{errors.scope}</p>}
          </fieldset>

          {/* State/City pickers */}
          {(scope === 'state' || scope === 'city') && (
            <>
              <NigerianLocationPicker
                state={selectedState}
                city={selectedCity}
                onStateChange={setSelectedState}
                onCityChange={setSelectedCity}
              />
              <input type="hidden" name="state" value={selectedState} />
              <input type="hidden" name="city" value={selectedCity} />
              {errors.state && <p className="text-xs text-kit-600 -mt-2">{errors.state}</p>}
              {errors.city && <p className="text-xs text-kit-600 -mt-2">{errors.city}</p>}
            </>
          )}

          {/* Visibility */}
          <fieldset>
            <legend className="block text-xs font-bold text-gray-700 mb-1.5">Visibility</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: CompetitionVisibility.PUBLIC, label: 'Public', hint: 'Anyone can find and join' },
                { value: CompetitionVisibility.INVITE_ONLY, label: 'Invite Only', hint: 'Teams need an invite code' },
              ].map((o) => (
                <label key={o.value} className="cursor-pointer">
                  <input type="radio" name="visibility" value={o.value} defaultChecked={o.value === 'public'} className="peer sr-only" />
                  <span className="flex flex-col h-full px-3 py-2.5 rounded-xl border-2 border-gray-200 bg-white transition-colors peer-checked:border-ink peer-checked:bg-volt-300 peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 hover:border-gray-300">
                    <span className="text-sm font-bold text-ink">{o.label}</span>
                    <span className="text-[11px] text-gray-500 leading-tight mt-0.5">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Entry fee + Max teams */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="entryFee" className="block text-xs font-bold text-gray-700 mb-1.5">Entry Fee (NGN)</label>
              <input id="entryFee" name="entryFee" type="number" min={0} step="0.01" defaultValue={0} placeholder="0 = free" className={inputClass('entryFee')} />
            </div>
            <div>
              <label htmlFor="maxTeams" className="block text-xs font-bold text-gray-700 mb-1.5">Max Teams</label>
              <input id="maxTeams" name="maxTeams" type="number" min={2} max={256} defaultValue={32} className={inputClass('maxTeams')} />
              {errors.maxTeams && <p className="text-xs text-kit-600 mt-1">{errors.maxTeams}</p>}
            </div>
          </div>

          {/* Player count range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="minPlayersPerTeam" className="block text-xs font-bold text-gray-700 mb-1.5">Min Players / Team</label>
              <input id="minPlayersPerTeam" name="minPlayersPerTeam" type="number" min={1} defaultValue={5} className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
            </div>
            <div>
              <label htmlFor="maxPlayersPerTeam" className="block text-xs font-bold text-gray-700 mb-1.5">Max Players / Team</label>
              <input id="maxPlayersPerTeam" name="maxPlayersPerTeam" type="number" min={1} defaultValue={25} className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="registrationDeadline" className="block text-xs font-bold text-gray-700 mb-1.5">Reg. Deadline</label>
              <input id="registrationDeadline" name="registrationDeadline" type="date" className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
            </div>
            <div>
              <label htmlFor="startDate" className="block text-xs font-bold text-gray-700 mb-1.5">Start Date</label>
              <input id="startDate" name="startDate" type="date" className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-xs font-bold text-gray-700 mb-1.5">End Date</label>
              <input id="endDate" name="endDate" type="date" className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600" />
            </div>
          </div>

          {/* Rules */}
          <div>
            <label htmlFor="rules" className="block text-xs font-bold text-gray-700 mb-1.5">Rules</label>
            <textarea id="rules" name="rules" rows={3} placeholder="Competition rules, match format, tiebreakers..." className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 resize-none" />
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-chalk border border-gray-200 p-3.5">
            <div className="w-8 h-8 rounded-lg bg-ink text-volt-300 flex items-center justify-center shrink-0 font-display font-extrabold text-sm">₦</div>
            <p className="text-xs text-gray-600 leading-relaxed">
              After creating, you can open a dedicated <span className="font-bold text-ink">Payrep MFB account</span> for this competition.
              Teams pay into it and their registration is confirmed automatically.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-ink text-volt-300 font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Cup'}
          </button>
        </form>
      </FormShell>
    </div>
  );
}
