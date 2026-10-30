import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PitchSchedule } from './pitch-schedule.entity';
import { PitchSlotOverride } from './pitch-slot-override.entity';
import { PitchBooking } from './pitch-booking.entity';

@Entity('pitches')
export class Pitch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  state: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'slot_duration_minutes', type: 'int', default: 60 })
  slotDurationMinutes: number;

  @Column({ name: 'default_price', type: 'decimal', precision: 12, scale: 2 })
  defaultPrice: number;

  @Column({ type: 'varchar', length: 5, default: 'NGN' })
  currency: string;

  @Column({ name: 'share_code', type: 'varchar', unique: true })
  shareCode: string;

  @Column({ type: 'varchar', default: 'active' })
  status: string;

  @Column({ name: 'bank_account_number', type: 'varchar', length: 10, nullable: true })
  bankAccountNumber: string | null;

  @Column({ name: 'bank_code', type: 'varchar', length: 10, nullable: true })
  bankCode: string | null;

  @Column({ name: 'bank_name', type: 'varchar', nullable: true })
  bankName: string | null;

  @Column({ name: 'account_holder_name', type: 'varchar', nullable: true })
  accountHolderName: string | null;

  /** Dedicated collection account provisioned with Payrep for this pitch. */
  @Column({ name: 'account_number', type: 'varchar', nullable: true, unique: true })
  accountNumber: string | null;

  @Column({ name: 'account_name', type: 'varchar', nullable: true })
  accountName: string | null;

  @Column({
    name: 'virtual_bank_name',
    type: 'varchar',
    nullable: true,
    transformer: { to: (v: string) => v, from: (v: string | null) => (v === 'Pulse Microfinance Bank' ? 'Payrep Microfinance Bank' : v) },
  })
  virtualBankName: string | null;

  /** Provider-side identifier for the account (for support / reconciliation). */
  @Column({ name: 'account_reference', type: 'varchar', nullable: true })
  accountReference: string | null;

  /** A Google or Apple Maps link to the pitch, pasted by the owner. */
  @Column({ name: 'map_url', type: 'varchar', length: 500, nullable: true })
  mapUrl: string | null;

  /** One line to find it on the day. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  directions: string | null;

  /** Players a side it's made for. */
  @Column({ name: 'a_side', type: 'smallint', nullable: true })
  aSide: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  surface: string | null;

  @Column({ name: 'length_m', type: 'smallint', nullable: true })
  lengthM: number | null;

  @Column({ name: 'width_m', type: 'smallint', nullable: true })
  widthM: number | null;

  /** What's there besides the pitch (PITCH_FACILITIES). */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  facilities: string[];

  @OneToMany(() => PitchSchedule, (s) => s.pitch)
  schedules: PitchSchedule[];

  @OneToMany(() => PitchSlotOverride, (o) => o.pitch)
  overrides: PitchSlotOverride[];

  @OneToMany(() => PitchBooking, (b) => b.pitch)
  bookings: PitchBooking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
