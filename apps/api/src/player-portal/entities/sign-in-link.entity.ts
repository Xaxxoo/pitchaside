import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A one-time link an organiser sends a player on WhatsApp so they can get into the app without
 * their old password (or set one for the first time). Only a hash of the token is stored; it works
 * once, for 24 hours, and a newer link for the same player cancels the older one.
 */
@Entity('sign_in_links')
export class SignInLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash: string;

  @Index()
  @Column({ name: 'player_id', type: 'uuid' })
  playerId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  /** The organiser who sent it, by name, for the record. */
  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
