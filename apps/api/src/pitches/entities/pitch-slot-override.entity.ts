import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Pitch } from './pitch.entity';

@Entity('pitch_slot_overrides')
export class PitchSlotOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Pitch, (p) => p.overrides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pitch_id' })
  pitch: Pitch;

  @Column({ name: 'pitch_id' })
  pitchId: string;

  @Column({ type: 'date' })
  date: string;

  /** "HH:mm" */
  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime: string;

  /** "HH:mm" */
  @Column({ name: 'end_time', type: 'varchar', length: 5 })
  endTime: string;

  /** blocked / added / price_override */
  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  price: number | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
