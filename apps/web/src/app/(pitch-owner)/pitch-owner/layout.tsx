'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { UserRole } from '@pitchaside/shared';
import { BallLoader } from '@/components/skeleton';
import { Logo } from '@/components/brand';

const navItems = [
  { label: 'Dashboard', href: '/pitch-owner/dashboard' },
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
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-ink text-white">
        <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
          <Link href="/pitch-owner/dashboard" className="flex-shrink-0">
            <Logo />
          </Link>
          <div className="flex items-center gap-1 ml-4">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-white/15 text-volt-300' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-white/60">{user.firstName}</span>
            <button
              onClick={() => logout()}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
