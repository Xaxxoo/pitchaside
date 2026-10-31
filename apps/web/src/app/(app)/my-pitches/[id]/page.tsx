'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { getPitch, getSchedule, listBookings, listOverrides, confirmBooking, rejectBooking, cancelBookingOwner, markBookingPaid, listPitchTransfers, assignPitchTransfer } from '@/lib/pitch';
import { useToast } from '@/components/toast';
import { HiddenPitchBanner } from '@/components/pitch/hidden-pitch-banner';
import type { IPitch, IPitchSchedule, IPitchBooking, IPitchSlotOverride } from '@pitchaside/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PitchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [pitch, setPitch] = useState<IPitch | null>(null);
  const [schedule, setSchedule] = useState<IPitchSchedule[]>([]);
  const [bookings, setBookings] = useState<IPitchBooking[]>([]);
  const [overrides, setOverrides] = useState<IPitchSlotOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bookings' | 'schedule' | 'overrides'>('bookings');
  const [unmatchedTransfers, setUnmatchedTransfers] = useState<any[]>([]);
  const [assigningBooking, setAssigningBooking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s, b, o] = await Promise.all([
        getPitch(id),
        getSchedule(id),
        listBookings(id),
        listOverrides(id),
      ]);
      setPitch(p);
      setSchedule(s);
      setBookings(b);
      setOverrides(o);
      if (p.accountNumber) {
        listPitchTransfers(id).then((t) => setUnmatchedTransfers(t.filter((tr: any) => tr.status === 'unmatched'))).catch(() => {});
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(action: () => Promise<any>, msg: string) {
    try {
      await action();
      toast.success(msg);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    }
  }

  async function handleAssignTransfer(bookingId: string, transferId: string) {
    try {
      await assignPitchTransfer(id, transferId, bookingId);
      toast.success('Payment assigned');
      setAssigningBooking(null);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Assignment failed');
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;
  if (!pitch) return <div className="text-center py-20 text-gray-500">Pitch not found</div>;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${pitch.shareCode}`
    : `/p/${pitch.shareCode}`;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton label="Your pitches" href="/my-pitches" />
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{pitch.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {[pitch.city, pitch.state].filter(Boolean).join(', ') || 'No location set'}
            {' \u00b7 '}
            {pitch.currency} {Number(pitch.defaultPrice).toLocaleString()} / slot
          </p>
        </div>
        <Link
          href={`/my-pitches/${id}/settings`}
          className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Pitch details
        </Link>
      </div>

      {pitch.status === 'inactive' && <HiddenPitchBanner pitchId={id} onShown={load} />}

      {/* Share link */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-500">Share link</p>
          <p className="text-sm font-mono text-ink mt-0.5">{shareUrl}</p>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Link copied'); }}
          className="text-xs font-bold text-pitch-600 hover:text-pitch-700"
        >
          Copy
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {(['bookings', 'schedule', 'overrides'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'text-ink border-b-2 border-ink' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'bookings' && (
        <div className="space-y-2">
          {bookings.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No bookings yet</p>
          ) : (
            bookings.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm text-ink">{b.bookerName}</span>
                    {b.bookerPhone && <span className="text-xs text-gray-400 ml-2">{b.bookerPhone}</span>}
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{b.date} &middot; {b.startTime} - {b.endTime} &middot; {pitch.currency} {Number(b.price).toLocaleString()}</p>
                {b.notes && <p className="text-xs text-gray-400 mt-1">{b.notes}</p>}
                <div className="flex gap-2 mt-2">
                  {b.status === 'pending' && (
                    <>
                      <ActionBtn label="Confirm" onClick={() => handleAction(() => confirmBooking(id, b.id), 'Booking confirmed')} color="green" />
                      <ActionBtn label="Reject" onClick={() => handleAction(() => rejectBooking(id, b.id), 'Booking rejected')} color="red" />
                    </>
                  )}
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <ActionBtn label="Cancel" onClick={() => handleAction(() => cancelBookingOwner(id, b.id), 'Booking cancelled')} color="gray" />
                  )}
                  {b.status === 'confirmed' && b.paymentStatus === 'unpaid' && (
                    <ActionBtn label="Mark paid" onClick={() => handleAction(() => markBookingPaid(id, b.id), 'Marked as paid')} color="blue" />
                  )}
                  {b.status === 'confirmed' && b.paymentStatus === 'unpaid' && unmatchedTransfers.length > 0 && (
                    <ActionBtn
                      label={assigningBooking === b.id ? 'Cancel' : 'Assign payment'}
                      onClick={() => setAssigningBooking(assigningBooking === b.id ? null : b.id)}
                      color="blue"
                    />
                  )}
                </div>
                {assigningBooking === b.id && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg space-y-1.5">
                    <p className="text-xs font-bold text-blue-700 mb-1">Select an unmatched transfer:</p>
                    {unmatchedTransfers.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => handleAssignTransfer(b.id, t.id)}
                        className="w-full text-left px-3 py-2 bg-white rounded-lg border border-blue-100 hover:border-blue-300 text-xs transition-colors"
                      >
                        <span className="font-bold text-ink">NGN {Number(t.amount).toLocaleString()}</span>
                        {t.senderName && <span className="text-gray-500 ml-2">{t.senderName}</span>}
                        <span className="text-gray-400 ml-2">{new Date(t.receivedAt).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                )}
                {b.paymentStatus === 'paid' && (
                  <p className="text-xs text-green-600 font-bold mt-1">Paid {b.paymentMethod === 'on_platform' ? '(on-platform)' : '(off-platform)'}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'schedule' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-ink">Weekly schedule</h2>
            <Link href={`/my-pitches/${id}/settings`} className="text-xs text-pitch-600 font-bold">
              Edit schedule
            </Link>
          </div>
          {schedule.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No schedule set. Set your weekly availability in settings.</p>
          ) : (
            <div className="space-y-2">
              {schedule.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{DAYS[s.dayOfWeek]}</span>
                  <span className="text-sm text-gray-600">{s.openTime} - {s.closeTime}</span>
                  {s.price != null && <span className="text-xs text-gray-400">{pitch.currency} {Number(s.price).toLocaleString()}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'overrides' && (
        <div>
          {overrides.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No date overrides</p>
          ) : (
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-ink">{o.date}</span>
                    <span className="text-xs text-gray-500 ml-2">{o.startTime} - {o.endTime}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    o.type === 'blocked' ? 'bg-red-100 text-red-600'
                    : o.type === 'added' ? 'bg-green-100 text-green-600'
                    : 'bg-blue-100 text-blue-600'
                  }`}>{o.type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function ActionBtn({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-700 bg-green-50 hover:bg-green-100',
    red: 'text-red-700 bg-red-50 hover:bg-red-100',
    gray: 'text-gray-600 bg-gray-50 hover:bg-gray-100',
    blue: 'text-blue-700 bg-blue-50 hover:bg-blue-100',
  };
  return (
    <button onClick={onClick} className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors ${colors[color]}`}>
      {label}
    </button>
  );
}
