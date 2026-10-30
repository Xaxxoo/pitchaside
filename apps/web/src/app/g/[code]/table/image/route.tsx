import { ImageResponse } from 'next/og';
import { loadFonts } from '@/lib/og';
import { getTableCard, rangeOf, type TableCard } from '../table-card';
import { DISPLAY, initials, loadPhotos, names, oneLine, prettyDate } from '@/lib/og-card';

export const dynamic = 'force-dynamic';

type Row = TableCard['rows'][number];

/*
 * The group's table as a light poster, like the table in the app: "Club Table" up top, the top
 * three on a podium on the pitch, the next four as the app's rows, and a dark footer bar.
 */

/** The app's tokens (globals.css); satori can't read CSS variables. */
const T = {
  ink: '#0f1a14',
  chalk: '#f5f3ea',
  gray200: '#e2dfd3',
  gray500: '#6f7a72',
  line: '#ece9de',
  pitch500: '#2f8f48',
  pitch600: '#1f743a',
  pitch700: '#185c2f',
  volt300: '#e3fb6c',
  volt400: '#d4f53c',
  kit400: '#ff8a5c',
  kit600: '#e5501f',
  amber: '#b45309',
};

/** The Team of the Day mark, as in the app's table. */
const Trophy = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path
      d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 7.35 12H7a4 4 0 0 1-4-4V5h3V3Zm0 4H5v1a2 2 0 0 0 1 1.73V7Zm12 0v2.73A2 2 0 0 0 19 8V7h-1Z"
      fill={color}
    />
  </svg>
);
const StarMark = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill={color} />
  </svg>
);
const Crown = ({ size, color, outline = false }: { size: number; color: string; outline?: boolean }) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 30 24">
    <path
      d="M3 20 L2 6 L9 12 L15 3 L21 12 L28 6 L27 20 Z"
      fill={outline ? 'none' : color}
      stroke={color}
      strokeWidth={outline ? 2.6 : 1.5}
      strokeLinejoin="round"
    />
  </svg>
);

/** A player's face on the podium: their photo, else their initials. */
function Photo({ r, size, ring }: { r: Row; size: number; ring: string }) {
  const style = { width: size, height: size, borderRadius: size, border: `6px solid ${ring}` };
  return r.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={r.photo} width={size} height={size} style={{ ...style, objectFit: 'cover' }} alt="" />
  ) : (
    <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.chalk, color: T.ink, fontFamily: DISPLAY, fontWeight: 800, fontSize: Math.round(size * 0.36) }}>
      {initials(names(r).main)}
    </div>
  );
}

/** The top three on the pitch: second, first, third, the winner's block tallest. */
function Podium({ rows, byRating = false }: { rows: Row[]; byRating?: boolean }) {
  const spots = [
    { r: rows[1], place: '2nd', h: 150, bg: T.gray200, photo: 132 },
    { r: rows[0], place: '1st', h: 180, bg: T.volt300, photo: 142 },
    { r: rows[2], place: '3rd', h: 134, bg: T.kit400, photo: 132 },
  ];
  const chalk = 'rgba(255,255,255,0.10)';
  return (
    <div style={{ display: 'flex', position: 'relative', height: 420, borderRadius: 44, overflow: 'hidden', background: T.pitch700 }}>
      {/* Mowed stripes and faint pitch lines */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{ flex: 1, background: i % 2 ? 'rgba(255,255,255,0.035)' : 'transparent' }} />
        ))}
      </div>
      <div style={{ position: 'absolute', top: 60, left: -90, width: 220, height: 220, borderRadius: 220, border: `3px solid ${chalk}`, display: 'flex' }} />
      <div style={{ position: 'absolute', top: 60, right: -90, width: 220, height: 220, borderRadius: 220, border: `3px solid ${chalk}`, display: 'flex' }} />
      <div style={{ position: 'absolute', top: 130, left: -3, width: 60, height: 120, border: `3px solid ${chalk}`, display: 'flex' }} />
      <div style={{ position: 'absolute', top: 130, right: -3, width: 60, height: 120, border: `3px solid ${chalk}`, display: 'flex' }} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 18, width: '100%', padding: '0 44px' }}>
        {spots.map(({ r, place, h, bg, photo }) => {
          const first = place === '1st';
          return (
            <div key={place} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: first ? 1.08 : 1, minWidth: 0 }}>
              <div style={{ display: 'flex', position: 'relative' }}>
                <Photo r={r} size={photo} ring={T.ink} />
                {first && (
                  <div style={{ display: 'flex', position: 'absolute', top: -26, right: -26, transform: 'rotate(18deg)' }}>
                    <Crown size={58} color={T.volt400} outline />
                  </div>
                )}
              </div>
              <div style={{ ...oneLine, maxWidth: '100%', marginTop: 10, fontSize: 32, fontWeight: 700, color: '#ffffff' }}>{names(r).main}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: h, marginTop: 10, borderRadius: '30px 30px 0 0', background: bg, color: T.ink, paddingTop: 16 }}>
                <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: byRating && r.ovr == null ? 48 : 72, lineHeight: 1 }}>{byRating ? (r.ovr ?? 'NEW') : r.points}</div>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, marginTop: 4 }}>{byRating ? `${place} · ${r.points} pts` : `pts · ${place}`}</div>
                {first && (
                  <div style={{ display: 'flex', marginTop: 10 }}>
                    <Crown size={40} color="#e0a100" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ▲2 green, ▼1 orange, a dash for the same place, "new" for a first match day. */
function Move({ move }: { move: number | null }) {
  if (move === null || move === 0) return <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: T.gray500 }}>{move === null ? 'new' : '–'}</div>;
  const up = move > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 20, fontWeight: 700, color: up ? T.pitch600 : T.kit600 }}>
      <svg width="14" height="12" viewBox="0 0 16 14">
        <path d={up ? 'M8 1 L15 13 L1 13 Z' : 'M1 1 L15 1 L8 13 Z'} fill={up ? T.pitch600 : T.kit600} />
      </svg>
      {Math.abs(move)}
    </div>
  );
}

