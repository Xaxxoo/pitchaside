'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getMyPitches, listBookings } from '@/lib/pitch';
import type { IPitch, IPitchBooking } from '@pitchaside/shared';

export default function PitchOwnerDashboard() {
  const { user } = useAuth();
  const [pitches, setPitches] = useState<IPitch[]>([]);
  const [todayBookings, setTodayBookings] = useState<IPitchBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyPitches();
        setPitches(p);
        // Load today's bookings from all pitches
        const today = new Date().toISOString().split('T')[0];
        const allBookings: IPitchBooking[] = [];
        for (const pitch of p) {
          const bookings = await listBookings(pitch.id);
          allBookings.push(...bookings.filter((b) => b.date === today));
        }
        setTodayBookings(allBookings);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pendingCount = todayBookings.filter((b) => b.status === 'pending').length;
  const confirmedCount = todayBookings.filter((b) => b.status === 'confirmed').length;

  if (loading) {
    return <div className="text-center py-20 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-ink">
        Welcome, {user?.firstName}
      </h1>
      <p className="text-sm text-gray-500 mt-1">Here is your pitch overview for today.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <StatCard label="Pitches" value={pitches.length} />
        <StatCard label="Today's bookings" value={todayBookings.length} />
        <StatCard label="Pending" value={pendingCount} />
        <StatCard label="Confirmed" value={confirmedCount} />
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mt-6">
        {pitches.length === 0 ? (
          <Link
            href="/pitch-owner/pitches/new"
            className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Add your first pitch
          </Link>
        ) : (
          <Link
            href="/pitch-owner/pitches"
            className="px-4 py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Manage pitches
          </Link>
        )}
      </div>

      {/* Today's bookings */}
      {todayBookings.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-ink mb-3">Today&apos;s bookings</h2>
          <div className="space-y-2">
            {todayBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
                <div>
                  <span className="text-sm font-semibold text-ink">{b.bookerName}</span>
                  <span className="text-xs text-gray-500 ml-2">{b.startTime} - {b.endTime}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  b.status === 'confirmed' ? 'bg-green-100 text-green-700'
                  : b.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
