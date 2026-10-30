'use client';

import { PushKeeper } from '@/components/notify';
import { InstallNudge } from '@/components/pwa';
import { TourHost } from '@/components/onboarding/tour';
import { openTour } from '@/lib/onboarding';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/brand';
import { BallLoader } from '@/components/skeleton';
import { getPlayerProfile, PlayerAuthError, type PlayerProfile } from '@/lib/player';

const ProfileContext = createContext<{ profile: PlayerProfile | null; refresh: () => Promise<void> }>({
  profile: null,
  refresh: async () => {},
});

export const usePlayerProfile = () => useContext(ProfileContext);

const tabs = [
  {
    href: '/me',
    label: 'Home',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />,
  },
  {
    href: '/me/games',
    label: 'Games',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />,
  },
  {
    href: '/me/club',
    label: 'Club',
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18v-1.5h-9V18m9 0h1.5v2.25H6V18h1.5m9 0H7.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25v-2.5m0 0A3.75 3.75 0 0 0 15.75 8V3.75h-7.5V8A3.75 3.75 0 0 0 12 11.75Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25H18a2.25 2.25 0 0 1 0 4.5h-.75m-9-4.5H6a2.25 2.25 0 0 0 0 4.5h.75" />
      </>
    ),
  },
  {
    href: '/me/pay',
    label: 'Pay',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />,
  },
  {
    href: '/me/profile',
    label: 'Me',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />,
  },
];

/** Playing ⇄ Organising. Organising needs the organiser's email + password (it handles money). */
export function ModeSwitch({ organiser, tone = 'light' }: { organiser: PlayerProfile['organiser']; tone?: 'light' | 'dark' }) {
  const router = useRouter();
  if (!organiser) return null;
  const goOrganise = () => {
    // Middleware redirects to /signin if no auth cookies exist
    router.push('/dashboard');
  };
  return (
    <div
      className={`flex items-center rounded-full p-0.5 text-[12px] font-bold ${tone === 'dark' ? 'bg-white/10' : 'bg-chalk border border-gray-200'}`}
      role="tablist"
      aria-label="Mode"
    >
      <span
        className={`flex-1 inline-flex items-center justify-center min-h-10 text-center px-3 rounded-full ${tone === 'dark' ? 'bg-volt-400 text-ink' : 'bg-ink text-volt-300'}`}
        role="tab"
        aria-selected
      >
        Playing
      </span>
      <button
        onClick={goOrganise}
        aria-label="Organising: back to running your groups"
        className={`press flex-1 min-h-10 px-3 rounded-full ${tone === 'dark' ? 'text-white/60 hover:text-white' : 'text-gray-600 hover:text-ink'}`}
        role="tab"
        aria-selected={false}
      >
        Organising
      </button>
    </div>
  );
}

/** Player app frame: header with mode switch, content, floating tab bar. */
export function PlayerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setProfile(await getPlayerProfile());
      setFailed(null);
    } catch (err) {
      if (err instanceof PlayerAuthError) router.replace('/me/login');
      else setFailed(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        {failed ? (
          <div className="text-center" role="alert">
            <p className="text-[15px] font-bold text-ink">Your season didn’t load.</p>
            <p className="mt-1 text-[13px] text-gray-500">The server said: “{failed}”</p>
            <button
              onClick={() => {
                setFailed(null);
                refresh();
              }}
              className="mt-3 min-h-11 px-4 text-sm font-bold text-pitch-700"
            >
              Try again
            </button>
          </div>
        ) : (
          <BallLoader label="Loading your season…" />
        )}
      </div>
    );
  }

  const isActive = (href: string) => (href === '/me' ? pathname === '/me' : pathname.startsWith(href));
  const initials = `${profile.player.firstName[0] ?? ''}${profile.player.lastName[0] ?? ''}`.toUpperCase();

  return (
    <ProfileContext.Provider value={{ profile, refresh }}>
      {/* Desktop sidebar — same frame as the organiser app */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-ink turf-stripes text-white flex-col z-50">
        <div className="px-5 pt-6 pb-6">
          <Logo href="/me" tone="light" />
          {profile.organiser && (
            <div className="mt-4">
              <ModeSwitch organiser={profile.organiser} tone="dark" />
            </div>
          )}
        </div>
        <p className="px-6 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Playing</p>
        <div className="flex-1 px-3 space-y-1">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive(t.href)
                  ? 'bg-volt-400 text-ink shadow-[0_6px_20px_-8px_rgba(212,245,60,0.6)]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
              }`}
              aria-current={isActive(t.href) ? 'page' : undefined}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={isActive(t.href) ? 2.2 : 1.6} stroke="currentColor" aria-hidden>
                {t.icon}
              </svg>
              {t.label}
            </Link>
          ))}
        </div>
        {!profile.organiser && (
          <Link
            href="/me/start-group"
            className="mx-3 mb-3 rounded-2xl bg-pitch-800/70 border border-white/10 p-4 hover:bg-pitch-800 transition-colors"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-volt-300">Run your own games?</p>
            <p className="text-xs text-white/70 mt-1.5 leading-relaxed">Start a group — collect payments, RSVPs and votes.</p>
          </Link>
        )}
        <button
          onClick={openTour}
          className="mx-3 mb-3 py-2 rounded-lg text-xs font-semibold text-white/60 bg-white/[0.06] hover:text-white hover:bg-white/10 transition-colors"
        >
          How PitchAside works
        </button>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-volt-400 text-ink flex items-center justify-center text-xs font-extrabold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">
                {profile.player.firstName} {profile.player.lastName}
              </p>
              <p className="text-xs text-white/45 truncate">{profile.player.email}</p>
            </div>
          </div>
        </div>
      </nav>

      <div className="min-h-screen pb-[calc(7rem_+_var(--install-nudge,0px))] md:pb-12 md:pl-60">
        {/* No phone header bar, like the organiser app: each screen opens on its own title. An
            organiser can always get back to organising: the Playing ⇄ Organising switch sits in
            Home's header, above every other tab's title on phones, and in the desktop sidebar. */}
        <main className="max-w-md md:max-w-5xl mx-auto px-4 md:px-8 pt-4 md:pt-10">
          {profile.organiser && pathname !== '/me' && (
            <div className="md:hidden -mt-1 mb-2 flex justify-end">
              <ModeSwitch organiser={profile.organiser} />
            </div>
          )}
          {children}
        </main>
      </div>

      <TourHost side="player" done={!!profile.player.photoKey} />
      <PushKeeper side="player" />

      {/* Until it's on their home screen: a nudge just above the tab bar, every visit */}
      <div className="hide-while-typing md:hidden fixed bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+5rem)] inset-x-3 z-40 max-w-md mx-auto">
        <InstallNudge />
      </div>

      {/* Phone tab bar */}
      <nav className="hide-while-typing md:hidden fixed bottom-0 inset-x-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none">
        <div className="pointer-events-auto max-w-md mx-auto flex justify-around items-center bg-ink/95 backdrop-blur-xl rounded-[22px] px-1.5 py-1.5 shadow-lift">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center rounded-2xl h-12 flex-1 transition-all ${
                isActive(t.href) ? 'bg-volt-400 text-ink' : 'text-white/55'
              }`}
              aria-current={isActive(t.href) ? 'page' : undefined}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={isActive(t.href) ? 2.2 : 1.6} stroke="currentColor" aria-hidden>
                {t.icon}
              </svg>
              <span className={`text-[10px] mt-0.5 ${isActive(t.href) ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </ProfileContext.Provider>
  );
}
