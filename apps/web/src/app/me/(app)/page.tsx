'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ratings';
import { PushToggle } from '@/components/pwa';
import { GameCard, GameRow, LoadError, Section, niceDate } from '@/components/player-ui';
import { CountUpNaira } from '@/components/motion';
import { formatCurrency } from '@/lib/api';
import { getPlayerHome, subscribePlayerPush, type PlayerHome } from '@/lib/player';
import { ModeSwitch, usePlayerProfile } from '@/components/player-shell';

/** 1st, 2nd, 3rd, 4th… for a place in the table. */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export default function PlayerHomePage() {
  const [home, setHome] = useState<PlayerHome | null>(null);
  const { profile } = usePlayerProfile();
  const [failed, setFailed] = useState<unknown>(null);
  // A failed refresh after it has loaded keeps what's on screen; only a first load shows the error.
  const load = useCallback(
    () =>
      getPlayerHome()
        .then((h) => {
          setHome(h);
          setFailed(null);
        })
        .catch(setFailed),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!home && failed) {
    return (
      <LoadError
        what="Your home"
        error={failed}
        onRetry={() => {
          setFailed(null);
          load();
        }}
      />
    );
  }

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
  // What to send now, from the server (played games and each group's next one, after part payments).
  const totalOwed = home.groups.reduce((sum, g) => sum + g.toPay, 0);
  const owedNow = home.owed.filter((o) => o.now).length;
  const extra = home.groups.reduce((sum, g) => sum + g.extra, 0);
  const pendingVotes = home.openVotes.filter((v) => !v.voted);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
    {/* The same top as the organiser's home: today's date, a greeting, and the mode switch */}
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-pitch-600">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="text-[26px] leading-tight font-extrabold text-ink mt-0.5">
          {greeting}, {home.player.nickname || home.player.firstName}
        </h1>
      </div>
      <div className="md:hidden shrink-0 pt-1">
        <ModeSwitch organiser={profile?.organiser ?? null} />
      </div>
    </div>
    <div className="md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-8 md:items-start">
      <div>
      {/* Money first, as on the organiser's home: what to send now, in one dark strip */}
      <Link
        href="/me/pay"
        aria-label={totalOwed > 0 ? `To pay now: ${formatCurrency(totalOwed)}. Open Pay` : 'Nothing to pay. Open Pay'}
        className="press relative block overflow-hidden rounded-[28px] bg-ink text-white shadow-card"
      >
        <span className="absolute inset-0 turf-stripes-soft" aria-hidden />
        <span className="relative flex items-center gap-3 p-5">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-white/70">{totalOwed > 0 ? 'To pay now' : 'Your money'}</span>
            {totalOwed > 0 ? (
              <CountUpNaira value={totalOwed} className="block mt-0.5 font-display text-[40px] leading-none font-extrabold text-volt-300" />
            ) : (
              <span className="block mt-0.5 font-display text-[30px] leading-none font-extrabold">All square ✓</span>
            )}
            <span className="block mt-2 text-[13px] text-white/70">
              {totalOwed > 0 ? `For ${owedNow} game${owedNow === 1 ? '' : 's'} · put your payment code on the transfer` : 'Nothing owed right now'}
            </span>
            {extra > 0 && (
              <span className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-sun-400">
                <span className="w-2 h-2 rounded-full bg-sun-400" aria-hidden />
                {formatCurrency(extra)} of yours is with your organiser{home.groups.some((g) => g.extra > 0 && !g.extraRequest) ? ' · choose what happens' : ''}
              </span>
            )}
          </span>
          <span className="w-11 h-11 shrink-0 rounded-full bg-white/10 flex items-center justify-center" aria-hidden>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
        </span>
      </Link>

      {/* This week's game, in the organiser's match-day card */}
      <div className="mt-3">
        {home.upcoming.length === 0 ? (
          <div className="rounded-3xl bg-chalk px-5 py-6 text-center">
            <p className="text-[15px] font-bold text-ink">No game coming up</p>
            <p className="mt-1 text-[13px] text-gray-600">
              {home.groups.length ? 'You’ll get a ping when your organiser sets the next one.' : 'Join a group with the link your organiser shares.'}
            </p>
          </div>
        ) : (
          <GameCard game={home.upcoming[0]} onChange={load} />
        )}
      </div>

      {pendingVotes.length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingVotes.map((v) => (
            <Link
              key={v.token}
              href={`/v/${v.token}`}
              className="press flex items-center gap-3 min-h-16 rounded-3xl border-2 border-ink bg-sun-400 px-4 py-3 shadow-sticker"
            >
              <span className="w-10 h-10 rounded-2xl bg-ink text-sun-400 flex items-center justify-center font-extrabold shrink-0" aria-hidden>
                ★
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-ink">Vote for Player of the Match</span>
                <span className="block text-xs text-ink/70 truncate">
                  {v.groupName} · {niceDate(v.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </span>
              <span className="text-[13px] font-extrabold text-ink">Vote ›</span>
            </Link>
          ))}
        </div>
      )}

      {/* You in the club, two taps away: your card lives on Me, the full table on Club */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          href="/me/profile"
          aria-label={`Your card: rating ${r.ovr ?? 'not set yet'}. Open Me`}
          className="press relative overflow-hidden flex flex-col justify-between min-h-[120px] rounded-3xl bg-ink text-white p-4 shadow-card"
        >
          <span className="absolute inset-0 turf-stripes-soft" aria-hidden />
          <span className="relative flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-white/70">Your card</span>
            <Avatar name={`${home.player.firstName} ${home.player.lastName}`} photoKey={home.player.photoKey} className="w-8 h-8 text-[10px]" />
          </span>
          <span className="relative">
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-[34px] leading-none font-extrabold text-volt-300 tabular-nums">{r.ovr ?? '–'}</span>
              <span className="text-[11px] font-extrabold tracking-[0.12em] text-white/60">OVR</span>
            </span>
            <span className="mt-1 block text-[12px] text-white/70 truncate">
              {r.games > 0 ? `W${r.record.w} D${r.record.d} L${r.record.l}${r.provisional ? ' · settling' : ''}` : 'Play to build it'}
            </span>
          </span>
        </Link>
        <Link
          href={firstTable ? `/me/club?group=${firstTable.groupId}` : '/me/club'}
          aria-label={firstTable?.me ? `${ordinal(firstTable.me.rank)} in ${firstTable.groupName} with ${firstTable.me.points} points. Open the table` : 'Open the table'}
          className="press flex flex-col justify-between min-h-[120px] rounded-3xl bg-white border border-gray-100 p-4 shadow-card"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-gray-500">The table</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
          {firstTable?.me ? (
            <span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-[34px] leading-none font-extrabold text-ink tabular-nums">{ordinal(firstTable.me.rank)}</span>
                <span className="text-[13px] font-bold text-gray-500 tabular-nums">{firstTable.me.points} pts</span>
              </span>
              <span className="mt-1 block text-[12px] text-gray-600 truncate">in {firstTable.groupName}</span>
            </span>
          ) : (
            <span>
              <span className="block font-display text-[20px] leading-tight font-extrabold text-ink">Not on it yet</span>
              <span className="mt-1 block text-[12px] text-gray-600">Play a game with scores</span>
            </span>
          )}
        </Link>
      </div>

      {home.upcoming.length > 1 && (
        <Section
          title="Coming up"
          action={
            <Link href="/me/games" className="inline-flex items-center min-h-11 text-[13px] font-bold text-pitch-700">
              All games ›
            </Link>
          }
        >
          <div className="space-y-2">
            {home.upcoming.slice(1).map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
          </div>
        </Section>
      )}

      </div>

      <div>
      <div className="mt-6 space-y-2">
        <PushToggle save={subscribePlayerPush} />
      </div>
      </div>
    </div>
    </>
  );
}
