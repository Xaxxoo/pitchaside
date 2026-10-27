import { MigrationInterface, QueryRunner } from 'typeorm';

/** When a player who came late went onto a side; their results count from then. Null for everyone else. */
export class JoinedSideAt1796300000000 implements MigrationInterface {
  name = 'JoinedSideAt1796300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "joined_side_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payments" DROP COLUMN IF EXISTS "joined_side_at"`);
  }
}
