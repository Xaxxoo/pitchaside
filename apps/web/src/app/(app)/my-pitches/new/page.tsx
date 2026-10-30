'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPitch } from '@/lib/pitch';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/brand';
import { btnMain } from '@/components/buttons';
import { NigerianLocationPicker } from '@/components/nigerian-location-picker';
import { field, label, Stepper } from '@/components/group/group-edit-sheet';
import { GameLengthPicker, gameLengthOk } from '@/components/pitch/game-length-picker';


/**
 * Add a pitch with only what it takes to exist: its name, where it is and what a game costs.
 * Everything else (hours, photos, how to find it, your bank) is on Pitch details, opened next on
 * the hours, since a pitch with no hours can't be booked.
 */
export default function NewPitchPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [price, setPrice] = useState(0);
  const [minutes, setMinutes] = useState(60);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error('Give the pitch a name.');
    if (price < 1) return toast.error('Set what one game costs.');
    if (!gameLengthOk(minutes)) return toast.error('A game lasts between 15 minutes and 4 hours.');
    setSaving(true);
    try {
      const pitch = await createPitch({ name: name.trim(), state: state || undefined, city: city || undefined, defaultPrice: price, slotDurationMinutes: minutes });
      toast.success('Pitch added. Now set its hours.');
      router.push(`/my-pitches/${pitch.id}/settings?open=hours`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t save. Try again.');
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader eyebrow="Your pitches" title="Add a pitch" subtitle="Name, area and price now. Hours and photos next." />
      <form onSubmit={save} noValidate className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6 space-y-5">
        <div>
          <label htmlFor="name" className={label}>Pitch name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Surulere Astro Turf" className={field} />
        </div>
        {/* The picker brings its own State and City labels */}
        <NigerianLocationPicker required={false} state={state} city={city} onStateChange={(s) => { setState(s); setCity(''); }} onCityChange={setCity} />
        <div>
          <p id="price-label" className={label}>Price a game</p>
          <Stepper id="price" value={price} onChange={setPrice} step={1000} min={0} prefix="₦" labelledBy="price-label" less="₦1,000 less" more="₦1,000 more" />
        </div>
        <GameLengthPicker value={minutes} onChange={setMinutes} />
        <button type="submit" disabled={saving} className={`w-full ${btnMain}`}>{saving ? 'Adding…' : 'Add pitch'}</button>
      </form>
    </div>
  );
}
