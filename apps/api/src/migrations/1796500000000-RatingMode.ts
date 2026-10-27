import { MigrationInterface, QueryRunner } from 'typeorm';

/** How the club's player cards are worked out: every club stays on 'classic' until its organiser switches. */
export class RatingMode1796500000000 implements MigrationInterface {
  name = 'RatingMode1796500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "rating_mode" character varying(10) NOT NULL DEFAULT 'classic'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "rating_mode"`);
  }
}
