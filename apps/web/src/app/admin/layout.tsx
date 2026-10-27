'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole } from '@pitchaside/shared';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/brand';
import { BallLoader } from '@/components/skeleton';

const sections = [
  {
    label: 'Overview',
    href: '/admin',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
  },
  {
    label: 'Clubs',
    href: '/admin/clubs',
    icon: 'm2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  },
  {
    label: 'People',
    href: '/admin/people',
    icon: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  },
  {
    label: 'Money',
    href: '/admin/money',
    icon: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  },
  {
    label: 'Notifications',
    href: '/admin/notifications',
    icon: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
  },
  {
    label: 'Activity',
    href: '/admin/activity',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
];

function Icon({ path }: { path: string }) {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

/** HQ shell — the PitchAside team's area. Anyone who isn't a super admin is sent back to their own app. */
export default function HqLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = user?.role === UserRole.SUPER_ADMIN;
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage || loading) return;
    if (!user) router.replace('/admin/login');
    else if (!allowed) router.replace('/dashboard');
  }, [user, loading, allowed, router, isLoginPage]);

  // The login page renders inside this layout but doesn't need the shell or auth guard.
  if (isLoginPage) return <>{children}</>;

  if (loading || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BallLoader />
      </div>
    );
  }

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  return (
    <>
      {/* Phone: logo bar + scrolling section tabs */}
      <header className="md:hidden sticky top-safe z-40 bg-ink text-white">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            <Logo href="/admin" tone="light" size="sm" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-volt-400 text-ink">HQ</span>
          </div>
          <button onClick={logout} className="text-xs font-semibold text-white/60 hover:text-white">
            Sign out
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2.5" aria-label="HQ sections">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={isActive(s.href) ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                isActive(s.href) ? 'bg-volt-400 text-ink' : 'text-white/60'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Desktop sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-ink turf-stripes text-white flex-col z-50" aria-label="HQ sections">
        <div className="px-5 pt-6 pb-6">
          <Logo href="/admin" tone="light" />
          <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] px-2 py-1 rounded-md bg-volt-400 text-ink">
            HQ · every club
          </p>
        </div>

        <div className="flex-1 px-3 space-y-1">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={isActive(s.href) ? 'page' : undefined}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive(s.href)
                  ? 'bg-volt-400 text-ink shadow-[0_6px_20px_-8px_rgba(212,245,60,0.6)]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon path={s.icon} />
              {s.label}
            </Link>
          ))}
        </div>

        <div className="p-3 border-t border-white/10">
          <div className="px-2 py-2 min-w-0">
            <p className="text-sm font-bold text-white truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-white/45 truncate">{user.email}</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <Link
              href="/settings"
              className="flex items-center justify-center py-2 text-xs font-semibold text-white/60 bg-white/[0.06] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Settings
            </Link>
            <button
              onClick={logout}
              className="flex items-center justify-center py-2 text-xs font-semibold text-white/60 bg-white/[0.06] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="min-h-screen pb-12 md:pl-60 md:pt-4">
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">{children}</div>
      </main>
    </>
  );
}
