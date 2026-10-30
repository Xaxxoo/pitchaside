import type { IPublicPitch } from '@pitchaside/shared';
import { naira, pitchFacts, PITCH_ICONS } from '@/components/pitch/pitch-facts';

/**
 * A pitch as groups and players see it: name and where, what it is, the price, how to find it on
 * the day and a way to open it in maps. Dark and turf-striped like the app's other pitch cards.
 */
export function PitchCard({ pitch, children }: { pitch: IPublicPitch; children?: React.ReactNode }) {
  const place = [pitch.address, pitch.city, pitch.state].filter(Boolean).join(', ');
  const facts = pitchFacts(pitch);
  const length = pitch.slotDurationMinutes === 60 ? '1 hour' : `${pitch.slotDurationMinutes} min`;
  return (
    <section className="rounded-3xl bg-ink turf-stripes text-white shadow-card px-5 py-5" aria-label={pitch.name}>
      <h1 className="font-display text-[26px] leading-tight font-extrabold line-clamp-2 break-words">{pitch.name}</h1>
      {place && <p className="text-[13px] text-white/70 mt-1 truncate">{place}</p>}
      <p className="mt-3 font-display text-[22px] font-extrabold text-volt-300 leading-none">
        {naira(pitch.defaultPrice)} <span className="text-[13px] font-sans font-bold text-white/70">a game · {length}</span>
      </p>
      {facts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="About the pitch">
          {facts.map((f) => (
            <li key={f} className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] font-bold text-white/90 whitespace-nowrap">{f}</li>
          ))}
        </ul>
      )}
      {pitch.description && <p className="mt-3 text-[13px] text-white/70 line-clamp-2">{pitch.description}</p>}
      {(pitch.directions || pitch.mapUrl) && (
        <div className="mt-4 pt-4 border-t border-white/10">
          {pitch.directions && (
            <p className="flex items-start gap-2.5 text-[14px] leading-snug text-white/90">
              <svg className="w-[18px] h-[18px] mt-px shrink-0 text-volt-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d={PITCH_ICONS.pin} />
              </svg>
              <span className="min-w-0 break-words">{pitch.directions}</span>
            </p>
          )}
          {pitch.mapUrl && (
            <a
              href={pitch.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`press w-full min-h-12 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white text-ink text-[15px] font-bold ${pitch.directions ? 'mt-3' : ''}`}
            >
              Directions
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
