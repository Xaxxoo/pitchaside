/**
 * Server-side: the link previews for invite links — a group link (/g/:code)
 * and a club invite (/join/:code). WhatsApp, X, iMessage etc. show the
 * group's name, who's inviting, when they play and the fee, instead of the
 * site-wide card.
 *
 * Only public, non-sensitive fields go on the card; the public group endpoint
 * also returns the collection account, which is never shown here.
 */
import { ImageResponse } from 'next/og';
import { fit, loadFonts } from '@/lib/og';

const API_URL = process.env.API_URL || 'http://localhost:3001';

export interface InviteCardData {
  /** e.g. "Lekki Ballers invites you" */
  eyebrow: string;
  /** Group or club name, the headline. */
  title: string;
  /** Short facts: schedule, fee, squad size. */
  chips: string[];
  /** Letter on the shirt. */
  badge: string;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api${path}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const firstLetter = (name: string) => name.trim().charAt(0).toUpperCase() || 'P';

export async function groupInvite(code: string): Promise<InviteCardData | null> {
  const g = await getJson<{ groupName: string; organizationName?: string; schedule?: string; feePerPlayer: number; memberCount: number }>(
    `/public/groups/${encodeURIComponent(code)}`,
  );
  if (!g) return null;
  return {
    eyebrow: g.organizationName ? `${g.organizationName} invites you` : 'You’ve been called up',
    title: g.groupName,
    chips: [g.schedule, g.feePerPlayer > 0 ? `${naira(g.feePerPlayer)} per game` : null, g.memberCount > 0 ? `${g.memberCount} players` : null].filter(
      (c): c is string => !!c,
    ),
    badge: firstLetter(g.groupName),
  };
}

export async function clubInvite(code: string): Promise<InviteCardData | null> {
  const c = await getJson<{ clubName: string; groups: { name: string }[] }>(`/public/clubs/${encodeURIComponent(code)}`);
  if (!c) return null;
  const names = c.groups.map((g) => g.name);
  return {
    eyebrow: 'You’ve been called up',
    title: c.clubName,
    chips: names.length > 3 ? [...names.slice(0, 2), `+${names.length - 2} more groups`] : names,
    badge: firstLetter(c.clubName),
  };
}

/** The text a link preview shows under the image. */
export function inviteDescription(card: InviteCardData) {
  return `${card.eyebrow}. ${card.chips.join(' · ')}. Join on PitchAside to see your games, pay and say if you’re in.`;
}

/* ── The image ─────────────────────────────────────────────── */

/** Brand colours (mirrors globals.css — satori can't read CSS variables). */
const C = {
  ink: '#0f1a14',
  night: '#0d331c',
  turf: '#185c2f',
  turfLight: '#1f743a',
  volt: '#d4f53c',
  kit: '#ff6a3d',
  white: '#ffffff',
  muted: 'rgba(255,255,255,0.72)',
};

const SHIRTS = ['#d4f53c', '#ff6a3d', '#9fd6fb', '#ffc93c', '#ffffff'];

function shirtFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHIRTS[h % SHIRTS.length];
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="52" height="52" viewBox="0 0 40 40">
        <rect x="1" y="1" width="38" height="38" rx="11" fill={C.ink} />
        <rect x="7" y="8" width="26" height="24" rx="4" fill="none" stroke={C.volt} strokeWidth="2.4" />
        <line x1="20" y1="8" x2="20" y2="32" stroke={C.volt} strokeWidth="2.4" />
        <circle cx="20" cy="20" r="5" fill="none" stroke={C.volt} strokeWidth="2.4" />
        <circle cx="20" cy="20" r="1.6" fill={C.volt} />
      </svg>
      <div style={{ display: 'flex', fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 34, color: C.white, letterSpacing: -1 }}>
        Pitch<span style={{ color: C.volt }}>Aside</span>
      </div>
    </div>
  );
}

function Card({ card }: { card: InviteCardData }) {
  const shirt = shirtFor(card.title);
  return (
    <div style={{ width: 1200, height: 630, display: 'flex', background: C.night, position: 'relative', overflow: 'hidden' }}>
      {/* Pitch stripes and a centre circle behind the shirt */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: 470, height: 630, display: 'flex' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ width: 79, height: 630, background: i % 2 ? C.turf : C.turfLight }} />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 85,
          top: 165,
          width: 300,
          height: 300,
          borderRadius: 150,
          border: '4px solid rgba(255,255,255,0.35)',
          display: 'flex',
        }}
      />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 4, height: 630, background: 'rgba(255,255,255,0.35)', display: 'flex' }} />

      {/* The shirt */}
      <div style={{ position: 'absolute', right: 75, top: 130, width: 320, height: 320, display: 'flex' }}>
        <svg width="320" height="320" viewBox="0 0 64 64">
          <path
            d="M22 6 L10 12 L4 26 L14 30 L16 24 L16 58 L48 58 L48 24 L50 30 L60 26 L54 12 L42 6 Q32 14 22 6 Z"
            fill={shirt}
            stroke={C.ink}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: 112,
            left: 0,
            width: 320,
            display: 'flex',
            justifyContent: 'center',
            fontFamily: 'Bricolage Grotesque',
            fontWeight: 800,
            fontSize: 110,
            color: C.ink,
          }}
        >
          {card.badge}
        </div>
      </div>

      {/* Words */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '56px 0 56px 64px', width: 700 }}>
        <Logo />
        <div
          style={{
            display: 'flex',
            marginTop: 54,
            fontFamily: 'DM Sans',
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: C.volt,
          }}
        >
          {card.eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 14,
            fontFamily: 'Bricolage Grotesque',
            fontWeight: 800,
            fontSize: fit(card.title, 78, 16),
            lineHeight: 1.02,
            letterSpacing: -2,
            color: C.white,
          }}
        >
          {card.title}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26 }}>
          {card.chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: 'flex',
                fontFamily: 'DM Sans',
                fontWeight: 700,
                fontSize: 24,
                color: C.white,
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 999,
                padding: '10px 20px',
              }}
            >
              {chip}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Bricolage Grotesque',
              fontWeight: 800,
              fontSize: 30,
              color: C.ink,
              background: C.volt,
              borderRadius: 999,
              padding: '16px 30px',
            }}
          >
            Join the squad →
          </div>
        </div>
      </div>
    </div>
  );
}

export async function inviteImage(card: InviteCardData | null) {
  // A dead link still gets a sensible card rather than an error.
  const data = card ?? { eyebrow: 'You’ve been called up', title: 'Join the squad', chips: ['Payment tracking for 5-a-side groups'], badge: 'P' };
  return new ImageResponse(<Card card={data} />, {
    width: 1200,
    height: 630,
    fonts: await loadFonts(),
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
