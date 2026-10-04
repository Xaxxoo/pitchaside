import { MigrationInterface, QueryRunner } from 'typeorm';

export class GroupLocation1792100000000 implements MigrationInterface {
  name = 'GroupLocation1792100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "location" character varying`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "location"`);
  }
}
