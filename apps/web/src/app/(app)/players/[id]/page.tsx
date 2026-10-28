'use client';

import { useEffect, useState } from 'react';
import { levelOf } from '@/lib/rating-level';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { RatingBreakdownSheet } from '@/components/rating-breakdown-sheet';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { prettyPhone, whatsappNumber } from '@/lib/whatsapp';
import { SignInLinkButton } from '@/components/sign-in-link-button';
import { PlayerSheet } from '@/components/group/member-sheet';
import { UserRole } from '@pitchaside/shared';
import { useAuth } from '@/lib/auth';
import {
  getPlayer,
  getGroups,
  getPlayerPayments,
  getPlayerStats,
  getPlayerRatings,
  getRatingBreakdown,
  type PlayerRatings,
  deletePlayer,
  formatCurrency,
  type IGroupWithMembers,
  removePlayerPhoto,
  setPlayerPhoto,
} from '@/lib/api';
import { photoUrl } from '@/lib/http';
import { CardPhotoButton } from '@/components/photo-picker';
import { Collapse } from '@/components/collapse';
import { niceDate } from '@/components/player-ui';
import { AttributeRow } from '@/components/ratings';
import { ShareCardButton, ShareIcon, shareIconDark } from '@/components/share-card';
import { PlayerStats } from '@/components/player-stats';
import { Player, Ball, JerseyBadge, kitFor, skins } from '@/components/illustrations';
import type { IPlayer, IPayment } from '@pitchaside/shared';


