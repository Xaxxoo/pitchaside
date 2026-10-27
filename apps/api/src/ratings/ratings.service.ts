import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { bibsFor, cleanBibs } from './bibs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Session, SessionKind, SessionStatus, kickoffFor } from '../sessions/entities/session.entity';
import { cleanPlan, withAway, withKeepers } from './plan';
import { dayTable } from './day-table';
import type { MatchPlan } from '@pitchaside/shared';
import { Group } from '../groups/entities/group.entity';
import { Player } from '../players/entities/player.entity';
import { Vote, VoteCategory } from './entities/vote.entity';
import { SessionGame } from './entities/session-game.entity';
import { MatchGoal } from './entities/match-goal.entity';
import { MatchEvent, type MatchEventKind } from './entities/match-event.entity';
import { GamePaid, paidForGames } from '../payments/game-dues';
import { localDate } from '../common/time.util';
import { shortDate } from '../common/format.util';
import { NotificationsService } from '../notifications/notifications.service';
import { clockRunning, timerChange, timerOf } from './timer';
import { lateArrivals, playedIn } from './late-arrivals';
import { checkKeepers } from './keepers';
import { pitchName, sheetName } from '../players/player-name';
import { Payment } from '../payments/entities/payment.entity';
import { DEFAULT_START, LEVEL_START, PROVISIONAL_UNDER, cardRating, replaySkill, type Skill, type SkillGame } from './skill';

/** Sides on match day. Colours live in the UI (Orange, Yellow, Blue, White, Green, Red). */
export const TEAM_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
/** What each side wears when nobody set bibs (DEFAULT_BIBS in @pitchaside/shared). */
/** Whether a score or scorer was signed by a captain or vice-captain ("Ada (captain)"). */
export const byCaptain = (by: string | null | undefined) => !!by && /\((vice-)?captain\)$/.test(by);
const DEFAULT_SIDE_COLOURS: Record<string, string> = { A: 'orange', B: 'yellow', C: 'blue', D: 'white', E: 'green', F: 'red' };
type TeamKey = (typeof TEAM_KEYS)[number];

/** The vote opens at full time (when the organiser ends the game) and stays open this long. */
/** Same as VOTE_HOURS in @pitchaside/shared: a Saturday game's vote closes Sunday evening. */
const VOTE_HOURS = 36;
/** Games ended before the vote was tied to full time keep their old window: match day plus a week. */
const LEGACY_WINDOW_DAYS = 7;


/** One goal as it's recorded: the side, the scorer, and the teammate who set it up (if anyone). */
export interface GoalInput {
  team: string;
  scorerId: string;
  assistId?: string | null;
}

/** What a player's abilities are made of, as votes describe them (GK is its own structure). */
export type Ability = 'SHO' | 'PAS' | 'TEC' | 'DEF' | 'IQ' | 'PHY' | 'MOV' | 'GK';

/**
 * Every vote category. `hint` is the one line the ballot shows. `abilities` is what an award is
 * evidence of; one nomination is one observation, split across them (never counted twice).
 */
export const CATEGORIES: { key: VoteCategory; title: string; hint?: string; abilities?: Ability[] }[] = [
  { key: VoteCategory.POTM, title: 'Player of the Match' },
  { key: VoteCategory.TEAMMATE, title: 'Best on your team' },
  { key: VoteCategory.VII, title: 'Best VII of the Day' },
  { key: VoteCategory.SHOOTING, title: 'Best Finisher', hint: 'Clinical: took their chances', abilities: ['SHO'] },
  { key: VoteCategory.PASSING, title: 'Best Passer', hint: 'Accurate, well-timed, useful passes', abilities: ['PAS'] },
  { key: VoteCategory.DRIBBLING, title: 'Best Dribbler', hint: 'Close control, beat their player, kept the ball', abilities: ['TEC'] },
  { key: VoteCategory.DEFENDING, title: 'Best Defender', hint: 'Tackles, marking, interceptions and blocks', abilities: ['DEF'] },
  { key: VoteCategory.SMARTEST, title: 'Smartest Player', hint: 'Good decisions and positioning, read the game', abilities: ['IQ'] },
  { key: VoteCategory.ENGINE, title: 'The Engine', hint: 'Never stopped: recovery runs, pressing, work rate', abilities: ['PHY', 'MOV'] },
  { key: VoteCategory.PLAYMAKER, title: 'Best Playmaker', hint: 'Made chances for teammates', abilities: ['PAS', 'IQ'] },
  { key: VoteCategory.MOVEMENT, title: 'Best Off-Ball Movement', hint: 'Found space, timed runs, always an option', abilities: ['MOV', 'IQ'] },
  { key: VoteCategory.KEEPER, title: 'Best Goalkeeper', hint: 'Only if someone kept goal: saves, positioning, distribution', abilities: ['GK'] },
  // No longer asked; earlier votes count towards The Engine.
  { key: VoteCategory.PACE, title: 'Fastest on the pitch', abilities: ['PHY', 'MOV'] },
];

/** The awards a voter can nominate for, up to MAX_AWARDS of them, each optional. */
export const AWARD_KEYS: VoteCategory[] = [
  VoteCategory.SHOOTING,
  VoteCategory.PASSING,
  VoteCategory.DRIBBLING,
  VoteCategory.DEFENDING,
  VoteCategory.SMARTEST,
  VoteCategory.ENGINE,
  VoteCategory.PLAYMAKER,
  VoteCategory.MOVEMENT,
  VoteCategory.KEEPER,
];
/** Every award can be given (Matt, 24 Oct; was three). An award still needs AWARD_MIN_VOTERS different people before it names anyone. */
export const MAX_AWARDS = AWARD_KEYS.length;
/** Best VII of the Day: six starters and a sub, asked when there are at least 8 others to choose from. */
export const VII_STARTERS = 6;
const VII_MIN_OTHERS = 8;
/** Picks from outside the voter's own team, so a Best VII isn't just your mates. */
export const VII_MIN_OTHER_TEAMS = 2;
/** An award needs nominations from this many different voters before it names a winner. */
export const AWARD_MIN_VOTERS = 3;

const titleOf = (key: VoteCategory) => CATEGORIES.find((c) => c.key === key)?.title ?? key;

/** Ratings need a few games of votes before they reach the extremes. */
const RATING_PRIOR = 6;
/** How far nominations lift a card attribute above the player's skill: up to +20, never down. */
const VOTE_WEIGHT = 8;
const VOTE_UP_MAX = 20;

/**
 * League points: results first, then the day's honours. Every short game on match day counts
 * (3 for a win, 1 for a draw); finishing top of the day's table (Team of the Day) and winning
 * Player of the Match each add a bonus. Votes still shape the player card, not the table.
 */
export const POINTS = { win: 3, draw: 1, teamOfDay: 2, potm: 3 };

/** Which match days a table counts: the latest N, and/or between two dates (YYYY-MM-DD, inclusive). */
export interface TableRange {
  last?: number;
  from?: string;
  to?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A table range from a link's query (?last=5, ?from=2026-10-01&to=2026-10-31); anything odd is left out. */
export function tableRange(query: { last?: unknown; from?: unknown; to?: unknown }): TableRange {
  const n = Number(query.last);
  const day = (v: unknown) => (typeof v === 'string' && ISO_DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
  const out: TableRange = {};
  if (Number.isInteger(n) && n >= 1 && n <= 52) out.last = n;
  const from = day(query.from);
  const to = day(query.to);
  if (from) out.from = from;
  if (to && (!from || to >= from)) out.to = to;
  return out;
}

export function tablePoints(r: Pick<PlayerRatings, 'record' | 'teamOfDay' | 'potmWins'>) {
  return r.record.w * POINTS.win + r.record.d * POINTS.draw + r.teamOfDay * POINTS.teamOfDay + r.potmWins * POINTS.potm;
}

type SquadMember = Pick<Player, 'id' | 'firstName' | 'lastName' | 'nickname'> & { photoKey?: string | null };

/** The abilities on the card, outfield first; GK only for players nominated in goal. */
export const ABILITIES: Ability[] = ['SHO', 'PAS', 'TEC', 'DEF', 'IQ', 'PHY', 'MOV', 'GK'];

/**
 * What teammates' nominations say about one award for one player: how many, from how many
 * different people, and what share of the votes they could have had. `enough` once at least
 * AWARD_MIN_VOTERS different people nominated them: below that it's not evidence yet.
 */
export interface AwardEvidence {
  nominations: number;
  voters: number;
  games: number;
  share: number;
  enough: boolean;
}

export interface PlayerRatings {
  games: number;
  ballotsSeen: number;
  votes: Record<VoteCategory, number>;
  potmWins: number;
  /** Results from games with bibs + score recorded. */
  record: { w: number; d: number; l: number };
  /** Match days finished top of the day's table. */
  teamOfDay: number;
  points: number;
  /** Skill rating from match results (Elo, ~1500 average); drives team balancing. */
  skill: number;
  /** Fewer than PROVISIONAL_UNDER scored games so far: the card is still settling. */
  provisional: boolean;
  ovr: number | null;
  attributes: Record<Ability, number | null>;
  goals: number;
  assists: number;
  /** Cards and saves recorded on match day. */
  yellowCards: number;
  redCards: number;
  saves: number;
  /** Times someone put them in their Best VII (starter or sub). */
  viiPicks: number;
  /** Times they made the Best VII of the Day. */
  viiOfDay: number;
  /** Times they won Best on their team. */
  bestOnTeam: number;
  /** Per award (Fastest counts as The Engine): the evidence behind the attributes. */
  evidence: Partial<Record<VoteCategory, AwardEvidence>>;
  /** Games where awards were voted on: how much the attributes rest on. */
  evidenceGames: number;
}

export function emptyVotes(): Record<VoteCategory, number> {
  return Object.fromEntries(Object.values(VoteCategory).map((k) => [k, 0])) as Record<VoteCategory, number>;
}

/**
 * The trial rating (decided 19 Oct: 40 individual stats, 40 votes, 20 team results), worked out
 * beside the card's rating so the organiser can compare before it replaces anything.
 *
 * Each part is where the player stands in the club on one measure (a percentile), pulled toward
 * the middle while there's little evidence, then put on the card's 40–99 scale:
 * - stats: goals plus three quarters of an assist, per game, with a little for each save and a
 *   little off for each card (Matt, 20 Oct: cards cost a small amount);
 * - votes: how often the ballots they could be on named them Player of the Match (40%) or put
 *   them in a Best VII (40%), plus their average share of the awards with enough evidence (20%).
 *   Shares, not raw counts, so a big group's votes don't outweigh a small one's;
 * - results: the results rating that balances teams.
 * No evidence on a measure counts as the middle, never as a penalty.
 */
export const TRIAL_WEIGHTS = { stats: 0.4, votes: 0.4, results: 0.2 } as const;
/** In goals: a save is worth a tenth of one; a yellow card costs a quarter, a red a whole goal. */
export const SAVE_WORTH = 0.1;
export const YELLOW_COST = 0.25;
export const RED_COST = 1;
/** How much evidence it takes before a part can move far from the middle: half way at this many. */
const TRIAL_PRIOR = { stats: 3, votes: 6, results: 3 } as const;

export interface TrialRating {
  trial: number;
  parts: { stats: number; votes: number; results: number };
}

export function trialRatings(rows: (PlayerRatings & { player: { id: string } })[]): Map<string, TrialRating> {
  const played = rows.filter((r) => r.games > 0);
  const awardShare = (r: PlayerRatings) => {
    const shares = Object.values(r.evidence ?? {}).filter((e): e is AwardEvidence => !!e && e.enough).map((e) => e.share);
    return shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : 0;
  };
  const measure = {
    stats: (r: PlayerRatings) =>
      r.games ? (r.goals + 0.75 * r.assists + SAVE_WORTH * (r.saves ?? 0) - YELLOW_COST * (r.yellowCards ?? 0) - RED_COST * (r.redCards ?? 0)) / r.games : null,
    votes: (r: PlayerRatings) =>
      r.ballotsSeen ? 0.4 * (r.votes.potm ?? 0) / r.ballotsSeen + 0.4 * Math.min(1, r.viiPicks / r.ballotsSeen) + 0.2 * awardShare(r) : null,
    results: (r: PlayerRatings) => (r.games ? r.skill : null),
  };
  const evidence = { stats: (r: PlayerRatings) => r.games, votes: (r: PlayerRatings) => r.ballotsSeen, results: (r: PlayerRatings) => r.games };
  const out = new Map<string, TrialRating>();
  const parts = (Object.keys(TRIAL_WEIGHTS) as (keyof typeof TRIAL_WEIGHTS)[]).map((k) => {
    const values = played.map((r) => measure[k](r)).filter((v): v is number => v !== null);
    return { k, values };
  });
  for (const r of rows) {
    const p = {} as TrialRating['parts'];
    for (const { k, values } of parts) {
      const v = r.games ? measure[k](r) : null;
      // Percentile: share below, plus half of those level (so a tie in the middle sits at the middle).
      const pct = v === null || values.length < 2 ? 0.5 : (values.filter((x) => x < v).length + 0.5 * (values.filter((x) => x === v).length - 1)) / (values.length - 1);
      const n = evidence[k](r);
      const pulled = 0.5 + (pct - 0.5) * (n / (n + TRIAL_PRIOR[k]));
      p[k] = Math.round(1 + 98 * pulled);
    }
    out.set(r.player.id, { parts: p, trial: Math.round(TRIAL_WEIGHTS.stats * p.stats + TRIAL_WEIGHTS.votes * p.votes + TRIAL_WEIGHTS.results * p.results) });
  }
  return out;
}

/** The numbers a player's stats compare with everyone else's. */
export const COMPARED = ['goals', 'assists', 'potmWins', 'viiOfDay', 'wins', 'points', 'games', 'bestOnTeam', 'teamOfDay', 'saves', 'yellowCards', 'redCards'] as const;
export type ComparedStat = (typeof COMPARED)[number];
/** Per number: the average in total and per game, this player's rank (ties share it; 0 if not played) and out of how many. */
export type StatCompare = Record<ComparedStat, { avg: number; avgPerGame: number; rank: number; of: number }>;

const statOf = (r: PlayerRatings, k: ComparedStat) => (k === 'wins' ? r.record.w : r[k]);

/** How `playerId` compares with everyone in `rows` (those who played), number by number. */
export function compareStats(rows: (PlayerRatings & { player: { id: string } })[], playerId: string): StatCompare {
  const me = rows.find((r) => r.player.id === playerId);
  const round = (n: number) => Math.round(n * 10) / 10;
  return Object.fromEntries(
    COMPARED.map((k) => {
      const values = rows.map((r) => statOf(r, k));
      const total = values.reduce((n, v) => n + v, 0);
      const perGame = rows.reduce((n, r) => n + (r.games ? statOf(r, k) / r.games : 0), 0);
      const mine = me ? statOf(me, k) : 0;
      return [
        k,
        {
          avg: rows.length ? round(total / rows.length) : 0,
          avgPerGame: rows.length ? Math.round((perGame / rows.length) * 100) / 100 : 0,
          rank: me ? 1 + values.filter((v) => v > mine).length : 0,
          of: rows.length,
        },
      ];
    }),
  ) as StatCompare;
}

/** Ratings for someone who hasn't played: zeros, and no card yet. */
export function blankRatings(): PlayerRatings {
  return {
    games: 0,
    ballotsSeen: 0,
    votes: emptyVotes(),
    potmWins: 0,
    record: { w: 0, d: 0, l: 0 },
    teamOfDay: 0,
    points: 0,
    skill: DEFAULT_START,
    provisional: true,
    ovr: null,
    attributes: Object.fromEntries(ABILITIES.map((a) => [a, null])) as Record<Ability, number | null>,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    viiPicks: 0,
    viiOfDay: 0,
    bestOnTeam: 0,
    evidence: {},
    evidenceGames: 0,
  };
}

/** Nominations an ability got (`n`) and what a random pick would have given (`e`). */
export type AbilityEvidence = Record<Ability, { n: number; e: number }>;
export const noEvidence = (): AbilityEvidence => Object.fromEntries(ABILITIES.map((a) => [a, { n: 0, e: 0 }])) as AbilityEvidence;

/**
 * The player card. Every attribute starts from the skill rating (on the card's scale), and award
 * nominations lift it when they come more often than a random pick would give. Never down: not
 * being nominated isn't evidence of anything (they may have had a quiet game, or played a
 * supporting role). PRIOR keeps a low-turnout week from swinging it. GK shows only for players
 * nominated in goal. OVR is the best four attributes plus a Player of the Match bonus.
 */
export function playerCard(skill: Skill | undefined, abilities: AbilityEvidence, potmVotes: number, ballotsSeen: number) {
  const base = cardRating(skill?.rating ?? DEFAULT_START);
  const rate = ({ n, e }: { n: number; e: number }) => {
    const lift = Math.round((VOTE_WEIGHT * (n - e)) / (e + RATING_PRIOR));
    return Math.max(40, Math.min(99, base + Math.max(0, Math.min(VOTE_UP_MAX, lift))));
  };
  const attributes = Object.fromEntries(
    ABILITIES.map((a) => [a, a === 'GK' && abilities.GK.n === 0 ? null : rate(abilities[a])]),
  ) as Record<Ability, number | null>;
  // OVR uses a player's best four attributes, so keepers aren't dragged down by SHO and vice versa.
  const best = Object.values(attributes)
    .filter((v): v is number => v !== null)
    .sort((x, y) => y - x)
    .slice(0, 4);
  const potmBoost = ballotsSeen > 0 ? Math.min(6, Math.round((potmVotes / ballotsSeen) * 12)) : 0;
  return {
    skill: Math.round(skill?.rating ?? DEFAULT_START),
    provisional: (skill?.games ?? 0) < PROVISIONAL_UNDER,
    attributes,
    ovr: Math.min(99, Math.round(best.reduce((x, y) => x + y, 0) / best.length) + potmBoost),
  };
}

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    @InjectRepository(Vote) private votesRepo: Repository<Vote>,
    @InjectRepository(SessionGame) private gamesRepo: Repository<SessionGame>,
    @InjectRepository(MatchGoal) private goalsRepo: Repository<MatchGoal>,
    @InjectRepository(Session) private sessionsRepo: Repository<Session>,
    @InjectRepository(Group) private groupsRepo: Repository<Group>,
    @InjectRepository(MatchEvent) private eventsRepo: Repository<MatchEvent>,
    @Optional() private notifications?: NotificationsService,
  ) {}

