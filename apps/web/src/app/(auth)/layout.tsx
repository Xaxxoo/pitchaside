'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { NightStadium } from '@/components/illustrations';
import { BallLoader } from '@/components/skeleton';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <BallLoader />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1fr_1.05fr]">
      <div className="min-h-screen flex items-center justify-center px-5 py-12 relative">
        <div className="absolute inset-0 chalk-dots opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] pointer-events-none" />
        <div className="relative w-full max-w-sm flex flex-col items-center animate-fade-in-up">
          <div className="lg:hidden w-full h-32 mb-8 rounded-3xl overflow-hidden bg-pitch-950 border-2 border-ink shadow-sticker">
            <NightStadium className="w-full h-full" />
          </div>
          {children}
        </div>
      </div>

      {/* Floodlit night game */}
      <aside className="hidden lg:block p-3 h-screen sticky top-safe">
        <div className="relative h-full rounded-[32px] overflow-hidden bg-pitch-950">
          <NightStadium className="absolute inset-x-0 top-0 bottom-44 w-full h-[calc(100%-11rem)]" />
          <div className="absolute inset-x-0 bottom-44 h-32 bg-gradient-to-t from-pitch-950 to-transparent" />
          <div className="absolute left-8 right-8 bottom-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-volt-400 text-ink text-[11px] font-extrabold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse-soft" />
              Live tonight
            </div>
            <p className="mt-4 font-display text-4xl xl:text-[44px] font-extrabold text-white tracking-tight leading-[1.02]">
              You organise the game.
              <br />
              <span className="text-volt-300">We&apos;ll keep the score</span> on who&apos;s paid.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
