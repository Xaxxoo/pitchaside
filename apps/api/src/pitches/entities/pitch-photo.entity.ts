import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Pitch } from './pitch.entity';

/**
 * A photo of a pitch, resized on the phone before it's sent and kept in the database like player
 * photos. Each upload gets a new random key, so its address never changes and can be cached for
 * good; the pitch lists its keys in order (the first is the cover).
 */
@Entity('pitch_photos')
export class PitchPhoto {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  key: string;

  @ManyToOne(() => Pitch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pitch_id' })
  pitch: Pitch;

  @Column({ name: 'pitch_id', type: 'uuid' })
  pitchId: string;

  @Column({ type: 'bytea' })
  data: Buffer;

  /** image/jpeg, image/png or image/webp. */
  @Column({ type: 'varchar', length: 20 })
  mime: string;

  @CreateDateColumn()
  createdAt: Date;
}
