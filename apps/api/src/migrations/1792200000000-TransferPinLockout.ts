import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransferPinLockout1792200000000 implements MigrationInterface {
  name = 'TransferPinLockout1792200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "transfer_pin_failed_attempts" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "transfer_pin_locked_until" TIMESTAMP`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "transfer_pin_locked_until"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "transfer_pin_failed_attempts"`);
  }
}
