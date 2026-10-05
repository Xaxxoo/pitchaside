'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/brand';
import { kitFor } from '@/components/illustrations';
import { VotePrompt } from '@/components/ratings';
import { getPlayersPaginated, deletePlayer, exportPlayersCsv, getInviteCode, regenerateInviteCode, type PaginatedResponse } from '@/lib/api';
import type { IPlayer } from '@pitchaside/shared';

export default function PlayersPage() {
  const toast = useToast();
  const [players, setPlayers] = useState<IPlayer[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<IPlayer | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function fetchPlayers(p = page, s = debouncedSearch) {
    return getPlayersPaginated(p, 10, s || undefined)
      .then((res) => {
        setPlayers(res.data);
        setMeta(res.meta);
      })
      .catch(() => {});
  }

  useEffect(() => {
    setLoading(true);
    fetchPlayers(page, debouncedSearch).finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  function handleSearchChange(value: string) {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }

  useEffect(() => {
    return () => clearTimeout(debounceTimer.current);
  }, []);

  function handlePageChange(p: number) {
    setPage(p);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const name = `${deleteTarget.firstName} ${deleteTarget.lastName}`;
    setDeleteTarget(null);
    try {
      await deletePlayer(deleteTarget.id);
      await fetchPlayers(page, debouncedSearch);
      toast.success(`${name} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete player');
    }
  }

  async function handleGetInviteLink() {
    setInviteLoading(true);
    try {
      const res = await getInviteCode();
      setInviteLink(res.link);
    } catch {
      toast.error('Failed to get invite link');
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRegenerate() {
    setShowRegenConfirm(false);
    setInviteLoading(true);
    try {
      const res = await regenerateInviteCode();
      setInviteLink(res.link);
      toast.success('Invite link regenerated');
    } catch {
      toast.error('Failed to regenerate link');
    } finally {
      setInviteLoading(false);
    }
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      toast.success('Invite link copied');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleShareWhatsApp() {
    if (!inviteLink) return;
    const text = encodeURIComponent(
      `⚽ Join us on PitchAside! Sign up, pick the groups you play in, and get your payment details: ${inviteLink}`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  if (loading && players.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 rounded w-24" />
          <div className="h-20 bg-gray-100 rounded-xl" />
          <div className="h-10 bg-gray-100 rounded-xl" />
          <div className="h-16 bg-gray-100 rounded-xl" />
          <div className="h-16 bg-gray-100 rounded-xl" />
          <div className="h-16 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Player"
        message={`Delete ${deleteTarget?.firstName} ${deleteTarget?.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={showRegenConfirm}
        title="Regenerate Invite Link"
        message="This will invalidate the current invite link. Anyone with the old link will no longer be able to join. Continue?"
        confirmLabel="Regenerate"
        variant="danger"
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegenConfirm(false)}
      />

      {/* Header */}
      <PageHeader
        eyebrow="The squad"
        title="Players"
        subtitle={meta.total > 0 ? `${meta.total} registered` : undefined}
        actions={
        <>
          {meta.total > 0 && (
            <button
              onClick={() => exportPlayersCsv().catch(() => toast.error('Export failed'))}
              className="p-2.5 text-gray-500 bg-white border border-gray-200 rounded-xl hover:text-ink hover:border-gray-300 transition-colors"
              title="Export CSV"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
          <Link
            href="/players/new"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-ink text-volt-300 text-sm font-bold rounded-xl hover:bg-pitch-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Player
          </Link>
        </>
        }
      />

      <VotePrompt />

      {/* Invite Players Section */}
      <div className="relative bg-pitch-800 text-white rounded-3xl p-5 mb-4 overflow-hidden">
        <div className="absolute inset-0 turf-stripes pointer-events-none" />
        <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 p-1.5 rounded-lg bg-volt-400 text-ink" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            <div>
              <h2 className="text-base font-bold text-white">Invite players</h2>
              <p className="text-xs text-white/60">One link for the whole club — players sign up and pick their groups</p>
            </div>
          </div>
          {inviteLink && (
            <button
              onClick={() => setShowRegenConfirm(true)}
              className="text-[11px] font-semibold text-white/50 hover:text-white transition-colors"
            >
              Regenerate
            </button>
          )}
        </div>
        {!inviteLink ? (
          <button
            onClick={handleGetInviteLink}
            disabled={inviteLoading}
            className="w-full py-3 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 transition-colors disabled:opacity-50"
          >
            {inviteLoading ? 'Generating...' : 'Get invite link'}
          </button>
        ) : (
          <div className="space-y-2.5">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="w-full px-3 py-2.5 !bg-black/25 border border-white/10 rounded-xl text-xs text-white/80 truncate font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-white bg-[#25D366] rounded-xl hover:brightness-95 transition"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                </svg>
                WhatsApp
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-3 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600 placeholder:text-gray-400"
        />
      </div>

      {meta.total === 0 && !debouncedSearch ? (
        <EmptyState
          icon="users"
          title="Build your squad"
          description="Add players to start tracking attendance and payments for your games."
          actionLabel="Add First Player"
          actionHref="/players/new"
        />
      ) : players.length === 0 ? (
        <EmptyState
          icon="users"
          title="No results"
          description="No players match your search. Try a different term."
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-2">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-card hover:border-gray-300 transition-colors"
              >
                <Link
                  href={`/players/${player.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className={`w-11 h-11 rounded-full ${kitFor(`${player.firstName} ${player.lastName}`).bg} ${kitFor(`${player.firstName} ${player.lastName}`).fg} flex items-center justify-center text-sm font-extrabold font-display shrink-0`}>
                    {player.firstName.charAt(0)}{player.lastName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">
                      {player.firstName} {player.lastName}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {player.email || player.phone || 'No contact details'}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => setDeleteTarget(player)}
                  className="text-gray-300 hover:text-kit-600 transition-colors shrink-0 p-1.5"
                  title="Delete player"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
