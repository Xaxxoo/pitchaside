'use client';

import { useEffect, useId, useState } from 'react';
import { Steps } from '@/components/steps';
import { QRCodeCanvas } from 'qrcode.react';
import { Sheet } from '@/components/sheet';
import { SheetTitle } from '@/components/home/sheet-title';
import { btnPrimary, btnSecondary } from '@/components/buttons';
import { BallSpinner } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { getGroupBilling } from '@/lib/api';

/**
 * This game's QR code, to show at the pitch: it opens the group link for this game. Players in
 * the group go straight to the game; anyone new signs up, joins the group, and lands on it.
 */
export function MatchQrSheet({
  sessionId,
  groupId,
  groupName,
  takesReplies,
  onClose,
}: {
  sessionId: string;
  groupId: string;
  groupName: string;
  /** Players say "I'm in" for games (else everyone in the group is on every game). */
  takesReplies: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGroupBilling(groupId).then(
      (b) => setUrl(`${b.link}?game=${sessionId}`),
      () => setError('The QR code didn’t load. Try again.'),
    );
  }, [groupId, sessionId]);

  const text = `Playing with ${groupName}? Open the game here:`;
  async function share() {
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${groupName} game`, text, url });
      } catch {
        // They closed the share menu: nothing to do.
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
  }
  const copy = () =>
    url &&
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy. Press and hold the link to copy it instead.'),
    );

  const steps = [
    { title: 'They scan the code', sub: `Anyone in ${groupName} goes straight to this game` },
    { title: `New players sign up and join`, sub: `${groupName}, then on to this game` },
    takesReplies ? { title: 'They tap “I’m in”', sub: 'And see what to pay' } : { title: 'They’re on the game', sub: 'And see what to pay' },
  ];

  return (
    <Sheet
      titleId={titleId}
      onClose={onClose}
      align="left"
      footer={
        url ? (
          <div className="flex gap-2">
            <button onClick={copy} className={`${btnSecondary} px-5`}>
              Copy link
            </button>
            <button onClick={share} className={`${btnPrimary} flex-1`}>
              Share link
            </button>
          </div>
        ) : undefined
      }
    >
      <SheetTitle id={titleId} title="Game QR code" sub="Show it at the pitch, or share the link." onClose={onClose} />
      {error ? (
        <p className="mt-6 rounded-2xl bg-chalk px-4 py-3 text-[14px] text-gray-700" role="alert">
          {error}
        </p>
      ) : !url ? (
        <div className="mt-6 flex justify-center py-16" aria-busy aria-label="Making the QR code">
          <BallSpinner className="w-6 h-6" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex justify-center animate-pop-in">
            <div className="rounded-3xl bg-white border-2 border-ink shadow-sticker p-4">
              <QRCodeCanvas value={url} size={208} level="M" role="img" aria-label={`QR code for this ${groupName} game`} />
            </div>
          </div>
          <Steps className="mt-5" heading="What happens when they scan" steps={steps} />
        </>
      )}
    </Sheet>
  );
}
