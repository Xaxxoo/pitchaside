'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { http } from '@/lib/http';
import { formatCurrency } from '@/lib/api';
import { GroupsCompared, MoneyHealth, QuietPlayers, SeasonHero, type OrgOverview } from '@/components/office/overview';
import { UserRole } from '@pitchaside/shared';
import { PageHeader } from '@/components/brand';
import { kitFor } from '@/components/illustrations';
import { ConfirmDialog } from '@/components/confirm-dialog';

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

/** One kind of thing someone did to payments: how to say it for one player, and for several. */
const ACTIONS: Record<string, { one: (player: string) => string; many: (n: number) => string }> = {
  payment_marked_paid: { one: (p) => `marked ${p} paid`, many: (n) => `marked ${n} payments paid` },
  payment_bulk_marked_paid: { one: (p) => `marked ${p} paid`, many: (n) => `marked ${n} payments paid` },
  payment_marked_unpaid: { one: (p) => `marked ${p} not paid`, many: (n) => `marked ${n} payments not paid` },
  payment_waived: { one: (p) => `let ${p} play free`, many: (n) => `let ${n} players play free` },
  payment_no_show: { one: (p) => `marked ${p} as didn’t come`, many: (n) => `marked ${n} players as didn’t come` },
  payment_came: { one: (p) => `marked ${p} as came`, many: (n) => `marked ${n} players as came` },
  payment_moved: { one: (p) => `moved ${p}’s payment`, many: (n) => `moved ${n} payments` },
};

