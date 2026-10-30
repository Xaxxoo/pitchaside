'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { field, label } from '@/components/group/group-edit-sheet';
import { btnMain } from '@/components/buttons';
import { getMyBookings, pitchCode } from '@/lib/pitch';
import type { IPitchBooking } from '@pitchaside/shared';

const HOW = [
  { title: 'Get the link', sub: 'From the owner', icon: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244' },
  { title: 'Pick times', sub: 'One or more', icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { title: 'Get confirmed', sub: 'Then you pay', icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
];

/** Bookings still to come, and how many are waiting on the owner, for the row under the card. */
function upcomingLine(list: IPitchBooking[]) {
  const today = new Date().toLocaleDateString('en-CA');
  const live = list.filter((b) => b.date >= today && (b.status === 'pending' || b.status === 'confirmed'));
  if (!live.length) return 'None coming up';
  const waiting = live.filter((b) => b.status === 'pending').length;
  return `${live.length} coming up${waiting ? ` · ${waiting} waiting for the owner` : ''}`;
}

/**
 * Book a pitch from inside the app. Pitch owners share a link; paste it (or just its code) and
 * the pitch opens with its free times. Your bookings sit right under it.
 */
export default function BookPitchEntryPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const [bookings, setBookings] = useState<IPitchBooking[] | null>(null);
  const code = pitchCode(text);

  useEffect(() => {
    getMyBookings().then(setBookings).catch(() => setBookings([]));
  }, []);

  function open(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (code) router.push(`/book-pitch/${code}`);
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader eyebrow="Pitches" title="Book a pitch" subtitle="Paste the link the pitch owner sent you." />

      <form onSubmit={open} noValidate className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6">
        <label htmlFor="pitch-link" className={label}>Pitch link or code</label>
        <input
          id="pitch-link"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. pitchaside.com/p/a1b2c3d4"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          aria-invalid={tried && !code}
          aria-describedby="pitch-link-help"
          className={field}
        />
        <p id="pitch-link-help" className={`text-[12px] mt-2 ${tried && !code ? 'text-kit-600 font-bold' : 'text-gray-500'}`}>
          {tried && !code ? 'That isn’t a pitch link. Check it with the owner.' : 'The whole link works, or just the code at the end.'}
        </p>
        <button type="submit" className={`mt-5 w-full ${btnMain}`}>See free times</button>
      </form>

      {/* How it works: three equal steps, quieter than the card above */}
      <section className="mt-6" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">How it works</h2>
        <ol className="grid grid-cols-3 gap-2">
          {HOW.map((h, i) => (
            <li key={h.title} className="rounded-2xl bg-chalk px-2.5 pt-3 pb-3.5 flex flex-col items-center text-center">
              <span className="relative w-11 h-11 rounded-full bg-white text-pitch-700 flex items-center justify-center" aria-hidden>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={h.icon} /></svg>
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ink text-volt-300 text-[11px] font-extrabold flex items-center justify-center">{i + 1}</span>
              </span>
              <span className="mt-2 text-[13px] font-bold text-ink leading-tight">{h.title}</span>
              <span className="mt-0.5 text-[11px] text-gray-600 leading-snug">{h.sub}</span>
            </li>
          ))}
        </ol>
      </section>

      <Link href="/book-pitch/mine" className="press mt-6 flex items-center gap-3 rounded-3xl bg-white border border-gray-100 shadow-card px-5 min-h-16 py-3">
        <span className="w-9 h-9 shrink-0 rounded-full bg-chalk text-pitch-700 flex items-center justify-center" aria-hidden>
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink">Your bookings</span>
          <span className="block text-[12px] text-gray-500 truncate">{bookings ? upcomingLine(bookings) : 'Loading…'}</span>
        </span>
        <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
      </Link>
    </div>
  );
}
