'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { useToast } from '@/components/toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Sheet } from '@/components/sheet';
import { EmptyState } from '@/components/empty-state';
import { BallIcon, kitFor } from '@/components/illustrations';
import { SheetTitle } from '@/components/home/sheet-title';
import { transferName } from '@/components/home/transfers-sheet';
import { senderFrom } from '@/lib/name-match';
import { MatchPlayerSheet } from '@/components/group/match-sheet';
import type { MatchMember } from '@/lib/give-outcome';
import { accountHint, from as unnamedFrom, when as whenIn } from '@/components/group/how-paid-sheet';
import { btnPrimary } from '@/components/buttons';
import { NotPlayerSheet } from '@/components/money/not-player-sheet';
import { MonthList } from '@/components/money/month-list';
import { ExtraSheet } from '@/components/money/extra-sheet';
import { FilterBar, FilterMenu } from '@/components/filter-menu';
import { Avatar } from '@/components/ratings';
import { DateRangePicker, inRange, rangeLabel, type DateRange } from '@/components/date-range';
import { MONEY_IN } from '@/lib/money-categories';
import {
  giveTransfer,
  getExtraMoney,
  giveExtra,
  keepExtra,
  keepExtraForGroup,
  acceptExtraGift,
  KEPT_REASON_WORDS,
  type KeptReason,
  holdExtra,
  releaseWaiting,
  type ExtraSource,
  type ExtraMoney,
  getGroupOwed,
  type OwedItem,
  formatCurrency,
  getGroupTransfers,
  getWebhookStatus,
  ignoreTransfer,
  markNotPlayer,
  markPlayerMoney,
  restoreTransfer,
  provisionGroupAccount,
  recordManualTransfer,
  regenerateGroupInvite,
  simulateTransfer,
  updateProfile,
  type BankTransfer,
  type TransferClaim,
  type GroupBilling,
  type ISessionWithDetails,
  type WebhookStatus,
} from '@/lib/api';
import { openWhatsApp } from '@/lib/whatsapp';
import { useAuth } from '@/lib/auth';
import { UserRole } from '@pitchaside/shared';
import { formatAccountNumber, frequencyShort, paymentShareText } from '@/lib/billing';
import { moneyHref } from '@/lib/money-href';

function copy(text: string, toast: ReturnType<typeof useToast>, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error('Could not copy'),
  );
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

/** The one player who said "I've paid" for an unmatched transfer, if only one did. */
function claimant(t: BankTransfer) {
  const people = [...new Map((t.claims ?? []).map((c) => [c.player.id, c.player])).values()];
  return people.length === 1 ? people[0] : null;
}

