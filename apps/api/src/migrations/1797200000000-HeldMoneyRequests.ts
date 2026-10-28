import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A member's request about money the organiser holds for them: let the group keep it, or send it
 * back. The organiser acts on it; it clears once nothing is held any more.
 */
export class HeldMoneyRequests1797200000000 implements MigrationInterface {
  name = 'HeldMoneyRequests1797200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "group_memberships" ADD COLUMN IF NOT EXISTS "extra_request" varchar(10)`);
    await q.query(`ALTER TABLE "group_memberships" ADD COLUMN IF NOT EXISTS "extra_request_amount" numeric(12,2)`);
    await q.query(`ALTER TABLE "group_memberships" ADD COLUMN IF NOT EXISTS "extra_request_at" timestamptz`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "group_memberships" DROP COLUMN IF EXISTS "extra_request_at"`);
    await q.query(`ALTER TABLE "group_memberships" DROP COLUMN IF EXISTS "extra_request_amount"`);
    await q.query(`ALTER TABLE "group_memberships" DROP COLUMN IF EXISTS "extra_request"`);
  }
}