  // ── Voting window & squad ──

  /**
   * When players can vote: from the moment the organiser ends the game, for 36 hours. Nobody
   * votes on a game that hasn't been played, and a game reopened by mistake stops taking votes
   * until it's ended again (keeping its first full-time, so reopening never stretches the vote).
   */
  private window(session: Session) {
    const eligible = session.kind !== SessionKind.DUES && session.status !== SessionStatus.CANCELLED;
    const ended = session.status === SessionStatus.COMPLETED;
    let opensAt: Date | null = null;
    let closesAt: Date | null = null;
    if (session.voteOpensAt) {
      opensAt = new Date(session.voteOpensAt);
      closesAt = new Date(opensAt.getTime() + VOTE_HOURS * 3_600_000);
    } else if (ended) {
      opensAt = new Date(`${session.date}T00:00:00`);
      closesAt = new Date(opensAt.getTime() + (LEGACY_WINDOW_DAYS + 1) * 86_400_000);
    }
    // Everyone who came has voted: no need to wait out the rest of the window.
    if (closesAt && session.voteClosedAt && new Date(session.voteClosedAt) < closesAt) closesAt = new Date(session.voteClosedAt);
    const now = Date.now();
    const open = eligible && ended && !!opensAt && !!closesAt && now >= opensAt.getTime() && now < closesAt.getTime();
    return {
      opensAt,
      closesAt,
      open,
      notYet: eligible && !ended,
      /** The vote has finished: results can be shown. */
      closed: eligible && ended && !!closesAt && now >= closesAt.getTime(),
    };
  }

  /** For the reminders: whether this game is taking votes right now. */
  isVoteOpen(session: Session) {
    return this.window(session).open;
  }

  /** For the reminders: when this game's vote closes (null before full time). */
  voteClosesAt(session: Session) {
    return this.window(session).closesAt;
  }

  /** Once a score is in, the teams are the ones that score was played by: nobody moves until the scores are deleted. */
  private async scoresIn(sessionId: string) {
    return (await this.gamesRepo.count({ where: { sessionId } })) > 0;
  }

  /** Everyone with a payment row for the game is in the squad, except anyone who didn't come. */
  private squad(session: Session): SquadMember[] {
    return (session.payments ?? [])
      .filter((p) => p.player && p.attendance !== 'no_show')
      .map((p) => ({ id: p.player.id, firstName: p.player.firstName, lastName: p.player.lastName, nickname: p.player.nickname ?? null, photoKey: p.player.photoKey ?? null }));
  }

  /** Max age for a voting link: 30 days after the vote opened. */
  private static readonly TOKEN_MAX_AGE_MS = 30 * 24 * 3_600_000;

  private async loadSessionByToken(token: string) {
    const session = await this.sessionsRepo.findOne({
      where: { votingToken: token },
      relations: ['group', 'payments', 'payments.player'],
    });
    if (!session) throw new NotFoundException('This voting link is invalid');
    if (session.voteOpensAt && Date.now() - new Date(session.voteOpensAt).getTime() > RatingsService.TOKEN_MAX_AGE_MS) {
      throw new NotFoundException('This voting link has expired');
    }
    return session;
  }

  private async loadSession(id: string, organizationId: string) {
    const session = await this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoinAndSelect('session.group', 'group')
      .leftJoinAndSelect('session.payments', 'payment')
      .leftJoinAndSelect('payment.player', 'player')
      .where('session.id = :id', { id })
      .andWhere('group.organizationId = :organizationId', { organizationId })
      .getOne();
    if (!session) throw new NotFoundException('Game not found');
    return session;
  }

  /**
   * The vote's standings. While the vote is open only the turnout is shared, so nobody votes
   * with the crowd and the WhatsApp group doesn't argue mid-vote; the winners show at the close.
   */
  private async results(session: Session) {
    const hidden = this.window(session).open;
    const votes = await this.votesRepo.find({ where: { sessionId: session.id } });
    const squad = this.squad(session);
    const byId = new Map(squad.map((p) => [p.id, p]));
    const ballots = new Set(votes.map((v) => v.voterId)).size;
    const sideOf = (id: string) => this.teamOf(session, session.payments?.find((p) => p.playerId === id)?.team ?? null);

    /** Standings in one category: nominations per player, most first. Best VII counts a sub pick as half. */
    const tally = (category: VoteCategory, team?: string) => {
      const counts = new Map<string, number>();
      const score = new Map<string, number>();
      for (const v of votes) {
        const weight = v.category === category ? 1 : category === VoteCategory.VII && v.category === VoteCategory.VII_SUB ? 0.5 : 0;
        if (!weight) continue;
        counts.set(v.nomineeId, (counts.get(v.nomineeId) ?? 0) + 1);
        score.set(v.nomineeId, (score.get(v.nomineeId) ?? 0) + weight);
      }
      return [...counts.entries()]
        .map(([playerId, count]) => ({ player: byId.get(playerId) ?? null, playerId, count, score: score.get(playerId) ?? 0 }))
        .filter((s) => s.player && (!team || sideOf(s.playerId) === team))
        .sort((x, y) => y.score - x.score || y.count - x.count)
        .map(({ score: _score, ...rest }) => rest);
    };
    const votersIn = (category: VoteCategory) => new Set(votes.filter((v) => v.category === category).map((v) => v.voterId)).size;

    // Player of the Match always; the rest when this game was voted on for them.
    const asked = CATEGORIES.filter((c) => c.key === VoteCategory.POTM || votes.some((v) => v.category === c.key));
    const categories = asked.flatMap((c) => {
      if (c.key === VoteCategory.TEAMMATE) {
        // Best on your team is a result per side: "Best on Orange: Ada".
        return TEAM_KEYS.slice(0, session.teamCount)
          .map((team) => ({ key: c.key, title: c.title, team: team as string | null, standings: tally(c.key, team), voters: 0, inconclusive: false }))
          .filter((t) => t.standings.length > 0)
          .map((t) => ({ ...t, standings: hidden ? [] : t.standings }));
      }
      const voters = votersIn(c.key);
      // An award with nominations from too few voters names nobody: not enough evidence.
      const inconclusive = AWARD_KEYS.includes(c.key) && voters < AWARD_MIN_VOTERS;
      const standings = hidden || inconclusive ? [] : tally(c.key);
      // Best VII of the Day: the seven most picked.
      return [{ key: c.key, title: c.title, team: null as string | null, standings: c.key === VoteCategory.VII ? standings.slice(0, VII_STARTERS + 1) : standings, voters, inconclusive }];
    });
    return { ballots, squadSize: squad.length, hidden, categories, bibs: bibsFor(session) };
  }

  // ── Admin ──

  /** Creates the vote link for a game on first use. */
  async ensureVotingToken(sessionId: string) {
    const session = await this.sessionsRepo.findOneOrFail({ where: { id: sessionId } });
    if (!session.votingToken) {
      session.votingToken = randomBytes(6).toString('base64url');
      await this.sessionsRepo.update(session.id, { votingToken: session.votingToken });
    }
    return session.votingToken;
  }

  async getSessionVoting(sessionId: string, organizationId: string) {
    const session = await this.loadSession(sessionId, organizationId);
    session.votingToken = await this.ensureVotingToken(session.id);
    const w = this.window(session);
    return {
      token: session.votingToken,
      open: w.open,
      notYet: w.notYet,
      closesAt: w.closesAt,
      /** Who has voted (never what they picked), so the organiser can see who's still to vote. */
      voted: await this.votersOf(session.id),
      ...(await this.results(session)),
    };
  }

  /** The players who've voted in a game: their ids only, never what they picked. */
  async votersOf(sessionId: string) {
    const rows = await this.votesRepo.find({ where: { sessionId }, select: { voterId: true } });
    return [...new Set(rows.map((v) => v.voterId))];
  }

