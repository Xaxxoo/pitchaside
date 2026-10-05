import Link from 'next/link';

/**
 * Text whose hyphenated words never break across lines — so "Tuesday Night 5-a-side"
 * wraps as "Tuesday Night / 5-a-side", not "5- / a-side". Spaces still wrap as usual.
 */
export function KeepHyphens({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        part.includes('-') ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The PitchAside mark: a volt pitch tile with a halfway line and centre spot. */
export function LogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#0f1a14" />
      <rect x="7" y="8" width="26" height="24" rx="4" fill="none" stroke="#d4f53c" strokeWidth="2.4" />
      <line x1="20" y1="8" x2="20" y2="32" stroke="#d4f53c" strokeWidth="2.4" />
      <circle cx="20" cy="20" r="5" fill="none" stroke="#d4f53c" strokeWidth="2.4" />
      <circle cx="20" cy="20" r="1.6" fill="#d4f53c" />
    </svg>
  );
}

export function Logo({
  href = '/',
  size = 'md',
  tone = 'dark',
}: {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'dark' | 'light';
}) {
  const mark = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const text = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 group">
      <LogoMark className={`${mark} transition-transform group-hover:-rotate-6`} />
      <span className={`font-display font-extrabold tracking-tight ${text} ${tone === 'light' ? 'text-white' : 'text-ink'}`}>
        Pitch<span className={tone === 'light' ? 'text-volt-400' : 'text-pitch-600'}>Aside</span>
      </span>
    </Link>
  );
}

/** Consistent top-of-page heading used across the app. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-pitch-600 mb-1">{eyebrow}</p>
        )}
        <h1 className="text-[28px] leading-none font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
