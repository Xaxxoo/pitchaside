import { MigrationInterface, QueryRunner } from 'typeorm';

/** Own goals: a goal for one side put in by the other side's player (missed penalties are a match event kind). */
export class OwnGoals1796900000000 implements MigrationInterface {
  name = 'OwnGoals1796900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "match_goals" ADD COLUMN IF NOT EXISTS "own_goal" boolean NOT NULL DEFAULT false`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "match_goals" DROP COLUMN IF EXISTS "own_goal"`);
  }
}
