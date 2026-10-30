'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { BallLoader } from '@/components/skeleton';
import { btnPrimary } from '@/components/buttons';
import { PitchCard } from '@/components/pitch/pitch-card';
import { PitchBooking } from '@/components/pitch/pitch-booking';
import { getPublicPitch } from '@/lib/pitch';
import type { IPublicPitch } from '@pitchaside/shared';

/** A pitch's own link: what it is and where, then pick a day and times and send a request. */
export default function PublicPitchPage() {
  const { code } = useParams<{ code: string }>();
  const [pitch, setPitch] = useState<IPublicPitch | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getPublicPitch(code).then(setPitch).catch(() => setMissing(true));
  }, [code]);

  return (
    <div className="min-h-screen bg-chalk">
      <div className="bg-ink">
        <div className="max-w-2xl mx-auto px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
          <Logo tone="light" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-8">
        {missing ? (
          <section className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6">
            <h1 className="font-display text-[22px] font-extrabold text-ink">This pitch isn’t taking bookings</h1>
            <p className="text-sm text-gray-600 mt-1">The link may be old, or the owner has hidden it.</p>
            <Link href="/" className={`mt-4 w-full ${btnPrimary}`}>Go to PitchAside</Link>
          </section>
        ) : !pitch ? (
          <div className="flex justify-center py-20"><BallLoader /></div>
        ) : (
          <>
            <PitchCard pitch={pitch} />
            <PitchBooking code={code} pitch={pitch} />
          </>
        )}
      </div>
    </div>
  );
}
