'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ratings';
import { InstallCard, PushToggle } from '@/components/pwa';
import { GameCard, PlayerCardHero, Section, niceDate } from '@/components/player-ui';
import { formatCurrency } from '@/lib/api';
import { getPlayerHome, subscribePlayerPush, testPlayerPush, type PlayerHome } from '@/lib/player';

export default function PlayerHomePage() {
  const [home, setHome] = useState<PlayerHome | null>(null);
  const load = useCallback(() => getPlayerHome().then(setHome).catch(() => {}), []);

  useEffect(() => {
    load();
  }, [load]);

  if (!home) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-44 bg-gray-100 rounded-[28px]" />
        <div className="h-32 bg-gray-100 rounded-3xl" />
        <div className="h-32 bg-gray-100 rounded-3xl" />
      </div>
    );
  }

  const r = home.ratings;
  const firstTable = home.tables.find((t) => t.me);
  const caption = [
    firstTable?.me ? `#${firstTable.me.rank} in ${firstTable.groupName} · ${firstTable.me.points} pts` : 'Play, win and get votes to build your card',
    r.record.w + r.record.d + r.record.l ? `W${r.record.w} D${r.record.d} L${r.record.l}` : null,
    r.potmWins ? `★ ${r.potmWins} POTM` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const totalOwed = home.owed.reduce((sum, o) => sum + o.amount, 0);
  const pendingVotes = home.openVotes.filter((v) => !v.voted);

  return (
    <div className="md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-8 md:items-start">
      <div>
      <PlayerCardHero firstName={home.player.firstName} lastName={home.player.lastName} ratings={r} caption={caption} />

      <div className="mt-4 space-y-2 md:hidden">
        <InstallCard />
        <PushToggle save={subscribePlayerPush} test={testPlayerPush} />
      </div>

      {pendingVotes.length > 0 && (
        <Section title="Votes waiting">
          <div className="space-y-2">
            {pendingVotes.map((v) => (
              <Link
                key={v.token}
                href={`/v/${v.token}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-sun-400 px-4 py-3 hover:shadow-sticker transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-ink text-sun-400 flex items-center justify-center font-extrabold shrink-0">★</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-ink">Who were the stars?</span>
                  <span className="block text-xs text-ink/60 truncate">
                    {v.groupName} · {niceDate(v.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className="text-xs font-bold text-ink">Vote ›</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Next up"
        action={
          <Link href="/me/games" className="text-xs font-bold text-pitch-600">
            All games ›
          </Link>
        }
      >
        {home.upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 bg-chalk rounded-2xl px-4 py-5 text-center">
            {home.groups.length ? 'No games scheduled yet. We’ll ping you when there is one.' : 'Join a group with the link your organiser shares.'}
          </p>
        ) : (
          <div className="space-y-3">
            {home.upcoming.map((g) => (
              <GameCard key={g.id} game={g} onChange={load} />
            ))}
          </div>
        )}
      </Section>

      </div>

      <div>
      <div className="hidden md:block space-y-2">
        <InstallCard />
        <PushToggle save={subscribePlayerPush} test={testPlayerPush} />
      </div>

      <Link
        href="/me/pay"
        className={`mt-7 md:mt-4 flex items-center justify-between gap-3 rounded-3xl px-5 py-4 ${
          totalOwed > 0 ? 'bg-ink text-white' : 'bg-volt-100 border border-volt-300 text-ink'
        }`}
      >
        <span>
          <span className={`block text-[11px] font-extrabold uppercase tracking-[0.12em] ${totalOwed > 0 ? 'text-white/50' : 'text-ink/50'}`}>
            To pay
          </span>
          <span className="font-display text-2xl font-extrabold tabular-nums">
            {totalOwed > 0 ? formatCurrency(totalOwed) : 'All square ✅'}
          </span>
        </span>
        <span className={`text-xs font-bold ${totalOwed > 0 ? 'text-volt-300' : 'text-ink'}`}>
          {totalOwed > 0 ? `${home.owed.length} item${home.owed.length === 1 ? '' : 's'} ›` : 'History ›'}
        </span>
      </Link>

      {home.tables.some((t) => t.top.some((row) => row.points > 0)) && (
        <Section title="The table">
          <div className="space-y-3">
            {home.tables
              .filter((t) => t.top.some((row) => row.points > 0))
              .map((t) => (
                <div key={t.groupId} className="bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
                  <p className="px-4 py-2.5 bg-ink text-[11px] font-extrabold uppercase tracking-wider text-white/60">{t.groupName}</p>
                  {t.top.map((row) => (
                    <div
                      key={row.id}
                      className={`flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 ${row.id === t.myPlayerId ? 'bg-volt-100' : ''}`}
                    >
                      <span className="w-5 text-xs font-extrabold text-gray-500 tabular-nums">{row.rank}</span>
                      <Avatar name={row.name} className="w-7 h-7 text-[10px]" />
                      <span className="flex-1 text-sm font-bold text-ink truncate">{row.id === t.myPlayerId ? 'You' : row.name}</span>
                      <span className="font-display font-extrabold text-ink tabular-nums">{row.points}</span>
                    </div>
                  ))}
                  {t.me && t.me.rank > t.top.length && (
                    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-dashed border-gray-200 bg-volt-100">
                      <span className="w-5 text-xs font-extrabold text-gray-500 tabular-nums">{t.me.rank}</span>
                      <Avatar name={`${home.player.firstName} ${home.player.lastName}`} className="w-7 h-7 text-[10px]" />
                      <span className="flex-1 text-sm font-bold text-ink">You</span>
                      <span className="font-display font-extrabold text-ink tabular-nums">{t.me.points}</span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </Section>
      )}
      </div>
    </div>
  );
}
