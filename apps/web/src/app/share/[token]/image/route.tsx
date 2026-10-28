import { ImageResponse } from 'next/og';
import { loadFonts } from '@/lib/og';
import { Brand, C, DISPLAY, Face, Star, initials, loadPhotos, names, oneLine } from '@/lib/og-card';
import { getMatchCard, type CardPlayer, type MatchCard } from '../match-card';
import { bibOf, teamName } from '@/lib/teams';
import type { TeamKey } from '@/lib/api';

export const dynamic = 'force-dynamic';

/*
 * The match-day card, "Floodlight Sticker": one loud thing (the Player of the Match, poster
 * size on a volt sticker) and everything else in quiet order under it: the day's points as
 * bars, the results as a grid of fixtures, the awards as a row of identical stickers, and the
 * pitch taking whatever height is left, so the card always ends full.
 */

/** The width inside the card's margins; every block lines up to it. */
const INNER = 968;
const GAP = 20;
const PANEL = { borderRadius: 28, background: 'rgba(0,0,0,0.3)', border: `2px solid ${C.line}` } as const;
/** Small, wide-spaced labels: the third and smallest size of type on the card. */
const LABEL = { fontSize: 17, fontWeight: 700, letterSpacing: 3, color: C.volt300 } as const;

/** A side's colour and name on the card: the game's own bibs (custom name first, then captain, then colour). */
function side(team: string, card: MatchCard) {
  const bib = bibOf(team as TeamKey, card.bibs);
  return { name: teamName(team as TeamKey, card.captains as Partial<Record<TeamKey, string>> | undefined, card.bibs), bg: bib.hex, fg: bib.ink ? C.ink : '#ffffff' };
}

