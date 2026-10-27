import type { Metadata } from 'next';
import { matchMetadata } from '../../share/[token]/meta';

/** The vote link's preview in WhatsApp: the match card and a call to vote, not the site's default. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  return matchMetadata((await params).token);
}

export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
