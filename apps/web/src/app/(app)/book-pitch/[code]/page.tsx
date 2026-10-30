'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BallLoader } from '@/components/skeleton';
import { btnPrimary } from '@/components/buttons';
import { PitchCard } from '@/components/pitch/pitch-card';
import { PitchBooking } from '@/components/pitch/pitch-booking';
import { getPublicPitch } from '@/lib/pitch';
import type { IPublicPitch } from '@pitchaside/shared';
import { BackButton } from '@/components/back-button';

/** Booking a pitch from inside the app: the same day-and-times picker as the pitch's own link. */
export default function BookPitchPage() {
  const { code } = useParams<{ code: string }>();
  const [pitch, setPitch] = useState<IPublicPitch | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getPublicPitch(code).then(setPitch).catch(() => setMissing(true));
  }, [code]);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Book a pitch" href="/book-pitch" />
      {missing ? (
        <section className="rounded-3xl bg-white border border-gray-100 shadow-card px-5 py-6">
          <h1 className="font-display text-[22px] font-extrabold text-ink">This pitch isn’t taking bookings</h1>
          <p className="text-sm text-gray-600 mt-1">Check the code with the owner.</p>
          <Link href="/book-pitch" className={`mt-4 w-full ${btnPrimary}`}>Try another code</Link>
        </section>
      ) : !pitch ? (
        <div className="flex justify-center py-20"><BallLoader /></div>
      ) : (
        <>
          <PitchCard pitch={pitch} />
          <PitchBooking code={code} pitch={pitch} inApp />
        </>
      )}
    </div>
  );
}
