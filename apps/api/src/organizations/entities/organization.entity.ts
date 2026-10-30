import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Group } from '../../groups/entities/group.entity';
import { Player } from '../../players/entities/player.entity';

export type RatingMode = 'classic' | 'steady';
export const RATING_MODES: RatingMode[] = ['classic', 'steady'];

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  state: string;

  @Column({ unique: true, nullable: true })
  inviteCode: string;

  /**
   * How the player card's number is worked out, for the whole club (every group, both apps):
   * 'classic' ranks players against the club (40% stats, 40% votes, 20% results);
   * 'steady' moves a little each match day from what they did (ratings/match-rating.ts).
   */
  @Column({ name: 'rating_mode', type: 'varchar', length: 10, default: 'steady' })
  ratingMode: RatingMode;

  /** When this club was moved from Classic to Steady ratings (null: it was always Steady). */
  @Column({ name: 'ratings_switched_at', type: 'timestamptz', nullable: true })
  ratingsSwitchedAt: Date | null;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => Group, (group) => group.organization)
  groups: Group[];

  @OneToMany(() => Player, (player) => player.organization)
  players: Player[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
