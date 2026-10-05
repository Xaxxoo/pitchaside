'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/brand';
import { Pagination } from '@/components/pagination';
import { hq, dayTime } from '@/lib/hq';
import { Chips, LoadError, Pill, Table, TableSkeletonRows, Tile, initialParam, useLoad } from '@/components/hq-ui';

const statusMeta: Record<string, { label: string; tone: 'good' | 'bad' | 'warn' | 'muted' }> = {
  sent: { label: 'Delivered', tone: 'good' },
  no_device: { label: 'No device', tone: 'warn' },
  failed: { label: 'Failed', tone: 'bad' },
  mock: { label: 'Test mode', tone: 'muted' },
};

const filters = [
  { value: '', label: 'All' },
  { value: 'sent', label: 'Delivered' },
  { value: 'no_device', label: 'No device' },
  { value: 'failed', label: 'Failed' },
];

const channelLabels: Record<string, string> = { push: 'Push', email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };

const fallbackNotes = {
  none: 'Fallback is off — push only',
  email: "Emailed when push can't reach a player",
  whatsapp: "WhatsApp/SMS when push can't reach a player",
};

export default function HqNotificationsPage() {
  const [status, setStatus] = useState(() => filters.find((f) => f.value === initialParam('status'))?.value ?? '');
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState('Welcome to PitchAside ⚽');
  const [body, setBody] = useState('Welcome aboard! Keep an eye out for your upcoming games, RSVPs and votes.');
  const [url, setUrl] = useState('/');
  const [sending, setSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const { data, error, loading } = useLoad(() => hq.messages({ page, status }), [page, status]);

  const week = (match: (row: { channel: string; status: string }) => boolean) =>
    data?.byStatus.filter(match).reduce((sum, row) => sum + row.count, 0) ?? 0;
  const pushSent = week((r) => r.channel === 'push' && r.status === 'sent');
  const pushTotal = week((r) => r.channel === 'push');
  const failed = week((r) => r.status === 'failed');
  const texts = week((r) => r.channel !== 'push');

  async function sendPromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm('Send this promotion to every device with PitchAside notifications enabled?')) return;
    setSending(true);
    setBroadcastResult(null);
    try {
      const result = await hq.broadcastPush({ title: title.trim(), body: body.trim(), url: url.trim() || '/' });
      setBroadcastResult(`Sent to ${result.delivered} of ${result.audience} subscribed device${result.audience === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setBroadcastResult(err.message || 'Could not send the promotion.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="HQ"
        title="Notifications"
        subtitle="Every push, email, WhatsApp and SMS sent on behalf of any club."
        actions={
          data && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Pill tone={data.modes.push ? 'good' : 'warn'}>Push: {data.modes.push ? 'on' : 'not configured'}</Pill>
              {data.modes.fallback === 'whatsapp' ? (
                <Pill tone={data.modes.messaging === 'live' ? 'good' : 'muted'}>
                  WhatsApp/SMS: {data.modes.messaging === 'live' ? 'live' : 'test mode'}
                </Pill>
              ) : (
                <Pill tone={data.modes.email ? 'good' : 'muted'}>Email: {data.modes.email ? 'live' : 'test mode'}</Pill>
              )}
            </div>
          )
        }
      />

      <section className="mb-6 rounded-3xl bg-ink text-white p-5 sm:p-6">
        <div className="mb-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Broadcast</p>
          <h2 className="text-xl font-extrabold mt-1">Send a promotion</h2>
          <p className="text-sm text-white/60 mt-1">Every device that has enabled PitchAside notifications will receive it.</p>
        </div>
        <form onSubmit={sendPromotion} className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            aria-label="Notification title"
            placeholder="Title"
            className="w-full rounded-xl bg-white/10 border border-white/15 px-3.5 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-volt-300"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            required
            rows={3}
            aria-label="Notification message"
            placeholder="Message"
            className="w-full rounded-xl bg-white/10 border border-white/15 px-3.5 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-volt-300 resize-y"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={200}
              pattern="^/(?!/).*"
              required
              aria-label="Notification link"
              placeholder="Link, e.g. /"
              className="min-w-0 flex-1 rounded-xl bg-white/10 border border-white/15 px-3.5 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-volt-300"
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-xl bg-volt-400 text-ink px-5 py-3 text-sm font-extrabold disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send to everyone'}
            </button>
          </div>
        </form>
        {broadcastResult && <p className="text-xs text-white/70 mt-3" aria-live="polite">{broadcastResult}</p>}
      </section>

      {error ? (
        <LoadError message={error} />
      ) : !data ? (
        <TableSkeletonRows />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile
              tone="volt"
              label="Push reach, last 7 days"
              value={pushTotal ? `${Math.round((pushSent / pushTotal) * 100)}%` : '—'}
              sub={pushTotal ? `${pushSent.toLocaleString()} of ${pushTotal.toLocaleString()} reached a device` : 'Nothing sent this week'}
            />
            <Tile label="Missed, last 7 days" value={(pushTotal - pushSent).toLocaleString()} sub="Player hasn't turned notifications on" />
            <Tile label="Failed, last 7 days" value={failed.toLocaleString()} sub="Rejected by the provider" />
            <Tile
              label="Email / WhatsApp / SMS, last 7 days"
              value={texts.toLocaleString()}
              sub={fallbackNotes[data.modes.fallback]}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-bold text-ink">Sent messages</h2>
            <Chips
              label="Delivery status"
              options={filters}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
          </div>

          {data.messages.data.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12 bg-white rounded-3xl border border-dashed border-gray-300">
              {status ? 'Nothing with that status.' : 'Nothing has been sent yet.'}
            </p>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>
              <Table head={['Sent', 'Message', 'To', 'Club', 'Status']} minWidth={820}>
                {data.messages.data.map((m) => {
                  const [title, ...rest] = (m.body ?? '').split('\n');
                  const meta = statusMeta[m.status] ?? { label: m.status, tone: 'muted' as const };
                  return (
                    <tr key={m.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{dayTime(m.createdAt)}</td>
                      <td className="px-4 py-3 max-w-sm">
                        <p className="font-semibold text-ink break-words">{m.kind === 'otp' ? 'Sign-in code (hidden)' : title}</p>
                        {rest.length > 0 && <p className="text-xs text-gray-500 whitespace-pre-line break-words">{rest.join('\n')}</p>}
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {channelLabels[m.channel] ?? m.channel} · {m.kind.replace(/_/g, ' ')}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.to}</td>
                      <td className="px-4 py-3">
                        {m.clubId ? (
                          <Link href={`/hq/clubs/${m.clubId}`} className="text-ink hover:text-pitch-600">
                            {m.clubName}
                          </Link>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                        {m.error && <p className="text-xs text-gray-500 mt-1 max-w-[200px] break-words">{m.error}</p>}
                      </td>
                    </tr>
                  );
                })}
              </Table>
              <Pagination
                page={data.messages.meta.page}
                totalPages={data.messages.meta.totalPages}
                total={data.messages.meta.total}
                limit={data.messages.meta.limit}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
