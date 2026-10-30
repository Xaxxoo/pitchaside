import { MigrationInterface, QueryRunner } from 'typeorm';

/** A group can count its stats from a date, so old trial match days stop counting. */
export class StatsFrom1797800000000 implements MigrationInterface {
  name = 'StatsFrom1797800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "stats_from" date`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "groups" DROP COLUMN "stats_from"`);
  }
}
