import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Club admins can remove a co-organiser or treasurer. The user row stays (payouts and the audit
 * log point at it); `removed_at` stops them signing in or using a session they already have.
 */
export class OrgUserRemoved1795700000000 implements MigrationInterface {
  name = 'OrgUserRemoved1795700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "removed_at" TIMESTAMP`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "removed_at"`);
  }
}
