'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { useAuth } from '@/lib/auth';
import { EmailVerifiedModal, VerifyEmailModal } from '@/components/verify-email-modal';
import { VerifyIdentityModal } from '@/components/verify-identity-modal';
import { UserRole } from '@pitchaside/shared';
import { BallLoader } from '@/components/skeleton';
import { InstallNudge } from '@/components/pwa';
import { CurrentGroupProvider } from '@/lib/current-group';
import { TourHost } from '@/components/onboarding/tour';

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
    <CurrentGroupProvider>
      {!user.emailVerified && <VerifyEmailModal email={user.email} onCheck={refreshUser} />}
      {/* After the email one, so they never stack. Only the club admin opens accounts, so only they're asked. */}
      {user.emailVerified && (!user.bvn || !user.nin) && user.role === UserRole.ORG_ADMIN && <VerifyIdentityModal />}
      {celebrate && <EmailVerifiedModal onClose={() => setCelebrate(false)} />}
      <main className="min-h-screen pb-[calc(7rem_+_var(--install-nudge,0px))] md:pb-10 md:pl-60 md:pt-4">
        {children}
      </main>
      <div className="fixed bottom-20 left-4 right-4 z-40 md:hidden">
        <InstallNudge />
      </div>
      <Nav />
      <TourHost side="organiser" />
    </CurrentGroupProvider>
  );
}