/** "SAT 10 OCT". */
function dayDate(iso: string) {
  return new Date(`${iso}T12:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

/** Who led a stat on the day (ties share it), or null when nobody recorded any. */
function leader(players: CardPlayer[], key: 'goals' | 'assists' | 'saves') {
  const top = Math.max(0, ...players.map((p) => p[key]));
  if (!top) return null;
  return { who: players.filter((p) => p[key] === top), value: top };
}

/** On a sticker: their nickname, else first name and initial ("Emeka O."). */
function stickerName(p: CardPlayer) {
  if (p.nickname) return p.nickname;
  const [first, ...rest] = (p.fullName || p.name).split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

/** How wide poster type runs, in ems: satori can't measure, so a little over the font's real widths. */
const emWidth = (word: string) => [...word].reduce((w, ch) => w + (/[IJ\-'.]/.test(ch) ? 0.35 : /[MW&]/.test(ch) ? 0.95 : 0.76), 0);
const SPACE = 0.3;
const HERO_LEADING = 0.98;

/** The name broken into lines at this size, word by word; null if one word won't fit a line. */
function wrap(words: string[], size: number, width: number) {
  const lines: string[] = [];
  let line = 0;
  for (const word of words) {
    const w = emWidth(word) * size;
    if (w > width) return null;
    if (lines.length && line + SPACE * size + w <= width) {
      lines[lines.length - 1] += ` ${word}`;
      line += SPACE * size + w;
    } else {
      lines.push(word);
      line = w;
    }
  }
  return lines;
}

/**
 * Poster type: the biggest size the whole name fits at, on one line or two, in the room above
 * the stats row, broken between words. A long name drops a size rather than losing its second
 * line under the stats.
 */
function heroType(name: string, room: number, width: number) {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  for (const size of [92, 74, 58, 48, 40, 34, 30]) {
    const lines = wrap(words, size, width);
    if (lines && lines.length <= 2 && lines.length * size * HERO_LEADING <= room) return { size, lines };
  }
  return { size: 30, lines: [name.toUpperCase()] };
}

/** The star's photo as a square sticker, tilted as if just pressed into the album; initials without one. */
function Portrait({ p, size, tilt }: { p: { name: string; photo?: string | null }; size: number; tilt: number }) {
  const frame = { width: size, height: size, borderRadius: 32, border: `6px solid ${C.ink}`, transform: `rotate(${tilt}deg)`, boxShadow: '8px 8px 0 rgba(0,0,0,0.35)' } as const;
  return p.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.photo} width={size} height={size} style={{ ...frame, objectFit: 'cover' }} alt="" />
  ) : (
    <div style={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.pitch600, color: C.volt300, fontFamily: DISPLAY, fontWeight: 800, fontSize: Math.round(size * 0.36) }}>
      {initials(p.name)}
    </div>
  );
}

/**
 * The hero: the Player of the Match on a volt sticker, name at poster size, their day in three
 * numbers. Until the vote closes it's the question instead: a "?" where the face will be.
 */
function Hero({ card, players }: { card: MatchCard; players: CardPlayer[] }) {
  const H = 300;
  const potm = card.open ? null : card.awards.find((a) => a.key === 'potm');
  if (!potm) {
    const turnout = card.squadSize ? Math.min(1, card.ballots / card.squadSize) : 0;
    return (
      <div style={{ display: 'flex', height: H, padding: '34px 40px', borderRadius: 40, border: '4px dashed rgba(227,251,108,0.5)', background: `linear-gradient(150deg, ${C.pitch800} 0%, ${C.pitch950} 100%)` }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Star color={C.volt300} size={24} />
            <div style={LABEL}>PLAYER OF THE MATCH</div>
          </div>
          <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, lineHeight: 1, marginTop: 18 }}>
            {card.open ? 'Who was it?' : card.notYet ? 'Match day' : 'No vote this time'}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: C.muted, marginTop: 14 }}>
            {card.open ? 'Revealed when the vote closes' : card.notYet ? 'The vote opens at full time' : 'Nobody voted for this game'}
          </div>
          {card.open && card.squadSize > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
              <div style={{ display: 'flex', fontSize: 22, fontWeight: 700 }}>{`${card.ballots} of ${card.squadSize} have voted`}</div>
              <div style={{ display: 'flex', width: 420, height: 12, borderRadius: 12, background: 'rgba(255,255,255,0.12)', marginTop: 10 }}>
                <div style={{ display: 'flex', width: Math.max(12, Math.round(420 * turnout)), height: 12, borderRadius: 12, background: C.volt400 }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 230, height: 230, alignSelf: 'center', borderRadius: 32, border: '4px dashed rgba(227,251,108,0.45)', transform: 'rotate(4deg)' }}>
          <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 180, lineHeight: 1, color: C.volt300 }}>?</div>
        </div>
      </div>
    );
  }

  const byId = new Map(players.map((p) => [p.id, p]));
  const winners = (potm.ids ?? []).map((id) => byId.get(id)).filter((p): p is CardPlayer => !!p);
  const star = winners.length === 1 ? winners[0] : null;
  const shown = winners.length > 1 ? { main: winners.map((w) => names(w).main).join(' & '), sub: null } : star ? names(star) : { main: potm.name, sub: null };
  const stats = [
    star?.ovr != null ? { k: 'OVR', v: star.ovr } : null,
    star ? { k: star.goals === 1 ? 'GOAL' : 'GOALS', v: star.goals } : null,
    star && star.assists ? { k: star.assists === 1 ? 'ASSIST' : 'ASSISTS', v: star.assists } : null,
    { k: potm.votes === 1 ? 'VOTE' : 'VOTES', v: potm.votes },
  ].filter((x): x is { k: string; v: number } => !!x);
  // The name's room: the hero's inside (300 less its padding and border), less the label, the
  // stats row and, with a nickname, the full name under it. Its width: beside the portrait.
  const room = 224 - 40 - 83 - (shown.sub ? 37 : 0);
  const hero = heroType(shown.main, room, INNER - 80 - 8 - 280 - 28);

  return (
    <div
      style={{
        display: 'flex',
        height: H,
        padding: '34px 40px',
        borderRadius: 40,
        border: `4px solid ${C.ink}`,
        background: `linear-gradient(150deg, ${C.volt300} 0%, ${C.volt400} 55%, #b8d42a 100%)`,
        boxShadow: '12px 12px 0 rgba(0,0,0,0.45)',
        color: C.ink,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, paddingRight: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Star color={C.ink} size={24} />
          <div style={{ ...LABEL, color: C.ink }}>
            {winners.length > 1 || potm.name.includes('&') ? 'PLAYERS OF THE MATCH' : potm.shared ? 'PLAYER OF THE MATCH · JOINT' : 'PLAYER OF THE MATCH'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', fontFamily: DISPLAY, fontWeight: 800, fontSize: hero.size, lineHeight: HERO_LEADING, letterSpacing: -1, marginTop: 16 }}>
          {hero.lines.map((line, i) => (
            <div key={i} style={oneLine}>
              {line}
            </div>
          ))}
        </div>
        {shown.sub && <div style={{ ...oneLine, fontSize: 24, fontWeight: 700, color: 'rgba(15,26,20,0.7)', marginTop: 8 }}>{shown.sub}</div>}
        <div style={{ display: 'flex', flexShrink: 0, gap: 34, marginTop: 'auto', paddingTop: 14, borderTop: `3px solid ${C.ink}` }}>
          {stats.map((s) => (
            <div key={s.k} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: 1 }}>{s.v}</div>
              <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>{s.k}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 280 }}>
        {winners.length > 1 ? (
          <div style={{ display: 'flex' }}>
            <Portrait p={winners[0]} size={170} tilt={-5} />
            <div style={{ display: 'flex', marginLeft: -60, marginTop: 60 }}>
              <Portrait p={winners[1]} size={170} tilt={5} />
            </div>
          </div>
        ) : (
          <Portrait p={star ?? { name: potm.name }} size={232} tilt={4} />
        )}
      </div>
    </div>
  );
}

/** A side's number on the day: points, or under winner stays points per game ("2.3"). */
const dayValue = (card: MatchCard, r: { pts: number; ppg?: number }) => (card.perGame ? (r.ppg ?? 0) : r.pts);
const dayLabel = (card: MatchCard, r: { pts: number; ppg?: number }) => (card.perGame ? (r.ppg ?? 0).toFixed(1) : String(r.pts));

/** The day's points as bars in each side's bib colour, longest first; the winner's in volt type. */
function DayBars({ card }: { card: MatchCard }) {
  const rows = card.standings.filter((r) => r.p > 0).slice(0, 4);
  const max = Math.max(card.perGame ? 0.1 : 1, ...rows.map((r) => dayValue(card, r)));
  // "2.3" is wider than "9": a little less bar, a little more room for the number.
  const barMax = card.perGame ? 150 : 170;
  return (
    <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={LABEL}>THE DAY</div>
        <div style={{ ...LABEL, color: C.muted }}>{card.perGame ? 'PTS PER GAME' : 'PTS'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-around', marginTop: 8 }}>
        {rows.map((r, i) => {
          const s = side(r.team, card);
          const won = card.teamOfTheDay?.team === r.team;
          return (
            <div key={r.team} style={{ display: 'flex', alignItems: 'center', height: 34 }}>
              <div style={{ display: 'flex', width: 30, fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: won ? C.volt300 : C.muted }}>{i + 1}</div>
              <div style={{ ...oneLine, width: 196, paddingRight: 12, fontSize: 23, fontWeight: 700, color: won ? C.volt300 : '#ffffff' }}>{s.name}</div>
              <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                <div style={{ display: 'flex', width: Math.max(10, Math.round((barMax * dayValue(card, r)) / max)), height: 24, borderRadius: 8, background: s.bg, border: `2px solid ${C.ink}` }} />
                <div style={{ display: 'flex', marginLeft: 10, fontSize: 16, fontWeight: 700, color: C.muted }}>{`${r.w}-${r.d}-${r.l}`}</div>
              </div>
              <div style={{ display: 'flex', width: card.perGame ? 60 : 44, justifyContent: 'flex-end', fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, color: won ? C.volt300 : '#ffffff' }}>{dayLabel(card, r)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The winning side, with only the games it won ("2–0 v Yellow"): the day's results belong to the
 * winners, not to a list of every score. Level at the top, it says so instead.
 */
function Winners({ card, width }: { card: MatchCard; width: number }) {
  const tod = card.teamOfTheDay;
  const panel = { ...PANEL, display: 'flex', flexDirection: 'column', width, padding: '20px 24px' } as const;
  if (!tod) {
    const top = card.standings.filter((r) => r.p > 0);
    const level = top.filter((r) => dayValue(card, r) === dayValue(card, top[0])).map((r) => side(r.team, card).name);
    return (
      <div style={panel}>
        <div style={LABEL}>TEAM OF THE DAY</div>
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, lineHeight: 1.05, marginTop: 14 }}>Level at the top</div>
        <div style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', lineClamp: 2, fontSize: 22, color: C.muted, marginTop: 8 }}>{card.perGame ? `${level.join(' and ')} finished on ${top[0] ? dayLabel(card, top[0]) : '0'} points a game` : `${level.join(' and ')} finished on ${top[0]?.pts ?? 0} points`}</div>
      </div>
    );
  }
  const s = side(tod.team, card);
  const wins = card.games.flatMap((g) => {
    const mine = g.teamA === tod.team ? { us: g.scoreA, them: g.scoreB, other: g.teamB } : g.teamB === tod.team ? { us: g.scoreB, them: g.scoreA, other: g.teamA } : null;
    return mine && mine.us > mine.them ? [mine] : [];
  });
  const shown = wins.length > 4 ? wins.slice(0, 3) : wins;
  const chipW = Math.floor((width - 48 - 4 - 8) / 2);
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Star color={C.volt300} size={20} />
        <div style={LABEL}>TEAM OF THE DAY</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
        <div style={{ display: 'flex', width: 22, height: 22, borderRadius: 6, background: s.bg, border: `2px solid ${C.ink}`, marginRight: 12, flexShrink: 0 }} />
        <div style={{ ...oneLine, flex: 1, minWidth: 0, fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, lineHeight: 1.1 }}>{s.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: C.volt300 }}>{dayLabel(card, tod)}</div>
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 2, color: C.volt300 }}>{card.perGame ? 'PER GAME' : 'PTS'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
        {shown.map((w, i) => {
          const o = side(w.other, card);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', width: chipW, height: 34, borderRadius: 9, overflow: 'hidden', border: `2px solid ${C.line}`, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: '100%', background: C.ink, fontFamily: DISPLAY, fontWeight: 800, fontSize: 19 }}>{`${w.us}–${w.them}`}</div>
              <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 3, background: o.bg, margin: '0 7px 0 9px', flexShrink: 0 }} />
              <div style={{ ...oneLine, flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, paddingRight: 8 }}>{`v ${o.name}`}</div>
            </div>
          );
        })}
        {wins.length > shown.length && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: chipW, height: 34, borderRadius: 9, border: `2px dashed ${C.line}`, fontSize: 16, fontWeight: 700, color: C.muted }}>{`+${wins.length - shown.length} more wins`}</div>
        )}
      </div>
    </div>
  );
}

