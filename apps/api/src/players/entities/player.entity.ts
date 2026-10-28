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
import type { KeeperPref } from '@pitchaside/shared';
import type { Position } from '../../ratings/match-rating';

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

  /** What they're called on the pitch ("Baba"); shown on team sheets in place of their first name. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  nickname: string | null;

  /** Optional contact number. Players an organiser added before email sign-in may only have this. */
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ nullable: true })
  email: string;

  /** Level the organiser gave them before they'd played; seeds their skill rating (null = average). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  level: PlayerLevel | null;

  /** Where they usually play (keeper, defence, midfield, attack); null: not said. Clean sheets and the steady rating use it. */
  @Column({ type: 'varchar', length: 3, nullable: true })
  position: Position | null;

  /** Whether they're happy to go in goal when the match day plan swaps players round; null: don't mind. */
  @Column({ type: 'varchar', length: 12, nullable: true })
  keeper: KeeperPref;

  /** Emails when a notification can't reach them: on unless they switch it off. */
  @Column({ name: 'email_notices', default: true })
  emailNotices: boolean;

  /** Their photo's key in player_photos (served at /api/photos/:key); null for none. */
  @Column({ name: 'photo_key', type: 'varchar', length: 32, nullable: true })
  photoKey: string | null;

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