/** "Today 2:05 pm", "Yesterday 9:10 am", else "Wed 21 Oct, 2:05 pm": short enough for one line. */
function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
  const key = (x: Date) => x.toLocaleDateString('en-CA');
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (key(d) === key(today)) return `Today ${time}`;
  if (key(d) === key(yesterday)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * The feed with runs folded together: the same person doing the same thing in the same group on
 * the same day is one line ("Tunde marked 5 payments not paid · Tobi, Ada +3"), not five.
 */
function groupActivity(logs: ActivityLog[]) {
  const runs: { logs: ActivityLog[]; key: string }[] = [];
  for (const log of logs) {
    const s = log.summary;
    const key = [log.action === 'payment_bulk_marked_paid' ? 'payment_marked_paid' : log.action, s?.actorName, s?.groupName, new Date(log.createdAt).toLocaleDateString('en-CA')].join('|');
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.logs.push(log);
    else runs.push({ key, logs: [log] });
  }
  return runs.map(({ logs }) => {
    const first = logs[0];
    const s = first.summary;
    const who = s?.actorName ?? 'Someone';
    const count = logs.reduce((n, l) => n + (l.summary?.count ?? 1), 0);
    const names = [...new Set(logs.map((l) => l.summary?.playerName).filter((x): x is string => !!x))];
    const say = ACTIONS[first.action];
    // An amount only where money changed hands (paid, not paid, free), on the line under the title
    const money = ['payment_marked_paid', 'payment_bulk_marked_paid', 'payment_marked_unpaid', 'payment_waived'].includes(first.action);
    const amount = money && count === 1 && s?.amount != null ? formatCurrency(s.amount) : null;
    const title = say
      ? `${who} ${count === 1 ? say.one(s?.playerName ?? 'a player') : say.many(count)}`
      : `${who}: ${first.action.replace(/_/g, ' ')}`;
    const people = count > 1 && names.length ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}` : null;
    return { id: first.id, title, people, when: when(first.createdAt), group: s?.groupName ?? null, amount };
  });
}

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [removing, setRemoving] = useState<any | null>(null);
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
      http.get<OrgOverview>('/admin/org/overview').then(setOverview),
      http.get<any[]>('/admin/org/members').then(setOrgMembers),
      http.get<any>('/admin/org/audit-log?limit=40').then((res) => setAuditLogs(res.data || [])),
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

  // Removing a co-organiser or treasurer signs them out everywhere; they can't sign back in.
  const removeMember = async () => {
    if (!removing) return;
    try {
      await http.delete(`/admin/org/members/${removing.id}`);
      setOrgMembers((prev) => prev.filter((m) => m.id !== removing.id));
      toast.success(`${removing.firstName} no longer has access`);
    } catch (err: any) {
      toast.error(err.message || 'Could not remove them');
    } finally {
      setRemoving(null);
    }
  };

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
        eyebrow={user?.organization?.name || 'Your club'}
        title="Club office"
        subtitle="Your season, money, players and team."
        actions={
          <Link
            href="/office/messages"
            className="px-3.5 py-2 text-sm font-bold text-ink bg-white border border-gray-200 rounded-xl hover:border-ink transition-colors"
          >
            Notifications
          </Link>
        }
      />

      {/* Super admin: the cross-club view lives in HQ */}
      {isSuperAdmin && (
        <Link
          href="/admin"
          className="mb-8 flex items-center justify-between gap-4 rounded-2xl bg-ink text-white p-4 hover:bg-pitch-900 transition-colors"
        >
          <span>
            <span className="block text-sm font-bold">PitchAside HQ</span>
            <span className="block text-xs text-white/60 mt-0.5">Every club, player, payment and notification.</span>
          </span>
          <span className="text-sm font-bold text-volt-300 whitespace-nowrap">Open HQ →</span>
        </Link>
      )}

      {/* Season first, then what needs doing, then who and where */}
      {overview && (
        <div className="space-y-6 mb-8">
          <SeasonHero o={overview} club={user?.organization?.name ?? 'Your club'} groups={overview.groups.length} />
          <MoneyHealth o={overview} />
          <GroupsCompared o={overview} />
          <QuietPlayers o={overview} />
        </div>
      )}

      {/* What the team did lately, runs folded into one line */}
      {auditLogs.length > 0 && (
        <section className="mb-8" aria-labelledby="activity">
          <h2 id="activity" className="text-base font-bold text-ink">
            Recent activity
          </h2>
          <p className="mb-2 text-xs text-gray-500">What you and your team changed lately.</p>
          <ul className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100">
            {groupActivity(auditLogs)
              .slice(0, 8)
              .map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="text-[14px] font-semibold text-ink leading-snug">{a.title}</p>
                  {a.people && <p className="text-[12px] text-gray-600 truncate">{a.people}</p>}
                  <p className="mt-0.5 text-[12px] text-gray-500 truncate">{[a.when, a.group, a.amount].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Org Members */}
      <div id="co-admins">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-ink">Team</h2>
            <p className="text-xs text-gray-500">People who help you run the club.</p>
          </div>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="min-h-11 px-2 -mr-2 text-sm font-bold text-pitch-700 hover:text-pitch-800"
          >
            {showInvite ? 'Cancel' : 'Add someone'}
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
              className="bg-white rounded-2xl shadow-card p-3.5 border border-gray-100 flex items-center gap-2"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 shrink-0 rounded-full ${kitFor(`${member.firstName} ${member.lastName}`).bg} ${kitFor(`${member.firstName} ${member.lastName}`).fg} flex items-center justify-center text-xs font-extrabold font-display`}>
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-bold text-ink truncate">
                      {member.firstName} {member.lastName}
                    </span>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide ${
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
                  </p>
                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                </div>
              </div>
              {(member.role === 'member' || member.role === 'treasurer') && member.id !== user?.id && (
                <button
                  onClick={() => setRemoving(member)}
                  className="shrink-0 min-h-11 px-3 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-ink transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          ))}

          <ConfirmDialog
            open={!!removing}
            title="Remove from your team"
            message={removing ? `${removing.firstName} will be signed out everywhere and won't be able to sign in to your club again.` : ''}
            confirmLabel="Remove"
            variant="danger"
            onConfirm={removeMember}
            onCancel={() => setRemoving(null)}
          />

          {orgMembers.length <= 1 && !showInvite && (
            <div className="rounded-2xl bg-chalk border border-dashed border-gray-300 px-4 py-3.5">
              <p className="text-[14px] font-bold text-ink">Running it alone?</p>
              <p className="text-[13px] text-gray-600">Add a co-organiser, or a treasurer who only records payments.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
