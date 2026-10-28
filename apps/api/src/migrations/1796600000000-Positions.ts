import { MigrationInterface, QueryRunner } from 'typeorm';

/** Where a player usually plays, and where they played on a match day when it was somewhere else. */
export class Positions1796600000000 implements MigrationInterface {
  name = 'Positions1796600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "position" character varying(3)`);
    await q.query(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "position" character varying(3)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "position"`);
    await q.query(`ALTER TABLE "players" DROP COLUMN IF EXISTS "position"`);
  }
}
