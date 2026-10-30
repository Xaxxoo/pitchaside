'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { btnPrimary } from '@/components/buttons';
import { Steps } from '@/components/steps';
import { getMyBookings, pitchCode } from '@/lib/pitch';
import type { IPitchBooking } from '@pitchaside/shared';

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

      <form onSubmit={open} noValidate className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-5">
        <label htmlFor="pitch-link" className="block text-xs font-bold text-gray-700 mb-1.5">Pitch link or code</label>
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
          className="w-full min-h-12 px-3.5 bg-white border border-gray-200 rounded-xl text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
        />
        <p id="pitch-link-help" className={`text-[12px] mt-1.5 ${tried && !code ? 'text-kit-600 font-bold' : 'text-gray-500'}`}>
          {tried && !code ? 'That isn’t a pitch link. Check it with the owner.' : 'The whole link works, or just the code at the end.'}
        </p>
        <button type="submit" className={`mt-4 w-full ${btnPrimary}`}>See free times</button>

        <Steps
          className="mt-6 pt-5 border-t border-gray-200"
          heading="How it works"
          steps={[
            { title: 'Open the owner’s link', sub: 'Or paste it here.' },
            { title: 'Pick a day and times', sub: 'Tap as many as you need.' },
            { title: 'The owner confirms', sub: 'Then you pay them.' },
          ]}
        />
      </form>

      <Link href="/book-pitch/mine" className="press mt-4 flex items-center gap-3 rounded-3xl bg-white border border-gray-100 shadow-card px-5 min-h-16 py-3">
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
