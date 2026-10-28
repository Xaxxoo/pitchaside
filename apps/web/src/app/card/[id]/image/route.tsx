import { ImageResponse } from 'next/og';
import { loadFonts } from '@/lib/og';
import { Brand, C, DISPLAY, Face, Star, loadPhotos, oneLine } from '@/lib/og-card';
import { getPlayerCard, type Ability, type PlayerCardData } from '../player-card';

export const dynamic = 'force-dynamic';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** The card's skills in FIFA order. Only those with evidence have a number (see the app's card). */
const ORDER: Ability[] = ['SHO', 'PAS', 'TEC', 'DEF', 'IQ', 'PHY', 'MOV', 'GK'];

/** The skills that have a number; the totals are in the tiles below, so they aren't repeated here. */
function cardLines(c: PlayerCardData): { k: string; v: number }[] {
  return ORDER.filter((k) => c.attributes[k] != null).map((k) => ({ k: k as string, v: c.attributes[k]! }));
}

function Attr({ k, v }: { k: string; v: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, height: 56 }}>
      <div style={{ display: 'flex', width: 84, justifyContent: 'flex-end', fontFamily: DISPLAY, fontWeight: 800, fontSize: 50, lineHeight: 1 }}>{v ?? '–'}</div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>{k}</div>
    </div>
  );
}

/**
 * The card itself, FIFA Ultimate Team style: rating and photo up top, name across the middle,
 * eight numbers below. Volt like the app's player card; "Settling" while the number is new.
 */
