'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { http } from '@/lib/http';

export default function PitchOwnerAccountSettings() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    bvn: user?.bvn || '',
    nin: user?.nin || '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await http.patch('/auth/profile', {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        bvn: form.bvn || undefined,
        nin: form.nin || undefined,
      });
      await refreshUser();
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-extrabold text-ink mb-6">Account Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">First name</label>
            <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Last name</label>
            <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Email</label>
          <input disabled value={user?.email || ''} className={inputClass + ' bg-gray-50 text-gray-400'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
        </div>
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-3">BVN or NIN is required to create a collection account for receiving pitch payments.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">BVN</label>
              <input maxLength={11} value={form.bvn} onChange={(e) => setForm({ ...form, bvn: e.target.value.replace(/\D/g, '') })} className={inputClass} placeholder="11 digits" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">NIN</label>
              <input maxLength={11} value={form.nin} onChange={(e) => setForm({ ...form, nin: e.target.value.replace(/\D/g, '') })} className={inputClass} placeholder="11 digits" />
            </div>
          </div>
        </div>
        <button type="submit" disabled={saving} className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
