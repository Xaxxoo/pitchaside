'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPitch } from '@/lib/pitch';
import { useToast } from '@/components/toast';

export default function NewPitchPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    description: '',
    slotDurationMinutes: '60',
    defaultPrice: '',
    currency: 'NGN',
  });
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const pitch = await createPitch({
        name: form.name,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        description: form.description || undefined,
        slotDurationMinutes: Number(form.slotDurationMinutes),
        defaultPrice: Number(form.defaultPrice),
        currency: form.currency,
      });
      toast.success('Pitch created');
      router.push(`/my-pitches/${pitch.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create pitch');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-extrabold text-ink mb-6">Add a pitch</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-bold text-gray-700 mb-1.5">Pitch name *</label>
          <input id="name" name="name" required value={form.name} onChange={handleChange} className={inputClass} placeholder="e.g. Main Field" />
        </div>
        <div>
          <label htmlFor="address" className="block text-xs font-bold text-gray-700 mb-1.5">Address</label>
          <input id="address" name="address" value={form.address} onChange={handleChange} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="city" className="block text-xs font-bold text-gray-700 mb-1.5">City</label>
            <input id="city" name="city" value={form.city} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label htmlFor="state" className="block text-xs font-bold text-gray-700 mb-1.5">State</label>
            <input id="state" name="state" value={form.state} onChange={handleChange} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="description" className="block text-xs font-bold text-gray-700 mb-1.5">Description</label>
          <textarea id="description" name="description" rows={3} value={form.description} onChange={handleChange} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="defaultPrice" className="block text-xs font-bold text-gray-700 mb-1.5">Price per slot *</label>
            <input id="defaultPrice" name="defaultPrice" type="number" min={0} step="0.01" required value={form.defaultPrice} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label htmlFor="slotDurationMinutes" className="block text-xs font-bold text-gray-700 mb-1.5">Slot duration (min)</label>
            <select id="slotDurationMinutes" name="slotDurationMinutes" value={form.slotDurationMinutes} onChange={handleChange} className={inputClass}>
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">120 min</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={submitting} className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create Pitch'}
        </button>
      </form>
    </div>
  );
}
