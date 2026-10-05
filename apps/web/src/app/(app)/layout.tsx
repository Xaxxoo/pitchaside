'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useAuth } from '@/lib/auth';
import { EmailVerifiedModal, VerifyEmailModal } from '@/components/verify-email-modal';
import { BallLoader } from '@/components/skeleton';
import { InstallCard } from '@/components/pwa';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [celebrate, setCelebrate] = useState(false);
  const wasUnverified = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/signin');
    }
  }, [user, loading, router]);

  // Verified from another device or tab while this one was open: cheer when we notice.
  const verified = user?.emailVerified;
  useEffect(() => {
    if (verified === false) wasUnverified.current = true;
    else if (verified && wasUnverified.current) {
      wasUnverified.current = false;
      setCelebrate(true);
    }
  }, [verified]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      {!user.emailVerified && <VerifyEmailModal email={user.email} onCheck={refreshUser} />}
      {celebrate && <EmailVerifiedModal onClose={() => setCelebrate(false)} />}
      <main className="min-h-screen pb-28 pt-[env(safe-area-inset-top)] md:pb-10 md:pl-60 md:pt-4">
        {children}
      </main>
      <div className="fixed bottom-20 left-4 right-4 z-40 md:hidden">
        <InstallCard />
      </div>
      <Nav />
    </>
  );
}
