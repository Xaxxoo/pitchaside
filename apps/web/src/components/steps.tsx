import type { ReactNode } from 'react';

/** A numbered step circle that turns to a tick once the step is done. */
export function StepDot({ n, done, current, onDark = false }: { n: number; done?: boolean; current?: boolean; onDark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[13px] font-extrabold transition-colors ${
        done
          ? 'bg-volt-300 text-ink'
          : current === false
            ? onDark
              ? 'bg-white/10 text-white/70'
              : 'bg-chalk text-gray-500 border border-gray-200'
            : onDark
              ? 'bg-volt-300 text-ink ring-4 ring-volt-300/20'
              : 'bg-ink text-volt-300'
      }`}
    >
      {done ? (
        <svg className="w-3.5 h-3.5 animate-pop-in" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

export interface Step {
  /** What to do, short: "Transfer ₦1,500". One line at 360px. */
  title: ReactNode;
  /** How, in a line: "To the account above". */
  sub?: ReactNode;
  done?: boolean;
  /** Something to do it with, under the words (a Copy button, a link). */
  action?: ReactNode;
}

/**
 * A process shown as steps, in order: numbered circles joined by a line, each step's title in
 * bold and how to do it under it. Done steps tick over in volt. The step to do next stands out;
 * later ones are quieter, so it reads at a glance "this, then this, then you're done".
 * `heading` names the whole thing ("3 steps to pay"), `note` says how long it takes.
 */
export function Steps({
  steps,
  heading,
  note,
  onDark = false,
  className = '',
}: {
  steps: Step[];
  heading?: ReactNode;
  note?: ReactNode;
  /** On an ink card. */
  onDark?: boolean;
  className?: string;
}) {
  const next = steps.findIndex((s) => !s.done);
  return (
    <div className={className}>
      {(heading || note) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {heading && <p className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${onDark ? 'text-volt-300' : 'text-gray-500'}`}>{heading}</p>}
          {note && <p className={`shrink-0 text-[12px] font-semibold ${onDark ? 'text-white/70' : 'text-pitch-700'}`}>{note}</p>}
        </div>
      )}
      <ol className="relative">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
              {/* The line down to the next step */}
              {!last && <span aria-hidden className={`absolute left-[13px] top-8 bottom-1 w-0.5 rounded-full ${s.done ? 'bg-volt-400' : onDark ? 'bg-white/15' : 'bg-gray-200'}`} />}
              <StepDot n={i + 1} done={s.done} current={next === -1 || i <= next ? undefined : false} onDark={onDark} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={`text-[14px] font-bold leading-snug ${s.done ? (onDark ? 'text-white/60' : 'text-gray-500') : onDark ? 'text-white' : 'text-ink'}`}>
                  <span className="sr-only">{s.done ? 'Done: ' : `Step ${i + 1}: `}</span>
                  {s.title}
                </p>
                {s.sub && <p className={`mt-0.5 text-[12px] leading-snug ${onDark ? 'text-white/60' : 'text-gray-500'}`}>{s.sub}</p>}
                {s.action && <div className="mt-2">{s.action}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
