import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Pitch } from './pitch.entity';

@Entity('pitch_schedules')
export class PitchSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Pitch, (p) => p.schedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pitch_id' })
  pitch: Pitch;

  @Column({ name: 'pitch_id' })
  pitchId: string;

  /** 0 = Sunday, 6 = Saturday. */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number;

  /** "HH:mm" */
  @Column({ name: 'open_time', type: 'varchar', length: 5 })
  openTime: string;

  /** "HH:mm" */
  @Column({ name: 'close_time', type: 'varchar', length: 5 })
  closeTime: string;

  /** Override pitch default price for this day; null = use default. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
