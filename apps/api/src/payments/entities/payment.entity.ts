import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Session } from '../../sessions/entities/session.entity';
import { Player } from '../../players/entities/player.entity';

export type Attendance = 'came' | 'no_show';

export enum PaymentStatus {
  PAID = 'paid',
  PENDING = 'pending',
  WAIVED = 'waived',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Session, (session) => session.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Player, (player) => player.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @Column({ name: 'player_id' })
  playerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  markedBy: string;

  /** 'manual' when an admin marked it, 'transfer' when reconciled from a bank transfer. */
  @Column({ nullable: true })
  source: string;

  /** Match-day side: 'A'–'F' (colours in the UI); null = not picked yet. */
  @Column({ type: 'varchar', nullable: true })
  team: string | null;

  /** Captain of their side for this game; the side goes by their name. At most one per side. */
  @Column({ default: false })
  captain: boolean;

  /** Vice-captain of their side for this game: keeps the score too, like the captain. At most one per side. */
  @Column({ name: 'vice_captain', default: false })
  viceCaptain: boolean;

  /**
   * Whether they turned up: null until the organiser ends the game (counts as came), 'came', or
   * 'no_show' — said they were in and didn't come, so there's nothing to pay (status is WAIVED).
   */
  @Column({ type: 'varchar', nullable: true })
  attendance: Attendance | null;

  /**
   * Marked paid by hand on top of a part payment: how much of it came from the money the player
   * had already sent by transfer (their kept money). Goes back to them if the payment is undone.
   */
  @Column({ name: 'from_credit', type: 'decimal', precision: 10, scale: 2, default: 0 })
  fromCredit: string;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Not stored: whether the player has paid for this game, set when sessions are loaded —
   * their own due, or their period's dues when those cover the game.
   */
  gamePaid?: 'paid' | 'unpaid' | 'waived';

  /**
   * Not stored: money the player has already sent towards this due (a part payment), set when
   * sessions are loaded. Only on their oldest unpaid due in the group, which is where it goes.
   */
  paidSoFar?: number;

  /** Not stored: the actual amount the player sent by transfer, set when sessions are loaded. */
  transferAmount?: number;
}
