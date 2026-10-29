'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/toast';
import { getMyBookings, cancelMyBooking } from '@/lib/pitch';
import type { IPitchBooking } from '@pitchaside/shared';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600',
  paid: 'bg-green-100 text-green-700',
  refunded: 'bg-blue-100 text-blue-700',
};

export default function MyBookingsPage() {
  const toast = useToast();
  const [bookings, setBookings] = useState<IPitchBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    getMyBookings()
      .then(setBookings)
      .catch(() => toast.error('Failed to load bookings'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      const updated = await cancelMyBooking(id);
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      toast.success('Booking cancelled');
    } catch (err: any) {
      toast.error(err.message || 'Could not cancel');
    } finally {
      setCancelling(null);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-ink">My pitch bookings</h1>
        <Link
          href="/book-pitch"
          className="px-4 py-2 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
        >
          Book a pitch
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm mb-4">You haven&apos;t booked any pitches yet.</p>
          <Link
            href="/book-pitch"
            className="inline-block px-5 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Book a pitch
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink truncate">
                  {b.pitch?.name || 'Pitch'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {b.date} &middot; {b.startTime}&ndash;{b.endTime}
                  {b.pitch?.city && ` &middot; ${b.pitch.city}`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {b.pitch?.currency || 'NGN'} {Number(b.price).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${STATUS_BADGE[b.status] || 'bg-gray-100 text-gray-500'}`}>
                  {b.status}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${PAYMENT_BADGE[b.paymentStatus] || 'bg-gray-100 text-gray-500'}`}>
                  {b.paymentStatus}
                </span>
                {(b.status === 'pending' || b.status === 'confirmed') && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancelling === b.id}
                    className="ml-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {cancelling === b.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
              {b.status === 'confirmed' && b.paymentStatus === 'unpaid' && b.pitch?.accountNumber && (
                <div className="w-full mt-2 bg-blue-50 rounded-lg px-3 py-2">
                  <p className="text-xs font-bold text-blue-700 mb-0.5">Pay via bank transfer</p>
                  <p className="text-xs text-blue-900 font-mono">{b.pitch.accountNumber}</p>
                  <p className="text-[11px] text-blue-700">{b.pitch.accountName} &middot; {b.pitch.virtualBankName}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
