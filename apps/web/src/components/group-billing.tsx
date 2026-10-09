'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { useToast } from '@/components/toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Sheet } from '@/components/sheet';
import { EmptyState } from '@/components/empty-state';
import { BallIcon } from '@/components/illustrations';
import {
  acceptTransferClaim,
  assignTransfer,
  formatCurrency,
  getGroupTransfers,
  getWebhookStatus,
  ignoreTransfer,
  provisionGroupAccount,
  recordManualTransfer,
  regenerateGroupInvite,
  simulateTransfer,
  updateProfile,
  type BankTransfer,
  type GroupBilling,
  type ISessionWithDetails,
  type WebhookStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAccountNumber, frequencyShort, paymentShareText } from '@/lib/billing';

function copy(text: string, toast: ReturnType<typeof useToast>, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error('Could not copy'),
  );
}

function openWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

const WhatsAppIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
  </svg>
);

const ReceiptIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25h6m-6-3.75h6M6.75 3h10.5A.75.75 0 0 1 18 3.75v16.5l-2.25-1.5-2.25 1.5-1.5-1.5-1.5 1.5-2.25-1.5L6 20.25V3.75A.75.75 0 0 1 6.75 3Z" />
  </svg>
);

function QrToggle({ accountNumber, bankName, accountName }: { accountNumber: string; bankName: string; accountName: string }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  function saveQr() {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${accountName.replace(/\s+/g, '-')}-QR.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const qrData = [accountNumber, bankName, accountName].join('\n');

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-bold text-white/60 hover:text-white transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        {open ? 'Hide QR code' : 'Show QR code'}
      </button>
      {open && (
        <div className="mt-3 flex flex-col items-center gap-3">
          <div ref={canvasRef} className="rounded-2xl bg-white p-4">
            <QRCodeCanvas value={qrData} size={180} level="M" />
          </div>
          <p className="text-[11px] text-white/50">Show this to players so they can scan and transfer</p>
          <button
            onClick={saveQr}
            className="text-xs font-bold text-volt-300 hover:text-white transition-colors"
          >
            Save QR image
          </button>
        </div>
      )}
    </div>
  );
}