const FORM: Record<'W' | 'D' | 'L', string> = { W: T.volt400, D: T.gray200, L: T.kit400 };

/** Places after the podium, as the app shows them: place and move, name and record, P, form, points. */
function Rows({ rows, from, byRating = false }: { rows: Row[]; from: number; byRating?: boolean }) {
  const cols = { place: 90, p: 70, form: 150, pts: 90 };
  const head = { display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.65)' } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 32, overflow: 'hidden', background: '#ffffff', border: `2px solid ${T.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 66, padding: '0 34px', background: T.ink }}>
        <div style={{ ...head, width: cols.place }}>#</div>
        <div style={{ ...head, flex: 1 }}>PLAYER</div>
        <div style={{ ...head, width: cols.p, justifyContent: 'center' }}>P</div>
        <div style={{ ...head, width: cols.form, justifyContent: 'center' }}>FORM</div>
        <div style={{ ...head, width: cols.pts, justifyContent: 'flex-end', color: T.volt300 }}>{byRating ? 'RATING' : 'PTS'}</div>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', height: 90, padding: '0 34px', borderTop: i ? `2px solid ${T.line}` : 'none', color: T.ink }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: cols.place }}>
            <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{from + i}</div>
            <div style={{ display: 'flex', marginTop: 4 }}>
              <Move move={r.move} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div style={{ ...oneLine, fontSize: 32, fontWeight: 700, lineHeight: 1.15 }}>{names(r).main}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, fontWeight: 700, color: T.gray500, marginTop: 4 }}>
              <div style={{ display: 'flex' }}>{`${r.w}W ${r.d}D ${r.l}L`}</div>
              {r.potmWins > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ display: 'flex' }}>·</div>
                  <StarMark size={20} color={T.gray500} />
                  <div style={{ display: 'flex' }}>{String(r.potmWins)}</div>
                </div>
              )}
              {(r.teamOfDay ?? 0) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.amber }}>
                  <div style={{ display: 'flex' }}>·</div>
                  <Trophy size={20} color={T.amber} />
                  <div style={{ display: 'flex' }}>{String(r.teamOfDay)}</div>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', width: cols.p, justifyContent: 'center', fontSize: 30, color: T.gray500 }}>{r.games}</div>
          <div style={{ display: 'flex', width: cols.form, justifyContent: 'center', gap: 8 }}>
            {r.form.length ? (
              r.form.map((f, k) => (
                <div key={k} style={{ display: 'flex', width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', background: FORM[f], fontSize: 22, fontWeight: 700 }}>
                  {f}
                </div>
              ))
            ) : (
              <div style={{ display: 'flex', fontSize: 24, color: T.gray500 }}>–</div>
            )}
          </div>
          <div style={{ display: 'flex', width: cols.pts, justifyContent: 'flex-end', fontFamily: DISPLAY, fontWeight: 800, fontSize: byRating && r.ovr == null ? 26 : 40 }}>{byRating ? (r.ovr ?? 'NEW') : r.points}</div>
        </div>
      ))}
    </div>
  );
}

