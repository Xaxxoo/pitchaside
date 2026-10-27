import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Emails about games, payments and votes are on for everyone unless they switch them off: one
 * flag on each player record and each organiser account, true for everyone already here too.
 */
export class EmailNotices1795700000000 implements MigrationInterface {
  name = 'EmailNotices1795700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "email_notices" boolean NOT NULL DEFAULT true`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notices" boolean NOT NULL DEFAULT true`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "players" DROP COLUMN IF EXISTS "email_notices"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_notices"`);
  }
}
