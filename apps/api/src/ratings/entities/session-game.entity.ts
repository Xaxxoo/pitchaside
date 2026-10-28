import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Session } from '../../sessions/entities/session.entity';

/**
 * One short game on match day between two of the session's sides
 * (winner-stays-on or round robin — the app doesn't mind).
 */
@Entity('session_games')
export class SessionGame {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ name: 'team_a', type: 'varchar', length: 1 })
  teamA: string;

  @Column({ name: 'team_b', type: 'varchar', length: 1 })
  teamB: string;

  @Column({ name: 'score_a', type: 'int' })
  scoreA: number;

  @Column({ name: 'score_b', type: 'int' })
  scoreB: number;

  /** How long it lasted, from the timer when it was running; null when not known. */
  @Column({ type: 'int', nullable: true })
  seconds: number | null;

  /** Who was in goal for each side: anyone playing that day (a keeper borrowed from another team too). Null when not recorded. */
  @Column({ name: 'keeper_a', type: 'uuid', nullable: true })
  keeperA: string | null;

  @Column({ name: 'keeper_b', type: 'uuid', nullable: true })
  keeperB: string | null;

  /**
   * Players on either side who sat this whole game out (a side with more players than the pitch
   * takes). Null or empty: everyone on both sides played it.
   */
  @Column({ name: 'sat_out', type: 'jsonb', nullable: true })
  satOut: string[] | null;

  /** "Tunde (organiser)", "Ada (captain)": who saved the score. */
  @Column({ name: 'recorded_by', type: 'varchar', nullable: true })
  recordedBy: string | null;

  /** Sent by the phone with each save, so a retry of the same tap is saved once (see MatchDayKeys). */
  @Column({ name: 'client_key', type: 'varchar', length: 40, nullable: true, select: false })
  clientKey?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
