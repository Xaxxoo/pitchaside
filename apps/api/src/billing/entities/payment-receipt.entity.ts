import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * The screenshot a player attaches to "I've paid". Private: only that player and their
 * organisers can open it (it shows bank details), never cached publicly. Kept 90 days.
 */
@Entity('payment_receipts')
@Index(['groupId'])
export class PaymentReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId: string;

  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @Column({ type: 'varchar', length: 20 })
  mime: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
