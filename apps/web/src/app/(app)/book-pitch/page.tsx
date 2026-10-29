'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BookPitchEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim()) {
      router.push(`/book-pitch/${code.trim()}`);
    }
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  return (
    <div className="max-w-sm mx-auto pt-20">
      <h1 className="text-2xl font-extrabold text-ink text-center mb-2">Book a pitch</h1>
      <p className="text-sm text-gray-500 text-center mb-8">
        Enter the pitch share code to view availability and book a slot.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Pitch code (e.g. a1b2c3d4)"
          className={inputClass}
          autoFocus
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
        >
          View availability
        </button>
      </form>
    </div>
  );
}
