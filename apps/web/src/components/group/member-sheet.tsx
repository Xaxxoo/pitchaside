'use client';

import { PhoneHint, useTouched } from '@/components/phone-hint';
import { useId, useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { Collapse } from '@/components/collapse';
import { kitFor } from '@/components/illustrations';
import { PlayerLevelPicker } from '@/components/player-level';
import { useToast } from '@/components/toast';
import { formatCurrency, removePlayerPhoto, setPlayerPhoto, updatePlayer } from '@/lib/api';
import { Avatar } from '@/components/ratings';
import { PhotoPicker } from '@/components/photo-picker';
import type { IPlayer, KeeperPref, PlayerLevel } from '@pitchaside/shared';

export type MemberDue = { label: string; state: 'paid' | 'owes' | 'waived' | 'out'; amount: number; paidSoFar?: number } | null;

/** Where a player stands in the group they were opened from. */
export type Membership = {
  joinedAt: string;
  credit: number;
  /** Sent beyond what they owed, waiting for the organiser to sort. */
  extra?: number;
  /** Extra they sent for someone not in the group yet, or no one knows who. */
  waiting?: number;
  /** Their code for transfer descriptions; null until they've opened their payment details. */
  paymentCode?: string | null;
  due: MemberDue;
};

/**
 * The one player card, wherever a player is opened: where they stand in the group (when opened
 * from one), their payment code, and their details (name, nickname, contact, level), folded
 * until "Edit details". Only the organiser can change anything; a treasurer reads it.
 */
export function PlayerSheet({
  player,
  membership,
  canEdit,
  onSaved,
  onRemove,
  onSendDetails,
  showProfileLink = true,
  startEditing = false,
  onClose,
}: {
  player: IPlayer;
  membership?: Membership;
  canEdit: boolean;
  onSaved: (p: IPlayer) => void;
  /** Take them out of the group they were opened from. */
  onRemove?: () => void;
  /** WhatsApp them the account and their code; only when the group has an account. */
  onSendDetails?: () => void;
  showProfileLink?: boolean;
  startEditing?: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const editId = useId();
  const toast = useToast();
  const initial = {
    firstName: player.firstName,
    lastName: player.lastName,
    nickname: player.nickname ?? '',
    email: player.email ?? '',
    phone: player.phone ?? '',
    level: (player.level ?? 'average') as PlayerLevel,
    keeper: (player.keeper ?? '') as Exclude<KeeperPref, null> | '',
  };
  const [form, setForm] = useState(initial);
  const phoneSeen = useTouched();
  const [editing, setEditing] = useState(startEditing && canEdit);
  const [saving, setSaving] = useState(false);
  const name = `${player.firstName} ${player.lastName}`;
  const kit = kitFor(name);
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => String(form[k]).trim() !== String(initial[k]));

  async function save() {
    setSaving(true);
    try {
      const saved = await updatePlayer(player.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        nickname: form.nickname.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        level: form.level,
        keeper: form.keeper || null,
      });
      onSaved(saved);
      setEditing(false);
      toast.success('Details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The details didn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const copyCode = (code: string) =>
    navigator.clipboard.writeText(code).then(
      () => toast.success('Payment code copied'),
      () => toast.error('Could not copy. Press and hold the code to copy it instead.'),
    );

  const input =
    'w-full h-11 px-3.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';
  const due = membership?.due;
  // Kept money already counted as part of the due below isn't also "paid ahead".
  const credit = (membership?.credit ?? 0) - (due?.paidSoFar ?? 0);
  const facts = [
    membership && { k: 'Joined', v: new Date(membership.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    due && {
      k: due.label,
      v:
        due.state === 'paid'
          ? 'Paid'
          : due.state === 'waived'
            ? 'Free'
            : due.state === 'owes'
              ? due.paidSoFar
                ? `${formatCurrency(due.amount)} left of ${formatCurrency(Number(due.amount) + Number(due.paidSoFar))}`
                : `${formatCurrency(due.amount)} to pay`
              : 'Not in',
      tone: due.state === 'owes' ? 'text-amber-700' : due.state === 'paid' ? 'text-pitch-600' : 'text-gray-600',
    },
    (membership?.extra ?? 0) > 0 && {
      k: 'Extra to sort',
      v: formatCurrency(membership!.extra!),
      note: 'Sent more than they owed. Say what it was for on Money.',
      tone: 'text-amber-700',
    },
    (membership?.waiting ?? 0) > 0 && {
      k: 'Waiting for a player',
      v: formatCurrency(membership!.waiting!),
      note: 'They paid it for someone you can’t place yet. Give it to them on Money.',
    },
    credit > 0 && {
      k: 'Paid ahead',
      v: formatCurrency(credit),
      note: 'Kept for them. Pays their next game once it’s the next one.',
    },
    { k: 'Phone', v: player.phone || 'Not added', tone: player.phone ? undefined : 'text-gray-500 font-semibold' },
    { k: 'Email', v: player.email || 'Not added', tone: player.email ? undefined : 'text-gray-500 font-semibold' },
  ].filter(Boolean) as { k: string; v: string; tone?: string; note?: string }[];

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <div className="flex items-start gap-3">
        {player.photoKey ? (
          <Avatar name={name} photoKey={player.photoKey} className="w-12 h-12" />
        ) : (
          <span className={`w-12 h-12 shrink-0 rounded-full ${kit.bg} ${kit.fg} flex items-center justify-center text-base font-extrabold font-display`} aria-hidden>
            {player.firstName.charAt(0)}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <SheetTitle id={titleId} title={name} sub={player.nickname ? `“${player.nickname}” on the team sheet` : undefined} onClose={onClose} />
        </div>
      </div>

      {canEdit && (
        <div className="mt-4">
          <PhotoPicker
            name={name}
            photoKey={player.photoKey}
            size="w-14 h-14 text-lg"
            onUpload={async (image) => {
              const { photoKey } = await setPlayerPhoto(player.id, image);
              onSaved({ ...player, photoKey });
              return photoKey;
            }}
            onRemove={async () => {
              await removePlayerPhoto(player.id);
              onSaved({ ...player, photoKey: null });
            }}
          />
        </div>
      )}

      <dl className="mt-4 rounded-2xl bg-chalk divide-y divide-gray-200/70">
        {facts.map((f) => (
          <div key={f.k} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
            <dt className="shrink-0 text-[13px] text-gray-600">
              {f.k}
              {f.note && <span className="block text-[11px] text-gray-500">{f.note}</span>}
            </dt>
            <dd className={`min-w-0 truncate text-[13px] font-bold tabular-nums ${f.tone ?? 'text-ink'}`}>{f.v}</dd>
          </div>
        ))}
        {membership?.paymentCode && (
          <div className="flex items-center justify-between gap-3 pl-3.5 pr-1.5 py-1.5">
            <dt className="min-w-0 py-1 text-[13px] text-gray-600">
              Payment code
              <span className="block text-[11px] leading-snug text-gray-500">If {player.firstName} adds it to a transfer, it matches automatically</span>
            </dt>
            <dd>
              <button
                onClick={() => copyCode(membership.paymentCode!)}
                aria-label={`Copy payment code ${membership.paymentCode}`}
                className="press shrink-0 flex items-center gap-1.5 h-10 pl-3 pr-2.5 rounded-xl hover:bg-white transition-colors"
              >
                <span className="font-display text-[15px] font-extrabold tracking-wide text-ink">{membership.paymentCode}</span>
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-9.376a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25" />
                </svg>
              </button>
            </dd>
          </div>
        )}
      </dl>
      {onSendDetails && (
        <button onClick={onSendDetails} className={`${btnSecondary} mt-3 w-full`}>
          Send payment details on WhatsApp
        </button>
      )}

      {canEdit && (
        <>
          <button
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            aria-controls={editId}
            className="press mt-4 -mx-2 w-[calc(100%+1rem)] flex items-center justify-between min-h-12 px-2 rounded-xl text-[15px] font-semibold text-ink hover:bg-chalk"
          >
            Edit details
            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${editing ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <Collapse open={editing} id={editId}>
            <div className="pt-1 pb-1 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-xs font-bold text-gray-700 mb-1">First name</span>
                  <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={input} autoComplete="off" />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-gray-700 mb-1">Last name</span>
                  <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={input} autoComplete="off" />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 mb-1">
                  Nickname <span className="font-semibold text-gray-500">(optional, shown on team sheets)</span>
                </span>
                <input value={form.nickname} maxLength={24} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="e.g. Pele" className={input} autoComplete="off" />
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 mb-1">
                  Phone <span className="font-semibold text-gray-500">(for WhatsApp)</span>
                </span>
                <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={phoneSeen.onBlur} placeholder="0803 123 4567" className={input} autoComplete="off" />
                <PhoneHint value={form.phone} touched={phoneSeen.touched}>Optional. For WhatsApp messages.</PhoneHint>
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gray-700 mb-1">
                  Email <span className="font-semibold text-gray-500">(they sign in with it)</span>
                </span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" className={input} autoComplete="off" />
              </label>
              <PlayerLevelPicker value={form.level} onChange={(level) => setForm({ ...form, level })} />
              {/* Missing (not null) from a server before day plans: it wouldn't be saved. */}
              {player.keeper !== undefined && (
              <fieldset>
                <legend className="block text-xs font-bold text-gray-700 mb-1">
                  In goal <span className="font-semibold text-gray-500">(for the day plan’s swaps)</span>
                </legend>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['happy', 'Happy'],
                      ['', 'Doesn’t mind'],
                      ['rather_not', 'Rather not'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={form.keeper === v}
                      onClick={() => setForm({ ...form, keeper: v })}
                      className={`press min-h-11 px-2 rounded-xl border text-[13px] font-bold leading-tight whitespace-nowrap ${
                        form.keeper === v ? 'bg-ink border-ink text-white' : 'bg-white border-gray-200 text-ink hover:border-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              )}
              <button
                onClick={save}
                disabled={!changed || saving || !form.firstName.trim() || !form.lastName.trim()}
                className={`${btnPrimary} w-full disabled:opacity-40`}
              >
                {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </Collapse>
        </>
      )}

      {(showProfileLink || (canEdit && onRemove)) && (
        <div className={`${canEdit ? 'mt-1' : 'mt-4'} -mx-2`}>
          {showProfileLink && (
            <Link href={`/players/${player.id}`} className="press flex items-center justify-between min-h-12 px-2 rounded-xl text-[15px] font-semibold text-ink hover:bg-chalk">
              Ratings and payment history
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          )}
          {canEdit && onRemove && (
            <button onClick={onRemove} className="press w-full flex items-center min-h-12 px-2 rounded-xl text-[15px] font-semibold text-kit-600 hover:bg-kit-500/10">
              Remove from group
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
