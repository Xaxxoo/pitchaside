'use client';

import { useId, useState } from 'react';
import { useToast } from '@/components/toast';
import { BallSpinner } from '@/components/skeleton';
import { ConfirmSheet } from '@/components/match-day/confirm-sheet';
import { resizePitchPhoto } from '@/lib/photo';
import { addPitchPhoto, coverPitchPhoto, pitchPhotoUrl, removePitchPhoto } from '@/lib/pitch';

/** The same limit as the API (MAX_PITCH_PHOTOS). */
export const MAX_PITCH_PHOTOS = 6;

/**
 * A pitch's photos as a grid: the first is the cover (said on it), any other can be made the
 * cover, each can be removed (asks first), and "Add photos" takes several at once. Each photo is
 * shrunk on the phone before it's sent.
 */
export function PitchPhotosEditor({ pitchId, keys, onChange }: { pitchId: string; keys: string[]; onChange: (keys: string[]) => void }) {
  const toast = useToast();
  const inputId = useId();
  const [adding, setAdding] = useState<{ done: number; of: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const room = MAX_PITCH_PHOTOS - keys.length;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, room);
    if (files.length > room) toast.error(`Only ${room} more fit. A pitch can have ${MAX_PITCH_PHOTOS} photos.`);
    let latest = keys;
    for (let i = 0; i < list.length; i++) {
      setAdding({ done: i + 1, of: list.length });
      try {
        latest = (await addPitchPhoto(pitchId, await resizePitchPhoto(list[i]))).photoKeys;
        onChange(latest);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'That photo didn’t upload. Try again.');
      }
    }
    setAdding(null);
    if (latest.length > keys.length) toast.success(latest.length - keys.length === 1 ? 'Photo added' : `${latest.length - keys.length} photos added`);
  }

  async function act(key: string, work: () => Promise<{ photoKeys: string[] }>, done: string) {
    setBusy(key);
    try {
      onChange((await work()).photoKeys);
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-2" aria-label="Photos">
        {keys.map((k, i) => (
          <li key={k} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-chalk">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pitchPhotoUrl(k)} alt={i === 0 ? 'Cover photo' : `Photo ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 && <span className="absolute left-2 top-2 px-2 py-0.5 rounded-full bg-volt-300 text-ink text-[11px] font-extrabold">Cover</span>}
            <button
              type="button"
              onClick={() => setRemoving(k)}
              disabled={busy === k}
              aria-label={i === 0 ? 'Remove the cover photo' : `Remove photo ${i + 1}`}
              className="press absolute right-0 top-0 w-11 h-11 flex items-center justify-center"
            >
              <span className="w-7 h-7 rounded-full bg-ink/70 text-white flex items-center justify-center" aria-hidden>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </span>
            </button>
            {i > 0 && (
              <button
                type="button"
                onClick={() => act(k, () => coverPitchPhoto(pitchId, k), 'Cover changed')}
                disabled={busy === k}
                className="press absolute left-2 bottom-2 min-h-8 px-2.5 rounded-full bg-white/90 text-ink text-[12px] font-bold"
                aria-label={`Make photo ${i + 1} the cover`}
              >
                Make cover
              </button>
            )}
          </li>
        ))}
        {room > 0 && (
          <li className="aspect-[4/3]">
            <input id={inputId} type="file" accept="image/*" multiple className="sr-only" disabled={!!adding} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            <label
              htmlFor={inputId}
              className={`press w-full h-full rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-pitch-700 ${adding ? 'opacity-70' : 'cursor-pointer hover:border-pitch-600'}`}
            >
              {adding ? (
                <>
                  <BallSpinner />
                  <span className="text-[12px] font-bold">Adding {adding.done} of {adding.of}…</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  <span className="text-[13px] font-bold">{keys.length ? 'Add more' : 'Add photos'}</span>
                </>
              )}
            </label>
          </li>
        )}
      </ul>
      <p className="text-[12px] text-gray-500 mt-2">{room > 0 ? `Landscape works best. Up to ${MAX_PITCH_PHOTOS} photos.` : `That’s ${MAX_PITCH_PHOTOS}: remove one to add another.`}</p>
      <ConfirmSheet
        open={!!removing}
        title="Remove this photo?"
        message={keys[0] === removing && keys.length > 1 ? 'The next photo becomes the cover.' : 'Groups won’t see it on your pitch any more.'}
        confirmLabel="Remove photo"
        cancelLabel="Keep it"
        danger
        onConfirm={() => { const k = removing!; setRemoving(null); act(k, () => removePitchPhoto(pitchId, k), 'Photo removed'); }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
