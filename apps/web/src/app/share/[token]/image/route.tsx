import { ImageResponse } from 'next/og';
import { getMatchCard, type MatchCard } from '../match-card';

export const dynamic = 'force-dynamic';

/** Brand colours (mirrors the @theme tokens in globals.css — satori can't read CSS variables). */
const C = {
  ink: '#0f1a14',
  pitch950: '#071f10',
  pitch900: '#0d331c',
  pitch600: '#1f743a',
  volt300: '#e3fb6c',
  volt400: '#d4f53c',
  chalk: '#f5f3ea',
  muted: 'rgba(255,255,255,0.55)',
};

const TEAM_COLOURS: Record<string, { name: string; bg: string; fg: string }> = {
  A: { name: 'Orange', bg: '#ff6a3d', fg: '#ffffff' },
  B: { name: 'Yellow', bg: '#ffc93c', fg: C.ink },
  C: { name: 'Blue', bg: '#3b82f6', fg: '#ffffff' },
  D: { name: 'White', bg: '#ffffff', fg: C.ink },
  E: { name: 'Green', bg: '#2f8f48', fg: '#ffffff' },
  F: { name: 'Red', bg: '#e5484d', fg: '#ffffff' },
};

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=DM+Sans:wght@500;700';

type Font = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: 'normal' };
let fontsCache: Promise<Font[]> | null = null;

/** Brand fonts as TTF (satori needs TTF/OTF). Falls back to the built-in font if offline. */
function loadFonts(): Promise<Font[]> {
  fontsCache ??= (async () => {
    try {
      const css = await (await fetch(FONT_CSS)).text();
      const faces = [...css.matchAll(/font-family: '([^']+)';[\s\S]*?font-weight: (\d+);[\s\S]*?src: url\(([^)]+)\)/g)];
      return await Promise.all(
        faces.map(async ([, name, weight, url]) => ({
          name,
          weight: Number(weight) as Font['weight'],
          style: 'normal' as const,
          data: await (await fetch(url)).arrayBuffer(),
        })),
      );
    } catch {
      fontsCache = null;
      return [];
    }
  })();
  return fontsCache;
}

