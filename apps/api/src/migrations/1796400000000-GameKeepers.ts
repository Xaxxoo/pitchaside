import { MigrationInterface, QueryRunner } from 'typeorm';

/** Who was in goal for each side of a short game; null when not recorded (every older game). */
export class GameKeepers1796400000000 implements MigrationInterface {
  name = 'GameKeepers1796400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "session_games" ADD COLUMN IF NOT EXISTS "keeper_a" uuid`);
    await q.query(`ALTER TABLE "session_games" ADD COLUMN IF NOT EXISTS "keeper_b" uuid`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "session_games" DROP COLUMN IF EXISTS "keeper_b"`);
    await q.query(`ALTER TABLE "session_games" DROP COLUMN IF EXISTS "keeper_a"`);
  }
}
