'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { formatCurrency } from '@/lib/api';
import { hq, compactNaira, shortDay, type HqOverview } from '@/lib/hq';
import { Delta, LoadError, Panel, Pill, Tile, WeeklyBars, useLoad } from '@/components/hq-ui';

/** Things someone at HQ should look at, worst first. Only non-zero items are shown. */
function attentionItems(a: HqOverview['attention']) {
  const pushTotal = a.pushDelivered7d + a.pushMissed7d;
  const pushRate = pushTotal ? Math.round((a.pushDelivered7d / pushTotal) * 100) : null;
  return [
    a.unmatchedTransfers > 0 && {
      key: 'transfers',
      tone: 'bad' as const,
      title: `${a.unmatchedTransfers} bank transfer${a.unmatchedTransfers === 1 ? '' : 's'} not matched to a player`,
      detail: `${formatCurrency(a.unmatchedAmount)} received but not credited to anyone yet.`,
      href: '/hq/money?status=unmatched',
    },
    a.failedMessages7d > 0 && {
      key: 'failed',
      tone: 'bad' as const,
      title: `${a.failedMessages7d} message${a.failedMessages7d === 1 ? '' : 's'} failed to send this week`,
      detail: 'WhatsApp / SMS rejected by the provider.',
      href: '/hq/notifications?status=failed',
    },
    a.overdueAmount > 0 && {
      key: 'overdue',
      tone: 'warn' as const,
      title: `${formatCurrency(a.overdueAmount)} unpaid for more than two weeks`,
      detail: 'Owed for games and dues periods that are over 14 days old.',
      href: '/hq/clubs?sort=outstanding',
    },
    pushRate !== null && pushRate < 50 && {
      key: 'push',
      tone: 'warn' as const,
      title: `Only ${pushRate}% of notifications reached a device this week`,
      detail: `${a.pushMissed7d} went to players who haven't turned notifications on.`,
      href: '/hq/notifications?status=no_device',
    },
    a.groupsWithoutAccount > 0 && {
      key: 'accounts',
      tone: 'warn' as const,
      title: `${a.groupsWithoutAccount} group${a.groupsWithoutAccount === 1 ? ' has' : 's have'} no collection account`,
      detail: 'Players in these groups have nowhere to transfer to.',
      href: '/hq/clubs',
    },
    a.dormantClubs > 0 && {
      key: 'dormant',
      tone: 'muted' as const,
      title: `${a.dormantClubs} club${a.dormantClubs === 1 ? ' has' : 's have'} gone quiet`,
      detail: 'Set up with groups, but no game or dues period in the last 30 days.',
      href: '/hq/clubs',
    },
    a.clubsWithoutGroups > 0 && {
      key: 'empty',
      tone: 'muted' as const,
      title: `${a.clubsWithoutGroups} club${a.clubsWithoutGroups === 1 ? '' : 's'} signed up but never created a group`,
      detail: 'Stuck at the first onboarding step.',
      href: '/hq/clubs',
    },
  ].filter((item): item is Exclude<typeof item, false> => Boolean(item));
}

