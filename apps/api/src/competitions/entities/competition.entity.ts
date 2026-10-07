import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { CompetitionTeam } from './competition-team.entity';
import { CompetitionMatch } from './competition-match.entity';

export enum CompetitionFormat {
  KNOCKOUT = 'knockout',
  LEAGUE = 'league',
}

export enum CompetitionScope {
  NATIONWIDE = 'nationwide',
  STATE = 'state',
  CITY = 'city',
}

export enum CompetitionStatus {
  DRAFT = 'draft',
  REGISTRATION_OPEN = 'registration_open',
  REGISTRATION_CLOSED = 'registration_closed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum CompetitionVisibility {
  PUBLIC = 'public',
  INVITE_ONLY = 'invite_only',
}

@Entity('competitions')
@Index('IDX_competitions_status_visibility', ['status', 'visibility'])
@Index('IDX_competitions_scope_state', ['scope', 'state'])
export class Competition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: CompetitionFormat })
  format: CompetitionFormat;

  @Column({ type: 'enum', enum: CompetitionScope })
  scope: CompetitionScope;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  city: string;

  @Column({ type: 'enum', enum: CompetitionVisibility, default: CompetitionVisibility.PUBLIC })
  visibility: CompetitionVisibility;

  @Column({ type: 'enum', enum: CompetitionStatus, default: CompetitionStatus.DRAFT })
  status: CompetitionStatus;

  @Column({ name: 'entry_fee', type: 'decimal', precision: 12, scale: 2, default: 0 })
  entryFee: number;

  @Column({ name: 'max_teams', type: 'int', default: 32 })
  maxTeams: number;

  @Column({ name: 'min_players_per_team', type: 'int', default: 5 })
  minPlayersPerTeam: number;

  @Column({ name: 'max_players_per_team', type: 'int', default: 25 })
  maxPlayersPerTeam: number;

  @Column({ name: 'registration_deadline', type: 'timestamp', nullable: true })
  registrationDeadline: Date;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string;

  @Column({ type: 'text', nullable: true })
  rules: string;

  @Column({ name: 'invite_code', nullable: true, unique: true })
  inviteCode: string;

  /** Dedicated collection account provisioned with Payrep for this competition. */
  @Column({ name: 'account_number', nullable: true })
  accountNumber: string;

  @Column({ name: 'account_name', nullable: true })
  accountName: string;

  @Column({ name: 'bank_name', nullable: true })
  bankName: string;

  @Column({ name: 'account_reference', nullable: true })
  accountReference: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User;

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @OneToMany(() => CompetitionTeam, (team) => team.competition)
  teams: CompetitionTeam[];

  @OneToMany(() => CompetitionMatch, (match) => match.competition)
  matches: CompetitionMatch[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
