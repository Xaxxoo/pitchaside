import type { Metadata } from 'next';

// A personal, one-time link: never indexed, and the token never leaks to other sites as a referrer.
export const metadata: Metadata = {
  title: 'Get into PitchAside',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function SignInLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