export default function HqOverviewPage() {
  const { data, error, loading } = useLoad(() => hq.overview(), []);

  if (error) {
    return (
      <>
        <PageHeader eyebrow="HQ" title="Overview" />
        <LoadError message={error} />
      </>
    );
  }

  if (loading || !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="h-64 bg-gray-100 rounded-3xl" />
          <div className="h-64 bg-gray-100 rounded-3xl" />
        </div>
      </div>
    );
  }

  const { totals, money, growth, weekly, attention, topClubs, recentClubs, modes } = data;
  const items = attentionItems(attention);
  const collectedTotal = money.collected + money.outstanding;
  const collectionRate = collectedTotal > 0 ? Math.round((money.collected / collectedTotal) * 100) : null;

  return (
    <>
      <PageHeader
        eyebrow="HQ"
        title="Overview"
        subtitle="Every club on PitchAside, in one place."
        actions={
          <div className="hidden sm:flex items-center gap-1.5">
            <Pill tone={modes.bank === 'live' ? 'good' : 'warn'}>Bank: {modes.bank === 'live' ? 'live' : 'test mode'}</Pill>
            <Pill tone={modes.push ? 'good' : 'warn'}>Push: {modes.push ? 'on' : 'not configured'}</Pill>
          </div>
        }
      />

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Tile
          tone="volt"
          label="Collected, last 30 days"
          value={compactNaira(money.collected30d)}
          sub={<Delta current={money.collected30d} previous={money.collectedPrev30d} />}
        />
        <Tile
          label="Clubs"
          value={totals.clubs.toLocaleString()}
          sub={
            <>
              {growth.clubs30d} new · <Delta current={growth.clubs30d} previous={growth.clubsPrev30d} />
            </>
          }
        />
        <Tile
          label="Players"
          value={totals.players.toLocaleString()}
          sub={
            <>
              {growth.players30d} new · <Delta current={growth.players30d} previous={growth.playersPrev30d} />
            </>
          }
        />
        <Tile
          label="Games, last 30 days"
          value={growth.games30d.toLocaleString()}
          sub={<Delta current={growth.games30d} previous={growth.gamesPrev30d} />}
        />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Panel title="Money collected per week" hint="Payments marked paid or matched from a bank transfer, last 12 weeks.">
            <WeeklyBars
              weeks={weekly.map((w) => ({ week: w.week, value: w.collected }))}
              format={formatCurrency}
              unit={compactNaira}
            />
          </Panel>

          <div className="grid sm:grid-cols-2 gap-4">
            <Panel title="New players per week" hint="First time a person joins any club.">
              <WeeklyBars
                weeks={weekly.map((w) => ({ week: w.week, value: w.newPlayers }))}
                format={(v) => `${v} player${v === 1 ? '' : 's'}`}
                unit={String}
                whole
              />
            </Panel>
            <Panel title="Games per week" hint="Match days that weren't cancelled.">
              <WeeklyBars
                weeks={weekly.map((w) => ({ week: w.week, value: w.games }))}
                format={(v) => `${v} game${v === 1 ? '' : 's'}`}
                unit={String}
                whole
              />
            </Panel>
          </div>

          <Panel
            title="Newest clubs"
            action={
              <Link href="/hq/clubs" className="text-xs font-bold text-pitch-600 hover:text-pitch-800 whitespace-nowrap">
                All clubs →
              </Link>
            }
          >
            {recentClubs.length === 0 ? (
              <p className="text-sm text-gray-500">No clubs have signed up yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 -my-2">
                {recentClubs.map((c) => (
                  <li key={c.id}>
                    <Link href={`/hq/clubs/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 group">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink truncate group-hover:text-pitch-600">{c.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {c.ownerName ?? 'No organiser'} · joined {shortDay(c.createdAt)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
                        {c.groups} group{c.groups === 1 ? '' : 's'} · {c.players} player{c.players === 1 ? '' : 's'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4 min-w-0">
          <Panel title="Needs attention">
            {items.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing to chase. Transfers are matched and messages are going out.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex gap-3 rounded-2xl border border-gray-100 p-3 hover:border-ink transition-colors"
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          item.tone === 'bad' ? 'bg-kit-500' : item.tone === 'warn' ? 'bg-sun-400' : 'bg-gray-300'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-ink">{item.title}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{item.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Money, all time">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Collected</dt>
                <dd className="font-bold text-ink tabular-nums">{formatCurrency(money.collected)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">of which by bank transfer</dt>
                <dd className="text-ink tabular-nums">{formatCurrency(money.collectedByTransfer)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Still owed</dt>
                <dd className="font-bold text-ink tabular-nums">{formatCurrency(money.outstanding)}</dd>
              </div>
              {collectionRate !== null && (
                <div className="flex justify-between gap-3 pt-2.5 border-t border-gray-100">
                  <dt className="text-gray-500">Collection rate</dt>
                  <dd className="font-bold text-ink tabular-nums">{collectionRate}%</dd>
                </div>
              )}
            </dl>
          </Panel>

          <Panel title="Top clubs, last 30 days" hint="By money collected.">
            {topClubs.length === 0 ? (
              <p className="text-sm text-gray-500">No payments in the last 30 days.</p>
            ) : (
              <ol className="space-y-2.5">
                {topClubs.map((c, i) => (
                  <li key={c.id}>
                    <Link href={`/hq/clubs/${c.id}`} className="block group">
                      <span className="flex justify-between gap-3 text-sm">
                        <span className="font-semibold text-ink truncate group-hover:text-pitch-600">
                          <span className="text-gray-500 tabular-nums mr-1.5">{i + 1}</span>
                          {c.name}
                        </span>
                        <span className="font-bold text-ink tabular-nums">{formatCurrency(c.collected)}</span>
                      </span>
                      <span className="block mt-1.5 h-1.5 rounded-full bg-gray-100">
                        <span
                          className="block h-1.5 rounded-full bg-pitch-500"
                          style={{ width: `${Math.max((c.collected / topClubs[0].collected) * 100, 2)}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Footprint">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                ['Groups', totals.groups],
                ['Organisers', totals.organisers],
                ['Players with a login', totals.playersWithLogin],
                ['Devices with push on', totals.pushDevices],
                ['Games played', totals.gamesPlayed],
                ['Games coming up', totals.gamesUpcoming],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="font-display text-xl font-extrabold text-ink">{Number(value).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
