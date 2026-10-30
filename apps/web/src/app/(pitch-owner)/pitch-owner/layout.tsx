'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { UserRole } from '@pitchaside/shared';
import { BallLoader } from '@/components/skeleton';
import { Logo } from '@/components/brand';

const navItems = [
  { label: 'Home', href: '/pitch-owner/dashboard' },
  { label: 'Pitches', href: '/pitch-owner/pitches' },
  { label: 'Settings', href: '/pitch-owner/settings' },
];

export default function PitchOwnerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/signin');
    }
    if (!loading && user && user.role !== UserRole.PITCH_OWNER && user.role !== UserRole.SUPER_ADMIN) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-chalk">
      {/* Dark bar: logo and sign out, then the three places as equal tabs (fits a 360px phone) */}
      <nav className="bg-ink turf-stripes text-white pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3">
            <Logo href="/pitch-owner/dashboard" tone="light" />
            <button onClick={() => logout()} className="press ml-auto min-h-11 px-2 text-sm font-bold text-white/70 hover:text-white transition-colors">
              Sign out
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 pb-2">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`press min-h-11 flex items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                    active ? 'bg-white/15 text-volt-300' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
