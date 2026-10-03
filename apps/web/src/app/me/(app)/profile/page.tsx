'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InstallCard, PushToggle } from '@/components/pwa';
import { PlayerCardHero, Section } from '@/components/player-ui';
import { usePlayerProfile } from '@/components/player-shell';
import { PlayerAccountSettings } from '@/components/player-account';
import { KitLine } from '@/components/illustrations';
import { logoutPlayer, subscribePlayerPush } from '@/lib/player';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-card px-3 py-3 text-center">
      <p className="font-display text-2xl font-extrabold text-ink tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1">{label}</p>
    </div>
  );
}

export default function PlayerProfilePage() {
  const router = useRouter();
  const { profile, refresh } = usePlayerProfile();
  if (!profile) return null;
  const r = profile.ratings;

  return (
    <>
      <PlayerCardHero
        firstName={profile.player.firstName}
        lastName={profile.player.lastName}
        ratings={r}
        caption={profile.player.email}
      />

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-4">
        <Stat label="Games" value={r.games} />
        <Stat label="W-D-L" value={`${r.record.w}-${r.record.d}-${r.record.l}`} />
        <Stat label="Points" value={r.points} />
        <Stat label="POTM" value={r.potmWins} />
        <Stat label="Team of day" value={r.teamOfDay} />
        <Stat label="Votes got" value={Object.values(r.votes).reduce((a, b) => a + b, 0)} />
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
      <div>
      {profile.clubs.length > 0 && (
        <Section title="My clubs">
          <div className="space-y-2">
            {profile.clubs.map((c) => (
              <div key={c.clubName} className="bg-white rounded-2xl border border-gray-100 shadow-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-ink">{c.clubName}</p>
                  <span className="text-xs font-bold text-gray-500 tabular-nums">
                    {c.ratings.ovr != null ? `OVR ${c.ratings.ovr}` : 'No rating yet'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{c.groups.map((g) => g.name).join(' · ') || 'No groups'}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Organising">
        {profile.organiser ? (
          <Link
            href="/dashboard"
            className="flex items-center justify-between gap-3 rounded-3xl bg-ink text-white px-5 py-4"
          >
            <span>
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-volt-300">You run</span>
              <span className="font-display text-xl font-extrabold">{profile.organiser.clubName}</span>
            </span>
            <span className="text-xs font-bold text-volt-300">Switch to organising ›</span>
          </Link>
        ) : (
          <Link
            href="/me/start-group"
            className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-volt-300 border-2 border-ink shadow-sticker px-5 py-4"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl font-extrabold text-ink leading-tight">Start your own group</span>
              <span className="block text-xs text-ink/70 mt-1">Run your own 5-a-side: collect payments, RSVPs and votes. You keep your player card.</span>
            </span>
            <KitLine className="w-24 h-auto shrink-0" />
          </Link>
        )}
      </Section>

      </div>
      <div>
      <Section title="Account">
        <PlayerAccountSettings
          firstName={profile.player.firstName}
          lastName={profile.player.lastName}
          email={profile.player.email}
          onSaved={refresh}
        />
      </Section>

      <Section title="App">
        <div className="space-y-2">
          <InstallCard />
          <PushToggle save={subscribePlayerPush} />
          <button
            onClick={async () => {
              await logoutPlayer();
              router.replace('/me/login');
            }}
            className="w-full py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-2xl hover:border-ink"
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
