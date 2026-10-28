import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Session } from '../../sessions/entities/session.entity';
import { Player } from '../../players/entities/player.entity';

export enum VoteCategory {
  /** Player of the match. */
  POTM = 'potm',
  /** Fastest on the pitch: no longer asked; earlier votes count towards The Engine. */
  PACE = 'pace',
  /** Best finisher → SHO */
  SHOOTING = 'shooting',
  /** Best passer → PAS */
  PASSING = 'passing',
  /** Rock at the back → DEF */
  DEFENDING = 'defending',
  /** Best goalkeeper → GK */
  KEEPER = 'keeper',
  /** Best on the voter's own team (picked from their teammates). */
  TEAMMATE = 'teammate',
  /** Best VII of the Day: one of the six starters (a voter picks six). */
  VII = 'vii',
  /** Best VII of the Day: the substitute (one per voter). */
  VII_SUB = 'vii_sub',
  /** Best VII of the Day: the keeper, from those who were in goal that day (one per voter). */
  VII_GK = 'vii_gk',
  /** Close control, take-ons, keeping the ball → TEC */
  DRIBBLING = 'dribbling',
  /** Decisions, positioning, reading the game → IQ */
  SMARTEST = 'smartest',
  /** Work rate, recovery runs, pressing → PHY, MOV */
  ENGINE = 'engine',
  /** Making chances for teammates → PAS, IQ */
  PLAYMAKER = 'playmaker',
  /** Finding space, timing runs → MOV, IQ */
  MOVEMENT = 'movement',
}

/** One player's pick for one category in one game. */
@Entity('votes')
// One pick per category, except Best VII's six starters: so one row per voter, category and nominee.
@Unique(['sessionId', 'voterId', 'category', 'nomineeId'])
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: Session;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => Player, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: Player;

  @Column({ name: 'voter_id' })
  voterId: string;

  @Column({ type: 'enum', enum: VoteCategory })
  category: VoteCategory;

  @ManyToOne(() => Player, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nominee_id' })
  nominee: Player;

  @Column({ name: 'nominee_id' })
  nomineeId: string;

  @CreateDateColumn()
  createdAt: Date;
}