  /** Games this player can vote in right now, and whether they already have. */
  async openVotesFor(playerId: string, organizationId: string) {
    const sessions = await this.gamesQuery(organizationId)
      .innerJoin('session.payments', 'mine', 'mine.playerId = :playerId', { playerId })
      .leftJoinAndSelect('session.group', 'g')
      .getMany();
    const open = sessions.filter((s) => this.window(s).open && this.cameTo(s, playerId));
    const result = [];
    for (const s of open) {
      const token = await this.ensureVotingToken(s.id);
      // Turnout, with the faces of who's voted (never what they picked): nobody is named for not voting.
      const full = await this.sessionsRepo.findOne({ where: { id: s.id }, relations: ['payments', 'payments.player'] });
      const squad = full ? this.squad(full) : [];
      const voters = new Set(await this.votersOf(s.id));
      result.push({
        token,
        sessionId: s.id,
        groupId: s.groupId,
        groupName: s.group?.name,
        date: s.date,
        /** When the vote shuts: the banner counts down to it. */
        closesAt: this.window(s).closesAt,
        voted: voters.has(playerId),
        ballots: squad.filter((p) => voters.has(p.id)).length,
        squadSize: squad.length,
        voters: squad
          .filter((p) => voters.has(p.id) && p.id !== playerId)
          .slice(0, 6)
          .map((p) => ({ id: p.id, name: sheetName(p), photoKey: p.photoKey ?? null })),
      });
    }
    return result;
  }

  // ── Public ballot ──

  async getBallot(token: string) {
    const session = await this.loadSessionByToken(token);
    const w = this.window(session);
    const r = await this.results(session);
    return {
      groupName: session.group?.name,
      date: session.date,
      open: w.open,
      notYet: w.notYet,
      closesAt: w.closesAt,
      categories: [VoteCategory.POTM, ...(this.hasTeams(session) ? [VoteCategory.TEAMMATE] : [])].map((key) => ({ key, title: titleOf(key) })),
      // Best VII of the Day: six starters and a sub, at least two from other teams (null: too few played).
      vii: this.viiAsked(session) ? { starters: VII_STARTERS, subs: 1, minOtherTeams: VII_MIN_OTHER_TEAMS } : null,
      awards: AWARD_KEYS.map((key) => {
        const c = CATEGORIES.find((x) => x.key === key)!;
        return { key, title: c.title, hint: c.hint ?? '' };
      }),
      maxAwards: MAX_AWARDS,
      // Each player's side, so the ballot can group them by team (own team first).
      squad: this.squad(session).map((p) => ({
        ...p,
        team: this.teamOf(session, session.payments?.find((x) => x.playerId === p.id)?.team ?? null),
      })),
      teamCount: session.teamCount,
      captains: this.captainsOf(session),
      /** Each side's bib colour and name for this game (its own, else the group's). */
      bibs: bibsFor(session),
      ballots: r.ballots,
      squadSize: r.squadSize,
    };
  }

  /** Enough played for a Best VII to mean something: seven picks from at least eight others. */
  private viiAsked(session: Session) {
    return this.squad(session).length - 1 >= VII_MIN_OTHERS;
  }

  /** At least two sides were picked, so "best on your team" means something. */
  private hasTeams(session: Session) {
    return new Set(this.squad(session).map((p) => this.teamOf(session, session.payments?.find((x) => x.playerId === p.id)?.team ?? null)).filter(Boolean)).size >= 2;
  }

  /** On the game's list and not marked as didn't come. */
  private cameTo(session: Session, playerId: string) {
    return (session.payments ?? []).some((p) => p.playerId === playerId && p.attendance !== 'no_show');
  }

  /** The person's player record among those who played (they may play for several clubs). */
  private voterIn(session: Session, playerIds: string[]) {
    const voter = (session.payments ?? []).find((p) => playerIds.includes(p.playerId) && p.attendance !== 'no_show')?.player;
    if (!voter) throw new ForbiddenException('Only players who played in this game can vote');
    return voter;
  }

  /** The signed-in player's existing picks for this game. */
  async myBallot(token: string, playerIds: string[]) {
    const session = await this.loadSessionByToken(token);
    const voter = this.voterIn(session, playerIds);
    const existing = await this.votesRepo.find({ where: { sessionId: session.id, voterId: voter.id } });
    return {
      playerId: voter.id,
      firstName: voter.firstName,
      // Best VII's six starters come back as a list; every other category is one pick.
      picks: {
        ...Object.fromEntries(existing.filter((v) => v.category !== VoteCategory.VII).map((v) => [v.category, v.nomineeId])),
        ...(existing.some((v) => v.category === VoteCategory.VII)
          ? { [VoteCategory.VII]: existing.filter((v) => v.category === VoteCategory.VII).map((v) => v.nomineeId) }
          : {}),
      },
    };
  }

  /**
   * One ballot: Player of the Match; the best on your own team (when teams were set); Best VII of
   * the Day, six starters and a sub with at least two from other teams (when enough played); and
   * any of the awards, each optional. Nobody can pick themselves or anyone who didn't play.
   */
  async submitVotes(token: string, playerIds: string[], picks: Record<string, string | string[] | null | undefined>) {
    const session = await this.loadSessionByToken(token);
    const w = this.window(session);
    if (!w.open) throw new BadRequestException(w.notYet ? 'Voting opens when the game ends' : 'Voting has closed for this game');

    const voter = this.voterIn(session, playerIds);
    const squadIds = new Set(this.squad(session).map((p) => p.id));
    const teamOf = (id: string) => this.teamOf(session, session.payments?.find((p) => p.playerId === id)?.team ?? null);
    const myTeam = teamOf(voter.id);
    const check = (nomineeId: unknown) => {
      if (typeof nomineeId !== 'string' || !squadIds.has(nomineeId)) throw new BadRequestException('You can only vote for players in this game');
      if (nomineeId === voter.id) throw new BadRequestException("Nice try — you can't vote for yourself");
      return nomineeId;
    };
    const rows: Partial<Vote>[] = [];
    const add = (category: VoteCategory, nomineeId: string) => rows.push({ sessionId: session.id, voterId: voter.id, category, nomineeId });

    if (!picks[VoteCategory.POTM]) throw new BadRequestException('Pick a Player of the Match');
    add(VoteCategory.POTM, check(picks[VoteCategory.POTM]));

    // Best on your team: required when you were on a side with teammates.
    const mates = [...squadIds].filter((id) => id !== voter.id && myTeam && teamOf(id) === myTeam);
    if (this.hasTeams(session) && mates.length) {
      const mate = picks[VoteCategory.TEAMMATE];
      if (!mate) throw new BadRequestException('Pick the best player on your team');
      if (teamOf(check(mate)) !== myTeam) throw new BadRequestException('Pick the best player from your own team');
      add(VoteCategory.TEAMMATE, mate as string);
    }

    if (this.viiAsked(session)) {
      const starters = picks[VoteCategory.VII];
      const sub = picks[VoteCategory.VII_SUB];
      if (!Array.isArray(starters) || starters.length !== VII_STARTERS || !sub) {
        throw new BadRequestException(`Pick your Best VII: ${VII_STARTERS} starters and a sub`);
      }
      const seven = [...starters, sub].map(check);
      if (new Set(seven).size !== seven.length) throw new BadRequestException('Pick seven different players for your Best VII');
      // At least two from other teams (or all of them, if fewer played).
      const elsewhere = [...squadIds].filter((id) => id !== voter.id && myTeam && teamOf(id) && teamOf(id) !== myTeam).length;
      const need = Math.min(VII_MIN_OTHER_TEAMS, elsewhere);
      if (seven.filter((id) => teamOf(id) && teamOf(id) !== myTeam).length < need) {
        throw new BadRequestException(`Pick at least ${need} players from other teams for your Best VII`);
      }
      for (const id of starters as string[]) add(VoteCategory.VII, id);
      add(VoteCategory.VII_SUB, sub as string);
    }

    const handled = new Set<string>([VoteCategory.POTM, VoteCategory.TEAMMATE, VoteCategory.VII, VoteCategory.VII_SUB]);
    const awards = Object.entries(picks).filter(([k, v]) => !handled.has(k) && v);
    for (const [category] of awards) {
      if (!AWARD_KEYS.includes(category as VoteCategory)) throw new BadRequestException(`Unknown category "${category}"`);
    }
    if (awards.length > MAX_AWARDS) throw new BadRequestException(`Up to ${MAX_AWARDS} awards`);
    for (const [category, nomineeId] of awards) add(category as VoteCategory, check(nomineeId));

    // Re-voting replaces your previous ballot.
    await this.votesRepo.manager.transaction(async (m) => {
      await m.delete(Vote, { sessionId: session.id, voterId: voter.id });
      await m.save(Vote, rows.map((r) => m.create(Vote, r)));
    });
    // The last of the players who came has voted: close the vote now, so the result shows.
    const voters = new Set((await this.votesRepo.find({ where: { sessionId: session.id } })).map((v) => v.voterId));
    if (this.squad(session).every((p) => voters.has(p.id))) {
      session.voteClosedAt = new Date();
      await this.sessionsRepo.update(session.id, { voteClosedAt: session.voteClosedAt });
    }
    return this.results(session);
  }

  async getPublicResults(token: string) {
    const session = await this.loadSessionByToken(token);
    return this.results(session);
  }

  /**
   * Everything the match-day share card needs, by vote token: the winner of
   * each award, Team of the Day and the day's table.
   */
  async getMatchCard(token: string) {
    const session = await this.loadSessionByToken(token);
    const [results, games, group] = await Promise.all([
      this.results(session),
      this.gamesRepo.find({ where: { sessionId: session.id }, order: { createdAt: 'ASC' } }),
      this.groupsRepo.findOne({ where: { id: session.groupId }, relations: ['organization'] }),
    ]);
    const name = (p: SquadMember) => sheetName(p);
    // Empty while the vote is open: the winners show at the close.
    // Best VII of the Day is a team, not one winner: it isn't one of the card's awards.
    const awards = results.categories
      .filter((c) => c.key !== VoteCategory.VII)
      .map((c) => {
        const top = c.standings[0];
        if (!top?.player) return null;
        // A tie at the top is shared: "Chidi & Tunde".
        const tied = c.standings.filter((s) => s.count === top.count && s.player).map((s) => name(s.player!));
        return {
          key: c.key,
          title: c.title,
          // Best on your team is one award per side.
          team: c.team,
          captain: c.team ? (this.captainsOf(session)[c.team as TeamKey] ?? null) : null,
          name: tied.join(' & '),
          votes: top.count,
          shared: tied.length > 1,
          /** Who won it (more than one when shared), to find them in `players`. */
          ids: c.standings.filter((s) => s.count === top.count && s.player).map((s) => s.playerId),
        };
      })
      .filter((a): a is NonNullable<typeof a> => !!a);

    const table = this.standings(session.teamCount, games, session.plan);
    const tod = table.teamOfTheDay;
    const todRow = tod ? table.rows.find((r) => r.team === tod) : null;
    const w = this.window(session);

    // Everyone who played, with their day in numbers and their card rating: the card's player
    // faces, stat leaders and Best VII all come from this one list.
    const [goals, events, ratings] = await Promise.all([
      this.goalsRepo.find({ where: { sessionId: session.id } }),
      this.eventsRepo.find({ where: { sessionId: session.id } }),
      group ? this.ovrMap(group.organizationId).catch(() => null) : Promise.resolve(null),
    ]);
    const count = <T>(list: T[], pick: (x: T) => string | null | undefined, id: string) => list.filter((x) => pick(x) === id).length;
    const players = (session.payments ?? [])
      .filter((p) => p.player && p.attendance !== 'no_show')
      .map((p) => ({
        id: p.player.id,
        name: name(p.player),
        short: pitchName(p.player),
        // Both, so the card can show the nickname with the real name under it.
        fullName: `${p.player.firstName} ${p.player.lastName}`.trim(),
        nickname: p.player.nickname || null,
        photoKey: p.player.photoKey ?? null,
        team: p.team ?? null,
        ovr: ratings ? (ratings.ovr.get(p.player.id) ?? cardRating(ratings.skills.get(p.player.id)?.rating ?? DEFAULT_START)) : null,
        goals: count(goals, (g) => g.scorerId, p.player.id),
        assists: count(goals, (g) => g.assistId, p.player.id),
        saves: count(events, (e) => (e.kind === 'save' ? e.playerId : null), p.player.id),
        yellow: count(events, (e) => (e.kind === 'yellow' ? e.playerId : null), p.player.id),
        red: count(events, (e) => (e.kind === 'red' ? e.playerId : null), p.player.id),
      }));
    // Best VII of the Day, once the vote has closed: the six most picked, then the sub.
    const viiCat = w.open ? null : results.categories.find((c) => c.key === VoteCategory.VII);
    const vii = viiCat && !viiCat.inconclusive && viiCat.standings.length >= VII_STARTERS ? viiCat.standings.slice(0, VII_STARTERS + 1).map((s) => s.playerId) : null;

    return {
      groupName: group?.name ?? '',
      clubName: group?.organization?.name ?? null,
      bibs: bibsFor(session),
      date: session.date,
      open: w.open,
      /** Not ended yet: the vote opens at full time. */
      notYet: w.notYet,
      ballots: results.ballots,
      squadSize: results.squadSize,
      awards,
      teamOfTheDay:
        tod && todRow
          ? {
              team: tod,
              captain: this.captainsOf(session)[tod as TeamKey] ?? null,
              players: (session.payments ?? []).filter((p) => p.team === tod && p.player).map((p) => pitchName(p.player)),
              w: todRow.w,
              d: todRow.d,
              l: todRow.l,
              pts: todRow.pts,
              ppg: todRow.ppg,
            }
          : null,
      standings: games.length ? table.rows : [],
      perGame: table.perGame,
      games: games.map((g) => ({ teamA: g.teamA, teamB: g.teamB, scoreA: g.scoreA, scoreB: g.scoreB })),
      captains: this.captainsOf(session),
      players,
      vii,
    };
  }

