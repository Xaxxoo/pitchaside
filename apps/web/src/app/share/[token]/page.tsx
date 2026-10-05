import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatchCard } from './match-card';

export const dynamic = 'force-dynamic';

async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || /^\d/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

function title(card: { groupName: string; awards: { key: string; name: string }[] }) {
  const potm = card.awards.find((a) => a.key === 'potm');
  return potm ? `${potm.name} — Player of the Match · ${card.groupName}` : `${card.groupName} — match day`;
}

/** The link shared to WhatsApp: its preview is the match card image. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const card = await getMatchCard(token);
  if (!card) return { title: 'PitchAside' };
  const image = `${await origin()}/share/${token}/image`;
  const description = card.open
    ? `${card.ballots} of ${card.squadSize} have voted. Have your say on PitchAside.`
    : 'Final result on PitchAside.';
  return {
    title: title(card),
    description,
    openGraph: { title: title(card), description, images: [{ url: image, width: 1080, height: 1350 }] },
    twitter: { card: 'summary_large_image', title: title(card), description, images: [image] },
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await getMatchCard(token);
  if (!card) notFound();

  return (
    <main className="min-h-screen bg-pitch-950 turf-stripes px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG route */}
        <img
          src={`/share/${token}/image`}
          alt={title(card)}
          width={1080}
          height={1350}
          className="w-full h-auto rounded-3xl border-2 border-ink shadow-sticker"
        />
        <div className="mt-5 space-y-2">
          <Link
            href={`/v/${token}`}
            className="block w-full py-3.5 text-center text-sm font-bold text-ink bg-volt-400 rounded-xl hover:bg-volt-300 transition-colors"
          >
            {card.open ? 'Played? Cast your votes' : 'See the full results'}
          </Link>
          <Link
            href="/signup"
            className="block w-full py-3 text-center text-sm font-bold text-white/80 border border-white/20 rounded-xl hover:bg-white/5 transition-colors"
          >
            Run your own games? Start a group on PitchAside
          </Link>
        </div>
      </div>
    </main>
  );
}
