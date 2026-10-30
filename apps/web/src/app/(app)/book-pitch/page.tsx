'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { field } from '@/components/group/group-edit-sheet';
import { Steps } from '@/components/steps';
import { btnMain } from '@/components/buttons';
import { getMyBookings, pitchCode } from '@/lib/pitch';
import type { IPitchBooking } from '@pitchaside/shared';
import { BackButton } from '@/components/back-button';

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
      <BackButton label="Home" href="/dashboard" />
      <PageHeader eyebrow="Pitches" title="Book a pitch" subtitle="Four steps, in this order." />

      {/* The steps are the page: the link box sits in the step it belongs to */}
      <form onSubmit={open} noValidate className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6">
        <Steps
          steps={[
            { title: 'Get the pitch’s link', sub: 'The owner sends it, often on WhatsApp.' },
            {
              title: 'Paste it here',
              sub: 'The whole link, or just its code.',
              action: (
                <div className="space-y-3">
                  <input
                    id="pitch-link"
                    aria-label="Pitch link or code"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="pitchaside.com/p/a1b2c3d4"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="url"
                    aria-invalid={tried && !code}
                    aria-describedby={tried && !code ? 'pitch-link-error' : undefined}
                    className={`${field} ${tried && !code ? 'border-kit-500' : ''}`}
                  />
                  {tried && !code && (
                    <p id="pitch-link-error" className="text-[12px] font-bold text-kit-600">That isn’t a pitch link. Check it with the owner.</p>
                  )}
                  <button type="submit" className={`w-full ${btnMain}`}>See free times</button>
                </div>
              ),
            },
            { title: 'Pick a day and times', sub: 'Tap as many as you need, then send.' },
            { title: 'The owner confirms', sub: 'Then you pay them, not before.' },
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
