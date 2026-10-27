import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatchCard } from './match-card';
import { matchPreview } from '@/lib/match-words';
import { matchMetadata } from './meta';

export const dynamic = 'force-dynamic';

const title = (card: Parameters<typeof matchPreview>[0]) => matchPreview(card).title;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  return matchMetadata((await params).token);
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
