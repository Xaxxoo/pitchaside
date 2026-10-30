'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BackButtonProps {
  label?: string;
  /** Where it goes, named by `label` ("Your pitches"). Without it, it steps back in the history. */
  href?: string;
}

const cls =
  'press inline-flex items-center gap-1.5 min-h-11 pl-2.5 pr-3.5 -ml-1 mb-4 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-full hover:text-ink hover:border-gray-300 transition-colors';

const Chevron = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

/** The way back, saying where it goes. A fixed place (`href`) works even when the page was opened from a link. */
export function BackButton({ label = 'Back', href }: BackButtonProps) {
  const router = useRouter();
  if (href) {
    return (
      <Link href={href} className={cls}>
        <Chevron />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => router.back()} className={cls}>
      <Chevron />
      {label}
    </button>
  );
}
