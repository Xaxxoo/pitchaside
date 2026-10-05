import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { GroupMembership } from '../../groups/entities/group-membership.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import type { PlayerLevel } from '../../ratings/skill';

/**
 * A player within one club (organisation). The same person can play for
 * several clubs — their email address ties those records together.
 */
@Entity('players')
@Unique('UQ_players_org_phone', ['organizationId', 'phone'])
@Unique('UQ_players_org_email', ['organizationId', 'email'])
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  /** Optional contact number. Players an organiser added before email sign-in may only have this. */
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  email: string;

  /** Level the organiser gave them before they'd played; seeds their skill rating (null = average). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  level: PlayerLevel | null;

  @ManyToOne(() => Organization, (org) => org.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @OneToMany(() => GroupMembership, (membership) => membership.player)
  memberships: GroupMembership[];

  @OneToMany(() => Payment, (payment) => payment.player)
  payments: Payment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
