/** Server-side: a group's table behind its share link (the group's join-link code). */
export interface TableCard {
  groupName: string;
  clubName: string | null;
  /** Match days the table counts. */
  games: number;
  /** Only the latest N match days, when the table was shared that way. */
  last: number | null;
  /** A date range the table was shared for (YYYY-MM-DD), when it was; newer servers only. */
  from?: string | null;
  to?: string | null;
  lastDate: string | null;
  /** 'rating': ranked by the card's rating, points beside it. Missing: by points (older servers). */
  rankedBy?: 'rating' | 'points';
  points: { win: number; draw: number; teamOfDay: number; potm: number };
  /** Everyone in the table; `rows` is the top ten. */
  total: number;
  rows: {
    id: string;
    name: string;
    short: string;
    /** Their real name and nickname, kept apart (newer servers only). */
    fullName?: string;
    nickname?: string | null;
    photoKey: string | null;
    /** The photo itself, loaded before drawing (see loadPhotos). */
    photo?: string | null;
    points: number;
    games: number;
    w: number;
    d: number;
    l: number;
    potmWins: number;
    /** Times on the Team of the Day (newer servers only). */
    teamOfDay?: number;
    form: ('W' | 'D' | 'L')[];
    move: number | null;
    ovr: number | null;
  }[];
}

export const API_URL = process.env.API_URL || 'http://localhost:3001';

/** Which match days a shared table covers: the latest N, and/or a date range. */
export interface TableLinkRange {
  last: number | null;
  from: string | null;
  to: string | null;
}

/** The link's own query again: "?last=5", "?from=…&to=…", or nothing. */
export function rangeQuery(r: TableLinkRange) {
  const q = new URLSearchParams();
  if (r.last) q.set('last', String(r.last));
  if (r.from) q.set('from', r.from);
  if (r.to) q.set('to', r.to);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** `?last=5&from=2026-10-01&to=2026-10-31` from a shared link, kept to sensible values. */
export function rangeOf(get: (key: string) => string | string[] | null | undefined): TableLinkRange {
  const iso = (v: string | string[] | null | undefined) => {
    const x = Array.isArray(v) ? v[0] : v;
    return x && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) ? x : null;
  };
  return { last: lastOf(get('last')), from: iso(get('from')), to: iso(get('to')) };
}

export async function getTableCard(code: string, range: TableLinkRange | number | null = null): Promise<TableCard | null> {
  try {
    const r = typeof range === 'number' || range === null ? { last: range, from: null, to: null } : range;
    // A minute's cache: the page, its link preview and the image all ask for the same table.
    const res = await fetch(`${API_URL}/api/public/groups/${encodeURIComponent(code)}/table${rangeQuery(r)}`, { next: { revalidate: 60 } });
    return res.ok ? ((await res.json()) as TableCard) : null;
  } catch {
    return null;
  }
}

/** `?last=5` from a shared link, kept to sensible values. */
export function lastOf(value: string | string[] | null | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n <= 52 ? n : null;
}
