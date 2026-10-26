import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organisers can verify their identity with a NIN as well as a BVN; either one unlocks a group
 * collection account.
 */
export class UserNin1795800000000 implements MigrationInterface {
  name = 'UserNin1795800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nin" varchar(11)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "nin"`);
  }
}
