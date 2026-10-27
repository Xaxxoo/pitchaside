import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getMatchCard } from './match-card';
import { matchPreview } from '@/lib/match-words';

async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || /^\d/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * The preview WhatsApp shows for a match-day link (this page and the vote, /v/…): the match card
 * picture, with a title that asks for votes while the vote is open and names the winner after.
 */
export async function matchMetadata(token: string): Promise<Metadata> {
  const card = await getMatchCard(token);
  if (!card) return { title: 'PitchAside' };
  const image = `${await origin()}/share/${token}/image`;
  const { title, description } = matchPreview(card);
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1080, height: 1350 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

