'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'pitchaside.currentGroup';

type CurrentGroup = {
  /** The group the organiser is looking at, as they last picked it; null until they pick one. */
  groupId: string | null;
  setGroupId: (id: string) => void;
};

const Ctx = createContext<CurrentGroup>({ groupId: null, setGroupId: () => {} });

/**
 * One remembered "current group" for the whole organiser app, so Home, a group's page and (later)
 * Squad and Money all show the same group, and it's still picked after a reload. Screens decide
 * their own fallback (Home: the group playing soonest) until the organiser picks.
 */
export function CurrentGroupProvider({ children }: { children: React.ReactNode }) {
  const [groupId, setId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setId(window.localStorage.getItem(KEY));
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
    // Sync across tabs: if the organiser picks a group in another tab, follow it here.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) setId(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setGroupId = useCallback((id: string) => {
    setId(id);
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      /* not remembered, still used for this visit */
    }
  }, []);

  return <Ctx.Provider value={{ groupId, setGroupId }}>{children}</Ctx.Provider>;
}

export const useCurrentGroup = () => useContext(Ctx);