/** "Femi Kuti said they sent ₦1,500 at 14:53", or who all said so when it's more than one. */
function claimLine(claims: TransferClaim[]) {
  const people = [...new Map(claims.map((c) => [c.player.id, `${c.player.firstName} ${c.player.lastName}`.trim()])).values()];
  if (people.length > 1) return `${people.join(', ')} each said they sent this. Check before you give it.`;
  const c = claims[0];
  const d = new Date(c.createdAt);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const at = d.toDateString() === new Date().toDateString() ? `at ${time}` : `on ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
  return `${people[0]} said they sent ${formatCurrency(Number(c.amount))} ${at}.`;
}

export function GroupAccountCard({
  groupId,
  groupName,
  fee,
  billing,
  balance,
  onChange,
  onMatchTransfer,
  showLink = true,
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
  /** False hides the group link box (a page with its own Invite button doesn't need it twice). */
  showLink?: boolean;
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
            else router.push(moneyHref(groupId, { transfer: transferId }));
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
              {/* What's come in is what organisers check; the number is for sharing, so it sits below. */}
              <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/60">Balance</p>
              <p className="font-display text-[40px] sm:text-5xl font-extrabold text-volt-300 tabular-nums leading-none mt-1.5">
                {balance != null ? formatCurrency(balance) : '—'}
              </p>

              <button
                onClick={() => copy(account.accountNumber, toast, 'Account number')}
                className="group mt-4 flex w-fit items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-left hover:bg-white/15 transition-colors"
                title="Copy account number"
              >
                <span className="text-base font-extrabold tracking-[0.06em] tabular-nums leading-none">
                  {formatAccountNumber(account.accountNumber)}
                </span>
                <span className="text-white/60 group-hover:text-volt-300 transition-colors">
                  <CopyIcon />
                </span>
              </button>
              <p className="text-xs text-white/60 mt-1.5 truncate">{account.accountName}</p>

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
                {user?.bvn
                  ? 'The group’s account isn’t open yet: the bank didn’t answer when the group was made. Try again.'
                  : 'Add your BVN to open the group’s bank account. Players pay into it, and it’s in your name as the organiser.'}
              </p>
              {showBvnPrompt ? (
                <form onSubmit={handleBvnSubmit} className="mt-4 space-y-3">
                  <p className="text-xs text-white/80">
                    Your BVN (Bank Verification Number) is the 11 digits you get by dialling *565*0#. The bank needs it to open an account
                    in your name. It isn’t shown to players.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{11}"
                    maxLength={11}
                    value={bvnInput}
                    onChange={(e) => setBvnInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="11-digit BVN"
                    aria-label="Your BVN"
                    className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-volt-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={busy || bvnInput.length !== 11}
                      className="px-4 py-2.5 text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 disabled:opacity-50 transition-colors"
                    >
                      {busy ? 'Opening…' : bvnInput.length === 11 ? 'Open the account' : `${11 - bvnInput.length} digits to go`}
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
                  {busy ? 'Opening…' : user?.bvn ? 'Try again' : 'Add BVN and open account'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Invite / pay link */}
      {showLink && (
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
              <p className="text-xs text-gray-500">Players join, get their payment code and see where to pay</p>
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
      )}
    </div>
  );
}

const transferStatus: Record<BankTransfer['status'], { label: string; text: string; avatar: string }> = {
  matched: { label: 'Paid', text: 'text-pitch-600', avatar: 'bg-volt-300 text-ink' },
  assigned: { label: 'Paid', text: 'text-pitch-600', avatar: 'bg-volt-300 text-ink' },
  unmatched: { label: 'No name', text: 'text-amber-700', avatar: 'bg-sun-400/30 text-amber-800' },
  ignored: { label: 'Set aside', text: 'text-gray-400', avatar: 'bg-gray-100 text-gray-400' },
  other: { label: 'Not a player', text: 'text-gray-600', avatar: 'bg-chalk text-gray-700' },
};

/** What a player's payment went on: "Sat 17 Oct", "October 2026 dues", or kept for their next game. */
function paidFor(t: BankTransfer) {
  const s = t.payment?.session;
  if (!s) return 'Not on a game yet';
  if (s.kind === 'dues' && s.label) return `${s.label} dues`;
  const [y, m, d] = String(s.date).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

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
            <h3 className="text-[13px] font-bold text-gray-600">{day.label}</h3>
            <span className="text-[13px] font-semibold text-gray-500 tabular-nums">{formatCurrency(day.total)}</span>
          </div>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden text-left">
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
  withDate,
}: {
  t: BankTransfer;
  onClick: () => void;
  expanded?: boolean;
  statusLabel?: string;
  /** In a month's list there's no day heading, so the row says the day too. */
  withDate?: boolean;
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
        {t.status === 'unmatched' ? '?' : initials(t.senderName || who)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink truncate">{transferName(t)}</span>
        <span className="block text-[13px] text-gray-600 mt-0.5 truncate">
          {withDate
            ? `${new Date(t.receivedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}, `
            : ''}
          {new Date(t.receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          {t.status === 'unmatched' && t.narration && !(!t.senderName?.trim() && senderFrom(t)) ? `, “${t.narration}”` : ''}
        </span>
      </span>
      <span className="text-right shrink-0">
        <span
          className={`block font-display text-[15px] font-extrabold tabular-nums ${
            t.status === 'ignored' ? 'text-gray-400 line-through' : t.status === 'unmatched' ? 'text-amber-700' : t.status === 'other' ? 'text-ink' : 'text-pitch-600'
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
      {t.status === 'other' && (
        <p>
          Not a player payment{t.category ? <>: <span className="font-bold text-ink">{MONEY_IN[t.category].label}</span></> : ''}
          {t.note ? <> · “{t.note}”</> : ''}
        </p>
      )}
      {who && !t.payment && t.status !== 'unmatched' && t.status !== 'other' && (
        <p>
          From <span className="font-bold text-ink">{who}</span>. Not on a game yet: it’s towards a game they owe, or extra to sort above
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
                <TransferRow t={t} onClick={() => onMatch(t.id)} statusLabel="No name yet →" />
              ) : (
                <>
                  <TransferRow
                    t={t}
                    onClick={() => setOpenId(openId === t.id ? null : t.id)}
                    expanded={openId === t.id}
                    statusLabel={t.status === 'other' && t.category ? MONEY_IN[t.category].label : undefined}
                  />
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

/** One amount in "Money to sort": who or what, where it came from, and what tapping it does. */
function SortRow({ avatar, title, sub, amount, cta, busy, asked, onClick }: { avatar: React.ReactNode; title: string; sub: string; amount: number; cta: string; busy: boolean; /** The player asked for something: the line says what, in bold. */ asked?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      aria-label={`${title}, ${formatCurrency(amount)}. ${cta}`}
      className="press w-full flex items-center gap-3 px-4 min-h-[72px] py-3 text-left hover:bg-chalk transition-colors disabled:opacity-50"
    >
      {avatar}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold text-ink truncate">{title}</span>
        <span className={`block text-[13px] truncate ${asked ? 'font-bold text-pitch-700' : 'text-gray-500'}`}>{sub}</span>
      </span>
      <span className="shrink-0 font-display text-[16px] font-extrabold tabular-nums text-ink">{formatCurrency(amount)}</span>
      <svg className="w-4 h-4 shrink-0 -mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
      </svg>
    </button>
  );
}

/** Money received into the group account: who paid, and the few payments no one could put a name to. */
export function TransfersPanel({
  groupId,
  fee,
  transfers,
  sessions,
  mockMode,
  onRefresh,
  focusId,
  onAddPlayers,
  members = [],
}: {
  groupId: string;
  fee: number;
  transfers: BankTransfer[];
  sessions: ISessionWithDetails[];
  mockMode: boolean;
  onRefresh: () => Promise<void>;
  /** A transfer to open and scroll to, e.g. one tapped in the transfer record. */
  focusId?: string | null;
  /** The squad, so any member can be picked for a transfer and the preview can say where the money goes. */
  members?: MatchMember[];
  /** Where to send the organiser when there's no one to match a transfer to. */
  onAddPlayers?: () => void;
}) {
  const toast = useToast();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [sim, setSim] = useState({ amount: String(fee), senderName: '', narration: '' });
  const [simulating, setSimulating] = useState(false);
  const [rec, setRec] = useState({ amount: '', senderName: '', narration: '' });
  const [recording, setRecording] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSetAside, setShowSetAside] = useState(false);
  // From the home's "4 with no name": bring that list into view once it's there.
  const shownUnnamed = useRef(false);
  const unnamedCount = transfers.filter((t) => t.status === 'unmatched').length;
  useEffect(() => {
    if (shownUnnamed.current || !unnamedCount) return;
    if (new URLSearchParams(window.location.search).get('show') !== 'unnamed') return;
    shownUnnamed.current = true;
    requestAnimationFrame(() => document.getElementById('unnamed-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [unnamedCount]);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);

  useEffect(() => {
    if (!mockMode) getWebhookStatus().then(setWebhookStatus).catch(() => {});
  }, [mockMode]);

  const focused = transfers.find((t) => t.id === focusId);
  // Open a linked transfer once. The list refreshes every 20s, so key on the id, not the object.
  const handledFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || handledFocus.current === focused.id) return;
    // Wait for the games too, so the picker has everyone who owes.
    if (focused.status === 'unmatched' && sessions.length === 0) return;
    handledFocus.current = focused.id;
    setOpenId(focused.id);
    // Arrived from the home's "Match to a player": open the picker straight away.
    if (focused.status === 'unmatched' && membersRef.current > 0) {
      setPick(claimant(focused)?.id);
      setMatching(focused);
    }
    // After the list has rendered with the row in it.
    requestAnimationFrame(() =>
      document.getElementById(`transfer-${focused.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }, [focused, sessions.length]);

  // What everyone owes, from the server (every game, not only the ones this page has loaded).
  const [owed, setOwed] = useState<OwedItem[]>([]);
  const loadOwed = () => getGroupOwed(groupId).then(setOwed).catch(() => {});
  useEffect(() => {
    loadOwed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  const [matching, setMatching] = useState<BankTransfer | null>(null);
  // Who to start with picked in the matching sheet: the one player who said they sent it.
  const [pick, setPick] = useState<string | undefined>();
  const membersRef = useRef(0);
  membersRef.current = members.length;
  const [ignoring, setIgnoring] = useState<BankTransfer | null>(null);
  const [classifying, setClassifying] = useState<BankTransfer | null>(null);
  // More than someone owed: it waits here until the organiser says what it was for.
  const panelRouter = useRouter();
  const [extraMoney, setExtras] = useState<ExtraMoney[]>([]);
  const extras = extraMoney.filter((x) => x.extra > 0.001);
  // Put aside for someone not in the group yet, or no one knows who.
  const waitingMoney = extraMoney.filter((x) => x.waiting > 0.001);
  const [sorting, setSorting] = useState<(ExtraMoney & { source: ExtraSource }) | null>(null);
  const { user } = useAuth();
  // "Keep it for the group", waiting for the organiser's confirm.
  const [keeping, setKeeping] = useState<{ item: ExtraMoney & { source: ExtraSource }; reason: KeptReason; note: string } | null>(null);
  const loadExtras = () => getExtraMoney(groupId).then(setExtras).catch(() => {});
  useEffect(() => {
    loadExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, transfers.length]);
  // From the home's "extra money to sort": bring that list into view once it's there.
  const shownExtra = useRef(false);
  useEffect(() => {
    if (shownExtra.current || !extras.length) return;
    if (new URLSearchParams(window.location.search).get('show') !== 'extra') return;
    shownExtra.current = true;
    requestAnimationFrame(() => document.getElementById('extra-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [extras.length]);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<'all' | 'games' | 'ahead' | 'other'>('all');
  const [when, setWhen] = useState<'any' | 'week' | 'month' | 'last' | 'custom'>('any');
  // "Pick dates": from and to, as YYYY-MM-DD from the date inputs (either may be empty).
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setWorkingId(id);
    try {
      await fn();
      await onRefresh();
      loadOwed();
      toast.success(ok);
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      // Someone else may have matched it meanwhile: show the list as it is now.
      onRefresh().catch(() => {});
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
      toast.success(res.status === 'matched' ? 'Payment in and placed' : 'Payment in, but we couldn’t tell who sent it');
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

  const unnamed = transfers.filter((t) => t.status === 'unmatched');
  const placed = transfers.filter((t) => t.status === 'matched' || t.status === 'assigned');
  const notPlayers = transfers.filter((t) => t.status === 'other');
  const setAside = transfers.filter((t) => t.status === 'ignored');
  // Money in: players' payments and money that isn't, narrowed by the two filters and the search.
  const q = search.trim().toLowerCase().replace(/[₦,]/g, '');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const inTime = (iso: string) => {
    const at = new Date(iso).getTime();
    if (when === 'week') return at >= now.getTime() - 7 * 86_400_000;
    if (when === 'month') return at >= monthStart;
    if (when === 'last') return at >= lastStart && at < monthStart;
    if (when === 'custom') return inRange(iso, range);
    return true;
  };
  const listed = [...placed, ...notPlayers]
    .sort((x, y) => new Date(y.receivedAt).getTime() - new Date(x.receivedAt).getTime())
    .filter((t) => {
      if (show === 'games' && !(t.status !== 'other' && t.payment?.session)) return false;
      if (show === 'ahead' && !(t.status !== 'other' && !t.payment?.session)) return false;
      if (show === 'other' && t.status !== 'other') return false;
      if (!inTime(t.receivedAt)) return false;
      if (!q) return true;
      const words = [transferName(t), payerName(t), t.senderName, t.narration, t.note, t.category && MONEY_IN[t.category].label, paidFor(t), String(Number(t.amount))];
      return words.some((w) => w && w.toLowerCase().includes(q));
    });
  const filtered = show !== 'all' || when !== 'any' || !!q;


  return (
    <div className="space-y-3">
      {matching && (
        <MatchPlayerSheet
          transfer={matching}
          members={members}
          owed={owed}
          busy={workingId === matching.id}
          picked={pick}
          onClose={() => setMatching(null)}
          onGive={async (member, done) => {
            const t = matching;
            setMatching(null);
            await run(t.id, () => giveTransfer(t.id, member.playerId), done);
          }}
        />
      )}
      {classifying && (
        <NotPlayerSheet
          transfer={classifying}
          playerName={payerName(classifying)}
          busy={workingId === classifying.id}
          onClose={() => setClassifying(null)}
          onSetAside={
            classifying.status === 'unmatched'
              ? () => {
                  const t = classifying;
                  setClassifying(null);
                  setIgnoring(t);
                }
              : undefined
          }
          onConfirm={(category, note) => {
            const t = classifying;
            setClassifying(null);
            run(
              t.id,
              () => markNotPlayer(t.id, { category, note: note.trim() || undefined }),
              t.status === 'other' ? 'Saved' : `Marked as ${MONEY_IN[category].label.toLowerCase()}. It isn’t anyone’s payment now.`,
            );
          }}
        />
      )}
      <ConfirmDialog
        open={!!ignoring}
        title={`Set this ${ignoring ? formatCurrency(Number(ignoring.amount)) : ''} aside?`}
        message="For a duplicate or a mistake. It won't count as anyone's payment or in Money in. You can put it back from 'Money set aside'."
        confirmLabel="Set aside"
        variant="danger"
        onConfirm={() => {
          const t = ignoring;
          setIgnoring(null);
          if (t) run(t.id, () => ignoreTransfer(t.id), 'Set aside. Put it back any time from Money set aside.');
        }}
        onCancel={() => setIgnoring(null)}
      />

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

      {sorting && (
        <ExtraSheet
          groupId={groupId}
          source={sorting.source}
          item={sorting}
          members={members}
          owed={owed}
          busy={workingId === `extra-${sorting.playerId}`}
          onClose={() => setSorting(null)}
          onGive={async (to, done) => {
            const item = sorting;
            setSorting(null);
            await run(`extra-${item.playerId}`, () => giveExtra(groupId, item.playerId, to.playerId, item.source), done);
            loadExtras();
          }}
          onKeep={async () => {
            const item = sorting;
            setSorting(null);
            await run(`extra-${item.playerId}`, () => keepExtra(groupId, item.playerId), `${formatCurrency(item.extra)} kept for ${item.name.split(' ')[0]}’s next game`);
            loadExtras();
          }}
          onSendBack={() => {
            const item = sorting;
            setSorting(null);
            panelRouter.push(`/money?group=${groupId}&view=payouts&refund=${item.playerId}`);
          }}
          onHold={async (note) => {
            const item = sorting;
            setSorting(null);
            await run(`extra-${item.playerId}`, () => holdExtra(groupId, item.playerId, note || undefined), `${formatCurrency(item.extra)} is waiting for a player`);
            loadExtras();
          }}
          onAcceptGift={
            user?.role === UserRole.TREASURER
              ? undefined
              : async () => {
                  const item = sorting;
                  setSorting(null);
                  const amt = Math.min(item.request?.amount ?? item.extra, item.extra);
                  await run(`extra-${item.playerId}`, () => acceptExtraGift(groupId, item.playerId), `${formatCurrency(amt)} from ${item.name.split(' ')[0]} kept for the group`);
                  loadExtras();
                }
          }
          onKeepForGroup={
            user?.role === UserRole.TREASURER
              ? undefined
              : (reason, note) => {
                  const item = sorting;
                  setSorting(null);
                  setKeeping({ item, reason, note });
                }
          }
          onRelease={async () => {
            const item = sorting;
            setSorting(null);
            await run(`extra-${item.playerId}`, () => releaseWaiting(groupId, item.playerId), `${formatCurrency(item.waiting)} back with ${item.name.split(' ')[0]}’s extra to sort`);
            loadExtras();
          }}
        />
      )}

      <ConfirmDialog
        open={!!keeping}
        title={keeping ? `Keep ${formatCurrency(keeping.item.extra)} for the group?` : ''}
        message={
          keeping
            ? `${keeping.item.name.split(' ')[0]} won’t be owed this any more, and it can’t be refunded afterwards. They’ll see “${keeping.reason === 'other' ? keeping.note : KEPT_REASON_WORDS[keeping.reason]}” in their history.`
            : ''
        }
        confirmLabel="Keep it for the group"
        cancelLabel="Go back"
        variant="danger"
        onConfirm={async () => {
          const k = keeping;
          setKeeping(null);
          if (!k) return;
          await run(`extra-${k.item.playerId}`, () => keepExtraForGroup(groupId, k.item.playerId, k.reason, k.note || undefined), `${formatCurrency(k.item.extra)} kept for the group`);
          loadExtras();
        }}
        onCancel={() => setKeeping(null)}
      />

      {/* Money that isn't on a game: extra to sort, and what's waiting for a player. Never used on its own. */}
      {extras.length + waitingMoney.length > 0 && (
        <section aria-labelledby="extra-title" className="pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="extra-title" className="scroll-mt-32 text-base font-bold text-ink">
              Money to sort
            </h2>
            <p className="font-display text-[15px] font-extrabold tabular-nums text-ink">
              {formatCurrency(extras.reduce((n, x) => n + x.extra, 0) + waitingMoney.reduce((n, x) => n + x.waiting, 0))}
            </p>
          </div>
          <p className="mt-0.5 mb-2.5 text-[13px] text-gray-600">Not on any game yet. Tap one to say what it was for.</p>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-card overflow-hidden">
            {extras.length > 0 && (
              <ul aria-label="Extra to sort" className="divide-y divide-gray-100">
                {extras.map((x) => {
                  // Only name the transfer when it alone explains the extra; otherwise it built up over several.
                  const one = x.lastTransfer && x.lastTransfer.amount + 0.001 >= x.extra ? x.lastTransfer : null;
                  return (
                    <li key={x.playerId}>
                      <SortRow
                        avatar={<Avatar name={x.name} className="w-10 h-10 text-[13px]" />}
                        title={x.name}
                        sub={
                          x.request
                            ? x.request.kind === 'give'
                              ? `Offered ${formatCurrency(Math.min(x.request.amount, x.extra))} to the group`
                              : `Asked for ${formatCurrency(Math.min(x.request.amount, x.extra))} back`
                            : one
                            ? `Sent ${formatCurrency(one.amount)} · ${new Date(one.receivedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}`
                            : 'From earlier payments'
                        }
                        amount={x.extra}
                        cta={x.request ? (x.request.kind === 'give' ? 'Accept their offer' : 'Send it back') : 'What was it for?'}
                        busy={workingId === `extra-${x.playerId}`}
                        asked={!!x.request}
                        onClick={() => setSorting({ ...x, source: 'extra' })}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {waitingMoney.length > 0 && (
              <>
                <h3 id="waiting-title" className="scroll-mt-32 px-4 py-1.5 bg-chalk border-y border-gray-100 first:border-t-0 text-[12px] font-bold text-gray-700">
                  Waiting for a player · not in the group yet
                </h3>
                <ul aria-labelledby="waiting-title" className="divide-y divide-gray-100">
                  {waitingMoney.map((x) => (
                    <li key={x.playerId}>
                      <SortRow
                        avatar={
                          <span className="w-10 h-10 shrink-0 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center font-display text-[15px] font-extrabold text-gray-500" aria-hidden>
                            ?
                          </span>
                        }
                        title={x.waitingNote ? `For ${x.waitingNote}` : 'Not known yet'}
                        sub={`Sent by ${x.name}`}
                        amount={x.waiting}
                        cta="Give it"
                        busy={workingId === `extra-${x.playerId}`}
                        onClick={() => setSorting({ ...x, source: 'waiting' })}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {/* Money no one could put a name to: the only thing here that needs the organiser */}
      {unnamed.length > 0 && (
        <section aria-labelledby="unnamed-title" className="pt-3">
          <h2 id="unnamed-title" className="scroll-mt-32 text-base font-bold text-ink">
            Who sent {unnamed.length === 1 ? 'this' : 'these'}?
          </h2>
          <p className="mt-0.5 mb-2.5 text-[13px] text-gray-600">
            We couldn’t tell who {unnamed.length === 1 ? 'this payment is' : `these ${unnamed.length} payments are`} from.
          </p>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-card divide-y divide-gray-100 overflow-hidden">
            {unnamed.map((t) => (
              <div key={t.id} id={`transfer-${t.id}`} className="scroll-mt-24 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink truncate">{unnamedFrom(t)}</p>
                    <p className="text-[13px] text-gray-500 truncate">
                      {whenIn(t.receivedAt)}
                      {accountHint(t)}
                    </p>
                  </div>
                  <p className="shrink-0 font-display text-[15px] font-extrabold tabular-nums text-ink">+{formatCurrency(Number(t.amount))}</p>
                </div>
                {(t.claims?.length ?? 0) > 0 && (
                  <p className="mt-2 flex items-start gap-2 rounded-2xl bg-volt-300/30 px-3 py-2 text-[13px] leading-snug text-ink">
                    <span aria-hidden>🙋</span>
                    <span>{claimLine(t.claims!)}</span>
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  {members.length === 0 ? (
                    onAddPlayers ? (
                      <button onClick={onAddPlayers} className={`${btnPrimary} flex-1 min-h-10 text-sm`}>
                        Add players first
                      </button>
                    ) : (
                      <p className="flex-1 text-[13px] leading-snug text-gray-600">The organiser needs to add players before this can be matched.</p>
                    )
                  ) : (
                    <button
                      disabled={workingId === t.id}
                      onClick={() => {
                        setPick(claimant(t)?.id);
                        setMatching(t);
                      }}
                      className={`${btnPrimary} flex-1 min-h-10 text-sm`}
                    >
                      {claimant(t) ? `Give to ${claimant(t)!.firstName}…` : 'Choose the player'}
                    </button>
                  )}
                  <button
                    disabled={workingId === t.id}
                    onClick={() => setClassifying(t)}
                    className="shrink-0 h-10 px-3 text-[13px] font-bold text-gray-600 hover:text-ink disabled:opacity-40"
                  >
                    Not a player’s
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Everyone who's paid, newest first, like a bank app: search, two filters, then month by month */}
      <section aria-labelledby="money-in-title" className="pt-3">
        <h2 id="money-in-title" className="text-base font-bold text-ink">
          Money in
        </h2>
        {placed.length + notPlayers.length > 0 && (
          <div className="mt-2.5 space-y-2">
            {placed.length + notPlayers.length > 4 && (
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a name, note or amount"
                aria-label="Search money in"
                className="w-full min-h-11 px-3.5 bg-white border border-gray-200 rounded-2xl text-[15px] focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
              />
            )}
            <FilterBar>
              <FilterMenu
                label="What kind of money"
                value={show}
                onChange={setShow}
                columns={2}
                options={[
                  { value: 'all', label: 'All money' },
                  { value: 'games', label: 'Paid for games' },
                  { value: 'ahead', label: 'Not on a game yet' },
                  { value: 'other', label: 'Not from players' },
                ]}
              />
              <FilterMenu
                label="When"
                value={when}
                onChange={setWhen}
                columns={2}
                options={[
                  { value: 'any', label: 'Any time' },
                  { value: 'week', label: 'Last 7 days' },
                  { value: 'month', label: 'This month' },
                  { value: 'last', label: 'Last month' },
                  { value: 'custom', label: when === 'custom' ? rangeLabel(range) : 'Pick dates' },
                ]}
                custom={{
                  value: 'custom',
                  render: (done) => (
                    <DateRangePicker
                      value={range}
                      showLabel="Show payments"
                      onApply={(r) => {
                        setRange(r);
                        setWhen('custom');
                        done();
                      }}
                      onClear={
                        when === 'custom'
                          ? () => {
                              setRange({ from: '', to: '' });
                              setWhen('any');
                              done();
                            }
                          : undefined
                      }
                    />
                  ),
                }}
              />
            </FilterBar>
            {filtered && listed.length > 0 && (
              <p className="px-1 text-[13px] text-gray-600 tabular-nums" aria-live="polite">
                {listed.length} payment{listed.length === 1 ? '' : 's'} · {formatCurrency(listed.reduce((n, t) => n + Number(t.amount), 0))}
              </p>
            )}
          </div>
        )}
      </section>

      {transfers.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No payments yet"
          description="When players pay into the group account, they show up here with what they paid for."
        />
      ) : placed.length + notPlayers.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No one’s payment is in yet.</p>
      ) : listed.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">{q ? `Nothing matches “${search.trim()}”.` : 'Nothing here yet.'}</p>
          <button
            onClick={() => {
              setSearch('');
              setShow('all');
              setWhen('any');
              setRange({ from: '', to: '' });
            }}
            className="mt-1 min-h-11 px-3 text-sm font-bold text-pitch-700"
          >
            Show everything
          </button>
        </div>
      ) : (
        <MonthList
          items={listed}
          idOf={(t) => t.id}
          idPrefix="transfer-"
          dateOf={(t) => t.receivedAt}
          amountOf={(t) => Number(t.amount)}
          direction="in"
          sticky={!q}
        >
          {(t) => {
            const open = openId === t.id;
            const other = t.status === 'other';
            return (
              <>
                <TransferRow
                  t={t}
                  onClick={() => setOpenId(open ? null : t.id)}
                  expanded={open}
                  statusLabel={other ? (t.category ? MONEY_IN[t.category].label : 'Not a player') : paidFor(t)}
                />
                {open && (
                  <div className="px-4 pb-4 -mt-1 space-y-1.5 text-xs text-gray-600">
                    <TransferDetails t={t} />
                    <div className="flex flex-wrap gap-2 pt-1.5">
                      {other ? (
                        <>
                          <button
                            onClick={() => setClassifying(t)}
                            disabled={workingId === t.id}
                            className="min-h-11 px-3.5 rounded-xl border border-gray-200 text-[13px] font-bold text-ink hover:border-ink disabled:opacity-50"
                          >
                            Change what it was
                          </button>
                          <button
                            onClick={() => run(t.id, () => markPlayerMoney(t.id), 'Moved to the payments with no name. Choose the player there.')}
                            disabled={workingId === t.id}
                            className="min-h-11 px-3.5 rounded-xl border border-gray-200 text-[13px] font-bold text-ink hover:border-ink disabled:opacity-50"
                          >
                            It was a player’s
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setClassifying(t)}
                          disabled={workingId === t.id}
                          className="min-h-11 px-3.5 rounded-xl border border-gray-200 text-[13px] font-bold text-ink hover:border-ink disabled:opacity-50"
                        >
                          Not a player payment
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          }}
        </MonthList>
      )}

      {setAside.length > 0 && (
        <div>
          <button
            onClick={() => setShowSetAside(!showSetAside)}
            aria-expanded={showSetAside}
            className="h-10 px-1 text-[13px] font-bold text-gray-600 hover:text-ink"
          >
            {showSetAside ? 'Hide' : 'Show'} money set aside ({setAside.length})
          </button>
          {showSetAside && (
            <div className="bg-white rounded-3xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {setAside.map((t) => (
                <div key={t.id} className="flex items-center gap-2 pr-3">
                  <div className="flex-1 min-w-0">
                    <TransferRow t={t} onClick={() => {}} />
                  </div>
                  <button
                    onClick={() => run(t.id, () => restoreTransfer(t.id), 'Put back with the payments that have no name yet')}
                    disabled={workingId === t.id}
                    className="shrink-0 h-9 px-3 rounded-xl border border-gray-200 text-[13px] font-bold text-ink hover:border-ink disabled:opacity-50"
                  >
                    Put back
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rare: a transfer the bank didn't send us. A quiet line under the list, not a header action */}
      <div className="pt-1 text-center">
        <button
          onClick={() => setShowRecord(!showRecord)}
          aria-expanded={showRecord}
          className="h-11 px-2 text-sm font-semibold text-gray-600 hover:text-ink"
        >
          {showRecord ? 'Close' : <>Transfer missing? <span className="font-bold text-pitch-700">Add it</span></>}
        </button>
      </div>
      {showRecord && (
        <form onSubmit={handleRecord} className="bg-white rounded-3xl border border-gray-100 shadow-card p-4 space-y-3">
          <p className="text-xs text-gray-500">
            For a transfer that reached the group account but isn&apos;t listed here. Check it isn&apos;t already in the list, so it isn&apos;t counted twice.
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
              placeholder="Description (payment code, if any)"
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

      {/* Test setups only (PULSE_MODE=mock): never shown to real organisers */}
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
              placeholder="Description (payment code, if any)"
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
    </div>
  );
}

