'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { http } from '@/lib/http';
import { formatCurrency } from '@/lib/api';
import { StatCard } from '@/components/stat-card';
import { UserRole } from '@pitchaside/shared';
import { PageHeader } from '@/components/brand';
import { kitFor } from '@/components/illustrations';

/** An activity-feed entry as the API sends it: `summary` names the people and game involved. */
interface ActivityLog {
  id: string;
  action: string;
  createdAt: string;
  summary?: {
    actorName: string | null;
    playerName: string | null;
    groupName: string | null;
    sessionDate: string | null;
    amount: number | null;
    count: number;
  };
}

/** "Tunde marked Tobi Martins paid · ₦3,000", with the group and game underneath. */
function describeActivity(log: ActivityLog) {
  const s = log.summary;
  const who = s?.actorName ?? 'Someone';
  const amount = s?.amount != null ? ` · ${formatCurrency(s.amount)}` : '';
  let title: string;
  switch (log.action) {
    case 'payment_marked_paid':
      title = `${who} marked ${s?.playerName ?? 'a payment'} paid${amount}`;
      break;
    case 'payment_bulk_marked_paid':
      title = `${who} marked ${s?.count ?? 'several'} payment${s?.count === 1 ? '' : 's'} paid`;
      break;
    case 'payment_waived':
      title = `${who} waived ${s?.playerName ? `${s.playerName}’s due` : 'a due'}${amount}`;
      break;
    default:
      title = log.action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
  const game = s?.sessionDate
    ? new Date(`${s.sessionDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  const detail = [s?.groupName, game && `game on ${game}`].filter(Boolean).join(' · ');
  return { title, detail };
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  const [orgStats, setOrgStats] = useState<any>(null);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'member' });
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role !== UserRole.ORG_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      router.replace('/dashboard');
      return;
    }

    const promises: Promise<void>[] = [
      http.get<any>('/admin/org/stats').then(setOrgStats),
      http.get<any[]>('/admin/org/members').then(setOrgMembers),
      http.get<any>('/admin/org/audit-log?limit=10').then((res) => setAuditLogs(res.data || [])),
    ];

    Promise.all(promises)
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        // "Add organiser" on the home page lands here with the form open.
        if (new URLSearchParams(window.location.search).has('invite')) {
          setShowInvite(true);
          setTimeout(() => document.getElementById('co-admins')?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      });
  }, [user, router]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const newMember = await http.post<any>('/admin/org/members', inviteForm);
      setOrgMembers((prev) => [...prev, newMember]);
      setInviteForm({ firstName: '', lastName: '', email: '', password: '', role: 'member' });
      setShowInvite(false);
      toast.success('Member added successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add member');
    } finally {
      setInviting(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600";

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-24" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-20 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <PageHeader
        eyebrow="Club office"
        title="Admin"
        subtitle={isSuperAdmin ? 'Platform administration' : 'Organization management'}
        actions={
          <Link
            href="/admin/messages"
            className="px-3.5 py-2 text-sm font-bold text-ink bg-white border border-gray-200 rounded-xl hover:border-ink transition-colors"
          >
            Notifications
          </Link>
        }
      />

      {/* Super admin: the cross-club view lives in HQ */}
      {isSuperAdmin && (
        <Link
          href="/hq"
          className="mb-8 flex items-center justify-between gap-4 rounded-2xl bg-ink text-white p-4 hover:bg-pitch-900 transition-colors"
        >
          <span>
            <span className="block text-sm font-bold">PitchAside HQ</span>
            <span className="block text-xs text-white/60 mt-0.5">Every club, player, payment and notification.</span>
          </span>
          <span className="text-sm font-bold text-volt-300 whitespace-nowrap">Open HQ →</span>
        </Link>
      )}

      {/* Org Stats */}
      {orgStats && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-ink mb-3">
            {user?.organization?.name || 'Organization'}
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <StatCard
              label="Received"
              value={formatCurrency(orgStats.totalReceived ?? 0)}
              sub="Every transfer in, matched or not"
              tone="ink"
            />
            <StatCard
              label="Dues paid"
              value={formatCurrency(orgStats.totalCollected)}
              sub="Marked paid, by transfer or by hand"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Groups" value={orgStats.totalGroups} />
            <StatCard label="Players" value={orgStats.totalPlayers} />
            <StatCard label="Sessions" value={orgStats.totalSessions} />
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {auditLogs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-ink mb-3">Recent Activity</h2>
          <div className="space-y-2">
            {auditLogs.map((log: ActivityLog) => {
              const { title, detail } = describeActivity(log);
              return (
              <div
                key={log.id}
                className="bg-white rounded-2xl shadow-card p-3.5 border border-gray-100 text-sm"
              >
                <div className="flex justify-between items-start gap-3">
                  <p className="text-gray-900 font-medium">{title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(log.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Org Members */}
      <div id="co-admins">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Co-admins</h2>
            <p className="text-xs text-gray-500">People who help you run the group.</p>
          </div>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="text-sm font-semibold text-pitch-600 hover:text-pitch-700"
          >
            {showInvite ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <form onSubmit={handleInvite} className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First name"
                required
                value={inviteForm.firstName}
                onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Last name"
                required
                value={inviteForm.lastName}
                onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                className={inputClass}
              />
            </div>
            <input
              type="email"
              placeholder="Email address"
              required
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Access">
              {[
                { value: 'member', title: 'Co-organiser', hint: 'Everything except this Admin page' },
                { value: 'treasurer', title: 'Treasurer', hint: 'Sees everything, only records payments' },
              ].map((r) => (
                <label key={r.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={inviteForm.role === r.value}
                    onChange={() => setInviteForm({ ...inviteForm, role: r.value })}
                    className="peer sr-only"
                  />
                  <span className="block h-full rounded-xl border-2 border-gray-200 px-3 py-2.5 peer-checked:border-ink peer-checked:bg-volt-300 transition-colors">
                    <span className="block text-sm font-bold text-ink">{r.title}</span>
                    <span className="block text-[11px] text-gray-500 leading-tight mt-0.5">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <input
              type="password"
              placeholder="Temporary password"
              required
              minLength={8}
              value={inviteForm.password}
              onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={inviting}
              className="w-full py-2.5 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors disabled:opacity-50"
            >
              {inviting ? 'Adding...' : inviteForm.role === 'treasurer' ? 'Add treasurer' : 'Add co-organiser'}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {orgMembers.map((member: any) => (
            <div
              key={member.id}
              className="bg-white rounded-2xl shadow-card p-3.5 border border-gray-100 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${kitFor(`${member.firstName} ${member.lastName}`).bg} ${kitFor(`${member.firstName} ${member.lastName}`).fg} flex items-center justify-center text-xs font-extrabold font-display`}>
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                </div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide ${
                member.role === 'super_admin'
                  ? 'bg-purple-50 text-purple-700'
                  : member.role === 'org_admin'
                    ? 'bg-volt-300 text-ink'
                    : member.role === 'treasurer'
                      ? 'bg-sun-400/30 text-amber-800'
                      : 'bg-gray-100 text-gray-600'
              }`}>
                {member.role === 'super_admin'
                  ? 'Super Admin'
                  : member.role === 'org_admin'
                    ? 'Admin'
                    : member.role === 'treasurer'
                      ? 'Treasurer'
                      : 'Co-organiser'}
              </span>
            </div>
          ))}

          {orgMembers.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No team members yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
