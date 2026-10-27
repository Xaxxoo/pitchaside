import type { Bibs, MatchPlan } from '@pitchaside/shared';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { Payment } from '../../payments/entities/payment.entity';

export enum SessionStatus {
  UPCOMING = 'upcoming',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum SessionKind {
  /** A match day. */
  GAME = 'game',
  /** A billing period for weekly / monthly / quarterly / annual groups. */
  DUES = 'dues',
}

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'group_id' })
  groupId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  targetAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  collectedAmount: number;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.UPCOMING })
  status: SessionStatus;

  @Column({ type: 'enum', enum: SessionKind, default: SessionKind.GAME })
  kind: SessionKind;

  /** Human label for dues periods, e.g. "October 2026". */
  @Column({ nullable: true })
  label: string;

  /** "HH:mm" for this game; null means the group's kick-off time. Use kickoffFor(). */
  @Column({ name: 'kickoff_time', type: 'varchar', length: 5, nullable: true })
  kickoffTime: string | null;

  /** How many sides the squad is split into on match day (2–6). */
  @Column({ name: 'team_count', type: 'int', default: 2 })
  teamCount: number;

  /** Today's game length when changed at the pitch; null: the group's. */
  @Column({ name: 'timer_minutes', type: 'int', nullable: true })
  timerMinutes: number | null;

  /** When the running game's clock was started; null while it isn't running. */
  @Column({ name: 'timer_started_at', type: 'timestamptz', nullable: true })
  timerStartedAt: Date | null;

  /** When the running clock was paused; null while it runs. Resuming moves the start on by the pause. */
  @Column({ name: 'timer_paused_at', type: 'timestamptz', nullable: true })
  timerPausedAt: Date | null;

  /** This game's bibs, when the organiser changed them for the day. Null: the group's bibs. */
  @Column({ type: 'jsonb', nullable: true })
  bibs: Bibs | null;

  /** The day's plan (booked time, game length, swaps), when the organiser made one. See ratings/plan. */
  @Column({ type: 'jsonb', nullable: true })
  plan: MatchPlan | null;

  /** Set once the day-before reminder has gone out. */
  @Column({ name: 'reminder_sent_at', type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  /**
   * When the vote opened: the moment the organiser ended the game. It stays open for 36 hours.
   * Null for games not ended yet, and for games ended before votes were tied to full time.
   */
  @Column({ name: 'vote_opens_at', type: 'timestamptz', nullable: true })
  voteOpensAt: Date | null;

  /** When the vote closed early because everyone who came had voted; null runs the full 36 hours. */
  @Column({ name: 'vote_closed_at', type: 'timestamptz', nullable: true })
  voteClosedAt: Date | null;

  /** Public code for the post-match vote link (/v/:token); created on first use. */
  @Column({ name: 'voting_token', nullable: true, unique: true })
  votingToken: string;

  @OneToMany(() => Payment, (payment) => payment.session)
  payments: Payment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** When a game kicks off ("HH:mm"): its own time, else its group's, else unknown. */
export function kickoffFor(session: Pick<Session, 'kickoffTime'> & { group?: { kickoffTime: string | null } | null }) {
  return session.kickoffTime || session.group?.kickoffTime || null;
}