  // ── Match day: teams on the day + short games ──

  /** The day's table; winner stays ranks by points per game (see dayTable). */
  private standings(teamCount: number, games: SessionGame[], plan?: MatchPlan | null) {
    return dayTable(teamCount, games, plan?.format === 'winner_stays');
  }

  async getLineup(sessionId: string, organizationId: string) {
    const session = await this.loadSession(sessionId, organizationId);
    const [{ ovr, skills }, games, paid, goals, events] = await Promise.all([
      // Ratings only decorate the teams: if they can't be worked out, the teams still load.
      this.ovrMap(organizationId).catch((err) => {
        this.logger.error(`Ratings for the lineup of ${sessionId} failed: ${err instanceof Error ? err.stack : err}`);
        return { ovr: new Map<string, number | null>(), skills: new Map<string, Skill>() };
      }),
      this.gamesRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
      this.paidFor(session),
      this.goalsRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
      this.eventsRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
    ]);
    const table = this.standings(session.teamCount, games, session.plan);
    return {
      teamCount: session.teamCount,
      ...(await this.planOf(session)),
      /** Scores are in, so the teams can't change until they're deleted. */
      locked: games.length > 0,
      /** Scores can be added from match day, unless the game was called off. */
      scoresOpen: session.status !== SessionStatus.CANCELLED && localDate(0) >= String(session.date).slice(0, 10),
      captains: this.captainsOf(session),
      /** Each side's bib colour and name for this game (its own, else the group's). */
      bibs: bibsFor(session),
      squad: (session.payments ?? [])
        .filter((p) => p.player && p.attendance !== 'no_show')
        .map((p) => ({
          id: p.player.id,
          firstName: p.player.firstName,
          lastName: p.player.lastName,
          nickname: p.player.nickname ?? null,
          photoKey: p.player.photoKey ?? null,
          team: this.teamOf(session, p.team),
          captain: this.isCaptain(session, p),
          vice: this.isVice(session, p),
          keeper: p.player.keeper ?? null,
          ovr: ovr.get(p.player.id) ?? cardRating(skills.get(p.player.id)?.rating ?? DEFAULT_START),
          skill: Math.round(skills.get(p.player.id)?.rating ?? DEFAULT_START),
          // Organisers always see who's paid for this game (or the period it falls in).
          paid: paid.get(p.playerId) ?? 'unpaid',
        })),
      games: games.map((g) => ({
        id: g.id,
        teamA: g.teamA,
        teamB: g.teamB,
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        seconds: g.seconds ?? null,
        keeperA: g.keeperA ?? null,
        keeperB: g.keeperB ?? null,
        recordedBy: g.recordedBy ?? null,
        goals: goals
          .filter((x) => x.gameId === g.id)
          .map((x) => ({ id: x.id, team: x.team, scorerId: x.scorerId, assistId: x.assistId, recordedBy: x.recordedBy })),
      })),
      /** Cards and saves recorded today, oldest first. */
      events: events.map((e) => ({ id: e.id, playerId: e.playerId, kind: e.kind, recordedBy: e.recordedBy })),
      standings: table.rows,
      teamOfTheDay: table.teamOfTheDay,
      tablePerGame: table.perGame,
    };
  }

  /**
   * The day's plan and what it's worked out from: kick-off and the date (the swaps start from a
   * different player each week). With no plan yet, the last one this group used, to start from.
   */
  private async planOf(session: Session, withLast = true) {
    let lastPlan: MatchPlan | null = null;
    if (!session.plan && withLast) {
      const before = await this.sessionsRepo
        .createQueryBuilder('s')
        .where('s.groupId = :groupId', { groupId: session.groupId })
        .andWhere('s.plan IS NOT NULL')
        .andWhere('s.id <> :id', { id: session.id })
        .orderBy('s.date', 'DESC')
        .getOne();
      if (before?.plan) {
        const { away: _away, ...settings } = before.plan;
        lastPlan = settings;
      }
    }
    return {
      plan: session.plan ?? null,
      lastPlan,
      kickoff: kickoffFor(session),
      date: String(session.date).slice(0, 10),
    };
  }

