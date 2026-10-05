'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { UserRole } from '@pitchaside/shared';
import { Logo } from '@/components/brand';
import { useToast } from '@/components/toast';
import { playerTokenFromOrganiser } from '@/lib/api';
import { BallIcon } from '@/components/illustrations';

const tabs = [
  {
    label: 'Home',
    href: '/dashboard',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5} stroke="currentColor">
        {active ? (
          <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 0 1-.53 1.28h-1.44v7.44a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-7.44H4.28a.75.75 0 0 1-.53-1.28l8.69-8.69Z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        )}
      </svg>
    ),
  },
  {
    label: 'Groups',
    href: '/groups',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5} stroke="currentColor">
        {active ? (
          <path d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        )}
      </svg>
    ),
  },
  {
    label: 'Players',
    href: '/players',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5} stroke="currentColor">
        {active ? (
          <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        )}
      </svg>
    ),
  },
  {
    label: 'Sessions',
    href: '/sessions',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={active ? 2.2 : 1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        {active && <path d="M3 11.25V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v3.75Z" fill="currentColor" stroke="none" />}
      </svg>
    ),
  },
];

const adminTab = {
  label: 'Admin',
  href: '/admin',
  icon: (active: boolean) => (
    <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.5} stroke="currentColor">
      {active ? (
        <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" clipRule="evenodd" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </>
      )}
    </svg>
  ),
};

/** Organising → Playing: open this person's player side (same email). */
function usePlayingSwitch() {
  const router = useRouter();
  const toast = useToast();
  return async () => {
    try {
      await playerTokenFromOrganiser();
      router.push('/me');
    } catch (err: any) {
      toast.error(err.message || 'Could not switch');
    }
  };
}

export function Nav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const switchToPlaying = usePlayingSwitch();
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === UserRole.ORG_ADMIN || user?.role === UserRole.SUPER_ADMIN;
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : '';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [mobileMenuOpen]);

  const allTabs = isAdmin ? [...tabs, adminTab] : tabs;

  const settingsActive = pathname.startsWith('/settings');
  // On phones the bar keeps four tabs plus More; Admin lives in More (the sidebar has room for it).
  const moreActive = settingsActive || pathname.startsWith('/admin');

  return (
    <>
      {/* Mobile bottom nav — floating pill */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none">
        <div className="pointer-events-auto flex justify-around items-center bg-ink/95 backdrop-blur-xl rounded-[22px] px-1.5 py-1.5 shadow-lift">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center rounded-2xl h-12 min-w-0 flex-1 transition-all ${
                  isActive ? 'bg-volt-400 text-ink' : 'text-white/55 active:text-white'
                }`}
              >
                {tab.icon(isActive)}
                <span className={`text-[10px] mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
          {/* Mobile user menu */}
          {user && (
            <div className="relative flex-1" ref={menuRef}>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`w-full flex flex-col items-center justify-center rounded-2xl h-12 transition-all ${
                  moreActive ? 'bg-volt-400 text-ink' : 'text-white/55'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  moreActive ? 'bg-ink text-volt-300' : 'bg-white/15 text-white'
                }`}>
                  {initials}
                </div>
                <span className={`text-[10px] mt-0.5 ${moreActive ? 'font-bold' : 'font-medium'}`}>
                  More
                </span>
              </button>
              {mobileMenuOpen && (
                <div className="absolute bottom-full right-0 mb-3 w-56 bg-white rounded-2xl shadow-lift border border-gray-100 p-1.5 animate-fade-in-up">
                  <div className="px-3 py-3 mb-1 rounded-xl bg-chalk">
                    <p className="text-sm font-bold text-ink truncate">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.organization?.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      switchToPlaying();
                    }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 mb-1 text-sm font-bold text-ink rounded-xl bg-volt-300 hover:bg-volt-400 transition-colors"
                  >
                    <span aria-hidden>⚽</span>
                    Switch to Playing
                  </button>
                  {isAdmin && (
                    <Link
                      href={adminTab.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-gray-500"
                    >
                      {adminTab.icon(false)}
                      {adminTab.label}
                    </Link>
                  )}
                  <Link
                    href="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Desktop sidebar — floodlit turf */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 bg-ink turf-stripes text-white flex-col z-50">
        <div className="px-5 pt-6 pb-6">
          <Logo href="/dashboard" tone="light" />
          <div className="mt-4 flex items-center rounded-full bg-white/10 p-0.5 text-[11px] font-bold" role="tablist" aria-label="Mode">
            <button onClick={switchToPlaying} className="flex-1 px-2.5 py-1.5 rounded-full text-white/60 hover:text-white" role="tab" aria-selected={false}>
              Playing
            </button>
            <span className="flex-1 text-center px-2.5 py-1.5 rounded-full bg-volt-400 text-ink" role="tab" aria-selected>
              Organising
            </span>
          </div>
        </div>

        <p className="px-6 mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Menu</p>
        <div className="flex-1 px-3 space-y-1">
          {allTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-volt-400 text-ink shadow-[0_6px_20px_-8px_rgba(212,245,60,0.6)]'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {tab.icon(isActive)}
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Matchday card */}
        <div className="mx-3 mb-3 rounded-2xl bg-pitch-800/70 border border-white/10 p-4 relative overflow-hidden">
          <BallIcon className="absolute -right-3 -top-3 w-14 h-14 opacity-90 animate-spin-slow" />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-volt-300">Matchday tip</p>
          <p className="text-xs text-white/70 mt-1.5 leading-relaxed pr-6">
            Share your invite link in the group chat so players can register themselves.
          </p>
        </div>

        {/* User section */}
        {user && (
          <div className="p-3 border-t border-white/10">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-9 h-9 rounded-full bg-volt-400 text-ink flex items-center justify-center text-xs font-extrabold shrink-0 ring-2 ring-white/10">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-white/45 truncate">{user.organization?.name}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Link
                href="/settings"
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  settingsActive
                    ? 'bg-white text-ink'
                    : 'text-white/60 bg-white/[0.06] hover:text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                Settings
              </Link>
              <button
                onClick={logout}
                className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white/60 bg-white/[0.06] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
