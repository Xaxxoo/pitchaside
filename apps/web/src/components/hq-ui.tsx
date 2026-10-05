'use client';

import { useEffect, useState } from 'react';
import { shortDay } from '@/lib/hq';

/** Building blocks for the HQ (platform admin) pages. */

/**
 * A query-string value as the page first renders (e.g. ?status=unmatched from an
 * Overview link). HQ pages only render in the browser, behind the sign-in check.
 */
export function initialParam(name: string) {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name);
}

/** Fetch on mount and whenever `deps` change; the previous page stays on screen while the next loads. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((err: Error) => live && setState({ data: null, error: err.message, loading: false }));
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; `deps` says when it actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function Panel({
  title,
  hint,
  action,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-3xl border border-gray-100 shadow-card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Change against the previous period, e.g. "▲ 12% vs previous 30 days". */
export function Delta({ current, previous, period = 'previous 30 days' }: { current: number; previous: number; period?: string }) {
  if (previous === 0 && current === 0) return <span className="text-gray-500">No change vs {period}</span>;
  if (previous === 0) return <span className="text-gray-500">none in the {period}</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  const up = change >= 0;
  return (
    <span className="text-gray-500">
      <span className={`font-bold ${up ? 'text-pitch-600' : 'text-kit-600'}`}>
        <span aria-hidden>{up ? '▲' : '▼'}</span> {Math.abs(change)}%
      </span>{' '}
      <span className="sr-only">{up ? 'up' : 'down'}</span>vs {period}
    </span>
  );
}

export function Tile({
  label,
  value,
  sub,
  tone = 'white',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'white' | 'volt';
}) {
  return (
    <div className={`rounded-2xl p-4 border ${tone === 'volt' ? 'bg-volt-300 border-volt-400' : 'bg-white border-gray-100 shadow-card'}`}>
      <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${tone === 'volt' ? 'text-ink/60' : 'text-gray-500'}`}>{label}</p>
      <p className="font-display text-3xl font-extrabold text-ink mt-1 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-2 leading-snug">{sub}</p>}
    </div>
  );
}

const pillTones = {
  good: 'bg-pitch-100 text-pitch-800',
  warn: 'bg-sun-400/30 text-amber-900',
  bad: 'bg-kit-400/25 text-kit-600',
  muted: 'bg-gray-100 text-gray-600',
  volt: 'bg-volt-300 text-ink',
} as const;

export function Pill({ tone = 'muted', children }: { tone?: keyof typeof pillTones; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${pillTones[tone]}`}>
      {children}
    </span>
  );
}

/** Search field that reports the term once typing pauses. */
export function SearchBox({ placeholder, onSearch }: { placeholder: string; onSearch: (term: string) => void }) {
  const [term, setTerm] = useState('');

  useEffect(() => {
    const t = setTimeout(() => onSearch(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term, onSearch]);

  return (
    <input
      type="search"
      value={term}
      onChange={(e) => setTerm(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full sm:max-w-xs rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-volt-300/70 focus:border-pitch-600"
    />
  );
}

/** Row of mutually exclusive filter chips. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            o.value === value ? 'bg-ink text-volt-300 border-ink' : 'bg-white text-gray-600 border-gray-200 hover:border-ink hover:text-ink'
          }`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Scrolls sideways on phones instead of squeezing columns. */
export function Table({ head, children, minWidth = 640 }: { head: string[]; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-card overflow-x-auto">
      <table className="w-full text-sm text-left" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-gray-100">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

export function TableSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 bg-gray-100 rounded-2xl" />
      ))}
    </div>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-kit-400/40 bg-kit-400/10 px-4 py-3 text-sm text-ink">
      <span className="font-bold">Couldn&apos;t load this.</span> {message}
    </div>
  );
}

/** A round axis top at or above `max`. For counts it's even, so the halfway tick is a whole number. */
function niceCeil(max: number, whole: boolean) {
  if (max <= 0) return whole ? 2 : 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const steps = whole ? [2, 4, 6, 10] : [1, 2, 2.5, 5, 10];
  return (steps.find((s) => s * pow >= max) ?? 10) * pow;
}

/**
 * One series, one bar per week. The title above it names the series, so there's
 * no legend; every value is reachable by hover, tap or keyboard focus.
 */
export function WeeklyBars({
  weeks,
  format,
  unit,
  whole = false,
}: {
  weeks: { week: string; value: number }[];
  /** The series is a count (players, games) rather than an amount. */
  whole?: boolean;
  /** Full value for the tooltip. */
  format: (value: number) => string;
  /** Short form for axis ticks. */
  unit?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceCeil(Math.max(...weeks.map((w) => w.value), 0), whole);
  const tick = unit ?? format;
  const height = 132;

  if (weeks.every((w) => w.value === 0)) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-500 chalk-dots rounded-2xl" style={{ height: height + 22 }}>
        Nothing in the last {weeks.length} weeks yet
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Axis ticks */}
      <div className="relative w-10 shrink-0 text-[10px] text-gray-500 tabular-nums text-right" style={{ height }} aria-hidden>
        <span className="absolute right-0 -top-1.5">{tick(top)}</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2">{tick(top / 2)}</span>
        <span className="absolute right-0 -bottom-1.5">{tick(0)}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
          {/* Hairline grid */}
          <div className="absolute inset-x-0 top-0 border-t border-gray-100" />
          <div className="absolute inset-x-0 top-1/2 border-t border-gray-100" />
          <div className="absolute inset-x-0 bottom-0 border-t border-gray-200" />

          <div className="absolute inset-0 flex">
            {weeks.map((w, i) => (
              <button
                key={w.week}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
                aria-label={`Week of ${shortDay(w.week)}: ${format(w.value)}`}
                className="relative flex-1 flex items-end justify-center px-px focus-visible:outline-none group"
              >
                <span
                  className={`w-full max-w-6 rounded-t transition-colors ${
                    active === i ? 'bg-pitch-800' : 'bg-pitch-500 group-focus-visible:bg-pitch-800'
                  }`}
                  style={{ height: `${(w.value / top) * 100}%`, minHeight: w.value > 0 ? 2 : 0 }}
                />
                {active === i && (
                  <span
                    role="tooltip"
                    className={`absolute z-10 bottom-full mb-1 px-2.5 py-1.5 rounded-xl bg-ink text-white text-left whitespace-nowrap shadow-lift pointer-events-none ${
                      i < 2 ? 'left-0' : i > weeks.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    <span className="block text-sm font-bold tabular-nums">{format(w.value)}</span>
                    <span className="block text-[10px] text-white/60">Week of {shortDay(w.week)}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Week labels — every third, so they never collide */}
        <div className="flex mt-1.5" aria-hidden>
          {weeks.map((w, i) => (
            <span key={w.week} className="flex-1 text-center text-[10px] text-gray-500 whitespace-nowrap overflow-visible">
              {(weeks.length - 1 - i) % 3 === 0 ? shortDay(w.week) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
