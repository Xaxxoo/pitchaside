'use client';

import { UserRole } from '@pitchaside/shared';
import { useAuth } from '@/lib/auth';
import { Callout } from '@/components/callout';
import { VerifyEmailRow } from '@/components/verify-email-modal';

/** Who can list a pitch: the same rule as the server (pitch-access.ts). */
const LISTERS = [UserRole.ORG_ADMIN, UserRole.PITCH_OWNER, UserRole.SUPER_ADMIN];

/**
 * Before adding a pitch: a pitch takes money, so only a group's admin or a pitch owner with a
 * confirmed email can list one. Says which step is missing and how to do it; null when it's fine.
 */
export function ListPitchGate() {
  const { user, refreshUser } = useAuth();
  if (!user) return null;
  if (!LISTERS.includes(user.role)) {
    return (
      <Callout tone="note" title="Ask your group’s admin">
        Admins and pitch owners list pitches.
      </Callout>
    );
  }
  if (user.emailVerified) return null;
  return (
    <div>
      <Callout tone="note" title="Confirm your email first" className="mb-3">
        A pitch takes money, so we check the email is yours.
      </Callout>
      <VerifyEmailRow email={user.email} verified={false} onCheck={refreshUser} />
    </div>
  );
}

/** True when the signed-in person can list a pitch now. */
export function useCanListPitch() {
  const { user } = useAuth();
  return !!user && LISTERS.includes(user.role) && !!user.emailVerified;
}
