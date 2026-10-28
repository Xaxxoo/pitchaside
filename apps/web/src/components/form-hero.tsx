/** Illustrated banner that sits on top of create/edit forms. */
export function FormHero({
  eyebrow,
  title,
  subtitle,
  art,
  tone = 'volt',
  progress,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  art: React.ReactNode;
  tone?: 'volt' | 'sky' | 'kit';
  /** Setting up: the steps across the top, in place of the eyebrow, so the screen has one header. */
  progress?: React.ReactNode;
}) {
  const bg = tone === 'sky' ? 'bg-sky-300' : tone === 'kit' ? 'bg-kit-400' : 'bg-volt-300';
  return (
    <div className={`relative ${bg} rounded-t-[28px] border-2 border-b-0 border-ink px-5 pt-5 sm:px-7 sm:pt-6 overflow-hidden`}>
      <div className="absolute inset-0 chalk-dots opacity-60 pointer-events-none" />
      {progress && <div className="relative mb-4">{progress}</div>}
      <div className="relative flex items-end justify-between gap-3">
        <div className="pb-5 sm:pb-6 min-w-0">
          {!progress && <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/60 mb-1.5">{eyebrow}</p>}
          <h1 className="text-[30px] leading-none font-extrabold text-ink">{title}</h1>
          <p className="text-sm text-ink/70 mt-2 max-w-xs">{subtitle}</p>
        </div>
        <div className="w-24 sm:w-40 shrink-0 -mb-px">{art}</div>
      </div>
    </div>
  );
}

export const formCardClass =
  'bg-white rounded-b-[28px] border-2 border-t-0 border-ink p-5 sm:p-7 space-y-4';

/** Groups a FormHero and its form so they share one sticker shadow. */
export function FormShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[30px] shadow-sticker">{children}</div>;
}
