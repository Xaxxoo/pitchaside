import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Classic ratings are retired (decided 30 Oct with Matt and the council): every club moves to
 * Steady, which counts clean sheets and keepers and can't be swung by one day or a few votes. The
 * time it happened is kept, so the clubs that moved see a one-time note saying why cards changed.
 * Cards are worked out from the games and votes each time, so nothing else needs rewriting.
 */
export class SteadyForEveryone1797700000000 implements MigrationInterface {
  name = 'SteadyForEveryone1797700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ratings_switched_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`UPDATE "organizations" SET "rating_mode" = 'steady', "ratings_switched_at" = now() WHERE "rating_mode" <> 'steady'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Which clubs were on Classic isn't kept beyond the switch time: those go back
    await q.query(`UPDATE "organizations" SET "rating_mode" = 'classic' WHERE "ratings_switched_at" IS NOT NULL`);
    await q.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "ratings_switched_at"`);
  }
}
