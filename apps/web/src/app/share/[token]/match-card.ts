import type { Bibs } from '@pitchaside/shared';
/** Server-side: the match-day summary behind the share card and its page. */
export interface MatchCard {
  /** Each side's bib colour and name for this game. */
  bibs?: Bibs;
  groupName: string;
  clubName: string | null;
  date: string;
  open: boolean;
  /** Not ended yet: the vote opens at full time. */
  notYet?: boolean;
  ballots: number;
  squadSize: number;
  awards: { key: string; title: string; team?: string | null; captain?: string | null; name: string; votes: number; shared: boolean; ids?: string[] }[];
  teamOfTheDay: { team: string; captain?: string | null; players: string[]; w: number; d: number; l: number; pts: number; ppg?: number } | null;
  standings: { team: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; ppg?: number }[];
  /** Winner stays: the day is ranked by points per game (teams play different numbers of games). */
  perGame?: boolean;
  games: { teamA: string; teamB: string; scoreA: number; scoreB: number }[];
  /** Each side's captain, for sides named after them. */
  captains?: Record<string, string>;
  /** Everyone who played: their day in numbers and their card rating. */
  players?: CardPlayer[];
  /** Best VII of the Day once the vote has closed: six starters then the sub (player ids). */
  vii?: string[] | null;
  /** The Best VII's keeper (first in `vii`), when the vote had a keeper spot. */
  viiKeeper?: string | null;
}

export interface CardPlayer {
  id: string;
  name: string;
  /** Nickname or first name, for tight spots. */
  short: string;
  /** Their real name and nickname, kept apart (newer servers only). */
  fullName?: string;
  nickname?: string | null;
  photoKey: string | null;
  /** The photo itself, loaded before drawing (see loadPhotos). */
  photo?: string | null;
  team: string | null;
  ovr: number | null;
  goals: number;
  assists: number;
  saves: number;
  yellow: number;
  red: number;
}

export const API_URL = process.env.API_URL || 'http://localhost:3001';

export async function getMatchCard(token: string): Promise<MatchCard | null> {
  try {
    // A minute's cache: the page, its link preview and the image all ask for the same card.
    const res = await fetch(`${API_URL}/api/public/votes/${encodeURIComponent(token)}/card`, { next: { revalidate: 60 } });
    return res.ok ? ((await res.json()) as MatchCard) : null;
  } catch {
    return null;
  }
}
