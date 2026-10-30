import { MigrationInterface, QueryRunner } from 'typeorm';

/** New clubs start on Steady ratings (decided 30 Oct with Matt). Clubs already set up keep what they have. */
export class SteadyDefault1797600000000 implements MigrationInterface {
  name = 'SteadyDefault1797600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" ALTER COLUMN "rating_mode" SET DEFAULT 'steady'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "organizations" ALTER COLUMN "rating_mode" SET DEFAULT 'classic'`);
  }
}