/** The group's PulseMFB collection account + shareable join/pay link. */
export function GroupAccountCard({
  groupId,
  groupName,
  fee,
  billing,
  balance,
  onChange,
  onMatchTransfer,
}: {
  groupId: string;
  groupName: string;
  fee: number;
  billing: GroupBilling;
  /** What's in the account now (the bank's figure when we can get it); null while unknown. */
  balance?: number | null;
  onChange: (b: GroupBilling) => void;
  /** Opens an unmatched transfer for matching; without it, goes to the group's Transfers tab. */
  onMatchTransfer?: (transferId: string) => void;
}) {
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [bvnInput, setBvnInput] = useState('');
  const [showBvnPrompt, setShowBvnPrompt] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const router = useRouter();
  const account = billing.account;

  async function retryAccount() {
    // If the user has no BVN on file, show the inline BVN input first
    if (!user?.bvn) {
      setShowBvnPrompt(true);
      return;
    }
    await doProvision();
  }

  async function handleBvnSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{11}$/.test(bvnInput)) {
      toast.error('BVN must be exactly 11 digits');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ firstName: user!.firstName, lastName: user!.lastName, bvn: bvnInput });
      await refreshUser();
      setShowBvnPrompt(false);
      await doProvision();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save BVN');
      setBusy(false);
    }
  }

  async function doProvision() {
    setBusy(true);
    try {
      const b = await provisionGroupAccount(groupId);
      onChange(b);
      if (b.account) toast.success('Account created');
      else toast.error('Payrep MFB is not responding — try again shortly');
    } catch (err) {
      // The API passes on PulseMFB's reason, e.g. a field it rejected.
      toast.error(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setConfirmRegen(false);
    try {
      onChange(await regenerateGroupInvite(groupId));
      toast.success('New link generated');
    } catch {
      toast.error('Could not regenerate the link');
    }
  }

  const shareText = account
    ? paymentShareText({
        groupName,
        amount: formatCurrency(fee),
        frequency: frequencyShort(billing.paymentType),
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        accountName: account.accountName,
        link: billing.link,
      })
    : '';

  return (
    <div className="space-y-3 mb-6">
      <ConfirmDialog
        open={confirmRegen}
        title="Regenerate group link"
        message="The current link will stop working. Anyone who hasn't joined yet will need the new one."
        confirmLabel="Regenerate"
        variant="danger"
        onConfirm={regenerate}
        onCancel={() => setConfirmRegen(false)}
      />

      {showRecord && (
        <TransferRecordSheet
          groupId={groupId}
          groupName={groupName}
          onClose={() => setShowRecord(false)}
          onMatch={(transferId) => {
            setShowRecord(false);
            if (onMatchTransfer) onMatchTransfer(transferId);
            else router.push(`/groups/${groupId}?tab=transfers&transfer=${transferId}`);
          }}
        />
      )}

      {/* Bank-card style account */}
      <div className="relative rounded-[28px] bg-ink text-white overflow-hidden shadow-lift">
        <div className="absolute inset-0 turf-stripes" />
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full border-[18px] border-volt-400/10" />
        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-volt-300">Group account</p>
              <p className="text-sm font-semibold text-white/70 mt-1">{account?.bankName ?? 'Payrep Microfinance Bank'}</p>
            </div>
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-volt-400 text-ink tabular-nums whitespace-nowrap">
              {formatCurrency(fee)} {frequencyShort(billing.paymentType)}
            </span>
          </div>

          {account ? (
            <>
              <button
                onClick={() => copy(account.accountNumber, toast, 'Account number')}
                className="group mt-5 flex items-center gap-3 text-left"
                title="Copy account number"
              >
                <span className="font-display text-[32px] sm:text-4xl font-extrabold tracking-[0.06em] tabular-nums leading-none">
                  {formatAccountNumber(account.accountNumber)}
                </span>
                <span className="p-2 rounded-lg bg-white/10 text-white/70 group-hover:bg-volt-400 group-hover:text-ink transition-colors">
                  <CopyIcon />
                </span>
              </button>
              <p className="text-sm text-white/60 mt-2 truncate">{account.accountName}</p>

              {balance != null && (
                <div className="mt-4 flex w-fit items-baseline gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Balance</span>
                  <span className="font-display text-2xl font-extrabold text-volt-300 tabular-nums leading-none">{formatCurrency(balance)}</span>
                </div>
              )}

              {billing.currentPeriod && (
                <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-volt-400 animate-pulse-soft" />
                  Collecting for <span className="font-bold text-white">{billing.currentPeriod.label}</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 mt-5">
                <button
                  onClick={() => openWhatsApp(shareText)}
                  className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-[#25D366] rounded-xl hover:brightness-95 transition"
                >
                  <WhatsAppIcon />
                  Share details
                </button>
                <button
                  onClick={() => setShowRecord(true)}
                  className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 transition-colors"
                >
                  <ReceiptIcon />
                  Transfers
                  {billing.unmatchedTransfers > 0 && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-kit-500 text-white text-[10px] font-extrabold flex items-center justify-center">
                      {billing.unmatchedTransfers}
                    </span>
                  )}
                </button>
              </div>

              <QrToggle
                accountNumber={account.accountNumber}
                bankName={account.bankName}
                accountName={account.accountName}
              />
            </>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-white/70">
                The collection account isn&apos;t ready yet. This usually means Payrep MFB didn&apos;t respond when the group was created.
              </p>
              {showBvnPrompt ? (
                <form onSubmit={handleBvnSubmit} className="mt-4 space-y-3">
                  <p className="text-xs text-white/80">
                    A BVN (Bank Verification Number) is required to open the collection account.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{11}"
                    maxLength={11}
                    value={bvnInput}
                    onChange={(e) => setBvnInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="Enter your 11-digit BVN"
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-volt-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy || bvnInput.length !== 11}
                      className="px-4 py-2.5 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 disabled:opacity-50 transition-colors"
                    >
                      {busy ? 'Creating…' : 'Save & create account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBvnPrompt(false)}
                      className="px-4 py-2.5 text-sm font-bold text-white/70 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={retryAccount}
                  disabled={busy}
                  className="mt-4 px-4 py-2.5 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Creating…' : 'Create account'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Invite / pay link */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-volt-300 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink leading-tight">Group link</h2>
              <p className="text-xs text-gray-500">Players join, get their payment reference and see where to pay</p>
            </div>
          </div>
          <button
            onClick={() => setConfirmRegen(true)}
            className="text-[11px] font-semibold text-gray-500 hover:text-ink transition-colors shrink-0"
          >
            Regenerate
          </button>
        </div>
        <div className="flex gap-2">
          <input
            readOnly
            value={billing.link}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 px-3 py-2.5 !bg-chalk border border-gray-200 rounded-xl text-xs text-gray-600 font-mono truncate"
          />
          <button
            onClick={() => copy(billing.link, toast, 'Link')}
            className="px-3.5 py-2.5 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 transition-colors"
          >
            Copy
          </button>
          <button
            onClick={() =>
              openWhatsApp(`Join ${groupName} on PitchAside ⚽ — register and get the payment details here: ${billing.link}`)
            }
            className="px-3 py-2.5 text-white bg-[#25D366] rounded-xl hover:brightness-95 transition"
            title="Share on WhatsApp"
          >
            <WhatsAppIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

const transferStatus: Record<BankTransfer['status'], { label: string; text: string; avatar: string }> = {
  matched: { label: 'Matched', text: 'text-pitch-600', avatar: 'bg-volt-300 text-ink' },
  assigned: { label: 'Matched', text: 'text-pitch-600', avatar: 'bg-volt-300 text-ink' },
  unmatched: { label: 'Needs matching', text: 'text-amber-700', avatar: 'bg-sun-400/30 text-amber-800' },
  ignored: { label: 'Ignored', text: 'text-gray-400', avatar: 'bg-gray-100 text-gray-400' },
};

function initials(name?: string | null) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length ? (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase() : '₦';
}

/** "Today", "Yesterday", or e.g. "Wed, 7 Oct" — how bank apps head each day's transactions. */
function dayLabel(date: Date) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(date)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  });
}

type TransferDay = { label: string; total: number; items: BankTransfer[] };

/** Newest first (the API's order), bucketed by calendar day with what came in that day. */
function groupByDay(transfers: BankTransfer[]): TransferDay[] {
  const days: TransferDay[] = [];
  for (const t of transfers) {
    const label = dayLabel(new Date(t.receivedAt));
    let day = days[days.length - 1];
    if (!day || day.label !== label) days.push((day = { label, total: 0, items: [] }));
    day.items.push(t);
    if (t.status !== 'ignored') day.total += Number(t.amount);
  }
  return days;
}

function payerName(t: BankTransfer) {
  const from = t.payment?.player ?? t.player;
  return from ? `${from.firstName} ${from.lastName}` : null;
}

function TransferDayList({ days, children }: { days: TransferDay[]; children: (t: BankTransfer) => React.ReactNode }) {
  return (
    <>
      {days.map((day) => (
        <section key={day.label}>
          <div className="flex items-baseline justify-between px-1 mb-1.5">
            <h3 className="text-xs font-extrabold text-gray-500">{day.label}</h3>
            <span className="text-[11px] font-bold text-gray-500 tabular-nums">In {formatCurrency(day.total)}</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden text-left">
            {day.items.map((t) => (
              <div key={t.id} id={`transfer-${t.id}`} className="scroll-mt-24">
                {children(t)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** One line of the history, laid out like a bank app's: who, when, +amount, status. */
function TransferRow({
  t,
  onClick,
  expanded,
  statusLabel,
}: {
  t: BankTransfer;
  onClick: () => void;
  expanded?: boolean;
  statusLabel?: string;
}) {
  const who = payerName(t);
  const status = transferStatus[t.status];
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      aria-expanded={expanded}
    >
      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${status.avatar}`}>
        {initials(t.senderName || who)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink line-clamp-2 break-words">Transfer from {t.senderName || who || 'unknown sender'}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5 truncate">
          {new Date(t.receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {who && t.status !== 'unmatched' ? ` · ${who}` : ''}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span
          className={`block text-sm font-extrabold tabular-nums ${
            t.status === 'ignored' ? 'text-gray-400 line-through' : 'text-pitch-600'
          }`}
        >
          +{formatCurrency(Number(t.amount))}
        </span>
        <span className={`block text-[11px] font-bold mt-0.5 ${status.text}`}>{statusLabel ?? status.label}</span>
      </span>
    </button>
  );
}

/** Date, narration and what the money paid for — shown when a row is opened. */
function TransferDetails({ t }: { t: BankTransfer }) {
  const who = payerName(t);
  return (
    <>
      <p>
        {new Date(t.receivedAt).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
      <p>
        Narration: <span className="text-ink">{t.narration ? `“${t.narration}”` : 'none'}</span>
      </p>
      {who && t.payment && (
        <p>
          Paid for <span className="font-bold text-ink">{who}</span>
          {t.payment.session?.label ? ` · ${t.payment.session.label}` : ''}
        </p>
      )}
      {who && !t.payment && t.status !== 'unmatched' && (
        <p>
          From <span className="font-bold text-ink">{who}</span> · less than a due, so it&apos;s held as their credit and pays
          their next due once it&apos;s enough
        </p>
      )}
    </>
  );
}

/**
 * Read-only record of every transfer into the group account, like a bank app's transaction
 * history. Matching happens in the group's Transfers tab; unmatched rows hand off to it.
 */
function TransferRecordSheet({
  groupId,
  groupName,
  onClose,
  onMatch,
}: {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onMatch: (transferId: string) => void;
}) {
  const [transfers, setTransfers] = useState<BankTransfer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    getGroupTransfers(groupId).then(setTransfers, () => setFailed(true));
  }, [groupId]);

  const counted = (transfers ?? []).filter((t) => t.status !== 'ignored');
  const received = counted.reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <Sheet titleId="transfer-record-title" onClose={onClose} align="left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="transfer-record-title" className="font-display text-xl font-extrabold text-ink">
            Transfer record
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{groupName}</p>
        </div>
        <button onClick={onClose} className="p-1.5 -mr-1.5 text-gray-400 hover:text-ink" aria-label="Close">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {transfers && transfers.length > 0 && (
        <p className="mt-3 text-sm text-gray-600">
          <span className="font-display text-2xl font-extrabold text-ink tabular-nums">{formatCurrency(received)}</span>{' '}
          in {counted.length} transfer{counted.length === 1 ? '' : 's'}
        </p>
      )}

      <div className="mt-4 space-y-4">
        {failed ? (
          <p className="text-sm text-gray-500 py-6 text-center">Couldn&apos;t load transfers. Try again shortly.</p>
        ) : !transfers ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : transfers.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            No transfers yet. When players pay into the group account, they show up here.
          </p>
        ) : (
          <TransferDayList days={groupByDay(transfers)}>
            {(t) =>
              t.status === 'unmatched' ? (
                <TransferRow t={t} onClick={() => onMatch(t.id)} statusLabel="Needs matching →" />
              ) : (
                <>
                  <TransferRow t={t} onClick={() => setOpenId(openId === t.id ? null : t.id)} expanded={openId === t.id} />
                  {openId === t.id && (
                    <div className="px-4 pb-4 -mt-1 space-y-1.5 text-xs text-gray-600">
                      <TransferDetails t={t} />
                    </div>
                  )}
                </>
              )
            }
          </TransferDayList>
        )}
      </div>
    </Sheet>
  );
}

/** Money received into the group account, with manual matching for the leftovers. */
export function TransfersPanel({
  groupId,
  fee,
  transfers,
  sessions,
  mockMode,
  onRefresh,
  focusId,
}: {
  groupId: string;
  fee: number;
  transfers: BankTransfer[];
  sessions: ISessionWithDetails[];
  mockMode: boolean;
  onRefresh: () => Promise<void>;
  /** A transfer to open and scroll to, e.g. one tapped in the transfer record. */
  focusId?: string | null;
}) {
  const toast = useToast();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [sim, setSim] = useState({ amount: String(fee), senderName: '', narration: '' });
  const [simulating, setSimulating] = useState(false);
  const [rec, setRec] = useState({ amount: '', senderName: '', narration: '' });
  const [recording, setRecording] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Unset = matching first: show what needs matching while there is any.
  const [filter, setFilter] = useState<'all' | 'unmatched' | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);

  useEffect(() => {
    if (!mockMode) getWebhookStatus().then(setWebhookStatus).catch(() => {});
  }, [mockMode]);

  const focused = transfers.find((t) => t.id === focusId);
  useEffect(() => {
    if (!focused) return;
    if (focused.status !== 'unmatched') setFilter('all');
    setOpenId(focused.id);
    // After the list has rendered with the row in it.
    requestAnimationFrame(() =>
      document.getElementById(`transfer-${focused.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, [focused]);

  const pendingOptions = sessions
    .filter((s) => s.status !== 'cancelled')
    .flatMap((s) =>
      (s.payments ?? [])
        .filter((p) => p.status === 'pending')
        .map((p) => ({
          id: p.id,
          label: `${p.player ? `${p.player.firstName} ${p.player.lastName}` : 'Player'} · ${
            s.label ?? new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          } · ${formatCurrency(Number(p.amount))}`,
        })),
    );

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setWorkingId(id);
    try {
      await fn();
      await onRefresh();
      toast.success(ok);
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setWorkingId(null);
    }
  }

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    setSimulating(true);
    try {
      const res = await simulateTransfer(groupId, {
        amount: Number(sim.amount),
        senderName: sim.senderName || undefined,
        narration: sim.narration || undefined,
      });
      await onRefresh();
      toast.success(res.status === 'matched' ? 'Transfer matched to a member' : 'Transfer received — needs matching');
      setSim((s) => ({ ...s, senderName: '', narration: '' }));
    } catch (err: any) {
      toast.error(err.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setRecording(true);
    try {
      await recordManualTransfer(groupId, {
        amount: Number(rec.amount),
        senderName: rec.senderName || undefined,
        narration: rec.narration || undefined,
      });
      await onRefresh();
      toast.success('Transfer recorded');
      setRec({ amount: '', senderName: '', narration: '' });
      setShowRecord(false);
    } catch (err: any) {
      toast.error(err.message || 'Could not record transfer');
    } finally {
      setRecording(false);
    }
  }

  const input =
    'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600';

  const counted = transfers.filter((t) => t.status !== 'ignored');
  const received = counted.reduce((sum, t) => sum + Number(t.amount), 0);
  const unmatchedCount = transfers.filter((t) => t.status === 'unmatched').length;
  const activeFilter = filter ?? (unmatchedCount > 0 ? 'unmatched' : 'all');
  const days = groupByDay(activeFilter === 'unmatched' ? transfers.filter((t) => t.status === 'unmatched') : transfers);

  return (
    <div className="space-y-3">
      {mockMode && (
        <form onSubmit={handleSimulate} className="bg-sky-300/30 border-2 border-dashed border-sky-300 rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BallIcon className="w-5 h-5" />
            <p className="text-sm font-bold text-ink">Test mode: simulate a bank transfer</p>
          </div>
          <p className="text-xs text-gray-600 -mt-1">
            Payrep MFB is running in mock mode. Put a member&apos;s payment reference (e.g. PA7K3FQ) in the narration, or use their full name as the sender.
          </p>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <input
              type="number"
              min={1}
              value={sim.amount}
              onChange={(e) => setSim({ ...sim, amount: e.target.value })}
              className={input}
              aria-label="Amount"
            />
            <input
              placeholder="Sender name"
              value={sim.senderName}
              onChange={(e) => setSim({ ...sim, senderName: e.target.value })}
              className={input}
            />
          </div>
          <div className="flex gap-2">
            <input
              placeholder="Narration / reference"
              value={sim.narration}
              onChange={(e) => setSim({ ...sim, narration: e.target.value })}
              className={input}
            />
            <button
              type="submit"
              disabled={simulating || !Number(sim.amount)}
              className="px-4 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              {simulating ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}

      {webhookStatus && !webhookStatus.ok && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-4 space-y-2">
          <p className="text-sm font-bold text-red-800">Webhook setup problem</p>
          <p className="text-xs text-red-700">
            Payrep isn&apos;t sending payment notices to PitchAside. Transfers won&apos;t appear automatically until this is fixed.
          </p>
          <ul className="text-xs text-red-600 list-disc pl-4 space-y-1">
            {webhookStatus.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-100 shadow-card p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-gray-500">Transfer history</p>
            <p className="font-display text-2xl font-extrabold text-ink tabular-nums mt-1">{formatCurrency(received)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              received in {counted.length} transfer{counted.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={() => setShowRecord(!showRecord)}
            className="px-3 py-2 text-xs font-bold text-ink bg-white border border-gray-200 rounded-xl hover:border-ink transition-colors whitespace-nowrap"
          >
            {showRecord ? 'Close' : '+ Record a transfer'}
          </button>
        </div>
        {transfers.length > 0 && (
          <div className="flex gap-2 mt-4">
            {(['all', 'unmatched'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
                  activeFilter === f ? 'bg-ink text-volt-300' : 'bg-gray-100 text-gray-600 hover:text-ink'
                }`}
              >
                {f === 'all' ? 'All' : `Needs matching (${unmatchedCount})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {showRecord && (
        <form onSubmit={handleRecord} className="bg-white rounded-3xl border border-gray-100 shadow-card p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Manually log money that arrived but wasn&apos;t picked up by the webhook.
          </p>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <input
              type="number"
              min={1}
              placeholder="Amount"
              value={rec.amount}
              onChange={(e) => setRec({ ...rec, amount: e.target.value })}
              className={input}
              aria-label="Amount"
            />
            <input
              placeholder="Sender name"
              value={rec.senderName}
              onChange={(e) => setRec({ ...rec, senderName: e.target.value })}
              className={input}
            />
          </div>
          <div className="flex gap-2">
            <input
              placeholder="Narration / reference"
              value={rec.narration}
              onChange={(e) => setRec({ ...rec, narration: e.target.value })}
              className={input}
            />
            <button
              type="submit"
              disabled={recording || !Number(rec.amount)}
              className="px-4 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              {recording ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      )}

      {transfers.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No transfers yet"
          description="When players pay into the group account, their transfers show up here and are matched automatically."
        />
      ) : days.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Every transfer is matched.</p>
      ) : (
        <TransferDayList days={days}>
          {(t) => {
            const open = openId === t.id;
            return (
              <>
                <TransferRow t={t} onClick={() => setOpenId(open ? null : t.id)} expanded={open} />
                {(open || t.status === 'unmatched') && (
                  <div className="px-4 pb-4 -mt-1 space-y-1.5 text-xs text-gray-600">
                    {open && <TransferDetails t={t} />}
                    {t.status === 'unmatched' && t.claims && t.claims.length > 0 && (
                      <div className="pt-1 space-y-1.5">
                        <p className="font-bold text-ink">Said they&apos;ve paid</p>
                        {t.claims.map((c) => {
                          const name = `${c.player.firstName} ${c.player.lastName}`;
                          return (
                            <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-volt-100 px-3 py-2">
                              <span className="min-w-0">
                                <span className="block font-bold text-ink truncate">{name}</span>
                                <span className="block text-[11px] text-gray-600">
                                  {formatCurrency(c.amount)} ·{' '}
                                  {new Date(c.createdAt).toLocaleString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </span>
                              <button
                                disabled={workingId === t.id}
                                onClick={() => run(t.id, () => acceptTransferClaim(t.id, c.id), `Matched to ${name}`)}
                                className="px-3 py-2 text-xs font-bold text-volt-300 bg-ink rounded-lg hover:bg-pitch-900 disabled:opacity-40 transition-colors shrink-0"
                              >
                                Match
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {t.status === 'unmatched' && (
                      <div className="pt-1 flex flex-col sm:flex-row gap-2">
                        <select
                          value={selection[t.id] ?? ''}
                          onChange={(e) => setSelection({ ...selection, [t.id]: e.target.value })}
                          className={`${input} flex-1`}
                        >
                          <option value="">Match to a pending payment…</option>
                          {pendingOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            disabled={!selection[t.id] || workingId === t.id}
                            onClick={() => run(t.id, () => assignTransfer(t.id, selection[t.id]), 'Payment matched')}
                            className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 disabled:opacity-40 transition-colors"
                          >
                            Match
                          </button>
                          <button
                            disabled={workingId === t.id}
                            onClick={() => run(t.id, () => ignoreTransfer(t.id), 'Transfer ignored')}
                            className="px-4 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-ink disabled:opacity-40 transition-colors"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          }}
        </TransferDayList>
      )}
    </div>
  );
}
