'use client';

import type { KnownAccount } from '@/lib/known-accounts';

/** One account, by name and email: the one signed in, or one to pick. */
export function AccountRow({ name, email, current, selected, onPick }: { name: string; email: string; current?: boolean; selected?: boolean; onPick?: () => void }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const body = (
    <>
      <span className="w-10 h-10 shrink-0 rounded-full bg-ink text-volt-300 flex items-center justify-center text-[13px] font-extrabold" aria-hidden>
        {initials}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold text-ink truncate">{name}</span>
        <span className="block text-[12px] text-gray-500 truncate">{email}</span>
      </span>
      {current && <span className="shrink-0 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-volt-300 text-ink">Signed in</span>}
      {selected && (
        <svg className="w-5 h-5 shrink-0 text-pitch-700" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
    </>
  );
  const cls = `w-full min-h-14 flex items-center gap-3 px-3 py-2 rounded-2xl border text-left ${selected || current ? 'border-ink bg-white' : 'border-gray-200 bg-white'}`;
  return onPick ? (
    <button type="button" onClick={onPick} aria-pressed={selected} className={`press ${cls} hover:border-ink`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * "Continue as": the player accounts this phone has used, one tap each to fill the email (they
 * still type the password). Nothing shows on a phone that hasn't signed in before.
 */
export function KnownAccountPicker({
  accounts,
  chosen,
  onPick,
  onNew,
}: {
  accounts: KnownAccount[];
  chosen: string;
  onPick: (email: string) => void;
  /** A shared phone: "I'm someone new" right under the names, not hidden at the bottom of the form. */
  onNew?: () => void;
}) {
  if (!accounts.length) return null;
  return (
    <div className="mb-3">
      <p className="text-[12px] font-bold text-gray-500">Continue as</p>
      <ul className="mt-1.5 space-y-1.5">
        {accounts.map((a) => (
          <li key={a.email}>
            <AccountRow name={[a.firstName, a.lastName].filter(Boolean).join(' ')} email={a.email} selected={chosen === a.email} onPick={() => onPick(a.email)} />
          </li>
        ))}
        {onNew && (
          <li>
            <button
              type="button"
              onClick={onNew}
              className="press w-full min-h-14 flex items-center gap-3 px-3 py-2 rounded-2xl border border-dashed border-gray-300 bg-white text-left hover:border-ink"
            >
              <span className="w-10 h-10 shrink-0 rounded-full bg-chalk text-ink flex items-center justify-center text-lg font-extrabold" aria-hidden>
                +
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-bold text-ink">I’m someone new</span>
                <span className="block text-[12px] text-gray-500 truncate">Join with your own email</span>
              </span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
