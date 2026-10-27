'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { kitFor } from '@/components/illustrations';
import { stagger } from '@/components/motion';
import { GroupSettingsSheet } from '@/components/group/group-settings';
import { ICON_PATHS, icon } from '@/components/icons';
import { formatCurrency, type IGroupWithMembers } from '@/lib/api';

/**
 * Which group you're looking at, at the top of the screen: its name in a pill, and a tap to switch
 * to another, change this group's settings, see all groups or start a new one. With one group it
 * still opens, so settings and New group are always one tap away.
 */
export function GroupSwitch({
  groups,
  currentId,
  onPick,
  canManage = true,
  onGroupsChanged,
}: {
  groups: IGroupWithMembers[];
  currentId: string | null;
  onPick: (id: string) => void;
  /** Organisers can change settings and start groups; a treasurer only switches. */
  canManage?: boolean;
  /** A group was changed or deleted from its settings: reload the list. */
  onGroupsChanged?: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const current = groups.find((g) => g.id === currentId) ?? null;
  if (!groups.length) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${current?.name ?? 'No group picked'}. Switch group`}
        className="press inline-flex items-center gap-2 max-w-full h-10 pl-1.5 pr-3 rounded-full bg-white border border-gray-200 shadow-card hover:border-ink"
      >
        <Badge name={current?.name ?? 'Group'} />
        <span className="min-w-0 truncate text-[14px] font-bold text-ink">{current?.name ?? 'Pick a group'}</span>
        <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <Sheet titleId={titleId} onClose={() => setOpen(false)} align="left">
          <SheetTitle id={titleId} title="Your groups" sub="Home and the group’s screens follow the one you pick." onClose={() => setOpen(false)} />
          <ul className="mt-4 rounded-3xl bg-white border border-gray-100 divide-y divide-gray-100 overflow-hidden" role="radiogroup" aria-label="Groups">
            {groups.map((g, i) => {
              const on = g.id === currentId;
              const members = g.memberships?.length ?? 0;
              return (
                <li key={g.id} className="animate-rise" style={stagger(i, 30, 0)}>
                  <button
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      onPick(g.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 min-h-16 px-3.5 py-2.5 text-left transition-colors ${on ? 'bg-volt-300/35' : 'hover:bg-chalk'}`}
                  >
                    <Badge name={g.name} size="lg" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-bold text-ink truncate">{g.name}</span>
                      <span className="block text-[13px] text-gray-500 truncate">
                        {members} player{members === 1 ? '' : 's'}
                        {Number(g.feePerPlayer) > 0 ? ` · ${formatCurrency(Number(g.feePerPlayer))} a game` : ''}
                      </span>
                    </span>
                    <span
                      className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center ${on ? 'bg-ink text-volt-300' : 'border-2 border-gray-200'}`}
                      aria-hidden
                    >
                      {on && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {canManage && current && onGroupsChanged && (
            <button
              onClick={() => {
                setOpen(false);
                setSettings(true);
              }}
              className="press mt-3 w-full flex items-center gap-3 min-h-12 px-3.5 rounded-2xl bg-chalk text-left hover:bg-gray-100"
            >
              <span className="w-8 h-8 shrink-0 rounded-lg bg-white text-ink flex items-center justify-center">{icon(ICON_PATHS.pencil)}</span>
              <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-ink">Settings for {current.name}</span>
              <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/groups" onClick={() => setOpen(false)} className="press flex items-center justify-center h-11 rounded-xl border border-gray-200 text-sm font-bold text-ink hover:border-ink">
              All groups
            </Link>
            {canManage && (
              <Link href="/groups/new" onClick={() => setOpen(false)} className="press flex items-center justify-center h-11 rounded-xl bg-ink text-volt-300 text-sm font-bold hover:bg-pitch-900">
                New group
              </Link>
            )}
          </div>
        </Sheet>
      )}
      {settings && current && onGroupsChanged && (
        <GroupSettingsSheet group={current} onClose={() => setSettings(false)} onSaved={onGroupsChanged} onDeleted={onGroupsChanged} />
      )}
    </>
  );
}

function Badge({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  const kit = kitFor(name);
  return (
    <span
      className={`${size === 'lg' ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-[11px]'} shrink-0 rounded-full ${kit.bg} ${kit.fg} flex items-center justify-center font-extrabold font-display`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
