'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Avatar } from '@/components/ratings';
import { getRsvpBoard, setRsvpForPlayer, type RsvpBoard, type SquadMember } from '@/lib/api';

/** Organiser's view of who's in for a game — tap to move players in or out. */
export function TeamSheet({ sessionId, onChange }: { sessionId: string; onChange?: () => void }) {
  const toast = useToast();
  const [board, setBoard] = useState<RsvpBoard | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(() => getRsvpBoard(sessionId).then(setBoard).catch(() => {}), [sessionId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!board) return null;

  async function move(p: SquadMember, status: 'in' | 'out') {
    setWorking(p.id);
    try {
      setBoard(await setRsvpForPlayer(sessionId, p.id, status));
      onChange?.();
    } catch (err: any) {
      toast.error(err.message || 'Could not update');
    } finally {
      setWorking(null);
    }
  }

  const pct = Math.min(100, Math.round((board.in.length / Math.max(board.capacity, 1)) * 100));
  const Row = ({ p, action }: { p: SquadMember; action: React.ReactNode }) => (
    <div className="flex items-center gap-2.5 py-2">
      <Avatar name={`${p.firstName} ${p.lastName}`} className="w-8 h-8 text-[11px]" />
      <span className="flex-1 text-sm font-semibold text-ink truncate">
        {p.firstName} {p.lastName}
      </span>
      {action}
    </div>
  );
  const btn = (label: string, onClick: () => void, dark = false) => (
    <button
      onClick={onClick}
      disabled={!!working}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40 transition-colors ${
        dark ? 'bg-ink text-volt-300 hover:bg-pitch-900' : 'bg-white border border-gray-200 text-gray-600 hover:border-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mb-6 bg-white rounded-3xl border border-gray-100 shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-pitch-600">Team sheet</p>
          <h2 className="text-lg font-extrabold text-ink leading-tight">Who&apos;s playing</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {board.requireRsvp
              ? "Players say if they're in; tap to move anyone."
              : "Attendance only — it doesn't change what anyone owes."}
          </p>
        </div>
        <span className="font-display text-2xl font-extrabold text-ink tabular-nums">
          {board.in.length}
          <span className="text-gray-500 text-base">/{board.capacity}</span>
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mt-3">
        <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-volt-500' : 'bg-pitch-500'}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-x-6">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">In ({board.in.length})</p>
          {board.in.length === 0 && <p className="text-xs text-gray-500 py-2">Nobody yet.</p>}
          {board.in.map((p) => (
            <Row key={p.id} p={p} action={btn('Mark out', () => move(p, 'out'))} />
          ))}
          {board.waitlist.length > 0 && (
            <>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 mt-3 mb-1">Waitlist ({board.waitlist.length})</p>
              {board.waitlist.map((p, i) => (
                <Row
                  key={p.id}
                  p={p}
                  action={
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-amber-700">#{i + 1}</span>
                      {btn('Mark in', () => move(p, 'in'), true)}
                    </span>
                  }
                />
              ))}
            </>
          )}
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1 mt-3 sm:mt-0">
            No reply ({board.noReply.length})
          </p>
          {board.noReply.map((p) => (
            <Row key={p.id} p={p} action={btn('Mark in', () => move(p, 'in'), true)} />
          ))}
          {board.out.length > 0 && (
            <>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mt-3 mb-1">Out ({board.out.length})</p>
              {board.out.map((p) => (
                <Row key={p.id} p={p} action={btn('Mark in', () => move(p, 'in'))} />
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
