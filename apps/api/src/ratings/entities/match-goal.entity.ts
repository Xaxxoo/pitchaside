import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SessionGame } from './session-game.entity';

/**
 * One goal in a short game on match day: which side scored, who scored it and who set it up.
 * A game's score can have more goals than are named here (nobody saw who scored); never fewer.
 * `recordedBy` is who wrote it down, so the organiser can see and override a captain's entries.
 */
@Entity('match_goals')
@Index(['sessionId'])
export class MatchGoal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SessionGame, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_id' })
  game: SessionGame;

  @Column({ name: 'game_id', type: 'uuid' })
  gameId: string;

  @Column({ type: 'varchar', length: 1 })
  team: string;

  @Column({ name: 'scorer_id', type: 'uuid' })
  scorerId: string;

  @Column({ name: 'assist_id', type: 'uuid', nullable: true })
  assistId: string | null;

  /** Put in their own net: it counts for `team`, and `scorerId` is the other side's player who did it. */
  @Column({ name: 'own_goal', type: 'boolean', default: false })
  ownGoal: boolean;

  /** "Tunde (organiser)", "Ada (captain)". */
  @Column({ name: 'recorded_by', type: 'varchar', nullable: true })
  recordedBy: string | null;

  /** Sent by the phone with each save, so a retry of the same tap is saved once (see MatchDayKeys). */
  @Column({ name: 'client_key', type: 'varchar', length: 40, nullable: true, select: false })
  clientKey?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
