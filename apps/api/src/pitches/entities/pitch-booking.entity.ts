import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Pitch } from './pitch.entity';
import { User } from '../../users/entities/user.entity';

@Entity('pitch_bookings')
export class PitchBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Pitch, (p) => p.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pitch_id' })
  pitch: Pitch;

  @Column({ name: 'pitch_id' })
  pitchId: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'booked_by_id' })
  bookedBy: User | null;

  @Column({ name: 'booked_by_id', type: 'uuid', nullable: true })
  bookedById: string | null;

  @Column({ name: 'booker_name', type: 'varchar' })
  bookerName: string;

  @Column({ name: 'booker_phone', type: 'varchar', nullable: true })
  bookerPhone: string | null;

  @Column({ type: 'date' })
  date: string;

  /** "HH:mm" */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime: string;

  /** "HH:mm" */
  @Column({ name: 'end_time', type: 'varchar', length: 5 })
  endTime: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  /** pending / confirmed / rejected / cancelled */
  @Column({ type: 'varchar', default: 'pending' })
  status: string;

  /** on_platform / off_platform */
  @Column({ name: 'payment_method', type: 'varchar', default: 'off_platform' })
  paymentMethod: string;

  /** unpaid / paid / refunded */
  @Column({ name: 'payment_status', type: 'varchar', default: 'unpaid' })
  paymentStatus: string;

  @Column({ name: 'outgoing_transfer_id', type: 'uuid', nullable: true })
  outgoingTransferId: string | null;

  /** The incoming bank transfer that paid this booking (set when matched or assigned). */
  @Column({ name: 'incoming_transfer_id', type: 'uuid', nullable: true })
  incomingTransferId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
