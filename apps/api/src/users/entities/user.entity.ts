import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  MEMBER = 'member',
  /** Can see everything but only record payments (mark paid, waive, match transfers). */
  TREASURER = 'treasurer',
  /** Owns pitches: manages schedules, bookings, and receives payments from organisers. */
  PITCH_OWNER = 'pitch_owner',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Emails when a notification can't reach them: on unless they switch it off. */
  @Column({ name: 'email_notices', default: true })
  emailNotices: boolean;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  /** Links the organiser to their player side (same person, same number). */
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @ManyToOne(() => Organization, (org) => org.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ nullable: true, name: 'two_factor_secret', type: 'varchar' })
  twoFactorSecret: string | null;

  @Column({ default: false, name: 'two_factor_enabled' })
  twoFactorEnabled: boolean;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'email_verification_token', type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ name: 'email_verification_expires_at', type: 'timestamp', nullable: true })
  emailVerificationExpiresAt: Date | null;

  @Column({ name: 'bvn', type: 'varchar', length: 11, nullable: true })
  bvn: string | null;

  /** National Identification Number; a BVN or a NIN unlocks a group collection account. */
  @Column({ name: 'nin', type: 'varchar', length: 11, nullable: true })
  nin: string | null;

  @Column({ name: 'transfer_pin', type: 'varchar', nullable: true })
  transferPin: string | null;

  @Column({ name: 'transfer_pin_set_at', type: 'timestamp', nullable: true })
  transferPinSetAt: Date | null;

  /** Wrong transfer PINs in a row; at TRANSFER_PIN_MAX_ATTEMPTS the PIN locks for a while. */
  @Column({ name: 'transfer_pin_failed_attempts', type: 'int', default: 0 })
  transferPinFailedAttempts: number;

  @Column({ name: 'transfer_pin_locked_until', type: 'timestamp', nullable: true })
  transferPinLockedUntil: Date | null;

  /** Set when a club admin removes this co-organiser or treasurer: they can't sign in or use a session. */
  @Column({ name: 'removed_at', type: 'timestamp', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
