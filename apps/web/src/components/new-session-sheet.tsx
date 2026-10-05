'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/sheet';
import { BallSpinner } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { createSession, type IGroupWithMembers } from '@/lib/api';

const field =
  'w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

/**
 * Schedule a game (or a run of them) without opening the group first. With one group
 * there's nothing to pick; with several, the organiser chooses which.
 */
export function NewSessionSheet({ groups, onClose }: { groups: IGroupWithMembers[]; onClose: () => void }) {
  const titleId = useId();
  const router = useRouter();
  const toast = useToast();
  const [groupId, setGroupId] = useState(groups.length === 1 ? groups[0].id : '');
  const [date, setDate] = useState('');
  // Starts at the group's usual kick-off; players are told it and reminded 2 hours before.
  const [time, setTime] = useState(groups.length === 1 ? (groups[0].kickoffTime ?? '') : '');
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [creating, setCreating] = useState(false);

  const repeating = recurrenceType !== 'none';

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !date) return;
    setCreating(true);
    try {
      const session = await createSession({
        groupId,
        date,
        kickoffTime: time || undefined,
        recurrenceType: repeating ? recurrenceType : undefined,
        recurrenceCount: repeating ? recurrenceCount : undefined,
      });
      toast.success(repeating ? `${recurrenceCount} games scheduled` : 'Game scheduled');
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't schedule the game");
      setCreating(false);
    }
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <form onSubmit={create} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-extrabold text-ink">
            New game
          </h2>
          <button type="button" onClick={onClose} className="text-xs font-bold text-gray-500 hover:text-ink">
            Close
          </button>
        </div>
        <p className="text-xs text-gray-500 -mt-1">Everyone in the group gets a due for it.</p>

        {groups.length > 1 ? (
          <div>
            <label htmlFor={`${titleId}-group`} className="block text-xs font-bold text-gray-700 mb-1.5">
              Group
            </label>
            <select
              id={`${titleId}-group`}
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setTime(groups.find((g) => g.id === e.target.value)?.kickoffTime ?? '');
              }}
              className={field}
            >
              <option value="">Choose a group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm font-bold text-ink">{groups[0]?.name}</p>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label htmlFor={`${titleId}-date`} className="block text-xs font-bold text-gray-700 mb-1.5">
              Game date
            </label>
            <input id={`${titleId}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor={`${titleId}-time`} className="block text-xs font-bold text-gray-700 mb-1.5">
              Kick-off
            </label>
            <input id={`${titleId}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-1">Players get the time when it&apos;s scheduled, and a reminder 2 hours before.</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${titleId}-repeat`} className="block text-xs font-bold text-gray-700 mb-1.5">
              Repeat
            </label>
            <select id={`${titleId}-repeat`} value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value)} className={field}>
              <option value="none">Just this one</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {repeating && (
            <div>
              <label htmlFor={`${titleId}-count`} className="block text-xs font-bold text-gray-700 mb-1.5">
                How many
              </label>
              <input
                id={`${titleId}-count`}
                type="number"
                min={2}
                max={52}
                value={recurrenceCount}
                onChange={(e) => setRecurrenceCount(Number(e.target.value))}
                className={field}
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!groupId || !date || creating}
          className="w-full py-3 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {creating && <BallSpinner />}
          {creating ? 'Scheduling…' : repeating ? `Schedule ${recurrenceCount} games` : 'Schedule game'}
        </button>
      </form>
    </Sheet>
  );
}