export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [player, setPlayer] = useState<IPlayer | null>(null);
  const [groups, setGroups] = useState<IGroupWithMembers[]>([]);
  const [payments, setPayments] = useState<IPayment[]>([]);
  const [ratings, setRatings] = useState<PlayerRatings | null>(null);
  // "How this 80 is made", opened from the card's number.
  const [explaining, setExplaining] = useState(false);
  const [stats, setStats] = useState<{ totalSessions: number; totalPaid: number; totalOwed: number; paymentRate: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // The one player card, opened to edit.
  const [editing, setEditing] = useState(false);
  const { user } = useAuth();
  const canManage = user?.role !== UserRole.TREASURER;

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    getPlayerRatings(id).then(setRatings).catch(() => {});
    Promise.all([getPlayer(id), getGroups(), getPlayerPayments(id), getPlayerStats(id)])
      .then(([p, g, pay, s]) => {
        setPlayer(p);
        setGroups(g);
        setPayments(pay);
        setStats(s);
      })
      .catch(() => router.push('/players'))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleDelete() {
    setShowDeleteConfirm(false);
    try {
      await deletePlayer(id);
      toast.success('Player deleted');
      router.push('/players');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete player');
    }
  }

  if (loading || !player) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-20" />
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-gray-200 rounded-full" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-20 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const playerGroups = groups.filter((g) =>
    g.memberships?.some((m) => m.player.id === id)
  );

  // "0803…", "803…" or "+234…": WhatsApp needs 234 in front, or the chat doesn't open.
  const waNumber = whatsappNumber(player.phone);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Players" />
      {explaining && (
        <RatingBreakdownSheet name={`${player.firstName} ${player.lastName}`} load={() => getRatingBreakdown(id)} onClose={() => setExplaining(false)} />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Player"
        message={`Delete ${player.firstName} ${player.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {editing && (
        <PlayerSheet
          player={player}
          canEdit
          startEditing
          showProfileLink={false}
          onSaved={(p) => {
            setPlayer(p);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Player card: portrait (rating, photo) beside who they are and how to reach them; skills below */}
      <div className="relative mb-6 rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
        <div className="absolute inset-0 turf-stripes" aria-hidden />
        <div className="relative p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2 -mt-1 -mr-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Player profile</p>
            <div className="flex">
              {/* Their card as an image for WhatsApp */}
              <ShareCardButton
                page={`/card/${player.id}`}
                heading={`Share ${player.firstName}’s card`}
                label={`Share ${player.firstName}’s card`}
                fileName="pitchaside-player-card.png"
                caption={`⚽ ${player.firstName} ${player.lastName}${ratings?.ovr != null ? ` · ${ratings.ovr} OVR` : ''}`}
                className={shareIconDark}
              >
                <ShareIcon className="w-[18px] h-[18px]" />
              </ShareCardButton>
              {canManage && (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="press w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label={`Edit ${player.firstName}’s details`}
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="press w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-kit-400 hover:bg-white/10 transition-colors"
                    aria-label={`Delete ${player.firstName} ${player.lastName}`}
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-1 flex gap-4">
            {/* Trading-card portrait: the rating to tap, their photo or kit, and a camera to change it */}
            <div className="relative w-[112px] sm:w-32 shrink-0 aspect-[2/3] rounded-2xl bg-gradient-to-b from-pitch-600 to-pitch-800 border border-white/15">
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                {player.photoKey ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(player.photoKey)!} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-ink/40" aria-hidden />
                  </>
                ) : (
                  <svg viewBox="0 0 100 150" className="w-full h-full pt-3" aria-hidden>
                <Player
                  x={50}
                  y={146}
                  scale={0.82}
                  pose="stand"
                  kit={kitFor(`${player.firstName} ${player.lastName}`).hex}
                  numberColor={kitFor(`${player.firstName} ${player.lastName}`).text}
                  skin={skins[(player.firstName.length + player.lastName.length) % skins.length]}
                  hair={(['short', 'afro', 'buzz', 'bun'] as const)[player.lastName.length % 4]}
                  number={player.firstName.charAt(0) + player.lastName.charAt(0)}
                />
                <Ball x={84} y={138} r={8} />
              </svg>
                )}
              </div>
              {ratings?.ovr != null && ratings.games > 0 ? (
                <button
                  onClick={() => setExplaining(true)}
                  aria-label={`Rating ${ratings.ovr}: how it's made`}
                  className="press absolute z-10 top-0 left-0 min-w-11 min-h-11 pt-2 pl-2.5 pr-2 pb-1 text-left leading-none rounded-tl-2xl rounded-br-xl hover:bg-white/10"
                >
                  <span className="block font-display text-[26px] font-extrabold text-volt-300 tabular-nums">{ratings.ovr}</span>
                  <span className="flex items-center gap-0.5 text-[8px] font-extrabold tracking-[0.14em] text-white/70 mt-0.5">
                    OVR
                    <span className="w-3 h-3 rounded-full bg-white/20 text-white text-[8px] leading-3 text-center tracking-normal" aria-hidden>
                      i
                    </span>
                  </span>
                </button>
              ) : (
                <div className="absolute z-10 top-2 left-2.5 leading-none">
                  <p className="font-display text-[26px] font-extrabold text-volt-300 tabular-nums">{ratings?.ovr ?? '–'}</p>
                  <p className="text-[8px] font-extrabold tracking-[0.14em] text-white/70 mt-0.5">OVR</p>
                </div>
              )}
              {ratings?.provisional && (
                <p className="absolute z-10 top-[54px] left-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-volt-300" title="Rating is still settling: fewer than 3 games with scores">
                  Provisional
                </p>
              )}
              {canManage && (
                <span className="absolute z-10 -bottom-2 -right-2">
                  <CardPhotoButton
                    name={`${player.firstName} ${player.lastName}`}
                    photoKey={player.photoKey}
                    onUpload={async (image) => (await setPlayerPhoto(player.id, image)).photoKey}
                    onRemove={() => removePlayerPhoto(player.id).then(() => undefined)}
                    onChange={(photoKey) => setPlayer({ ...player, photoKey })}
                  />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 flex flex-col">
              <h1 className="font-display text-[26px] leading-[1.05] font-extrabold break-words">
                {player.firstName} {player.lastName}
              </h1>
              {player.nickname && <p className="mt-1 text-sm font-bold text-volt-300 truncate">“{player.nickname}”</p>}
              {ratings?.ovr != null && (
                <p className="mt-2 self-start rounded-full border border-volt-300/50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-volt-300">{levelOf(ratings.ovr).name}</p>
              )}
              {/* Their season in three numbers, so the column carries weight next to the portrait */}
              <dl className="mt-3 grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['Goals', ratings?.goals],
                    ['Assists', ratings?.assists],
                    ['POTM', ratings?.potmWins],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0 flex flex-col-reverse rounded-xl bg-white/[0.07] px-1 py-1.5 text-center">
                    <dt className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white/60 truncate">{label}</dt>
                    <dd className="font-display text-[18px] leading-none font-extrabold tabular-nums">{value ?? '–'}</dd>
                  </div>
                ))}
              </dl>

              {/* Reaching them: one row of round buttons, each says what it does */}
              <div className="mt-auto pt-3 flex items-center gap-2">
                {waNumber && (
                  <a
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${player.firstName}`}
                    className="press w-11 h-11 rounded-full bg-[#25D366] text-white flex items-center justify-center hover:brightness-95"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.496A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.594-.822-6.343-2.2l-.444-.355-3.187 1.07 1.07-3.187-.355-.444A9.955 9.955 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/>
                  </svg>
                  </a>
                )}
                {player.phone && (
                  <a
                    href={`tel:${player.phone}`}
                    aria-label={`Call ${player.firstName} on ${player.phone}`}
                    className="press w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                    </svg>
                  </a>
                )}
                {player.email && (
                  <a
                    href={`mailto:${player.email}`}
                    aria-label={`Email ${player.firstName} at ${player.email}`}
                    className="press w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                  </a>
                )}
              </div>
              {/* Can't get in (no email, forgot the password): a one-time link to their WhatsApp */}
              {canManage && <SignInLinkButton player={player} variant="dark" />}
              {player.phone &&
                (waNumber ? (
                  <p className="mt-2 text-[12px] text-white/60 tabular-nums truncate">{prettyPhone(player.phone)}</p>
                ) : (
                  // Typed so WhatsApp can't open it: say so, and the way to fix it.
                  <p className="mt-2 flex items-center gap-2 text-[12px] leading-snug text-kit-400">
                    <span className="min-w-0">
                      <span className="tabular-nums">{player.phone}</span> won’t open WhatsApp.
                    </span>
                    <button onClick={() => setEditing(true)} className="press shrink-0 min-h-9 px-2.5 rounded-full bg-white/10 font-bold text-white hover:bg-white/20">
                      Fix it
                    </button>
                  </p>
                ))}
            </div>
          </div>

          {ratings && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <AttributeRow ratings={ratings} dark />
              {/* Only under numbers: with none, the box above already says how they fill in */}
              {Object.values(ratings.attributes).some((v) => v != null) && <p className="mt-2 text-[11px] text-white/50">From goals, assists, saves and award votes.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Money: one answer first (what they owe, or all paid), then each game they've paid or owe for */}
      <PlayerMoney stats={stats} payments={payments} />

      {ratings && (
        <div className="mb-6">
          <PlayerStats ratings={ratings} />
        </div>
      )}

      {/* Groups */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink mb-3">Groups</h2>
        {playerGroups.length === 0 ? (
          <EmptyState
            icon="users"
            title="No groups"
            description="This player isn't a member of any group yet."
          />
        ) : (
          <div className="space-y-2">
            {playerGroups.map((g) => (
              <Link
                key={g.id}
                href={`/squad?group=${g.id}`}
                className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-card hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <JerseyBadge label={g.name.charAt(0).toUpperCase()} name={g.name} className="w-10 h-10" />
                  <div>
                    <p className="text-sm font-bold text-ink">{g.name}</p>
                    {g.schedule && (
                      <p className="text-xs text-gray-500">{g.schedule}</p>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

type PaymentRow = IPayment & { session?: { date: string; label?: string | null; kind?: string; status?: string; group?: { name: string } } };

/** How a payment reads: the app's words, never the database's. */
function paymentChip(p: PaymentRow) {
  if (p.attendance === 'no_show') return { text: 'Didn’t come', cls: 'bg-gray-100 text-gray-600' };
  if (p.session?.status === 'cancelled') return { text: 'Called off', cls: 'bg-gray-100 text-gray-600' };
  if (p.status === 'paid') return { text: '✓ Paid', cls: 'bg-volt-300 text-ink' };
  if (p.status === 'waived' || Number(p.amount) === 0) return { text: 'Free', cls: 'bg-gray-100 text-gray-600' };
  return { text: 'To pay', cls: 'bg-kit-500/15 text-kit-600' };
}

const SHOWN = 4;

/**
 * A player's money in one card: what they owe now (or that they're all paid), how many games
 * they've paid for, and each game, newest first, with its date and group. Older ones fold away.
 */
function PlayerMoney({
  stats,
  payments,
}: {
  stats: { totalSessions: number; totalPaid: number; totalOwed: number; paymentRate: number } | null;
  payments: IPayment[];
}) {
  const [all, setAll] = useState(false);
  const rows = [...(payments as PaymentRow[])].sort((a, b) => (b.session?.date ?? '').localeCompare(a.session?.date ?? ''));
  const due = rows.filter((p) => p.status !== 'waived' && Number(p.amount) > 0 && p.attendance !== 'no_show' && p.session?.status !== 'cancelled');
  const paid = due.filter((p) => p.status === 'paid').length;
  const owed = Number(stats?.totalOwed ?? 0);

  const Row = ({ p }: { p: PaymentRow }) => {
    const chip = paymentChip(p);
    const when = p.session?.date ? niceDate(p.session.date, { weekday: 'short', day: 'numeric', month: 'short' }) : null;
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink truncate">{p.session?.label ?? (when ? `Game · ${when}` : 'Game')}</span>
          <span className="block text-[12px] text-gray-500 truncate">
            {p.session?.group?.name}
            {p.status === 'paid' && p.paidAt ? ` · paid ${niceDate(p.paidAt, { day: 'numeric', month: 'short' })}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-display text-[15px] font-extrabold text-ink tabular-nums">{formatCurrency(Number(p.amount))}</span>
          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${chip.cls}`}>{chip.text}</span>
        </span>
      </li>
    );
  };

  return (
    <section aria-labelledby="money-title" className="mb-6 rounded-3xl bg-white border border-gray-100 shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h2 id="money-title" className="text-[13px] font-bold text-gray-500">
          Money
        </h2>
        {stats == null ? (
          <p className="mt-1 text-[15px] text-gray-600">Couldn’t load their money right now.</p>
        ) : owed > 0 ? (
          <p className="mt-0.5 font-display text-[28px] leading-tight font-extrabold text-kit-600 tabular-nums">Owes {formatCurrency(owed)}</p>
        ) : (
          <p className="mt-0.5 font-display text-[28px] leading-tight font-extrabold text-ink">All paid ✓</p>
        )}
        {stats && (
          <p className="mt-1 text-[13px] text-gray-600">
            {due.length > 0 ? (
              <>
                Paid for <b className="text-ink tabular-nums">{paid}</b> of {due.length} game{due.length === 1 ? '' : 's'} · <b className="text-ink tabular-nums">{formatCurrency(stats.totalPaid)}</b> in all
              </>
            ) : (
              'Nothing to pay for yet.'
            )}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-gray-100 px-4 py-4 text-[13px] text-gray-500">Their games show here once they’re in one.</p>
      ) : (
        <>
          <ul className="border-t border-gray-100 divide-y divide-gray-100">
            {rows.slice(0, SHOWN).map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
          {rows.length > SHOWN && (
            <>
              <Collapse open={all} id="older-payments">
                <ul className="border-t border-gray-100 divide-y divide-gray-100">
                  {rows.slice(SHOWN).map((p) => (
                    <Row key={p.id} p={p} />
                  ))}
                </ul>
              </Collapse>
              <button
                onClick={() => setAll((v) => !v)}
                aria-expanded={all}
                aria-controls="older-payments"
                className="press w-full min-h-12 border-t border-gray-100 text-[14px] font-bold text-pitch-700 hover:bg-chalk"
              >
                {all ? 'Show fewer' : `Show all ${rows.length} games`}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
