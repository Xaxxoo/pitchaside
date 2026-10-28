'use client';

import { NotificationSettings } from '@/components/notify';
import { ShareCardButton, ShareIcon, shareIconDark } from '@/components/share-card';
import { PageHeader } from '@/components/brand';
import Link from 'next/link';
import { useState } from 'react';
import { RatingBreakdownSheet } from '@/components/rating-breakdown-sheet';
import { useRouter } from 'next/navigation';
import { InstallCard } from '@/components/pwa';
import { PlayerCardHero, Section } from '@/components/player-ui';
import { PlayerStats } from '@/components/player-stats';
import { usePlayerProfile } from '@/components/player-shell';
import { PlayerAccountSettings } from '@/components/player-account';
import { getPlayerRatingBreakdown, logoutPlayer, removeMyPhoto, setMyPhoto } from '@/lib/player';
import { CardPhotoButton } from '@/components/photo-picker';
import { btnSecondary } from '@/components/buttons';
import { openTour } from '@/lib/onboarding';
import { KeeperSetting } from '@/components/plan/keeper-setting';
import { PositionSetting } from '@/components/plan/position-setting';

export default function PlayerProfilePage() {
  const router = useRouter();
  const { profile, refresh } = usePlayerProfile();
  const [explaining, setExplaining] = useState(false);
  if (!profile) return null;
  const r = profile.ratings;

  return (
    <>
      <PageHeader title="Me" subtitle="Your card, your clubs and your account." />
      <PlayerCardHero
        firstName={profile.player.firstName}
        lastName={profile.player.lastName}
        nickname={profile.player.nickname}
        ratings={r}
        // Won, drawn and lost are in the stats just below: the card only adds what they don't show
        caption={r.potmWins ? `★ ${r.potmWins} × Player of the Match` : undefined}
        photoKey={profile.player.photoKey}
        photoButton={
          <CardPhotoButton
            you
            name={`${profile.player.firstName} ${profile.player.lastName}`}
            photoKey={profile.player.photoKey}
            onUpload={async (image) => (await setMyPhoto(image)).photoKey}
            onRemove={() => removeMyPhoto().then(() => undefined)}
            onChange={() => refresh()}
          />
        }
        onRatingTap={profile.ratingsPlayerId && r.games > 0 ? () => setExplaining(true) : undefined}
        action={
          profile.ratingsPlayerId ? (
            <ShareCardButton
              page={`/card/${profile.ratingsPlayerId}`}
              heading="Share your card"
              label="Share your card"
              fileName="pitchaside-player-card.png"
              caption={`⚽ My PitchAside card${r.ovr != null ? `: ${r.ovr} OVR` : ''}`}
              className={shareIconDark}
            >
              <ShareIcon className="w-[18px] h-[18px]" />
            </ShareCardButton>
          ) : undefined
        }
      />
      {explaining && profile.ratingsPlayerId && (
        <RatingBreakdownSheet
          name={`${profile.player.firstName} ${profile.player.lastName}`}
          load={() => getPlayerRatingBreakdown(profile.ratingsPlayerId!)}
          onClose={() => setExplaining(false)}
        />
      )}

      {/* The card is one club's: with more than one, say which, and where the others are. */}
      {profile.clubs.length > 1 && (
        <p className="mt-3 text-[13px] leading-snug text-gray-600">
          Card from <b className="text-ink">{(profile.clubs.find((c) => c.playerId === profile.ratingsPlayerId)?.clubName ?? profile.clubs[0].clubName).trim()}</b>, where you play most.
          Each club’s rating is under My clubs.
        </p>
      )}
      <div className="mt-5">
        <PlayerStats ratings={r} you />
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
      <div>
      {profile.clubs.length > 0 && (
        <Section title={profile.clubs.length === 1 ? 'My club' : 'My clubs'}>
          <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
            {profile.clubs.map((c, i) => (
              <li key={`${c.clubName}-${i}`} className="flex items-center gap-3 min-h-16 px-4 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-ink truncate">{c.clubName}</span>
                  <span className="block text-[13px] text-gray-600 truncate">{c.groups.map((g) => g.name).join(' · ') || 'No groups yet'}</span>
                </span>
                {c.ratings.ovr != null ? (
                  <span className="shrink-0 w-12 h-12 rounded-xl bg-ink flex flex-col items-center justify-center leading-none" aria-label={`Rating ${c.ratings.ovr} in ${c.clubName}`}>
                    <span className="font-display text-[19px] font-extrabold text-volt-300 tabular-nums">{c.ratings.ovr}</span>
                    <span className="mt-0.5 text-[8px] font-extrabold tracking-[0.14em] text-white/60">OVR</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[12px] font-bold text-gray-500">No rating yet</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Organising">
        {profile.organiser ? (
          <Link href="/dashboard" className="press relative flex items-center gap-3 overflow-hidden rounded-3xl bg-ink text-white px-5 py-4">
            <span className="absolute inset-0 turf-stripes-soft" aria-hidden />
            <span className="relative flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-white/70">You run</span>
              <span className="block font-display text-xl font-extrabold truncate">{profile.organiser.clubName}</span>
            </span>
            <span className="relative shrink-0 inline-flex items-center min-h-11 px-4 rounded-full bg-volt-400 text-ink text-[13px] font-extrabold">Organise ›</span>
          </Link>
        ) : (
          <Link
            href="/me/start-group"
            className="press flex items-center gap-3 min-h-16 rounded-3xl bg-white border border-gray-100 shadow-card px-4 py-3 hover:border-gray-300"
          >
            <span className="w-10 h-10 shrink-0 rounded-2xl bg-chalk flex items-center justify-center text-lg" aria-hidden>
              ⚽
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-bold text-ink">Run your own games</span>
              <span className="block text-[13px] leading-snug text-gray-600 [text-wrap:pretty]">Start a group: collect payments, replies and votes. You keep your card.</span>
            </span>
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        )}
      </Section>

      </div>
      <div>
      {/* Missing (not null) from a server before day plans: nothing to save it to yet. */}
      {profile.player.keeper !== undefined && (
        <Section title="On the pitch">
          <div className="space-y-3">
            {/* Missing (not null) from a server before positions: nothing to save it to yet */}
            {profile.player.position !== undefined && <PositionSetting value={profile.player.position} onSaved={refresh} />}
            {/* A keeper is happy in goal already: asking again would only repeat it */}
            {profile.player.position !== 'GK' && <KeeperSetting key={String(profile.player.keeper)} value={profile.player.keeper} onSaved={refresh} />}
          </div>
        </Section>
      )}

      <Section title="Account">
        <PlayerAccountSettings
          firstName={profile.player.firstName}
          lastName={profile.player.lastName}
          nickname={profile.player.nickname}
          email={profile.player.email}
          onSaved={refresh}
        />
      </Section>

      <Section title="App">
        <div className="space-y-2">
          <InstallCard />
          <NotificationSettings side="player" emailOn={profile.player.emailNotices !== false} email={profile.player.email} onEmailChanged={() => refresh()} />
          <button onClick={openTour} className={`${btnSecondary} w-full`}>
            How PitchAside works
          </button>
          <button
            onClick={async () => {
              await logoutPlayer();
              router.replace('/me/login');
            }}
            className={`${btnSecondary} w-full`}
          >
            Sign out
          </button>
        </div>
      </Section>
      </div>
      </div>
    </>
  );
}
