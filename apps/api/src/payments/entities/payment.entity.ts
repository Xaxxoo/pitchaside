import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
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

  @Index()
  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Player, (player) => player.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @Index()
  @Column({ name: 'player_id' })
  playerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Index()
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  markedBy: string | null;

  /** 'manual' when an admin marked it, 'transfer' when reconciled from a bank transfer. */
  @Column({ type: 'varchar', nullable: true })
  source: string | null;

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
   * Came late: when they went onto a side, after the day's first score. Only the games saved from
   * then count for them (results and rating). Null when they were on a side from the start.
   */
  @Column({ name: 'joined_side_at', type: 'timestamptz', nullable: true })
  joinedSideAt: Date | null;

  /** Where they're playing on this match day when it isn't their usual position; null: their usual one. */
  @Column({ name: 'position', type: 'varchar', length: 3, nullable: true })
  position: 'GK' | 'DEF' | 'MID' | 'ATT' | null;

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
