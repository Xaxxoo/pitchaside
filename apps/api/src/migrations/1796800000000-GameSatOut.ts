import { MigrationInterface, QueryRunner } from 'typeorm';

/** Who sat a game out, so a sub who played 1 of 4 games isn't counted as playing all 4. */
export class GameSatOut1796800000000 implements MigrationInterface {
  name = 'GameSatOut1796800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "session_games" ADD COLUMN IF NOT EXISTS "sat_out" jsonb`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "session_games" DROP COLUMN IF EXISTS "sat_out"`);
  }
}
