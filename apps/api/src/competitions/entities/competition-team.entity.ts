import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Competition } from './competition.entity';
import { Organization } from '../../organizations/entities/organization.entity';

export enum TeamRegistrationStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  WITHDRAWN = 'withdrawn',
  DISQUALIFIED = 'disqualified',
}

@Entity('competition_teams')
@Unique('UQ_competition_team_name', ['competitionId', 'name'])
export class CompetitionTeam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Competition, (comp) => comp.teams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'competition_id' })
  competition: Competition;

  @Column({ name: 'competition_id' })
  competitionId: string;

  @Column()
  name: string;

  @Column({ name: 'captain_name' })
  captainName: string;

  @Column({ name: 'captain_phone' })
  captainPhone: string;

  @Column({ name: 'captain_email', nullable: true })
  captainEmail: string;

  @Column({
    name: 'registration_status',
    type: 'enum',
    enum: TeamRegistrationStatus,
    default: TeamRegistrationStatus.PENDING_PAYMENT,
  })
  registrationStatus: TeamRegistrationStatus;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id', nullable: true })
  organizationId: string;

  @Column({ type: 'int', nullable: true })
  seed: number;

  @Column({ name: 'payment_ref', nullable: true, unique: true })
  paymentRef: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
