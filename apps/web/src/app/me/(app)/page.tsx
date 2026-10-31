'use client';

import { PitchHomeRow } from '@/components/home/pitch-row';
import { NotifyPrompt } from '@/components/notify';
import { levelOf } from '@/lib/rating-level';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FaceStack } from '@/components/people-row';
import { Avatar, VoteClock, newLine } from '@/components/ratings';
import { DidYouKnow } from '@/components/onboarding/did-you-know';
import { GameCard, GameRow, LoadError, Section, niceDate } from '@/components/player-ui';
import { CountUpNaira, LiveDot } from '@/components/motion';
import { Trophy } from '@/components/illustrations';
import { formatCurrency } from '@/lib/api';
import { getPlayerHome, type PlayerHome } from '@/lib/player';
import { ModeSwitch, usePlayerProfile } from '@/components/player-shell';
import { PlayerGroupSwitch } from '@/components/player-group-switch';
import { usePlayerGroup } from '@/lib/player-group';

/** 1st, 2nd, 3rd, 4th… for a place in the table. */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export default function PlayerHomePage() {
  const [home, setHome] = useState<PlayerHome | null>(null);
  const { profile } = usePlayerProfile();
  const [failed, setFailed] = useState<unknown>(null);
  // All their groups, or one, like the organiser's group switch (Games and Club follow it too).
  const [groupId, pickGroup] = usePlayerGroup(home?.groups);
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
  const group = home.groups.find((g) => g.id === groupId) ?? null;
  const inGroup = (id?: string | null, name?: string | null) => !group || (id ? id === group.id : name === group.name);
  const upcoming = home.upcoming.filter((g) => inGroup(g.groupId));
  const firstTable = home.tables.find((t) => t.me && inGroup(t.groupId));
  // What to send now, from the server (played games and each group's next one, after part payments).
  // With one group picked it shows that group's, and still says what's owed in the others.
  const allOwed = home.groups.reduce((sum, g) => sum + g.toPay, 0);
  const totalOwed = group ? group.toPay : allOwed;
  const owedElsewhere = allOwed - totalOwed;
  const owedNow = home.owed.filter((o) => o.now && inGroup(o.groupId)).length;
  const extra = home.groups.reduce((sum, g) => sum + g.extra, 0);
  const pendingVotes = home.openVotes.filter((v) => !v.voted && inGroup(v.groupId, v.groupName));

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
    {home.groups.length > 0 && (
      <div className="-mt-1 mb-3.5">
        <PlayerGroupSwitch groups={home.groups} value={group?.id ?? null} onPick={pickGroup} />
      </div>
    )}
    <div className="md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-8 md:items-start">
      <div>
      {/* Money first, as on the organiser's home: what to send now, in one dark strip */}
      <Link
        href="/me/pay"
        aria-label={`${totalOwed > 0 ? `To pay now${group ? ` in ${group.name}` : ''}: ${formatCurrency(totalOwed)}` : 'Nothing to pay'}${owedElsewhere > 0 ? `, and ${formatCurrency(owedElsewhere)} in your other groups` : ''}. Open Pay`}
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
              {totalOwed > 0
                ? `For ${owedNow} game${owedNow === 1 ? '' : 's'}${group ? ` in ${group.name}` : ''} · put your payment code on the transfer`
                : group
                  ? `Nothing owed in ${group.name}`
                  : 'Nothing owed right now'}
            </span>
            {owedElsewhere > 0 && (
              <span className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-sun-400">
                <span className="w-2 h-2 rounded-full bg-sun-400" aria-hidden />
                {formatCurrency(owedElsewhere)} to pay in your other groups
              </span>
            )}
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

      {/* Notifications on by default: one tap, once, for a phone that hasn't allowed them */}
      <div className="mt-3">
        <NotifyPrompt side="player" />
      </div>

      {/* This week's game, in the organiser's match-day card */}
      <div className="mt-3">
        {upcoming.length === 0 ? (
          <div className="rounded-3xl bg-chalk px-5 py-6 text-center">
            <p className="text-[15px] font-bold text-ink">{group ? `No game coming up in ${group.name}` : 'No game coming up'}</p>
            <p className="mt-1 text-[13px] text-gray-600">
              {home.groups.length ? 'You’ll get a ping when your organiser sets the next one.' : 'Join a group with the link your organiser shares.'}
            </p>
            {group && home.upcoming.length > 0 && (
              <button onClick={() => pickGroup(null)} className="press mt-3 inline-flex items-center min-h-11 px-4 rounded-full bg-white border border-gray-200 text-[13px] font-bold text-ink hover:border-ink">
                See all my groups ({home.upcoming.length} coming up)
              </button>
            )}
          </div>
        ) : (
          <GameCard game={upcoming[0]} onChange={load} />
        )}
      </div>

      {pendingVotes.length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingVotes.map((v) => (
            // Full time: the card is the moment itself (who ran the show?), with one button to vote
            <Link
              key={v.token}
              href={`/v/${v.token}`}
              aria-label={`Vote for Player of the Match: ${v.groupName}, ${niceDate(v.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
              className="press group relative block overflow-hidden rounded-[28px] border-2 border-ink bg-[linear-gradient(160deg,#134927_0%,#10301d_42%,#0f1a14_100%)] p-5 text-white shadow-sticker animate-rise"
            >
              <span className="absolute inset-0 turf-stripes-soft" aria-hidden />
              <Trophy className="absolute -right-4 -top-1 w-32 motion-safe:animate-pop-in" />
              <span className="relative block pr-24">
                <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-volt-300">
                  <LiveDot className="bg-volt-400" />
                  Full time · {niceDate(v.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="mt-1.5 block font-display text-[26px] leading-[1.05] font-extrabold">Who ran the show?</span>
                <span className="mt-1 block text-[13px] text-white/75 truncate">{v.groupName}</span>
              </span>
              {/* Turnout, with the faces of who's voted: nobody is named for not voting */}
              <span className="relative mt-3 flex items-center gap-2 min-w-0">
                {v.voters && v.voters.length > 0 && <FaceStack people={v.voters} total={v.ballots} max={3} onDark showMore={false} />}
                {v.squadSize ? (
                  <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" aria-label={`${v.ballots} of ${v.squadSize} have voted`}>
                    {v.ballots} of {v.squadSize} voted
                  </span>
                ) : null}
              </span>
              {/* When it closes: a quiet line, then a countdown in the last 3 hours */}
              <VoteClock closesAt={v.closesAt} tone="dark" className="relative mt-1.5 block w-fit" />
              <span className="relative mt-4 flex items-center justify-center gap-2 h-12 rounded-2xl bg-volt-400 text-ink text-[15px] font-extrabold group-hover:bg-volt-300 transition-colors">
                Vote now · 1 minute
                <svg className="w-4 h-4 animate-nudge" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Pitches ready to book, for the one who rings the pitch for the boys */}
      <PitchHomeRow className="mt-4" />

      {/* Now and then: a "Did you know?" that fits what's going on */}
      <DidYouKnow side="player" className="mt-4" context={{ owes: totalOwed > 0, voteOpen: pendingVotes.length > 0, noPhoto: !home.player.photoKey }} />

      {/* You in the club, two taps away: your card lives on Me, the full table on Club */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          href="/me/profile"
          aria-label={`Your card: ${r.ovr != null ? `rating ${r.ovr}` : newLine(r.ratedIn)}. Open Me`}
          className="press relative overflow-hidden flex flex-col justify-between min-h-[120px] rounded-3xl bg-ink text-white p-4 shadow-card"
        >
          <span className="absolute inset-0 turf-stripes-soft" aria-hidden />
          <span className="relative flex items-center justify-between gap-2">
            {/* What their number makes them, once there is one */}
            <span className="text-[12px] font-bold text-volt-300 truncate">{r.ovr != null ? levelOf(r.ovr).name : 'Your card'}</span>
            <Avatar name={`${home.player.firstName} ${home.player.lastName}`} photoKey={home.player.photoKey} className="w-8 h-8 text-[10px]" />
          </span>
          <span className="relative">
            <span className="flex items-baseline gap-1.5">
              {r.ovr != null ? (
                <>
                  <span className="font-display text-[34px] leading-none font-extrabold text-volt-300 tabular-nums">{r.ovr}</span>
                  <span className="text-[11px] font-extrabold tracking-[0.12em] text-white/60">OVR</span>
                </>
              ) : (
                <span className="font-display text-[34px] leading-none font-extrabold text-volt-300">New</span>
              )}
            </span>
            <span className="mt-1 block text-[12px] text-white/70 truncate">
              {r.ovr == null
                ? newLine(r.ratedIn).replace('New · ', '')
                : `W${r.record.w} D${r.record.d} L${r.record.l}`}
            </span>
          </span>
        </Link>
        <Link
          href={firstTable ? `/me/club?group=${firstTable.groupId}` : group ? `/me/club?group=${group.id}` : '/me/club'}
          aria-label={firstTable?.me ? `${ordinal(firstTable.me.rank)}${firstTable.of ? ` of ${firstTable.of}` : ''} in ${firstTable.groupName}. Open the table` : 'Open the table'}
          className="press flex flex-col justify-between min-h-[120px] rounded-3xl bg-white border border-gray-100 p-4 shadow-card"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-gray-500">The table</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </span>
          {firstTable?.me ? (
            // Built like "Your card" beside it: one big number, a small tag on its baseline, one line under.
            <span>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="font-display text-[34px] leading-none font-extrabold text-ink tabular-nums">{ordinal(firstTable.me.rank)}</span>
                {firstTable.of ? <span className="text-[11px] font-extrabold tracking-[0.12em] text-gray-500 tabular-nums">OF {firstTable.of}</span> : null}
              </span>
              <span className="mt-1 block text-[12px] text-gray-600 truncate">{firstTable.groupName}</span>
            </span>
          ) : (
            <span>
              <span className="block font-display text-[20px] leading-tight font-extrabold text-ink">Not on it yet</span>
              <span className="mt-1 block text-[12px] text-gray-600 truncate">{group ? `in ${group.name}` : 'Play a game with scores'}</span>
            </span>
          )}
        </Link>
      </div>

      {upcoming.length > 1 && (
        <Section
          title="Coming up"
          action={
            <Link href="/me/games" className="inline-flex items-center min-h-11 text-[13px] font-bold text-pitch-700">
              All games ›
            </Link>
          }
        >
          <div className="space-y-2">
            {upcoming.slice(1).map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
          </div>
        </Section>
      )}

      </div>

    </div>
    </>
  );
}
