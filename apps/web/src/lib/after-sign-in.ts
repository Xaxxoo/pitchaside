import { useEffect, useState } from 'react';
import { UserRole } from '@pitchaside/shared';

/**
 * Where to go after signing in or up: back to the page that sent them (a pitch they were booking),
 * else their own home. Only a path on this site is followed, never another address, so a link
 * can't use the sign-in page to send someone elsewhere.
 */
export function nextPath(search: string | URLSearchParams = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const raw = (typeof search === 'string' ? new URLSearchParams(search) : search).get('redirect');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f]/.test(raw)) return null;
  return raw;
}

/** Someone's home after signing in: a pitch owner's is their pitches, everyone else's the dashboard. */
export function homeFor(user: { role?: UserRole | string } | null | undefined) {
  return user?.role === UserRole.PITCH_OWNER ? '/my-pitches' : '/dashboard';
}

/** The `?redirect=` to carry between sign in and sign up, so switching pages keeps where they were going. */
export function useCarryRedirect() {
  const [carry, setCarry] = useState('');
  useEffect(() => {
    const next = nextPath();
    if (next) setCarry(`?redirect=${encodeURIComponent(next)}`);
  }, []);
  return carry;
}