  /**
   * The organiser sets up the day's plan, or takes it away (null). Its game length becomes the
   * timer's for the day, so the clock and the plan agree; not while a game's clock is running.
   */
  async setPlan(sessionId: string, organizationId: string, input: unknown) {
    const session = await this.loadSession(sessionId, organizationId);
    if (session.kind !== SessionKind.GAME) throw new BadRequestException('Only games have a plan');
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game was called off, so it has no plan');
    if (session.status === SessionStatus.COMPLETED) throw new BadRequestException('This game has ended, so its plan can’t change');
    const running = clockRunning(session);
    let plan: MatchPlan | null = null;
    if (input != null) {
      try {
        plan = cleanPlan(input);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      // Keep who already left early, and the goal choices kept at the first score: setting the
      // plan again shouldn't bring anyone back or reshuffle the keepers.
      if (session.plan?.away && !(input as { away?: unknown }).away) plan.away = session.plan.away;
      if (session.plan?.keepers) plan.keepers = session.plan.keepers;
      if ((session.plan?.format ?? 'schedule') !== (plan.format ?? 'schedule') && (await this.scoresIn(session.id))) {
        throw new BadRequestException('The day has started: the format can’t change now');
      }
      // The draw stays unless a new one is sent, and can't change once the first game is on or
      // played: the games and swaps under way would move under everyone.
      if ((input as { draw?: unknown }).draw === undefined && session.plan?.draw) plan.draw = session.plan.draw;
      if ((plan.draw ?? null) !== (session.plan?.draw ?? null) && (running || (await this.scoresIn(session.id)))) {
        throw new BadRequestException('The first game has started, so the order can’t be shuffled now');
      }
    }
    const patch: Partial<Session> = { plan };
    if (plan && !running) patch.timerMinutes = plan.gameMinutes;
    await this.sessionsRepo.update(session.id, patch);
    return this.getLineup(sessionId, organizationId);
  }

  /** Someone left early (minutes after kick-off), or came back (null): the swaps share their time out. */
  async setAway(sessionId: string, organizationId: string, playerId: string, at: number | null) {
    const session = await this.loadSession(sessionId, organizationId);
    await this.saveAway(session, playerId, at);
    return this.getLineup(sessionId, organizationId);
  }

  private async saveAway(session: Session, playerId: string, at: number | null) {
    if (!session.plan) throw new BadRequestException('There’s no plan for this game yet');
    if (session.status !== SessionStatus.UPCOMING) throw new BadRequestException('This game has ended');
    if (!session.payments?.some((p) => p.playerId === playerId)) throw new BadRequestException("That player isn't in this game");
    let plan: MatchPlan;
    try {
      plan = withAway(session.plan, playerId, at);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.sessionsRepo.update(session.id, { plan });
  }

  /** The match-day timer, as the organiser sees it. */
  async getTimer(sessionId: string, organizationId: string) {
    return timerOf(await this.loadSession(sessionId, organizationId));
  }

  async setTimer(sessionId: string, organizationId: string, input: { start?: boolean; minutes?: number; pause?: boolean }) {
    const session = await this.loadSession(sessionId, organizationId);
    return this.changeTimer(session, input);
  }

  private async changeTimer(session: Session, input: { start?: boolean; minutes?: number; pause?: boolean }) {
    if (session.kind !== SessionKind.GAME) throw new BadRequestException('Only games have a timer');
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game was called off');
    let patch;
    try {
      patch = timerChange(input, session);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (Object.keys(patch).length) await this.sessionsRepo.update(session.id, patch);
    return timerOf({ ...session, ...patch });
  }

  /** The timer for anyone playing in the game, so the whole squad sees the clock. */
  async playerTimer(sessionId: string, playerIds: string[]) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId }, relations: ['group', 'payments'] });
    if (!session || session.kind !== SessionKind.GAME || !session.payments?.some((p) => playerIds.includes(p.playerId))) {
      throw new NotFoundException("You're not in this game");
    }
    return timerOf(session);
  }

  /**
   * This game's bibs, changed on the day (colours and names). Allowed after the scores are in:
   * it changes what the sides are called and wear, not who played. Null goes back to the group's.
   */
  async setGameBibs(sessionId: string, organizationId: string, bibs: unknown) {
    await this.loadSession(sessionId, organizationId);
    let clean;
    try {
      clean = cleanBibs(bibs);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.sessionsRepo.update(sessionId, { bibs: clean });
    return this.getLineup(sessionId, organizationId);
  }

  async setLineup(
    sessionId: string,
    organizationId: string,
    input: {
      teamCount?: number;
      teams?: Record<string, string | null>;
      captains?: Record<string, string | null>;
      vices?: Record<string, string | null>;
    },
  ) {
    const session = await this.loadSession(sessionId, organizationId);
    if (session.kind === SessionKind.DUES) throw new BadRequestException('Dues periods don’t have a lineup');
    if (await this.scoresIn(session.id)) {
      // Scores are in, so the sides stay as the games were played. The one change still allowed:
      // someone who came late (not on a side yet) goes onto one, from here on.
      const late = lateArrivals(session, input);
      if (late === 'locked') throw new BadRequestException('Teams are locked because scores are in. Delete the scores to change the teams.');
      if (late === 'ended') throw new BadRequestException('This game has ended, so no one can join a side now');
      const changed = (session.payments ?? []).filter((p) => p.playerId in late);
      const now = new Date();
      for (const p of changed) {
        p.team = late[p.playerId];
        p.joinedSideAt = now;
      }
      await this.sessionsRepo.manager.save(changed);
      return this.getLineup(sessionId, organizationId);
    }
    let count = session.teamCount;
    if (input.teamCount !== undefined) {
      count = Math.max(2, Math.min(TEAM_KEYS.length, Math.round(input.teamCount)));
      await this.sessionsRepo.update(session.id, { teamCount: count });
      // Anyone on a side that no longer exists goes back to "not picked".
      const dropped = (session.payments ?? []).filter((p) => p.team && TEAM_KEYS.indexOf(p.team as TeamKey) >= count);
      for (const p of dropped) {
        p.team = null;
        p.captain = false;
        p.viceCaptain = false;
      }
      if (dropped.length) await this.sessionsRepo.manager.save(dropped);
      // No scores to drop: the teams are locked once any are in.
    }
    if (input.teams) {
      const valid = new Set<string>(TEAM_KEYS.slice(0, count));
      const changed = (session.payments ?? []).filter((p) => p.playerId in input.teams!);
      for (const p of changed) {
        const t = input.teams[p.playerId];
        const next = t && valid.has(t) ? t : null;
        // A captain (or vice) moved off their side stops leading it.
        if (next !== p.team) {
          p.captain = false;
          p.viceCaptain = false;
          // No scores yet, so every game from here counts for them.
          p.joinedSideAt = null;
        }
        p.team = next;
      }
      await this.sessionsRepo.manager.save(changed);
    }
    const named: { payment: Payment; role: 'captain' | 'vice' }[] = [];
    for (const role of ['captain', 'vice'] as const) {
      const picks = role === 'captain' ? input.captains : input.vices;
      if (!picks) continue;
      const flag = role === 'captain' ? 'captain' : 'viceCaptain';
      const other = role === 'captain' ? 'viceCaptain' : 'captain';
      const valid = new Set<string>(TEAM_KEYS.slice(0, count));
      const payments = session.payments ?? [];
      const changed = new Set<Payment>();
      for (const [team, playerId] of Object.entries(picks)) {
        if (!valid.has(team)) throw new BadRequestException("That team isn't in this game");
        const pick = playerId ? payments.find((p) => p.playerId === playerId) : null;
        if (playerId && !pick) throw new BadRequestException("That player isn't in this game");
        // One captain and one vice per side: whoever had the armband hands it over.
        for (const p of payments) {
          if (p[flag] && p.team === team && p !== pick) {
            p[flag] = false;
            changed.add(p);
          }
        }
        if (pick) {
          const already = pick[flag] && pick.team === team;
          // Naming a captain puts them on the side they lead; nobody is both captain and vice.
          pick.team = team;
          pick[flag] = true;
          pick[other] = false;
          changed.add(pick);
          if (!already) named.push({ payment: pick, role });
        }
      }
      if (changed.size) await this.sessionsRepo.manager.save([...changed]);
    }
    for (const { payment, role } of named) this.tellLeader(session, payment, role);
    return this.getLineup(sessionId, organizationId);
  }

  /** The side a player is on, if it's one of this game's sides; anything else (an old name, a side beyond teamCount) is none. */
  private teamOf(session: Session, team: string | null) {
    const i = team ? TEAM_KEYS.indexOf(team as TeamKey) : -1;
    return i >= 0 && i < session.teamCount ? team : null;
  }

  private isCaptain(session: Session, p: Payment) {
    return p.captain && !!this.teamOf(session, p.team);
  }

  private isVice(session: Session, p: Payment) {
    return p.viceCaptain && !p.captain && !!this.teamOf(session, p.team);
  }

  /** Captains and vice-captains keep the score on match day. */
  private keepsScore(session: Session, p: Payment) {
    return this.isCaptain(session, p) || this.isVice(session, p);
  }

  /**
   * A message to whoever was just given the armband, so they know before kick-off: what they
   * lead, and that the score is theirs to keep on match day.
   */
  private tellLeader(session: Session, p: Payment, role: 'captain' | 'vice') {
    if (!this.notifications || session.status !== SessionStatus.UPCOMING) return;
    const bib = bibsFor(session)[p.team as TeamKey];
    const colour = bib?.colour ?? DEFAULT_SIDE_COLOURS[p.team as TeamKey] ?? p.team;
    const side = bib?.name || `${colour.charAt(0).toUpperCase()}${colour.slice(1)}`;
    const today = localDate(0) === String(session.date).slice(0, 10);
    const what = role === 'captain' ? 'captain' : 'vice-captain';
    const when = today ? 'today' : `on ${shortDate(String(session.date))}`;
    this.notifications.later(() =>
      this.notifications!.notifyPlayers([p.playerId], {
        kind: 'captain_named',
        title: `You're ${what} of ${side} ⚽`,
        body: today
          ? `For ${session.group?.name ?? 'your game'} today. Open the game to keep the score and who scored.`
          : `For ${session.group?.name ?? 'your game'} ${when}. On match day you can keep the score and who scored from your phone.`,
        url: `/me/games/${session.id}`,
      }),
    );
  }

  /** Side → its captain's name ("Baba"), for sides that have one. The side goes by it: "Team Baba". */
  private captainsOf(session: Session): Partial<Record<TeamKey, string>> {
    const out: Partial<Record<TeamKey, string>> = {};
    for (const p of session.payments ?? []) {
      if (p.player && this.isCaptain(session, p)) out[p.team as TeamKey] = pitchName(p.player);
    }
    return out;
  }

  private async paidFor(session: Session) {
    if (session.kind === SessionKind.DUES) return new Map<string, GamePaid>();
    return (await paidForGames(this.sessionsRepo.manager, [session])).get(session.id) ?? new Map<string, GamePaid>();
  }

  // ── Match day from a captain's phone ──

  /**
   * Whoever captains a side on match day can keep the score that day, from the player app: add
   * games and name scorers, and take back what captains added. Anything the organiser added is
   * theirs to change. Returns the session and how to sign their entries ("Ada (captain)").
   */
  private async captainToday(sessionId: string, playerIds: string[]) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId }, relations: ['group', 'payments', 'payments.player'] });
    const mine = session?.payments?.find((p) => playerIds.includes(p.playerId));
    if (!session || session.kind !== SessionKind.GAME || !mine) throw new NotFoundException("You're not in this game");
    if (!this.keepsScore(session, mine)) throw new BadRequestException('Only the captains and vice-captains can keep the score');
    if (mine.attendance === 'no_show') throw new BadRequestException("You're marked as not here today, so you can't keep the score");
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game was called off');
    // After full time the vote is on: scores feed it, so only the organiser changes them now.
    if (session.status === SessionStatus.COMPLETED) throw new BadRequestException('Full time: only the organiser can change the scores now');
    if (localDate(0) !== String(session.date).slice(0, 10)) throw new BadRequestException('Captains can keep the score on match day only');
    return {
      session,
      organizationId: session.group.organizationId,
      team: this.teamOf(session, mine.team)!,
      signedAs: `${pitchName(mine.player)} (${this.isCaptain(session, mine) ? 'captain' : 'vice-captain'})`,
    };
  }

  /** The match day as a captain sees it: like the organiser's, without ratings or who's paid. */
  async captainLineup(sessionId: string, playerIds: string[]) {
    const { organizationId } = await this.captainToday(sessionId, playerIds);
    return this.forCaptain(await this.getLineup(sessionId, organizationId));
  }

  private forCaptain(lineup: Awaited<ReturnType<RatingsService['getLineup']>>) {
    return { ...lineup, squad: lineup.squad.map((m) => ({ ...m, ovr: null, skill: 0, paid: undefined })) };
  }

  /** A captain marks one of their own players as gone (or back): the organiser does the rest. */
  async captainSetAway(sessionId: string, playerIds: string[], playerId: string, at: number | null) {
    const { session, organizationId, team } = await this.captainToday(sessionId, playerIds);
    const theirs = session.payments?.find((p) => p.playerId === playerId);
    if (!theirs || this.teamOf(session, theirs.team) !== team) {
      throw new BadRequestException('You can do this for your own team only. The organiser does the rest');
    }
    await this.saveAway(session, playerId, at);
    return this.forCaptain(await this.getLineup(sessionId, organizationId));
  }

  /** A captain records games their own side played, never a game between two other sides. */
  async captainAddGame(
    sessionId: string,
    playerIds: string[],
    input: { teamA: string; teamB: string; scoreA: number; scoreB: number; goals?: GoalInput[]; clientKey?: string; seconds?: number; keeperA?: string | null; keeperB?: string | null },
  ) {
    const { organizationId, signedAs, team } = await this.captainToday(sessionId, playerIds);
    if (input.teamA !== team && input.teamB !== team) throw new BadRequestException('You can only add games your team played');
    return this.forCaptain(await this.addGame(sessionId, organizationId, input, signedAs));
  }

  async captainAddGoal(sessionId: string, gameId: string, playerIds: string[], input: GoalInput & { clientKey?: string }) {
    const { organizationId, signedAs, team } = await this.captainToday(sessionId, playerIds);
    const game = await this.gamesRepo.findOne({ where: { id: gameId, sessionId } });
    if (game && game.teamA !== team && game.teamB !== team) throw new BadRequestException('You can only name scorers in games your team played');
    return this.forCaptain(await this.addGoal(sessionId, gameId, organizationId, input, signedAs));
  }

  /**
   * A captain takes back a game they saved themselves: not the organiser's, not the other
   * captain's, and not one the organiser has since named scorers in (those would go with it).
   */
  async captainDeleteGame(sessionId: string, gameId: string, playerIds: string[]) {
    const { organizationId, signedAs } = await this.captainToday(sessionId, playerIds);
    const game = await this.gamesRepo.findOne({ where: { id: gameId, sessionId } });
    if (!game) throw new NotFoundException('Game not found');
    if (game.recordedBy !== signedAs) throw new BadRequestException(this.notYours(game.recordedBy, 'saved this score', 'delete it'));
    const goals = await this.goalsRepo.find({ where: { gameId } });
    if (goals.some((g) => g.recordedBy !== signedAs)) {
      throw new BadRequestException('Someone else named scorers in this game: ask the organiser to delete it');
    }
    return this.forCaptain(await this.deleteGame(sessionId, gameId, organizationId));
  }

  async captainDeleteGoal(sessionId: string, goalId: string, playerIds: string[]) {
    const { organizationId, signedAs } = await this.captainToday(sessionId, playerIds);
    const goal = await this.goalsRepo.findOne({ where: { id: goalId, sessionId } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.recordedBy !== signedAs) throw new BadRequestException(this.notYours(goal.recordedBy, 'added this scorer', 'remove it'));
    return this.forCaptain(await this.deleteGoal(sessionId, goalId, organizationId));
  }

  /** Cards and saves, for a captain's own players only: a card costs rating, so not on the other side's. */
  async captainAddEvent(sessionId: string, playerIds: string[], input: { playerId: string; kind: MatchEventKind; clientKey?: string }) {
    const { session, organizationId, signedAs, team } = await this.captainToday(sessionId, playerIds);
    const theirs = session.payments?.find((p) => p.playerId === input.playerId);
    if (!theirs || this.teamOf(session, theirs.team) !== team) {
      throw new BadRequestException('You can add cards and saves for your own team only. The organiser adds the rest');
    }
    return this.forCaptain(await this.addEvent(sessionId, organizationId, input, signedAs));
  }

  async captainDeleteEvent(sessionId: string, eventId: string, playerIds: string[]) {
    const { organizationId, signedAs } = await this.captainToday(sessionId, playerIds);
    const event = await this.eventsRepo.findOne({ where: { id: eventId, sessionId } });
    if (!event) throw new NotFoundException('Not found');
    if (event.recordedBy !== signedAs) throw new BadRequestException(this.notYours(event.recordedBy, 'added this', 'remove it'));
    return this.forCaptain(await this.deleteEvent(sessionId, eventId, organizationId));
  }

  /** "The organiser saved this score: only they can delete it" / "Ada (captain) added this: ask them or the organiser". */
  private notYours(by: string | null, did: string, undo: string) {
    return byCaptain(by) ? `${by} ${did}: ask them or the organiser to ${undo}` : `The organiser ${did}: only they can ${undo}`;
  }

  /**
   * Saves a match-day entry once per `clientKey`: the phone sends the same key again when it
   * retries the same tap, and a row with that key already saved means it's done.
   */
  private async onceByKey(repo: Repository<{ sessionId: string; clientKey?: string | null }>, sessionId: string, clientKey: string | undefined, save: () => Promise<unknown>) {
    if (clientKey && (await repo.exists({ where: { sessionId, clientKey } }))) return;
    try {
      await save();
    } catch (err) {
      // Two copies of the same tap racing: the unique index lets one in, and that one counts.
      if (clientKey && (err as { code?: string }).code === '23505') return;
      throw err;
    }
  }

  // ── Bibs, from the player's side ──

  /** A game's squad as one of its players sees it: bibs, and who's paid if the group shares that. */
  async playerLineup(sessionId: string, playerIds: string[]) {
    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId },
      relations: ['group', 'payments', 'payments.player'],
    });
    const mine = session?.payments?.find((p) => playerIds.includes(p.playerId));
    if (!session || session.kind !== SessionKind.GAME || !mine) throw new NotFoundException("You're not in this game");

    const [paid, locked, games, goals, events] = await Promise.all([
      this.paidFor(session),
      this.scoresIn(session.id),
      this.gamesRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
      this.goalsRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
      this.eventsRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } }),
    ]);
    const showPaid = session.group.contributionsVisibility === 'names';
    const playerOf = (id: string | null | undefined) => (id ? session.payments?.find((x) => x.playerId === id)?.player : null);
    const nameOf = (id: string | null | undefined) => {
      const p = playerOf(id);
      return p ? sheetName(p) : null;
    };
    const photoOf = (id: string | null | undefined) => playerOf(id)?.photoKey ?? null;
    return {
      /**
       * Match day as it happens, for everyone in the game (not just the captains): each game's
       * score with who scored and set it up, the cards and saves, and the day's table so far.
       */
      live: {
        games: games.map((g) => ({
          id: g.id,
          teamA: g.teamA,
          teamB: g.teamB,
          scoreA: g.scoreA,
          scoreB: g.scoreB,
          seconds: g.seconds ?? null,
          goals: goals
            .filter((x) => x.gameId === g.id)
            .map((x) => ({
              team: x.team,
              scorer: nameOf(x.scorerId),
              scorerPhoto: photoOf(x.scorerId),
              assist: nameOf(x.assistId),
              assistPhoto: photoOf(x.assistId),
              mine: playerIds.includes(x.scorerId),
            })),
        })),
        events: events.map((e) => ({ kind: e.kind, name: nameOf(e.playerId), photoKey: photoOf(e.playerId), mine: playerIds.includes(e.playerId) })),
        table: this.standings(session.teamCount, games, session.plan),
      },
      teamCount: session.teamCount,
      ...(await this.planOf(session, false)),
      bibsOpen: this.bibsOpen(session, locked, locked && !mine.team),
      bibsClosed: (locked && !!mine.team) || this.bibsClosed(session),
      myTeam: this.teamOf(session, mine.team),
      captains: this.captainsOf(session),
      /** Each side's bib colour and name for this game (its own, else the group's). */
      bibs: bibsFor(session),
      /** They captain a side today, so they can keep the score from their phone. */
      canKeepScore:
        this.keepsScore(session, mine) &&
        mine.attendance !== 'no_show' &&
        session.status === SessionStatus.UPCOMING &&
        localDate(0) === String(session.date).slice(0, 10),
      /** What they lead today, if anything, so their card can say so. */
      myRole: this.isCaptain(session, mine) ? 'captain' : this.isVice(session, mine) ? 'vice' : null,
      myPaid: paid.get(mine.playerId) ?? 'unpaid',
      showPaid,
      squad: (session.payments ?? [])
        .filter((p) => p.player && p.attendance !== 'no_show')
        .map((p) => ({
          /** For the match day plan: the swaps go by player, the same on every phone. */
          id: p.playerId,
          keeper: p.player.keeper ?? null,
          name: sheetName(p.player),
          /** What teammates call them: nickname, else first name. */
          short: pitchName(p.player),
          photoKey: p.player.photoKey ?? null,
          me: p.playerId === mine.playerId,
          team: this.teamOf(session, p.team),
          captain: this.isCaptain(session, p),
          vice: this.isVice(session, p),
          // Everyone sees their own; others only when the group shares who's paid.
          paid: showPaid || p.playerId === mine.playerId ? (paid.get(p.playerId) ?? 'unpaid') : null,
        }))
        .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name)),
    };
  }

  /**
   * Players pick their own side from match day until the first score goes in, unless the game
   * was called off. After that the teams are what the scores were played by, so nobody can move
   * onto the winning side and rewrite the day's results. `late`: they came after the first score
   * and aren't on a side yet, so they can still pick one until full time.
   */
  private bibsOpen(session: Session, scoresIn: boolean, late = false) {
    return (
      session.status !== SessionStatus.CANCELLED &&
      localDate(0) >= String(session.date).slice(0, 10) &&
      (!scoresIn || (late && session.status === SessionStatus.UPCOMING)) &&
      !this.bibsClosed(session)
    );
  }

  /** Past the vote: teams are locked for good. */
  private bibsClosed(session: Session) {
    return this.window(session).closed;
  }

  /** A player picks the side they're on for the day — by bib or by captain (null to clear it). */
  async pickTeam(sessionId: string, playerIds: string[], team: string | null) {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId }, relations: ['payments'] });
    const mine = session?.payments?.find((p) => playerIds.includes(p.playerId));
    if (!session || session.kind !== SessionKind.GAME || !mine) throw new NotFoundException("You're not in this game");
    const locked = await this.scoresIn(session.id);
    // Came late: the scores are in, but they aren't on a side yet, so they can join one (once).
    const late = locked && !mine.team;
    if (!this.bibsOpen(session, locked, late) || (late && team === null)) {
      throw new BadRequestException(
        locked || this.bibsClosed(session) ? 'Teams are set: the scores are in' : 'Picking teams opens on match day',
      );
    }
    if (team !== null && !TEAM_KEYS.slice(0, session.teamCount).includes(team as TeamKey)) {
      throw new BadRequestException("That team isn't in this game");
    }
    if (team !== mine.team) {
      mine.captain = false;
      mine.viceCaptain = false;
      mine.joinedSideAt = late ? new Date() : null;
    }
    mine.team = team;
    await this.sessionsRepo.manager.save(mine);
    return this.playerLineup(sessionId, playerIds);
  }

  /**
   * Splits the squad across N sides so each gets a fair share of the best players. Captains stay
   * on the side they lead; everyone else goes, best first, to the side with the fewest players
   * (then the lowest total rating) — a snake draft when there are no captains.
   *
   * "Best" is half the results rating and half the card's 40/40/20 rating (decided 20 Oct), so
   * goals, assists and votes count as well as results. Both on the card's scale.
   */
  async balanceTeams(sessionId: string, organizationId: string, teamCount?: number) {
    if (teamCount) await this.setLineup(sessionId, organizationId, { teamCount });
    const lineup = await this.getLineup(sessionId, organizationId);
    const sides = TEAM_KEYS.slice(0, lineup.teamCount).map((key) => ({ key: key as string, size: 0, total: 0 }));
    const teams: Record<string, string> = {};
    const strength = (p: (typeof lineup.squad)[number]) => {
      const results = cardRating(p.skill);
      return (results + (p.ovr ?? results)) / 2;
    };
    for (const p of lineup.squad) {
      const side = (p.captain || p.vice) && sides.find((x) => x.key === p.team);
      if (!side) continue;
      side.size++;
      side.total += strength(p);
    }
    const rest = lineup.squad
      .filter((p) => !p.captain && !p.vice)
      .sort((a, b) => strength(b) - strength(a) || a.firstName.localeCompare(b.firstName));
    for (const p of rest) {
      const side = sides.reduce((best, x) => (x.size < best.size || (x.size === best.size && x.total < best.total) ? x : best));
      teams[p.id] = side.key;
      side.size++;
      side.total += strength(p);
    }
    return this.setLineup(sessionId, organizationId, { teams });
  }

  async addGame(
    sessionId: string,
    organizationId: string,
    input: { teamA: string; teamB: string; scoreA: number; scoreB: number; goals?: GoalInput[]; clientKey?: string; seconds?: number; keeperA?: string | null; keeperB?: string | null },
    recordedBy?: string,
  ) {
    const session = await this.loadSession(sessionId, organizationId);
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game was called off');
    if (localDate(0) < String(session.date).slice(0, 10)) throw new BadRequestException('Scores open on match day');
    const valid = new Set<string>(TEAM_KEYS.slice(0, session.teamCount));
    if (!valid.has(input.teamA) || !valid.has(input.teamB) || input.teamA === input.teamB) {
      throw new BadRequestException('Pick two different teams');
    }
    const clean = (n: number) => Math.max(0, Math.min(99, Math.round(Number(n) || 0)));
    const keepers = this.keepersFor(session, { keeperA: input.keeperA ?? null, keeperB: input.keeperB ?? null });
    const game = this.gamesRepo.create({
      ...keepers,
      sessionId: session.id,
      teamA: input.teamA,
      teamB: input.teamB,
      scoreA: clean(input.scoreA),
      scoreB: clean(input.scoreB),
      recordedBy: recordedBy ?? null,
      clientKey: input.clientKey ?? null,
      seconds: input.seconds != null ? Math.max(0, Math.min(7200, Math.round(input.seconds))) : null,
    });
    const goals = input.goals ?? [];
    this.checkGoals(session, game, [], goals);
    await this.onceByKey(this.gamesRepo, session.id, input.clientKey, () =>
      this.gamesRepo.manager.transaction(async (tx) => {
        const saved = await tx.save(game);
        if (goals.length) {
          await tx.save(goals.map((g) => this.goalsRepo.create({ team: g.team, scorerId: g.scorerId, assistId: g.assistId ?? null, sessionId: session.id, gameId: saved.id, recordedBy: recordedBy ?? null })));
        }
      }),
    );
    // The day has started: who's happy in goal is kept as it is now, so a change of mind in the
    // app can't reshuffle the swaps under way.
    if (session.plan && !session.plan.keepers) {
      const players = (session.payments ?? []).filter((p) => p.player).map((p) => ({ id: p.playerId, keeper: p.player.keeper }));
      await this.sessionsRepo.update(session.id, { plan: withKeepers(session.plan, players) });
    }
    return this.getLineup(sessionId, organizationId);
  }

  /**
   * Names a scorer (and maybe who set it up) for a goal in a game already saved. The score is
   * what counts: a side can't have more named scorers than goals.
   */
  async addGoal(sessionId: string, gameId: string, organizationId: string, input: GoalInput & { clientKey?: string }, recordedBy?: string) {
    const session = await this.loadSession(sessionId, organizationId);
    const { clientKey, ...goal } = input;
    await this.onceByKey(this.goalsRepo, sessionId, clientKey, () =>
      // The game row stays locked while its scorers are counted, so the organiser and a captain
      // naming scorers at the same moment can't name more than the score between them.
      this.gamesRepo.manager.transaction(async (tx) => {
        const game = await tx.findOne(SessionGame, { where: { id: gameId, sessionId }, lock: { mode: 'pessimistic_write' } });
        if (!game) throw new NotFoundException('Game not found');
        const existing = await tx.find(MatchGoal, { where: { gameId } });
        this.checkGoals(session, game, existing, [goal]);
        await tx.save(this.goalsRepo.create({ ...goal, assistId: goal.assistId ?? null, sessionId, gameId, recordedBy: recordedBy ?? null, clientKey: clientKey ?? null }));
      }),
    );
    return this.getLineup(sessionId, organizationId);
  }

  /** A yellow card, red card or save on match day, for a player who's in today's game. */
  async addEvent(sessionId: string, organizationId: string, input: { playerId: string; kind: MatchEventKind; clientKey?: string }, recordedBy?: string) {
    const session = await this.loadSession(sessionId, organizationId);
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game was called off');
    if (localDate(0) < String(session.date).slice(0, 10)) throw new BadRequestException('Cards and saves open on match day');
    if (!(session.payments ?? []).some((p) => p.playerId === input.playerId && p.attendance !== 'no_show')) {
      throw new BadRequestException("That player isn't in this game");
    }
    await this.onceByKey(this.eventsRepo, sessionId, input.clientKey, () =>
      this.eventsRepo.save(this.eventsRepo.create({ sessionId, playerId: input.playerId, kind: input.kind, recordedBy: recordedBy ?? null, clientKey: input.clientKey ?? null })),
    );
    return this.getLineup(sessionId, organizationId);
  }

  async deleteEvent(sessionId: string, eventId: string, organizationId: string) {
    await this.loadSession(sessionId, organizationId);
    await this.eventsRepo.delete({ id: eventId, sessionId });
    return this.getLineup(sessionId, organizationId);
  }

  async deleteGoal(sessionId: string, goalId: string, organizationId: string) {
    await this.loadSession(sessionId, organizationId);
    await this.goalsRepo.delete({ id: goalId, sessionId });
    return this.getLineup(sessionId, organizationId);
  }

  /**
   * Goals must make sense: scored for one of the game's two sides, by a player on that side, set
   * up (if at all) by a teammate who isn't the scorer, and no more named than the side scored.
   */
  private checkGoals(session: Session, game: Pick<SessionGame, 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>, existing: Pick<MatchGoal, 'team'>[], added: GoalInput[]) {
    const sideOf = new Map((session.payments ?? []).filter((p) => p.attendance !== 'no_show').map((p) => [p.playerId, this.teamOf(session, p.team)]));
    for (const g of added) {
      if (g.team !== game.teamA && g.team !== game.teamB) throw new BadRequestException("That team isn't in this game");
      if (sideOf.get(g.scorerId) !== g.team) throw new BadRequestException("The scorer isn't on that team");
      if (g.assistId && (g.assistId === g.scorerId || sideOf.get(g.assistId) !== g.team)) {
        throw new BadRequestException('The assist has to come from a teammate');
      }
    }
    for (const [team, score] of [[game.teamA, game.scoreA], [game.teamB, game.scoreB]] as const) {
      const named = [...existing, ...added].filter((g) => g.team === team).length;
      if (named > score) throw new BadRequestException(`More scorers than goals for ${team === game.teamA ? 'the first' : 'the second'} team`);
    }
  }

  /**
   * The organiser corrects a saved game's score. Its named scorers stay; a side can't go below
   * the scorers named for it, so they take one off first and the goals and scorers always agree.
   */
  async updateGame(
    sessionId: string,
    gameId: string,
    organizationId: string,
    input: { scoreA?: number; scoreB?: number; keeperA?: string | null; keeperB?: string | null },
  ) {
    const session = await this.loadSession(sessionId, organizationId);
    if (session.status === SessionStatus.CANCELLED) throw new BadRequestException('This game was called off');
    const clean = (n: number) => Math.max(0, Math.min(99, Math.round(Number(n) || 0)));
    await this.gamesRepo.manager.transaction(async (tx) => {
      const game = await tx.findOne(SessionGame, { where: { id: gameId, sessionId }, lock: { mode: 'pessimistic_write' } });
      if (!game) throw new NotFoundException('Game not found');
      const goals = await tx.find(MatchGoal, { where: { gameId } });
      // Left out stays as it is: a keeper can be corrected without touching the score.
      const next = {
        scoreA: input.scoreA === undefined ? game.scoreA : clean(input.scoreA),
        scoreB: input.scoreB === undefined ? game.scoreB : clean(input.scoreB),
        ...this.keepersFor(session, { keeperA: input.keeperA, keeperB: input.keeperB }, game),
      };
      for (const [team, score] of [[game.teamA, next.scoreA], [game.teamB, next.scoreB]] as const) {
        const named = goals.filter((g) => g.team === team).length;
        if (named > score) {
          throw new BadRequestException(
            `${this.sideName(session, team)} has ${named} scorer${named === 1 ? '' : 's'} named. Take ${named - score === 1 ? 'one' : named - score} off first, then lower the score.`,
          );
        }
      }
      await tx.update(SessionGame, { id: game.id }, next);
    });
    return this.getLineup(sessionId, organizationId);
  }

  /** Who was in goal, checked: anyone playing today, for either side, never both (see keepers.ts). */
  private keepersFor(session: Session, input: { keeperA?: string | null; keeperB?: string | null }, current?: Pick<SessionGame, 'keeperA' | 'keeperB'>) {
    // Only the keepers being set are checked against who's playing: a keeper since taken off the
    // game doesn't block correcting its score. Both sides are checked together, though.
    const keeperA = input.keeperA === undefined ? current?.keeperA : input.keeperA;
    const keeperB = input.keeperB === undefined ? current?.keeperB : input.keeperB;
    try {
      if (keeperA && keeperA === keeperB) throw new Error('One person can’t be in goal for both sides');
      return checkKeepers(session.payments ?? [], input);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** What a side is called: "Team Ada" with a captain, else its bib name or colour ("Orange"). */
  private sideName(session: Session, team: string) {
    const captain = this.captainsOf(session)[team as TeamKey];
    if (captain) return `Team ${captain}`;
    const bib = bibsFor(session)[team as TeamKey];
    const colour = bib?.colour ?? DEFAULT_SIDE_COLOURS[team] ?? team;
    return bib?.name || `${colour.charAt(0).toUpperCase()}${colour.slice(1)}`;
  }

  async deleteGame(sessionId: string, gameId: string, organizationId: string) {
    await this.loadSession(sessionId, organizationId);
    await this.gamesRepo.delete({ id: gameId, sessionId });
    return this.getLineup(sessionId, organizationId);
  }

  private async ovrMap(organizationId: string) {
    const { skills, card } = await this.clubCard(organizationId);
    return { ovr: card, skills };
  }

  /**
   * The card's big number for everyone in the club: the 40/40/20 rating (decided 20 Oct), worked
   * out once across the whole club, all time, so it's the same on every screen. Players who
   * haven't played aren't in it: their card shows the level their organiser gave them.
   * `everyone` is the club's all-time ratings, with the old way's number still in `ovr`.
   */
  private async clubCard(organizationId: string, without?: string) {
    const skills = await this.skills(organizationId, without);
    const sessions = (await this.gamesQuery(organizationId).getMany()).filter((s) => s.id !== without);
    const everyone = [...(await this.aggregate(sessions, skills)).values()];
    const trial = trialRatings(everyone);
    const card = new Map<string, number>();
    for (const r of everyone) if (r.games > 0) card.set(r.player.id, trial.get(r.player.id)!.trial);
    return { skills, everyone, trial, card };
  }

  /**
   * Every player's skill rating in the organisation, from replaying all its scored games in
   * order (each rating depends on everyone else's, so always the whole club). Players who
   * haven't played start from the level their organiser gave them, else average.
   */
  async skills(organizationId: string, without?: string): Promise<Map<string, Skill>> {
    const [all, players] = await Promise.all([
      this.gamesQuery(organizationId).orderBy('session.date', 'ASC').addOrderBy('session.createdAt', 'ASC').getMany(),
      this.sessionsRepo.manager.find(Player, { where: { organizationId }, select: ['id', 'level'] }),
    ]);
    const starts = new Map(players.map((p) => [p.id, p.level ? LEVEL_START[p.level] : DEFAULT_START]));
    // `without`: as it stood before that match day (the table's "places moved").
    const sessions = without ? all.filter((x) => x.id !== without) : all;
    if (!sessions.length) return replaySkill([], starts);

    const games = await this.gamesRepo.find({ where: { sessionId: In(sessions.map((s) => s.id)) }, order: { createdAt: 'ASC' } });
    const bySession = new Map<string, SessionGame[]>();
    for (const g of games) bySession.set(g.sessionId, [...(bySession.get(g.sessionId) ?? []), g]);

    const replay: SkillGame[] = [];
    for (const session of sessions) {
      // Who was on a side for this game: someone who came late only from when they joined it.
      const side = (team: string, g: SessionGame) =>
        (session.payments ?? []).filter((p) => p.player && this.teamOf(session, p.team) === team && playedIn(p, g)).map((p) => p.playerId);
      for (const g of bySession.get(session.id) ?? []) {
        replay.push({ sideA: side(g.teamA, g), sideB: side(g.teamB, g), scoreA: g.scoreA, scoreB: g.scoreB });
      }
    }
    return replaySkill(replay, starts);
  }

  // ── Ratings & league table ──

  /**
   * Aggregates every game into per-player ratings: results, Player of the Match, Best VII, best
   * on their team, goals and assists, and the award evidence behind the card's attributes.
   *
   * Award evidence is fair across ballots: in each game, what a player could expect from a random
   * pick is the category's voters (not counting them) over everyone else who played, so an
   * optional award nobody voted in expects nothing. The same voter nominating the same player in
   * the same award again counts for less each time (1, ½, ⅓…), so one friend can't make a card.
   */
  private async aggregate(sessions: Session[], skills: Map<string, Skill>) {
    const stats = new Map<string, PlayerRatings & { player: SquadMember }>();
    if (!sessions.length) return stats;
    const ordered = [...sessions].sort((x, y) => String(x.date).localeCompare(String(y.date)));
    const ids = ordered.map((s) => s.id);

    const [votes, allGames, goals, events] = await Promise.all([
      this.votesRepo.find({ where: { sessionId: In(ids) } }),
      this.gamesRepo.find({ where: { sessionId: In(ids) } }),
      this.goalsRepo.find({ where: { sessionId: In(ids) } }),
      this.eventsRepo.find({ where: { sessionId: In(ids) } }),
    ]);
    const group = <T extends { sessionId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.sessionId, [...(m.get(r.sessionId) ?? []), r]);
      return m;
    };
    const gamesBySession = group(allGames);
    const votesBySession = group(votes);
    const goalsBySession = group(goals);
    const eventsBySession = group(events);
    const dayWinner = new Map(ordered.map((s) => [s.id, this.standings(s.teamCount, gamesBySession.get(s.id) ?? [], s.plan).teamOfTheDay] as const));
    const abilitiesOf = new Map(CATEGORIES.filter((c) => c.abilities).map((c) => [c.key, c.abilities!]));
    /** Fastest on the pitch is kept as The Engine. */
    const evidenceKey = (c: VoteCategory) => (c === VoteCategory.PACE ? VoteCategory.ENGINE : c);

    const ability = new Map<string, AbilityEvidence>();
    const evidence = new Map<string, Map<VoteCategory, { nominations: number; voters: Set<string>; games: number; chances: number }>>();
    const repeats = new Map<string, number>();

    for (const session of ordered) {
      // One game's odd data (an old side, a deleted player) mustn't take the whole table down:
      // skip that game, say which, and carry on.
      try {
        // Votes count once the vote closes, like the results.
        const sv = this.window(session).open ? [] : (votesBySession.get(session.id) ?? []);
        const voters = new Set(sv.map((v) => v.voterId));
        const squad = this.squad(session);
        const sideOf = (id: string) => this.teamOf(session, session.payments?.find((p) => p.playerId === id)?.team ?? null);

        const countsIn = (category: VoteCategory) => {
          const m = new Map<string, number>();
          for (const v of sv) if (v.category === category) m.set(v.nomineeId, (m.get(v.nomineeId) ?? 0) + 1);
          return m;
        };
        // Player of the Match = most POTM votes (ties share it).
        const potm = countsIn(VoteCategory.POTM);
        const potmTop = Math.max(0, ...potm.values());
        // Best on each team (ties share it).
        const mate = countsIn(VoteCategory.TEAMMATE);
        const mateTop = new Map<string, number>();
        for (const [id, n] of mate) {
          const t = sideOf(id);
          if (t) mateTop.set(t, Math.max(mateTop.get(t) ?? 0, n));
        }
        // Best VII of the Day: the seven most picked, a sub pick counting half.
        const viiScore = new Map<string, number>();
        for (const v of sv) {
          if (v.category === VoteCategory.VII || v.category === VoteCategory.VII_SUB) {
            viiScore.set(v.nomineeId, (viiScore.get(v.nomineeId) ?? 0) + (v.category === VoteCategory.VII ? 1 : 0.5));
          }
        }
        const viiOfDay = new Set([...viiScore.entries()].sort((x, y) => y[1] - x[1]).slice(0, VII_STARTERS + 1).map(([id]) => id));
        // Who voted in each award this game.
        const awardVoters = new Map<VoteCategory, Set<string>>();
        for (const v of sv) {
          if (!abilitiesOf.has(v.category)) continue;
          awardVoters.set(v.category, (awardVoters.get(v.category) ?? new Set()).add(v.voterId));
        }
        const sessionGoals = goalsBySession.get(session.id) ?? [];

        for (const member of squad) {
          const s = stats.get(member.id) ?? {
            player: member,
            games: 0,
            ballotsSeen: 0,
            votes: emptyVotes(),
            potmWins: 0,
            record: { w: 0, d: 0, l: 0 },
            teamOfDay: 0,
            points: 0,
            skill: DEFAULT_START,
            provisional: true,
            ovr: null,
            attributes: Object.fromEntries(ABILITIES.map((a) => [a, null])) as Record<Ability, number | null>,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
            saves: 0,
            viiPicks: 0,
            viiOfDay: 0,
            bestOnTeam: 0,
            evidence: {},
            evidenceGames: 0,
          };
          s.games += 1;
          s.ballotsSeen += voters.size - (voters.has(member.id) ? 1 : 0);
          for (const v of sv) if (v.nomineeId === member.id) s.votes[v.category] += 1;
          if (potmTop > 0 && potm.get(member.id) === potmTop) s.potmWins += 1;
          const side = sideOf(member.id);
          if (side && mateTop.get(side) && mate.get(member.id) === mateTop.get(side)) s.bestOnTeam += 1;
          s.viiPicks += sv.filter((v) => v.nomineeId === member.id && (v.category === VoteCategory.VII || v.category === VoteCategory.VII_SUB)).length;
          if (viiOfDay.has(member.id)) s.viiOfDay += 1;
          s.goals += sessionGoals.filter((g) => g.scorerId === member.id).length;
          s.assists += sessionGoals.filter((g) => g.assistId === member.id).length;
          for (const e of eventsBySession.get(session.id) ?? []) {
            if (e.playerId !== member.id) continue;
            if (e.kind === 'yellow') s.yellowCards += 1;
            else if (e.kind === 'red') s.redCards += 1;
            else if (e.kind === 'save') s.saves += 1;
          }

          // Award evidence, split evenly across what each award says about them.
          if (awardVoters.size) s.evidenceGames += 1;
          const ab = ability.get(member.id) ?? noEvidence();
          const ev = evidence.get(member.id) ?? new Map();
          for (const [category, who] of awardVoters) {
            const chances = who.size - (who.has(member.id) ? 1 : 0);
            const expected = chances / Math.max(1, squad.length - 1);
            let got = 0;
            let raw = 0;
            for (const v of sv) {
              if (v.category !== category || v.nomineeId !== member.id) continue;
              const key = `${v.voterId}:${member.id}:${evidenceKey(category)}`;
              const k = (repeats.get(key) ?? 0) + 1;
              repeats.set(key, k);
              got += 1 / k;
              raw += 1;
            }
            const parts = abilitiesOf.get(category)!;
            for (const a of parts) {
              ab[a].n += got / parts.length;
              ab[a].e += expected / parts.length;
            }
            const e = ev.get(evidenceKey(category)) ?? { nominations: 0, voters: new Set<string>(), games: 0, chances: 0 };
            e.nominations += raw;
            e.chances += chances;
            if (raw) e.games += 1;
            for (const v of sv) if (v.category === category && v.nomineeId === member.id) e.voters.add(v.voterId);
            ev.set(evidenceKey(category), e);
          }
          ability.set(member.id, ab);
          evidence.set(member.id, ev);

          if (side) {
            const pay = session.payments?.find((p) => p.playerId === member.id);
            for (const g of gamesBySession.get(session.id) ?? []) {
              if ((g.teamA !== side && g.teamB !== side) || !playedIn(pay, g)) continue;
              const mine = g.teamA === side ? g.scoreA : g.scoreB;
              const theirs = g.teamA === side ? g.scoreB : g.scoreA;
              if (mine > theirs) s.record.w += 1;
              else if (mine === theirs) s.record.d += 1;
              else s.record.l += 1;
            }
            if (dayWinner.get(session.id) === side) s.teamOfDay += 1;
          }
          stats.set(member.id, s);
        }
      } catch (err) {
        this.logger.error(`Ratings: skipped game ${session.id} (${String(session.date)}): ${err instanceof Error ? err.stack : err}`);
      }
    }

    for (const [id, s] of stats) {
      s.points = tablePoints(s);
      s.evidence = Object.fromEntries(
        [...(evidence.get(id) ?? new Map()).entries()].map(([k, e]) => [
          k,
          { nominations: e.nominations, voters: e.voters.size, games: e.games, share: e.chances ? e.nominations / e.chances : 0, enough: e.voters.size >= AWARD_MIN_VOTERS },
        ]),
      );
      Object.assign(s, playerCard(skills.get(id), ability.get(id) ?? noEvidence(), s.votes.potm, s.ballotsSeen));
    }
    return stats;
  }

  private gamesQuery(organizationId: string) {
    return this.sessionsRepo
      .createQueryBuilder('session')
      .innerJoin('session.group', 'group')
      .leftJoinAndSelect('session.payments', 'payment')
      .leftJoinAndSelect('payment.player', 'player')
      .where('group.organizationId = :organizationId', { organizationId })
      .andWhere('session.kind = :kind', { kind: SessionKind.GAME })
      .andWhere('session.status != :cancelled', { cancelled: SessionStatus.CANCELLED })
      .andWhere('session.date <= CURRENT_DATE');
  }

  /** A player's recent match days: their side, how the day went, and who won POTM. */
  async recentForPlayer(playerId: string, organizationId: string, limit = 10) {
    const sessions = (
      await this.gamesQuery(organizationId)
        .leftJoinAndSelect('session.group', 'g')
        .orderBy('session.date', 'DESC')
        .getMany()
    )
      .filter((s) => s.payments?.some((p) => p.playerId === playerId))
      .slice(0, limit);
    if (!sessions.length) return [];

    const ids = sessions.map((s) => s.id);
    const [games, votes] = await Promise.all([
      this.gamesRepo.find({ where: { sessionId: In(ids) }, order: { createdAt: 'ASC' } }),
      this.votesRepo.find({ where: { sessionId: In(ids) } }),
    ]);

    return Promise.all(
      sessions.map(async (s) => {
        const pay = s.payments?.find((p) => p.playerId === playerId);
        const myTeam = pay?.team ?? null;
        const dayGames = games.filter((g) => g.sessionId === s.id);
        const record = { w: 0, d: 0, l: 0 };
        for (const g of dayGames) {
          if (!myTeam || (g.teamA !== myTeam && g.teamB !== myTeam) || !playedIn(pay, g)) continue;
          const mine = g.teamA === myTeam ? g.scoreA : g.scoreB;
          const theirs = g.teamA === myTeam ? g.scoreB : g.scoreA;
          if (mine > theirs) record.w++;
          else if (mine === theirs) record.d++;
          else record.l++;
        }
        const potmCounts = new Map<string, number>();
        const w = this.window(s);
        // The winner is only known once the vote closes.
        const sv = w.open ? [] : votes.filter((v) => v.sessionId === s.id);
        for (const v of sv) if (v.category === VoteCategory.POTM) potmCounts.set(v.nomineeId, (potmCounts.get(v.nomineeId) ?? 0) + 1);
        const [potmId, potmVotes] = [...potmCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
        const potmPlayer = potmId ? s.payments?.find((p) => p.playerId === potmId)?.player : null;
        return {
          sessionId: s.id,
          date: s.date,
          groupId: s.groupId,
          groupName: s.group?.name,
          teamCount: s.teamCount,
          myTeam,
          captains: this.captainsOf(s),
          /** Each side's bib colour and name for this game (its own, else the group's). */
          bibs: bibsFor(s),
          teamOpen: this.bibsOpen(s, dayGames.length > 0),
          teamOfTheDay: this.standings(s.teamCount, dayGames, s.plan).teamOfTheDay,
          record,
          games: dayGames.length,
          potm: potmPlayer ? { name: sheetName(potmPlayer), votes: potmVotes, isMe: potmId === playerId, photoKey: potmPlayer.photoKey ?? null } : null,
          vote:
            w.open && this.cameTo(s, playerId)
              ? { token: await this.ensureVotingToken(s.id), voted: votes.some((v) => v.sessionId === s.id && v.voterId === playerId) }
              : null,
          /** For the match-day share card, once the game has kicked off. */
          shareToken: w.notYet ? null : await this.ensureVotingToken(s.id),
        };
      }),
    );
  }

  /**
   * A group's table. `lastDays` limits it to the latest match days ("Last 5 match days"). Each row
   * also carries `form`, how the player's own last three match days went (W more games won than
   * lost, L fewer, D level; from the latest six), and `move`, places up (+) or down since before the latest match
   * day (null when they weren't in the table then).
   */
  async getGroupTable(groupId: string, organizationId: string, range?: number | TableRange) {
    const { last: lastDays, from, to } = typeof range === 'number' ? { last: range, from: undefined, to: undefined } : (range ?? {});
    const group = await this.groupsRepo.findOne({ where: { id: groupId, organizationId } });
    if (!group) throw new NotFoundException('Group not found');
    const all = await this.gamesQuery(organizationId).andWhere('session.groupId = :groupId', { groupId }).getMany();
    // Oldest first, so the latest match days are at the end.
    all.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.createdAt.getTime() - b.createdAt.getTime());
    // A date range (this month, last month, this year), then the latest N match days of it.
    const inRange = all.filter((x) => (!from || String(x.date).slice(0, 10) >= from) && (!to || String(x.date).slice(0, 10) <= to));
    const sessions = lastDays ? inRange.slice(-lastDays) : inRange;
    const skills = await this.skills(organizationId);
    // Ranked by the card's rating (Matt, 24 Oct): 40% goals and assists, 40% votes, 20% results,
    // so a player isn't top just for being on the winning side. The card's number is the club's,
    // all time, whatever period the table covers; level on rating, points decide.
    const { card } = await this.clubCard(organizationId);
    const latest = sessions[sessions.length - 1];
    const cardBefore = sessions.length > 1 ? (await this.clubCard(organizationId, latest.id)).card : null;
    const ranked = async (list: Session[], ratings: Map<string, number>) =>
      [...(await this.aggregate(list, skills)).values()].sort(
        (a, b) =>
          (ratings.get(b.player.id) ?? b.ovr ?? 0) - (ratings.get(a.player.id) ?? a.ovr ?? 0) ||
          b.points - a.points ||
          b.potmWins - a.potmWins ||
          b.record.w - a.record.w ||
          b.games - a.games,
      );
    const rows = await ranked(sessions, card);
    const before = cardBefore ? await ranked(sessions.slice(0, -1), cardBefore) : [];
    const placeBefore = new Map(before.map((r, i) => [r.player.id, i]));
    // Each of the latest six match days on its own, oldest first: form is a player's last three of them.
    const days = await Promise.all(sessions.slice(-6).map((s) => this.aggregate([s], skills)));
    return {
      games: sessions.length,
      /** The latest match day the table counts. */
      lastDate: sessions.length ? String(sessions[sessions.length - 1].date).slice(0, 10) : null,
      /** The group's join link code: the table's share link is built on it. */
      shareCode: group.inviteCode ?? null,
      /** What the table is ranked by: the card's rating (points still shown, and break a tie). */
      rankedBy: 'rating' as const,
      points: POINTS,
      rows: rows.map((r, i) => {
        const was = placeBefore.get(r.player.id);
        const form = days
          .map((d) => d.get(r.player.id)?.record)
          .filter((rec): rec is { w: number; d: number; l: number } => !!rec && rec.w + rec.d + rec.l > 0)
          .map((rec) => (rec.w > rec.l ? 'W' : rec.w < rec.l ? 'L' : 'D') as 'W' | 'D' | 'L')
          .slice(-3);
        return { ...r, ovr: card.get(r.player.id) ?? r.ovr, form, move: was === undefined || !before.length ? null : was - i };
      }),
    };
  }

  /**
   * A player's card for its share link (the player's id, which isn't guessable): their rating,
   * attributes and numbers, and where they rank in the club. Nothing about money.
   */
  async getPublicPlayerCard(playerId: string) {
    const player = await this.sessionsRepo.manager.findOne(Player, {
      where: { id: playerId },
      relations: ['organization', 'memberships', 'memberships.group'],
    });
    if (!player) throw new NotFoundException('This card link is not valid.');
    const r = await this.getPlayerRatings(player.id, player.organizationId);
    const rank = (k: keyof StatCompare) => (r.compare[k] ? { rank: r.compare[k].rank, of: r.compare[k].of } : null);
    return {
      name: sheetName(player),
      fullName: `${player.firstName} ${player.lastName}`.trim(),
      nickname: player.nickname || null,
      photoKey: player.photoKey ?? null,
      clubName: player.organization?.name ?? null,
      groups: (player.memberships ?? []).map((m) => m.group?.name).filter((n): n is string => !!n),
      ovr: r.ovr,
      provisional: r.provisional,
      attributes: r.attributes,
      games: r.games,
      record: r.record,
      points: r.points,
      goals: r.goals,
      assists: r.assists,
      saves: r.saves,
      potmWins: r.potmWins,
      viiOfDay: r.viiOfDay,
      teamOfDay: r.teamOfDay,
      ranks: { goals: rank('goals'), assists: rank('assists'), potmWins: rank('potmWins'), points: rank('points'), viiOfDay: rank('viiOfDay'), wins: rank('wins') },
    };
  }

  /**
   * A group's table for its share link, found by the group's join-link code (already public, and
   * the organiser can reset it): names, faces and points only, nothing about money. The top ten.
   */
  async getPublicTable(code: string, range?: number | TableRange) {
    const lastDays = typeof range === 'number' ? range : range?.last;
    const group = await this.groupsRepo.findOne({ where: { inviteCode: code }, relations: ['organization'] });
    if (!group) throw new NotFoundException('This table link is not valid any more.');
    const t = await this.getGroupTable(group.id, group.organizationId, range);
    return {
      groupName: group.name,
      from: typeof range === 'object' ? (range.from ?? null) : null,
      to: typeof range === 'object' ? (range.to ?? null) : null,
      clubName: group.organization?.name ?? null,
      games: t.games,
      last: lastDays ?? null,
      lastDate: t.lastDate,
      rankedBy: t.rankedBy,
      points: t.points,
      total: t.rows.length,
      rows: t.rows.slice(0, 10).map((r) => ({
        id: r.player.id,
        name: sheetName(r.player),
        short: pitchName(r.player),
        fullName: `${r.player.firstName} ${r.player.lastName}`.trim(),
        nickname: r.player.nickname || null,
        photoKey: r.player.photoKey ?? null,
        points: r.points,
        games: r.games,
        w: r.record.w,
        d: r.record.d,
        l: r.record.l,
        potmWins: r.potmWins,
        teamOfDay: r.teamOfDay,
        form: r.form,
        move: r.move,
        ovr: r.ovr ?? null,
      })),
    };
  }

  /**
   * The trial 40/40/20 rating for a group's players, beside the card's rating, for the organiser
   * only. Worked out across the club, all time, like the card. Changes nothing anyone else sees.
   */
  async getRatingTrial(groupId: string, organizationId: string) {
    const group = await this.groupsRepo.findOne({ where: { id: groupId, organizationId }, relations: ['memberships'] });
    if (!group) throw new NotFoundException('Group not found');
    const members = new Set((group.memberships ?? []).map((m) => m.playerId));
    const { everyone, trial } = await this.clubCard(organizationId);
    const rows = everyone
      .filter((r) => members.has(r.player.id) && r.games > 0)
      .map((r) => ({
        player: r.player,
        games: r.games,
        ballotsSeen: r.ballotsSeen,
        goals: r.goals,
        assists: r.assists,
        // What the card showed before 20 Oct, for comparing.
        oldOvr: r.ovr,
        ...trial.get(r.player.id)!,
      }))
      .sort((a, b) => b.trial - a.trial || (b.oldOvr ?? 0) - (a.oldOvr ?? 0));
    return { weights: TRIAL_WEIGHTS, rows };
  }

  /**
   * How one player's card number is made: each part's score, what went into it, and where they
   * stand in the club on it. Everyone can see anyone's (Matt, 20 Oct). Null if they haven't
   * played, when the card shows the level their organiser gave them.
   */
  async ratingBreakdown(playerId: string, organizationId: string) {
    const { everyone, trial } = await this.clubCard(organizationId);
    const me = everyone.find((r) => r.player.id === playerId && r.games > 0);
    if (!me) return null;
    const t = trial.get(playerId)!;
    const played = everyone.filter((r) => r.games > 0);
    // Where they stand on a part: 1 + how many have a higher score; ties share. Null when everyone's
    // level on it (no votes yet, say): a place would mean nothing.
    const placeOn = (k: keyof TrialRating['parts']) =>
      played.every((r) => trial.get(r.player.id)!.parts[k] === t.parts[k]) ? null : 1 + played.filter((r) => trial.get(r.player.id)!.parts[k] > t.parts[k]).length;
    const awards = Object.entries(me.evidence ?? {})
      .filter(([, e]) => e && e.enough)
      .map(([key, e]) => ({ key, share: Math.round(e!.share * 100) / 100 }));
    return {
      player: me.player,
      rating: t.trial,
      weights: TRIAL_WEIGHTS,
      of: played.length,
      worth: { save: SAVE_WORTH, yellow: YELLOW_COST, red: RED_COST },
      stats: {
        score: t.parts.stats,
        place: placeOn('stats'),
        games: me.games,
        goals: me.goals,
        assists: me.assists,
        saves: me.saves,
        yellowCards: me.yellowCards,
        redCards: me.redCards,
      },
      votes: {
        score: t.parts.votes,
        place: placeOn('votes'),
        ballots: me.ballotsSeen,
        potmVotes: me.votes.potm ?? 0,
        potmWins: me.potmWins,
        viiPicks: me.viiPicks,
        awards,
      },
      results: {
        score: t.parts.results,
        place: placeOn('results'),
        record: me.record,
        skill: me.skill,
      },
    };
  }

  /**
   * A player's ratings across the club, all time, with this calendar year's alongside. Each
   * carries `compare`: for the main numbers, the club's average (in total and per game) and
   * where this player ranks, among everyone who has played in that period.
   */
  async getPlayerRatings(playerId: string, organizationId: string): Promise<PlayerRatings & { compare: StatCompare; season: PlayerRatings & { compare: StatCompare } }> {
    const sessions = await this.gamesQuery(organizationId).getMany();
    const { skills, card } = await this.clubCard(organizationId);
    const year = String(new Date().getFullYear());
    const of = async (list: Session[]): Promise<PlayerRatings & { compare: StatCompare }> => {
      const everyone = await this.aggregate(list, skills);
      const compare = compareStats([...everyone.values()].filter((r) => r.games > 0), playerId);
      const s = everyone.get(playerId);
      if (s) {
        const { player: _player, ...ratings } = s;
        // One card number, the club's all-time rating, for this season's view too.
        return { ...ratings, ovr: card.get(playerId) ?? ratings.ovr, compare };
      }
      // Not played yet: the card starts from their level.
      return { ...blankRatings(), ...playerCard(skills.get(playerId), noEvidence(), 0, 0), compare };
    };
    return { ...(await of(sessions)), season: await of(sessions.filter((s) => String(s.date).startsWith(year))) };
  }


}
