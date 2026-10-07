import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Competition } from './competition.entity';
import { CompetitionTeam } from './competition-team.entity';

export enum MatchStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  WALKOVER = 'walkover',
}

@Entity('competition_matches')
@Index('IDX_competition_matches_round', ['competitionId', 'round'])
@Index('IDX_competition_matches_status', ['competitionId', 'status'])
export class CompetitionMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Competition, (comp) => comp.matches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ name: 'competition_id' })
  competitionId: string;

  @ManyToOne(() => CompetitionTeam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'home_team_id' })
  homeTeam: CompetitionTeam;

  @Column({ name: 'home_team_id', type: 'uuid', nullable: true })
  homeTeamId: string;

  @ManyToOne(() => CompetitionTeam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'away_team_id' })
  awayTeam: CompetitionTeam;

  @Column({ name: 'away_team_id', type: 'uuid', nullable: true })
  awayTeamId: string;

  @Column({ type: 'int' })
  round: number;

  @Column({ name: 'match_number', type: 'int' })
  matchNumber: number;

  @Column({ name: 'scheduled_date', type: 'date', nullable: true })
  scheduledDate: string;

  @Column({ name: 'scheduled_time', type: 'varchar', length: 5, nullable: true })
  scheduledTime: string;

  @Column({ nullable: true })
  venue: string;

  @Column({ name: 'home_score', type: 'int', nullable: true })
  homeScore: number;

  @Column({ name: 'away_score', type: 'int', nullable: true })
  awayScore: number;

  @Column({ name: 'home_penalties', type: 'int', nullable: true })
  homePenalties: number;

  @Column({ name: 'away_penalties', type: 'int', nullable: true })
  awayPenalties: number;

  @ManyToOne(() => CompetitionTeam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'winner_id' })
  winner: CompetitionTeam;

  @Column({ name: 'winner_id', type: 'uuid', nullable: true })
  winnerId: string;

  @Column({ type: 'enum', enum: MatchStatus, default: MatchStatus.SCHEDULED })
  status: MatchStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
