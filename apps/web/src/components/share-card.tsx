'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BallSpinner } from '@/components/skeleton';
import { matchCaption, type MatchWordsCard } from '@/lib/match-words';

/**
 * "Share match card": opens a sheet with the match-day card image, then shares
 * the PNG through the phone's share sheet, sends the link to WhatsApp (its
 * preview is the card), or saves the image.
 *
 * The image loads while the sheet is open so the Share tap can call
 * navigator.share straight away — iOS rejects a share that waits on a fetch.
 */
/** The share mark (three linked dots), the same on every shareable card. */
export function ShareIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
      />
    </svg>
  );
}

/** A round share button, 44px like the buttons beside it: on a light surface, or on a dark card. */
export const shareIconLight =
  'press shrink-0 w-11 h-11 rounded-full border border-gray-200 bg-white text-ink flex items-center justify-center hover:border-ink transition-colors';
/** On a bright (sun) card: ink, like the card's other dark pieces. */
export const shareIconInk = 'press shrink-0 w-11 h-11 rounded-full bg-ink text-sun-400 flex items-center justify-center hover:bg-pitch-900 transition-colors';
/** On a dark card's toolbar, beside Edit and Delete: quiet until pressed. */
export const shareIconDark = 'press shrink-0 w-11 h-11 rounded-full text-white/70 flex items-center justify-center hover:text-white hover:bg-white/10 transition-colors';
/** At the end of a card's action row: a chalk tile the same height as the row beside it. */
export const shareIconTile = 'press shrink-0 w-12 h-12 rounded-2xl bg-chalk text-ink flex items-center justify-center hover:bg-gray-100 transition-colors';

export function ShareCardButton({
  token,
  page,
  label,
  heading = 'Share the match day',
  fileName = 'pitchaside-match-day.png',
  caption,
  className,
  children = 'Share match card',
}: {
  /** The game's vote token: the match card. */
  token?: string;
  /** Any other shareable card: its page path; the image is the page path + "/image" (query kept). */
  page?: string;
  heading?: string;
  /** Said aloud (and shown on hover) when the button is just the share icon. */
  label?: string;
  fileName?: string;
  /** Message sent with the card, e.g. "Tuesday Night 5s — match day". */
  caption: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = page ?? `/share/${token}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={label} title={label}>
        {children}
      </button>
      {open && <ShareSheet path={path} token={page ? undefined : token} heading={heading} fileName={fileName} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "/g/abc/table?last=5" → "/g/abc/table/image?last=5". */
function imageOf(path: string) {
  const [p, q] = path.split('?');
  return `${p}/image${q ? `?${q}` : ''}`;
}

function ShareSheet({
  path,
  token,
  heading,
  fileName,
  caption: given,
  onClose,
}: {
  path: string;
  /** A match card: its caption is written from the result itself (who won, or a call to vote). */
  token?: string;
  heading: string;
  fileName: string;
  caption: string;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState(given);
  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/votes/${encodeURIComponent(token)}/card`)
      .then((res) => (res.ok ? (res.json() as Promise<MatchWordsCard>) : null))
      .then((card) => card && setCaption(matchCaption(card)))
      .catch(() => {});
  }, [token]);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const pageUrl = typeof window === 'undefined' ? '' : `${window.location.origin}${path}`;
  const canShareFiles =
    !!file && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });

  useEffect(() => {
    let objectUrl: string | null = null;
    fetch(imageOf(path))
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('card'))))
      .then((blob) => {
        setFile(new File([blob], fileName, { type: 'image/png' }));
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, fileName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  async function shareImage() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], text: `${caption} ${pageUrl}` });
    } catch (err) {
      // Cancelled is fine; anything else falls back to the link.
      if ((err as Error).name !== 'AbortError') whatsapp();
    }
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${caption} ${pageUrl}`)}`, '_blank', 'noopener');
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-4 animate-slide-up sm:animate-fade-in-up max-h-sheet overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold text-ink">{heading}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-500 hover:text-ink" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="aspect-[4/5] w-full max-h-[52dvh] mx-auto rounded-2xl overflow-hidden bg-pitch-950 flex items-center justify-center">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL, not an optimisable asset
            <img src={url} alt={`${heading}: ${caption}`} className="w-full h-full object-contain" />
          ) : failed ? (
            <p className="text-sm text-white/60 px-6 text-center">Couldn’t make the card. You can still share the link.</p>
          ) : (
            <BallSpinner />
          )}
        </div>

        <div className="mt-4 space-y-2">
          {canShareFiles && (
            <button
              onClick={shareImage}
              className="w-full py-3.5 text-sm font-bold text-volt-300 bg-ink rounded-xl hover:bg-pitch-900 transition-colors"
            >
              Share image
            </button>
          )}
          <button
            onClick={whatsapp}
            className="w-full py-3.5 text-sm font-bold text-white bg-[#25D366] rounded-xl hover:brightness-95 transition"
          >
            Send to WhatsApp
          </button>
          {url && (
            <a
              href={url}
              download={fileName}
              className="block w-full py-3 text-center text-sm font-bold text-ink bg-chalk rounded-xl hover:bg-gray-200 transition-colors"
            >
              Save image
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
