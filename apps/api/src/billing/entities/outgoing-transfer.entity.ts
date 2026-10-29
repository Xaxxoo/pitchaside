import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { Pitch } from '../../pitches/entities/pitch.entity';
import { User } from '../../users/entities/user.entity';
import { Player } from '../../players/entities/player.entity';

/** What a withdrawal was for. A refund to a player is 'refund' (set automatically). */
export const PAYOUT_CATEGORIES = ['pitch', 'footballs', 'bibs', 'water', 'supplies', 'refund', 'other'] as const;
export type PayoutCategory = (typeof PAYOUT_CATEGORIES)[number];

export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('outgoing_transfers')
export class OutgoingTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'group_id', nullable: true })
  groupId: string | null;

  @ManyToOne(() => Pitch, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'pitch_id' })
  pitch: Pitch;

  @Column({ name: 'pitch_id', type: 'uuid', nullable: true })
  pitchId: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fee: number;

  @Column({ name: 'beneficiary_account' })
  beneficiaryAccount: string;

  @Column({ name: 'beneficiary_name' })
  beneficiaryName: string;

  @Column({ name: 'beneficiary_bank_code', type: 'varchar', length: 10 })
  beneficiaryBankCode: string;

  @Column({ name: 'beneficiary_bank_name' })
  beneficiaryBankName: string;

  @Column({ nullable: true })
  narration: string;

  /** What the money went on: pitch, footballs, bibs… (null for withdrawals made before categories). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  category: PayoutCategory | null;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ name: 'provider_reference', nullable: true, unique: true })
  providerReference: string;

  @Column({ name: 'error_message', nullable: true })
  errorMessage: string;

  /**
   * Set when this payout refunds a member's credit: it's taken from their credit when sent
   * and given back if the transfer fails or is cancelled.
   */
  @ManyToOne(() => Player, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'refund_player_id' })
  refundPlayer: Player;

  @Column({ name: 'refund_player_id', type: 'uuid', nullable: true })
  refundPlayerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'initiated_by_id' })
  initiatedBy: User;

  @Column({ name: 'initiated_by_id', nullable: true })
  initiatedById: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;
}
