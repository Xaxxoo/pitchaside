import type { Metadata } from 'next';
import { groupInvite, inviteDescription } from '@/lib/invite-card';

/** The group link's preview in WhatsApp, X, etc.: the image comes from ./image. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const card = await groupInvite(code);
  if (!card) return {};
  const title = `Join ${card.title} on PitchAside`;
  const description = inviteDescription(card);
  const image = { url: `/g/${code}/image`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    openGraph: { title, description, url: `/g/${code}`, images: [image], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