function prettyDate(iso: string) {
  return new Date(`${iso}T12:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

/** Shrink long names so they stay on one line. */
function fit(text: string, base: number, max: number) {
  return text.length <= max ? base : Math.max(Math.round((base * max) / text.length), Math.round(base * 0.55));
}

function initials(name: string) {
  return name
    .split(/\s+|&/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function Jersey({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <div style={{ display: 'flex', position: 'relative', width: 190, height: 190 }}>
      <svg width="190" height="190" viewBox="0 0 64 64">
        <path
          d="M22 6 L10 12 L4 26 L14 30 L16 24 L16 58 L48 58 L48 24 L50 30 L60 26 L54 12 L42 6 Q32 14 22 6 Z"
          fill={bg}
          stroke={C.ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 0,
          width: 190,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: 'Bricolage Grotesque',
          fontSize: 52,
          fontWeight: 800,
          color: fg,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Card({ card }: { card: MatchCard }) {
  const potm = card.awards.find((a) => a.key === 'potm');
  const others = card.awards.filter((a) => a.key !== 'potm');
  const tod = card.teamOfTheDay;
  const todColour = tod ? TEAM_COLOURS[tod.team] ?? TEAM_COLOURS.A : null;

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: C.pitch950,
        fontFamily: 'DM Sans',
        color: '#ffffff',
        padding: 64,
      }}
    >
      {/* Mowed-grass stripes */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} style={{ flex: 1, background: i % 2 ? 'rgba(255,255,255,0.025)' : 'transparent' }} />
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* Same mark as components/brand.tsx, on a volt tile so it reads on the dark card. */}
          <svg width="64" height="64" viewBox="0 0 40 40">
            <rect x="1" y="1" width="38" height="38" rx="11" fill={C.volt400} />
            <rect x="7" y="8" width="26" height="24" rx="4" fill="none" stroke={C.ink} strokeWidth="2.4" />
            <line x1="20" y1="8" x2="20" y2="32" stroke={C.ink} strokeWidth="2.4" />
            <circle cx="20" cy="20" r="5" fill="none" stroke={C.ink} strokeWidth="2.4" />
            <circle cx="20" cy="20" r="1.6" fill={C.ink} />
          </svg>
          <div style={{ display: 'flex', fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 40 }}>
            Pitch<span style={{ color: C.volt300 }}>Aside</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            padding: '12px 24px',
            borderRadius: 999,
            border: '2px solid rgba(255,255,255,0.2)',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          {prettyDate(card.date)}
        </div>
      </div>

      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 6, color: C.volt300 }}>
          {(card.clubName ? `${card.clubName} · MATCH DAY` : 'MATCH DAY').toUpperCase()}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Bricolage Grotesque',
            fontWeight: 800,
            fontSize: fit(card.groupName, 92, 16),
            lineHeight: 1.05,
            marginTop: 8,
          }}
        >
          {card.groupName}
        </div>
      </div>

      {/* Player of the Match */}
      {potm ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginTop: 36,
            padding: '22px 40px 22px 24px',
            borderRadius: 48,
            background: C.volt400,
            color: C.ink,
            border: `4px solid ${C.ink}`,
            boxShadow: `10px 10px 0 ${C.ink}`,
          }}
        >
          <Jersey label={initials(potm.name)} bg="#ffffff" fg={C.ink} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 5 }}>PLAYER OF THE MATCH</div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Bricolage Grotesque',
                fontWeight: 800,
                fontSize: fit(potm.name, 76, 13),
                lineHeight: 1.05,
                marginTop: 6,
              }}
            >
              {potm.name}
            </div>
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, marginTop: 10, color: C.pitch900 }}>
              {potm.votes} {potm.votes === 1 ? 'vote' : 'votes'}
              {potm.shared ? ' each · shared' : ''}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            marginTop: 44,
            padding: 40,
            borderRadius: 48,
            border: '3px dashed rgba(255,255,255,0.3)',
            fontSize: 36,
            fontWeight: 700,
            color: C.muted,
          }}
        >
          Votes are still coming in…
        </div>
      )}

      {/* Other awards */}
      {others.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 28 }}>
          {others.map((a, i) => (
            <div
              key={a.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                // An odd one out (usually the keeper) spans the row.
                width: others.length % 2 === 1 && i === others.length - 1 ? 952 : 468,
                padding: '18px 28px',
                borderRadius: 32,
                background: 'rgba(255,255,255,0.07)',
                border: '2px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ display: 'flex', fontSize: 21, fontWeight: 700, letterSpacing: 3, color: C.volt300 }}>
                {a.title.toUpperCase()}
              </div>
              <div style={{ display: 'flex', fontSize: fit(a.name, 36, 18), fontWeight: 700, marginTop: 6 }}>{a.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Team of the Day */}
      {tod && todColour && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginTop: 28,
            padding: '22px 32px',
            borderRadius: 32,
            background: 'rgba(0,0,0,0.3)',
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 24,
              background: todColour.bg,
              color: todColour.fg,
              border: `3px solid ${C.ink}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Bricolage Grotesque',
              fontWeight: 800,
              fontSize: 48,
            }}
          >
            {tod.team}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 4, color: C.volt300 }}>
              TEAM OF THE DAY · {todColour.name.toUpperCase()}
            </div>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, marginTop: 4 }}>
              W{tod.w} D{tod.d} L{tod.l} · {tod.pts} pts
            </div>
            {tod.players.length > 0 && (
              <div style={{ display: 'flex', fontSize: 24, color: C.muted, marginTop: 4 }}>
                {tod.players.map((p) => p.split(' ')[0]).join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 26,
          color: C.muted,
        }}
      >
        <div style={{ display: 'flex' }}>
          {card.ballots} of {card.squadSize} voted
        </div>
        {card.open ? (
          <div
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              background: C.volt400,
              color: C.ink,
              fontWeight: 700,
            }}
          >
            Voting open — have your say
          </div>
        ) : (
          <div style={{ display: 'flex', fontWeight: 700, color: '#ffffff' }}>Final result</div>
        )}
      </div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await getMatchCard(token);
  if (!card) return new Response('Not found', { status: 404 });
  const fonts = await loadFonts();
  return new ImageResponse(<Card card={card} />, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    // Results move while voting is open; keep previews fresh-ish.
    headers: { 'Cache-Control': card.open ? 'public, max-age=60' : 'public, max-age=3600' },
  });
}