/** Voted awards first (the order they're asked in), then what the scores show. */
const AWARD_ORDER = ['engine', 'passing', 'shooting', 'playmaker', 'dribbling', 'defending', 'smartest', 'movement', 'keeper', 'teammate', 'pace'];
type Counted = { key: 'goals' | 'assists' | 'saves'; title: string; unit: string };
const COUNTED: Counted[] = [
  { key: 'goals', title: 'Top Scorer', unit: 'goal' },
  { key: 'assists', title: 'Most Assists', unit: 'assist' },
  { key: 'saves', title: 'Most Saves', unit: 'save' },
];

/** The awards as a row (or two) of identical stickers: face, award, name, how many. */
function Stickers({ card, players, rows, tall = false }: { card: MatchCard; players: CardPlayer[]; rows: number; tall?: boolean }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const voted = (card.open ? [] : card.awards.filter((a) => a.key !== 'potm')).sort((a, b) => AWARD_ORDER.indexOf(a.key) - AWARD_ORDER.indexOf(b.key));
  const counted = COUNTED.flatMap((c) => {
    const l = leader(players, c.key);
    return l ? [{ key: c.key, title: c.title, team: null, name: l.who.map(stickerName).join(' & '), votes: l.value, shared: l.who.length > 1, ids: l.who.map((p) => p.id), unit: c.unit }] : [];
  });
  const all = [...voted.slice(0, 3), ...counted, ...voted.slice(3)];
  if (!all.length) return null;
  const perRow = 4;
  const shown = all.slice(0, perRow * rows);
  const more = all.length - shown.length;
  const w = (INNER - (perRow - 1) * 16) / perRow;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={LABEL}>{voted.length && counted.length ? 'AWARDS AND STATS' : voted.length ? 'AWARDS · VOTED BY THE PLAYERS' : 'THE DAY IN STATS'}</div>
        {more > 0 && <div style={{ ...LABEL, color: C.muted }}>{`+${more} MORE`}</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
        {shown.map((a) => {
          const who = (a.ids ?? []).map((id) => byId.get(id)).filter((p): p is CardPlayer => !!p);
          const title = a.key === 'teammate' && a.team ? `Best on ${side(a.team, card).name}` : a.title;
          const name = who.length ? who.map(stickerName).join(' & ') : a.name;
          const count = 'unit' in a ? `${a.votes} ${a.unit}${a.votes === 1 ? '' : 's'}` : `${a.votes} vote${a.votes === 1 ? '' : 's'}`;
          return (
            <div key={`${a.key}-${a.team ?? ''}`} style={{ ...PANEL, display: 'flex', flexDirection: 'column', justifyContent: tall ? 'center' : 'flex-start', width: w, height: tall ? 176 : 122, borderRadius: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ ...oneLine, fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: C.volt300 }}>{title.toUpperCase()}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <Face p={who[0] ?? { name: a.name }} size={tall ? 64 : 52} ring={C.pitch900} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <div style={{ ...oneLine, fontSize: 23, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
                  <div style={{ ...oneLine, fontSize: 16, lineHeight: 1.2, color: C.muted, marginTop: 2 }}>{`${count}${a.shared ? ' each' : ''}`}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Who goes on the pitch: the Best VII once voted, else the winning side, else who played. */
function onThePitch(card: MatchCard, players: CardPlayer[]) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const vii = (card.vii ?? []).map((id) => byId.get(id)).filter((p): p is CardPlayer => !!p);
  const tod = card.teamOfTheDay;
  if (vii.length >= 6) return { title: 'BEST VII OF THE DAY', onPitch: vii.slice(0, 6), bench: vii[6] ?? null, more: 0 };
  if (tod) {
    const squad = players.length
      ? players.filter((p) => p.team === tod.team)
      : (tod.players ?? []).map((name) => ({ id: name, name, short: name, photoKey: null, team: tod.team, ovr: null, goals: 0, assists: 0, saves: 0, yellow: 0, red: 0 }));
    if (squad.length) {
      const onPitch = squad.slice(0, 8);
      return { title: `TEAM OF THE DAY · ${side(tod.team, card).name.toUpperCase()} · W${tod.w} D${tod.d} L${tod.l}`, onPitch, bench: null, more: squad.length - onPitch.length };
    }
  }
  if (!players.length) return null;
  const onPitch = players.slice(0, 8);
  return { title: `${card.notYet ? "WHO'S PLAYING" : 'WHO PLAYED'} · ${players.length}`, onPitch, bench: null as CardPlayer | null, more: players.length - onPitch.length };
}

/**
 * A player on the pitch, FPL style: face in their bib colour, the day's goals/assists/saves on a
 * badge top right, their rating on a badge bottom left, and their name on a tag under the face.
 */
function PitchPlayer({ p, card, size }: { p: CardPlayer; card: MatchCard; size: number }) {
  const bib = p.team ? side(p.team, card) : null;
  const tally = [p.goals ? `${p.goals}G` : null, p.assists ? `${p.assists}A` : null, p.saves ? `${p.saves}S` : null].filter(Boolean).join(' ');
  const badge = { display: 'flex', position: 'absolute', padding: '1px 9px', borderRadius: 999, fontSize: 17, fontWeight: 700, border: `2px solid ${C.ink}` } as const;
  const width = size + 64;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width }}>
      <div style={{ display: 'flex', position: 'relative' }}>
        <Face p={p} size={size} ring={bib?.bg ?? '#ffffff'} />
        {tally && <div style={{ ...badge, right: -22, top: -4, background: C.volt400, color: C.ink }}>{tally}</div>}
        {p.ovr != null && (
          <div style={{ ...badge, left: -18, bottom: -2, background: C.ink, color: C.volt300, fontFamily: DISPLAY, fontWeight: 800 }}>{p.ovr}</div>
        )}
      </div>
      <div style={{ ...oneLine, maxWidth: 176, marginTop: 8, padding: '3px 12px', borderRadius: 10, background: C.ink, color: '#ffffff', fontSize: 20, fontWeight: 700 }}>
        {p.short}
      </div>
    </div>
  );
}

/**
 * The pitch, FPL style: the Best VII of the Day once the vote has closed (six on the pitch, the
 * sub on the bench); before that, the Team of the Day's side; with no results, who played. It
 * fills whatever height the card has left, so it never runs into the footer.
 */
function Pitch({ card, players, compact = false }: { card: MatchCard; players: CardPlayer[]; compact?: boolean }) {
  const shown = onThePitch(card, players);
  if (!shown) return null;
  const { title, onPitch, bench, more } = shown;
  // Two lines of players, like a team sheet; smaller faces when the awards are showing above.
  const front = onPitch.length <= 4 ? onPitch : onPitch.slice(0, Math.ceil(onPitch.length / 2));
  const back = onPitch.slice(front.length);
  const size = compact ? 64 : onPitch.length <= 4 ? 112 : 92;
  // The lines are drawn over the playing area; the sub's bench sits to the side of it.
  const benchW = bench ? 190 : 0;
  const field = 956 - benchW;
  const chalk = 'rgba(255,255,255,0.3)';
  const row = (list: CardPlayer[]) => (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
      {list.map((p) => (
        <PitchPlayer key={p.id} p={p} card={card} size={size} />
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flex: 1, position: 'relative', borderRadius: 36, overflow: 'hidden', border: `3px solid ${C.line}` }}>
      {/* Mowed stripes, then the lines of a 5-a-side pitch: halfway line, centre circle, a box at each end */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: benchW, display: 'flex' }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ flex: 1, background: i % 2 ? '#14532d' : '#166534' }} />
        ))}
      </div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: field / 2 - 1, width: 3, background: chalk, display: 'flex' }} />
      <div style={{ position: 'absolute', top: '50%', marginTop: -55, left: field / 2 - 55, width: 110, height: 110, borderRadius: 110, border: `3px solid ${chalk}`, display: 'flex' }} />
      <div style={{ position: 'absolute', top: '50%', marginTop: -75, left: -3, width: 70, height: 150, border: `3px solid ${chalk}`, display: 'flex' }} />
      <div style={{ position: 'absolute', top: '50%', marginTop: -75, left: field - 64, width: 70, height: 150, border: `3px solid ${chalk}`, display: 'flex' }} />

      <div style={{ display: 'flex', flexDirection: 'column', width: field, paddingBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <div style={{ ...oneLine, maxWidth: field - 60, padding: '6px 18px', borderRadius: 999, background: 'rgba(7,31,16,0.85)', fontSize: 18, fontWeight: 700, letterSpacing: 3, color: C.volt300 }}>
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-around', paddingTop: 6 }}>
          {row(front)}
          {back.length > 0 && row(back)}
        </div>
        {more > 0 && (
          <div style={{ display: 'flex', position: 'absolute', right: 18, bottom: 12, fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>+{more} more</div>
        )}
      </div>
      {bench && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: benchW, background: C.pitch950, borderLeft: `3px solid ${C.line}` }}>
          <div style={{ ...LABEL, fontSize: 16, color: C.muted }}>SUB</div>
          <div style={{ display: 'flex', marginTop: 12 }}>
            <PitchPlayer p={bench} card={card} size={size} />
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ card }: { card: MatchCard }) {
  const players = card.players ?? [];
  const hasDay = card.standings.some((r) => r.p > 0);
  const hasPitch = !!onThePitch(card, players);
  const status = card.open ? 'VOTING OPEN' : card.notYet ? 'MATCH DAY' : 'FULL TIME';

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: `linear-gradient(180deg, ${C.pitch900} 0%, ${C.pitch950} 60%)`,
        fontFamily: 'DM Sans',
        color: '#ffffff',
        padding: '44px 56px 34px',
      }}
    >
      {/* Mowed stripes, barely there */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex' }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} style={{ flex: 1, background: i % 2 ? 'rgba(255,255,255,0.018)' : 'transparent' }} />
        ))}
      </div>

      {/* Masthead: the mark and where the day stands; the club and date; the group */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Brand />
        <div style={{ display: 'flex', padding: '10px 22px', borderRadius: 999, background: card.open || card.notYet ? C.volt400 : '#ffffff', color: C.ink, fontSize: 21, fontWeight: 700, letterSpacing: 2 }}>
          {status}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, marginTop: 22 }}>
        <div style={{ ...oneLine, flex: 1, minWidth: 0, fontFamily: DISPLAY, fontWeight: 800, fontSize: card.groupName.length > 20 ? 44 : 56, lineHeight: 1.05 }}>{card.groupName}</div>
        <div style={{ display: 'flex', flexShrink: 0, ...LABEL, fontSize: 20 }}>{dayDate(card.date)}</div>
      </div>
      {card.clubName && card.clubName.toLowerCase() !== card.groupName.toLowerCase() && (
        <div style={{ ...oneLine, ...LABEL, color: C.muted, marginTop: 4 }}>{card.clubName.toUpperCase()}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
        <Hero card={card} players={players} />
      </div>

      {hasDay && (
        <div style={{ display: 'flex', gap: GAP, height: hasPitch ? 214 : 250, marginTop: GAP + 8 }}>
          <DayBars card={card} />
          <Winners card={card} width={400} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: GAP }}>
        <Stickers card={card} players={players} rows={hasPitch ? 1 : 2} tall={!hasPitch} />
      </div>

      {hasPitch ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, marginTop: GAP }}>
          <Pitch card={card} players={players} compact={hasDay} />
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1 }} />
      )}

      {/* Footer, in the flow so nothing can run into it */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 21, color: C.muted }}>
        <div style={{ display: 'flex' }}>{card.notYet ? `${players.length} playing` : card.squadSize ? `${card.ballots} of ${card.squadSize} voted` : ''}</div>
        <div style={{ display: 'flex', fontWeight: 700, color: card.open ? C.volt300 : '#ffffff' }}>
          {card.open ? 'Played? Have your say on PitchAside' : card.notYet ? 'PitchAside' : 'Final result · PitchAside'}
        </div>
      </div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getMatchCard(token);
  if (!found) return new Response('Not found', { status: 404 });
  const [fonts, photos] = await Promise.all([loadFonts(), loadPhotos((found.players ?? []).map((p) => p.photoKey))]);
  const card = { ...found, players: (found.players ?? []).map((p) => ({ ...p, photo: p.photoKey ? (photos.get(p.photoKey) ?? null) : null })) };
  return new ImageResponse(<Card card={card} />, {
    width: 1080,
    height: 1350,
    fonts: fonts.length ? fonts : undefined,
    // Results move while voting is open; keep previews fresh-ish.
    headers: { 'Cache-Control': card.open ? 'public, max-age=60' : 'public, max-age=3600' },
  });
}