function Card({ t }: { t: TableCard }) {
  // A podium needs three with points; otherwise it's all one list (as in the app).
  const podium = t.rows.length >= 3 && (t.rankedBy === 'rating' ? t.rows[2].games > 0 : t.rows[2].points > 0);
  const list = podium ? t.rows.slice(3, 7) : t.rows.slice(0, 7);
  const hasPoints = t.rows.some((r) => r.points > 0 || r.games > 0);
  const shown = (podium ? 3 : 0) + list.length;
  const more = t.total - shown;
  const dates = t.from ? `${prettyDate(t.from)}${t.to && t.to !== t.from ? ` – ${prettyDate(t.to)}` : ''}` : null;
  const when = !t.games ? null : dates ? `${dates} · ${t.games} match day${t.games === 1 ? '' : 's'}` : t.last ? `last ${t.games} match days` : `after ${t.games} match day${t.games === 1 ? '' : 's'}`;
  const sub = [t.groupName, when, t.lastDate ? prettyDate(t.lastDate).replace(/^(\d+) (\w)(\w+)$/, (_, d, a, b) => `${d} ${a}${b.toLowerCase()}`) : null].filter(Boolean).join(' · ');

  return (
    <div style={{ width: 1080, height: 1350, display: 'flex', flexDirection: 'column', position: 'relative', background: T.chalk, fontFamily: 'DM Sans', color: T.ink, padding: '40px 46px 36px' }}>
      {/* Soft volt arcs in the corners, a crown and two strokes beside the headline */}
      <div style={{ position: 'absolute', top: -160, left: -160, width: 420, height: 420, borderRadius: 420, border: '46px solid rgba(212,245,60,0.16)', display: 'flex' }} />
      <div style={{ position: 'absolute', top: -120, right: -180, width: 440, height: 440, borderRadius: 440, border: '46px solid rgba(212,245,60,0.12)', display: 'flex' }} />
      <div style={{ position: 'absolute', top: 214, right: 58, display: 'flex', transform: 'rotate(14deg)' }}>
        <Crown size={110} color="#b9dd4a" outline />
      </div>
      <div style={{ position: 'absolute', top: 210, left: 92, display: 'flex' }}>
        <svg width="64" height="70" viewBox="0 0 64 70">
          <path d="M10 8 L30 44" stroke="#b9dd4a" strokeWidth="7" strokeLinecap="round" />
          <path d="M2 40 L26 58" stroke="#b9dd4a" strokeWidth="7" strokeLinecap="round" />
        </svg>
      </div>

      {/* Masthead */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Trophy size={50} color={T.ink} />
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 44 }}>PitchAside</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', fontFamily: DISPLAY, fontWeight: 800, fontSize: 132, lineHeight: 1, letterSpacing: -4, marginTop: 14 }}>
        <div style={{ display: 'flex' }}>Club</div>
        <div style={{ display: 'flex', color: T.pitch500, marginLeft: 26 }}>Table</div>
      </div>
      <div style={{ ...oneLine, alignSelf: 'center', maxWidth: 900, fontSize: 30, color: T.gray500, marginTop: 14, textAlign: 'center' }}>{sub}</div>
      <div style={{ display: 'flex', alignSelf: 'center', width: 84, height: 6, borderRadius: 6, background: T.volt400, marginTop: 16 }} />

      {!hasPoints ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: 26, borderRadius: 44, background: T.pitch700, color: '#ffffff' }}>
          <Trophy size={110} color={T.volt300} />
          <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, marginTop: 20 }}>No points yet</div>
          <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>The table fills up after the first match day with scores.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: 26 }}>
          {podium && <Podium rows={t.rows} byRating={t.rankedBy === 'rating' && t.rows.some((r) => r.ovr != null)} />}
          {list.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: podium ? 16 : 0 }}>
              <Rows rows={list} from={podium ? 4 : 1} byRating={t.rankedBy === 'rating' && t.rows.some((r) => r.ovr != null)} />
            </div>
          )}
        </div>
      )}

      {/* Footer bar */}
      <div style={{ display: 'flex', alignItems: 'center', height: 76, marginTop: 20, padding: '0 30px', borderRadius: 26, background: T.ink, color: '#ffffff' }}>
        <Trophy size={34} color={T.volt400} />
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 32, marginLeft: 12 }}>
          PitchAside<span style={{ color: T.volt300, marginLeft: 8 }}>Club</span>
        </div>
        <div style={{ display: 'flex', flex: 1 }} />
        <div style={{ display: 'flex', width: 2, height: 36, background: 'rgba(255,255,255,0.25)', marginRight: 22 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, color: 'rgba(255,255,255,0.8)' }}>
          {more > 0 ? `+${more} more in the full table` : 'The full table on PitchAside'}
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M7 17 L17 7 M9 7 H17 V15" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const query = new URL(req.url).searchParams;
  const last = rangeOf((k) => query.get(k));
  const found = await getTableCard(code, last);
  if (!found) return new Response('Not found', { status: 404 });
  const [fonts, photos] = await Promise.all([loadFonts(), loadPhotos(found.rows.map((r) => r.photoKey))]);
  const t = { ...found, rows: found.rows.map((r) => ({ ...r, photo: r.photoKey ? (photos.get(r.photoKey) ?? null) : null })) };
  return new ImageResponse(<Card t={t} />, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
