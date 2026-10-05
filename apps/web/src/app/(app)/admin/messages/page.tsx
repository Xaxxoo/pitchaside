'use client';

import { useEffect, useState } from 'react';
import { BackButton } from '@/components/back-button';
import { PageHeader } from '@/components/brand';
import { EmptyState } from '@/components/empty-state';
import { getMessages, type OutboundMessage } from '@/lib/api';

const kindLabels: Record<string, string> = {
  otp: 'Sign-in code',
  receipt: 'Payment receipt',
  payment_reminder: 'Payment reminder',
  dues_open: 'Dues open',
  dues_reminder: 'Dues reminder',
  rsvp_open: "Who's in?",
  rsvp_promoted: 'Off the waitlist',
  rsvp_nudge: 'Spots left',
  reminder_eve: 'Day-before reminder',
  reminder_kickoff: 'Kick-off reminder',
  game_reminder: 'Game reminder',
  vote_open: 'Vote invite',
  vote_nudge: 'Vote nudge',
  payment_received: 'Money received',
  transfer_unmatched: 'Transfer to match',
  member_joined: 'New member',
  game_full: 'Game full',
};

/** Every push PitchAside sent for this club, and whether it reached a device. */
export default function NotificationsLogPage() {
  const [data, setData] = useState<{ mode: 'mock' | 'live'; messages: OutboundMessage[] } | null>(null);

  useEffect(() => {
    getMessages().then(setData).catch(() => setData({ mode: 'live', messages: [] }));
  }, []);

  const pushes = data?.messages.filter((m) => m.channel === 'push') ?? [];
  const delivered = pushes.filter((m) => m.status === 'sent').length;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <BackButton />
      <PageHeader
        eyebrow="Club office"
        title="Notifications"
        subtitle="Push notifications sent to your players and organisers: game reminders, payments and votes."
      />

      {pushes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-volt-300 border border-volt-400 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/60">Delivered</p>
            <p className="font-display text-3xl font-extrabold text-ink tabular-nums leading-none mt-1">{delivered}</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 shadow-card p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Missed</p>
            <p className="font-display text-3xl font-extrabold text-ink tabular-nums leading-none mt-1">{pushes.length - delivered}</p>
            <p className="text-[11px] text-gray-500 mt-1">Notifications not turned on</p>
          </div>
        </div>
      )}

      <p className="mb-4 text-xs rounded-2xl bg-chalk border border-gray-200 px-4 py-3 text-gray-600">
        Players only get pushes after they open PitchAside on their phone, add it to their home screen and tap{' '}
        <span className="font-bold text-ink">Turn on notifications</span>. Share your group link to get them started.
      </p>

      {!data ? (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : data.messages.length === 0 ? (
        <EmptyState icon="box" title="Nothing sent yet" description="Game reminders, receipts and vote invites will show up here." />
      ) : (
        <div className="space-y-2">
          {data.messages.map((m) => {
            const [title, ...rest] = m.body.split('\n');
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-card p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-volt-300 text-ink">
                    {kindLabels[m.kind] ?? m.kind}
                  </span>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap truncate">
                    {m.to} ·{' '}
                    {new Date(m.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm font-bold text-ink">{m.kind === 'otp' ? 'Sign-in code' : title}</p>
                {rest.length > 0 && m.kind !== 'otp' && <p className="text-sm text-gray-600 whitespace-pre-line break-words">{rest.join('\n')}</p>}
                <p className={`text-[11px] font-bold mt-2 ${m.status === 'sent' || m.status === 'mock' ? 'text-pitch-600' : 'text-gray-500'}`}>
                  {m.channel === 'push'
                    ? m.status === 'sent'
                      ? '● Delivered'
                      : '○ Not delivered — notifications off'
                    : m.status === 'failed'
                      ? 'Failed to send'
                      : `${m.channel === 'email' ? 'Email' : m.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}${m.status === 'mock' ? ' (test mode)' : ''}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
