'use client';

import { useId, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { regenerateGroupInvite, type GroupBilling, type IGroupWithMembers } from '@/lib/api';
import { Sheet } from '@/components/sheet';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { Collapse } from '@/components/collapse';

/**
 * Bringing someone new in: the group link with Copy and WhatsApp, a QR code to scan at the
 * pitch, and (tucked away, with a warning) a fresh link if the old one has got around.
 */
export function InviteSheet({
  group,
  billing,
  canManage,
  onBilling,
  onClose,
}: {
  group: IGroupWithMembers;
  billing: GroupBilling;
  canManage: boolean;
  onBilling: (b: GroupBilling) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const toast = useToast();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrId = useId();
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped on each new link so the link box washes volt again.
  const [fresh, setFresh] = useState(0);
  const text = `Join ${group.name} on PitchAside to see when we're playing and where to pay:`;

  const copy = () =>
    navigator.clipboard.writeText(billing.link).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
        toast.success('Link copied');
      },
      () => toast.error('Could not copy. Press and hold the link to copy it instead.'),
    );

  // The phone's own share menu (WhatsApp, SMS, Telegram…) where there is one, else WhatsApp.
  async function share() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Join ${group.name}`, text, url: billing.link });
      } catch {
        // They closed the share menu: nothing to do.
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${billing.link}`)}`, '_blank', 'noopener');
  }

  async function regenerate() {
    setConfirmRegen(false);
    setBusy(true);
    try {
      onBilling(await regenerateGroupInvite(group.id));
      setFresh((n) => n + 1);
      toast.success('New link ready. Share it again: the old one no longer works.');
    } catch {
      toast.error('Could not make a new link. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet titleId={titleId} onClose={onClose} align="left">
      <SheetTitle id={titleId} title="Invite players" sub={`Anyone with the link can join ${group.name}`} onClose={onClose} />

      {/* The link: one line, with its own copy button */}
      <div
        key={fresh}
        className={`mt-4 flex items-center gap-2 rounded-2xl bg-chalk border border-gray-200 pl-3.5 pr-1.5 py-1.5 ${fresh ? 'animate-glow' : ''}`}
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-bold text-gray-600">Group link</span>
          <span className="block text-sm font-semibold text-ink truncate select-all">{billing.link.replace(/^https?:\/\//, '')}</span>
        </span>
        <button
          onClick={copy}
          aria-label="Copy group link"
          className="press w-11 h-11 shrink-0 rounded-xl bg-white border border-gray-200 text-ink flex items-center justify-center hover:border-ink transition-colors"
        >
          {copied ? <TickIcon /> : <CopyIcon />}
        </button>
      </div>

      {/* Said out loud for screen readers when the link is copied */}
      <p className="sr-only" aria-live="polite">
        {copied ? 'Group link copied' : ''}
      </p>

      {/* One main way to send it, WhatsApp as the quick alternative */}
      <div className="grid grid-cols-[1fr_auto] gap-2 mt-3">
        <button onClick={share} className={btnPrimary}>
          Share invite
        </button>
        <button
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${billing.link}`)}`, '_blank', 'noopener')}
          className={`${btnSecondary} px-3.5`}
        >
          <WhatsAppIcon />
          WhatsApp
        </button>
      </div>

      {/* QR: opens just below, for new players standing next to you */}
      <div className="mt-4 rounded-2xl border border-gray-200">
        <button
          onClick={() => setShowQr((s) => !s)}
          aria-expanded={showQr}
          aria-controls={qrId}
          className="press w-full min-h-12 flex items-center gap-3 px-3.5 text-left"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-ink">QR code</span>
            <span className="block text-xs text-gray-600">For players standing next to you to scan</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-pitch-700">{showQr ? 'Hide' : 'Show'}</span>
        </button>
        <Collapse open={showQr} id={qrId}>
          <div className="flex flex-col items-center gap-2 pb-4">
            <div className="rounded-2xl bg-white border border-gray-200 p-3">
              <QRCodeCanvas value={billing.link} size={168} level="M" />
            </div>
          </div>
        </Collapse>
      </div>

      {canManage && (
        // Rare and risky, so quiet: a small row at the bottom, and the confirm says what it does
        <button
          onClick={() => setConfirmRegen(true)}
          disabled={busy}
          className="press mt-3 w-full min-h-11 flex items-center justify-between gap-3 px-1 text-left disabled:opacity-60"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-bold text-[#b23a12]">{busy ? 'Resetting…' : 'Reset the link'}</span>
            <span className="block text-[12px] text-gray-500 truncate">The old link stops working</span>
          </span>
          <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      <ConfirmDialog
        open={confirmRegen}
        title="Reset the group link?"
        message="The current link stops working straight away. Anyone who hasn't joined yet will need the new one. People already in the group aren't affected."
        confirmLabel="Reset link"
        variant="danger"
        onConfirm={regenerate}
        onCancel={() => setConfirmRegen(false)}
      />
    </Sheet>
  );
}

const CopyIcon = () => (
  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
  </svg>
);

const TickIcon = () => (
  <svg className="w-[18px] h-[18px] text-pitch-600 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={2.75} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

/** WhatsApp's speech-bubble mark, in its green, so the button reads at a glance. */
const WhatsAppIcon = () => (
  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="#25D366" aria-hidden>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.82 14.13c-.25.69-1.44 1.32-1.98 1.36-.5.05-.98.24-3.31-.69-2.8-1.1-4.58-3.97-4.72-4.15-.14-.18-1.12-1.49-1.12-2.85 0-1.35.71-2.02.96-2.29.25-.28.55-.35.73-.35l.53.01c.17.01.4-.06.62.48.25.6.84 2.06.92 2.21.07.14.12.31.02.5-.1.18-.14.3-.28.46l-.42.49c-.14.14-.29.29-.12.57.17.28.74 1.22 1.6 1.98 1.1.98 2.02 1.28 2.31 1.43.28.14.45.12.61-.07.17-.19.71-.83.9-1.11.19-.28.37-.23.63-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.11.07.66-.18 1.35Z" />
  </svg>
);