function PlayerCard({ c }: { c: PlayerCardData }) {
  // As on their profile in the app: the real name big, the nickname in quotes above it.
  const full = c.fullName ?? c.name;
  const nick = c.nickname && c.nickname !== full ? c.nickname : null;
  return (
    <div
      style={{
        width: 600,
        height: 720,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: 48,
        background: `linear-gradient(160deg, ${C.volt300} 0%, ${C.volt400} 45%, #a9c61f 100%)`,
        border: `5px solid ${C.ink}`,
        color: C.ink,
        padding: '34px 40px',
      }}
    >
      {/* Rating, top left */}
      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 34, left: 44 }}>
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 132, lineHeight: 1 }}>{c.ovr ?? '–'}</div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 4, marginTop: 4 }}>OVR</div>
        {c.provisional && (
          <div style={{ display: 'flex', marginTop: 10, padding: '4px 12px', borderRadius: 999, background: C.ink, color: C.volt300, fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
            SETTLING
          </div>
        )}
        {c.potmWins > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 26, fontWeight: 700 }}>
            <Star color={C.ink} size={28} />
            {c.potmWins}
          </div>
        )}
      </div>
      {/* Photo, top right */}
      <div style={{ display: 'flex', position: 'absolute', top: 40, right: 44 }}>
        <Face p={c} size={280} ring={C.ink} />
      </div>

      {/* Name across the middle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', position: 'absolute', left: 36, right: 36, top: 336, height: 104 }}>
        {nick && <div style={{ ...oneLine, maxWidth: 520, fontSize: 26, fontWeight: 700 }}>{`“${nick}”`}</div>}
        {/* A long name takes two lines (one under a nickname) rather than being cut short */}
        <div
          style={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineClamp: nick ? 1 : 2,
            maxWidth: 520,
            textAlign: 'center',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: full.length > 18 ? 40 : 58,
            lineHeight: 1.1,
          }}
        >
          {full}
        </div>
      </div>

      {/* Up to eight numbers, two columns, with a line between */}
      {cardLines(c).length === 0 && (
        <div style={{ display: 'flex', position: 'absolute', left: 40, right: 40, top: 452, borderTop: `4px solid ${C.ink}`, paddingTop: 40, justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>
          Skills show up as they play
        </div>
      )}
      {cardLines(c).length > 0 && (
      <div style={{ display: 'flex', position: 'absolute', left: 40, right: 40, top: 452, borderTop: `4px solid ${C.ink}`, paddingTop: 14, justifyContent: 'space-around' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cardLines(c).slice(0, Math.ceil(cardLines(c).length / 2)).map((l) => (
            <Attr key={l.k} k={l.k} v={l.v} />
          ))}
        </div>
        <div style={{ display: 'flex', width: 4, height: Math.ceil(cardLines(c).length / 2) * 56, background: C.ink }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cardLines(c).slice(Math.ceil(cardLines(c).length / 2)).map((l) => (
            <Attr key={l.k} k={l.k} v={l.v} />
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

/** One season number, FPL style: the figure, what it is, and where it ranks in the club. */
function Tile({ value, label, rank }: { value: string | number; label: string; rank?: { rank: number; of: number } | null }) {
  const top = rank && rank.rank === 1 && Number(value) > 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 230,
        height: 140,
        padding: '16px 18px',
        borderRadius: 24,
        background: top ? 'rgba(212,245,60,0.16)' : 'rgba(255,255,255,0.07)',
        border: `2px solid ${top ? 'rgba(212,245,60,0.6)' : C.line}`,
      }}
    >
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: 1, color: top ? C.volt300 : '#ffffff' }}>{value}</div>
      <div style={{ ...oneLine, fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: C.muted, marginTop: 8 }}>{label}</div>
      {rank && Number(value) > 0 ? (
        <div style={{ ...oneLine, fontSize: 17, fontWeight: 700, color: top ? C.volt300 : 'rgba(255,255,255,0.8)', marginTop: 'auto' }}>
          {`${ordinal(rank.rank)} of ${rank.of} in the club`}
        </div>
      ) : null}
    </div>
  );
}

function Card({ c }: { c: PlayerCardData }) {
  // Club, then their groups; a group named like the club isn't said twice.
  const where = [...new Set([c.clubName, ...c.groups.slice(0, 2)].filter(Boolean).map((n) => n!.toUpperCase()))].join(' · ');
  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        background: `linear-gradient(180deg, ${C.pitch900} 0%, ${C.pitch950} 60%)`,
        fontFamily: 'DM Sans',
        color: '#ffffff',
        padding: '48px 56px 36px',
      }}
    >
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
        <Brand />
        <div style={{ display: 'flex', padding: '10px 22px', borderRadius: 999, background: '#ffffff', color: C.ink, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
          PLAYER CARD
        </div>
      </div>
      <div style={{ ...oneLine, width: '100%', marginTop: 22, fontSize: 22, fontWeight: 700, letterSpacing: 3, color: C.volt300 }}>{where}</div>

      <div style={{ display: 'flex', marginTop: 24 }}>
        <PlayerCard c={c} />
      </div>

      {/* The season in numbers, all time in the club */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, width: 962, marginTop: 26 }}>
        <Tile value={c.games} label="MATCH DAYS" />
        <Tile value={`${c.record.w}-${c.record.d}-${c.record.l}`} label="GAMES W-D-L" rank={c.ranks.wins} />
        <Tile value={c.points} label="TABLE POINTS" rank={c.ranks.points} />
        <Tile value={c.goals} label="GOALS" rank={c.ranks.goals} />
        <Tile value={c.assists} label="ASSISTS" rank={c.ranks.assists} />
        <Tile value={c.potmWins} label="PLAYER OF THE MATCH" rank={c.ranks.potmWins} />
        <Tile value={c.viiOfDay} label="BEST VII OF THE DAY" rank={c.ranks.viiOfDay} />
        <Tile value={c.saves ? c.saves : c.teamOfDay} label={c.saves ? 'SAVES' : 'TEAM OF THE DAY'} />
      </div>

      <div style={{ marginTop: 'auto', width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 20, color: C.muted }}>
        <div style={{ display: 'flex' }}>Rated from results, stats and teammates’ votes</div>
        <div style={{ display: 'flex', fontWeight: 700, color: '#ffffff' }}>PitchAside</div>
      </div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getPlayerCard(id);
  if (!found) return new Response('Not found', { status: 404 });
  const [fonts, photos] = await Promise.all([loadFonts(), loadPhotos([found.photoKey])]);
  const c = { ...found, photo: found.photoKey ? (photos.get(found.photoKey) ?? null) : null };
  return new ImageResponse(<Card c={c} />, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
