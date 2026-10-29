import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { Pitch } from '../../pitches/entities/pitch.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Player } from '../../players/entities/player.entity';

export enum TransferStatus {
  /** Automatically matched to a member's pending payment. */
  MATCHED = 'matched',
  /** Admin assigned it to a payment by hand. */
  ASSIGNED = 'assigned',
  /** Couldn't be matched; waiting for an admin. */
  UNMATCHED = 'unmatched',
  /** Admin dismissed it (e.g. not a dues payment). */
  IGNORED = 'ignored',
  /** Money in that isn't a player's payment (the organiser's own top-up, a sponsor…): in the account, never anyone's dues. */
  OTHER = 'other',
}

/** What non-player money in was. */
export const MONEY_IN_CATEGORIES = ['organiser', 'sponsor', 'refund', 'other'] as const;
export type MoneyInCategory = (typeof MONEY_IN_CATEGORIES)[number];

/** Every credit PulseMFB reports into a group account, matched or not. */
@Entity('bank_transfers')
export class BankTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_transaction_id', unique: true })
  providerTransactionId: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'group_id', nullable: true })
  groupId: string;

  @ManyToOne(() => Pitch, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'pitch_id' })
  pitch: Pitch;

  @Index('IDX_bank_transfers_pitch_id')
  @Column({ name: 'pitch_id', type: 'uuid', nullable: true })
  pitchId: string | null;

  @Column({ name: 'account_number' })
  accountNumber: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ name: 'sender_name', nullable: true })
  senderName: string;

  /** The account it came from (last 10 digits), when the bank says. Once an account has paid for one player, it's theirs. */
  @Index('IDX_bank_transfers_sender_account')
  @Column({ name: 'sender_account', type: 'varchar', nullable: true })
  senderAccount: string | null;

  @Column({ nullable: true })
  narration: string;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.UNMATCHED })
  status: TransferStatus;

  /** For money that isn't a player's (status OTHER): what it was. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  category: MoneyInCategory | null;

  /** The organiser's own words about it: "My top-up for bibs". */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ name: 'payment_id', nullable: true })
  paymentId: string;

  /** Who sent it, once known — set even when it only added to their credit and paid no due. */
  @ManyToOne(() => Player, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'player_id' })
  player: Player | null;

  @Column({ name: 'player_id', type: 'uuid', nullable: true })
  playerId: string | null;

  @Column({ name: 'received_at' })
  receivedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  raw: unknown;

  @CreateDateColumn()
  createdAt: Date;
}
