'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TEAMS } from '@/components/lineup-card';
import { BallSpinner } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import type { TeamKey } from '@/lib/api';
import { getGameLineup, pickBib, type GameLineup, type GamePaid } from '@/lib/player';

const KEYS = Object.keys(TEAMS) as TeamKey[];

function PaidTag({ paid }: { paid: GamePaid | null }) {
  if (!paid) return null;
  if (paid === 'paid') return <span className="text-[10px] font-extrabold text-pitch-600">✓ Paid</span>;
  if (paid === 'waived') return <span className="text-[10px] font-bold text-gray-500">Waived</span>;
  return <span className="text-[10px] font-extrabold text-kit-600">Not paid</span>;
}

/**
 * Match day on the player's game card: pick the bib you've been handed, and see the squad by
 * colour — with who's paid when the group shares that.
 */
export function MatchDayBibs({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const [lineup, setLineup] = useState<GameLineup | null>(null);
  const [saving, setSaving] = useState<TeamKey | 'clear' | null>(null);

  useEffect(() => {
    getGameLineup(sessionId).then(setLineup).catch(() => setLineup(null));
  }, [sessionId]);

  if (!lineup) return null;
  const teams = KEYS.slice(0, lineup.teamCount);

  async function choose(team: TeamKey) {
    const next = lineup?.myTeam === team ? null : team;
    setSaving(next ?? 'clear');
    try {
      setLineup(await pickBib(sessionId, next));
      if (next) toast.success(`You're in ${TEAMS[next].name.toLowerCase()} ⚽`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your bib");
    } finally {
      setSaving(null);
    }
  }

  const byTeam = (t: TeamKey | null) => lineup.squad.filter((p) => p.team === t);
  const noBib = byTeam(null);

  return (
    <div className="mt-4 rounded-2xl bg-chalk p-3.5 space-y-3">
      {lineup.bibsOpen ? (
        <div>
          <p className="text-xs font-bold text-ink mb-2">Which bib are you in?</p>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => {
              const mine = lineup.myTeam === t;
              return (
                <button
                  key={t}
                  onClick={() => choose(t)}
                  disabled={!!saving}
                  aria-pressed={mine}
                  className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-60 ${
                    mine ? 'bg-ink text-white' : 'bg-white text-ink border border-gray-200 hover:border-ink'
                  }`}
                >
                  {saving === t ? <BallSpinner /> : <span className={`w-5 h-5 rounded-full ${TEAMS[t].swatch}`} aria-hidden />}
                  {TEAMS[t].name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Bibs open on match day.</p>
      )}

      {lineup.myPaid === 'unpaid' ? (
        <Link href="/me/pay" className="block text-xs font-semibold text-kit-600">
          You haven&apos;t paid for this game yet — tap for the account details ›
        </Link>
      ) : lineup.myPaid === 'paid' ? (
        <p className="text-xs font-semibold text-pitch-600">✓ You&apos;ve paid for this game</p>
      ) : null}

      {lineup.squad.some((p) => p.team) && (
        <div className="space-y-2">
          {teams
            .filter((t) => byTeam(t).length)
            .map((t) => (
              <div key={t}>
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-sm ${TEAMS[t].swatch}`} aria-hidden />
                  {TEAMS[t].name} · {byTeam(t).length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {byTeam(t).map((p) => (
                    <span key={p.name} className="inline-flex items-center gap-1.5 bg-white rounded-full border border-gray-200 px-2.5 py-1">
                      <span className={`text-xs ${p.me ? 'font-extrabold text-ink' : 'font-semibold text-ink'}`}>{p.me ? 'You' : p.name}</span>
                      <PaidTag paid={p.paid} />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          {noBib.length > 0 && (
            <p className="text-[11px] text-gray-500">
              No bib yet: {noBib.map((p) => (p.me ? 'you' : p.name.split(' ')[0])).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
