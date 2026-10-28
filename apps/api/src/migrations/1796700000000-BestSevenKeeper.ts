import { MigrationInterface, QueryRunner } from 'typeorm';

/** Best VII of the Day gets a keeper: the voter's pick in goal, from those who were in goal that day. */
export class BestSevenKeeper1796700000000 implements MigrationInterface {
  name = 'BestSevenKeeper1796700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."votes_category_enum" ADD VALUE IF NOT EXISTS 'vii_gk'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Postgres can't drop an enum value; the keeper picks just go.
    await q.query(`DELETE FROM "votes" WHERE "category" = 'vii_gk'`);
  }
}
