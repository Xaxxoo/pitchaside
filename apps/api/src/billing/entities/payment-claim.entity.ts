import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { Player } from '../../players/entities/player.entity';
import { BankTransfer } from './bank-transfer.entity';

export enum ClaimStatus {
  /** Waiting for a transfer it can be paired with. */
  PENDING = 'pending',
  /** Paired with a transfer, which went to the player. */
  MATCHED = 'matched',
  /** The organiser confirmed it on the receipt before the bank reported the money (paid on receipt). */
  CONFIRMED = 'confirmed',
  /** The organiser couldn't find the money ("Not received"). */
  REJECTED = 'rejected',
}

/**
 * A player's "Yes, I've paid" after copying the group account number. On its own it
 * proves nothing; it lets a transfer that arrives without a reference or a matching
 * sender name be paired with them.
 */
@Entity('payment_claims')
@Index(['groupId', 'status'])
export class PaymentClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'group_id' })
  groupId: string;

  @ManyToOne(() => Player, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @Column({ name: 'player_id' })
  playerId: string;

  /** What they say they sent. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.PENDING })
  status: ClaimStatus;

  @ManyToOne(() => BankTransfer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transfer_id' })
  transfer: BankTransfer | null;

  @Column({ name: 'transfer_id', type: 'uuid', nullable: true })
  transferId: string | null;

  /** The screenshot they attached, if any (payment_receipts). */
  @Column({ name: 'receipt_id', type: 'uuid', nullable: true })
  receiptId: string | null;

  /** Who confirmed or turned it down, when, and what they said ("Not received"). */
  @Column({ name: 'decided_by', type: 'varchar', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
