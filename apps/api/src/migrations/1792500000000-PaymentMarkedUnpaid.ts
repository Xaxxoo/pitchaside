import { MigrationInterface, QueryRunner } from 'typeorm';

/** Allow admins to revert a payment back to pending (mark as unpaid). */
export class PaymentMarkedUnpaid1792500000000 implements MigrationInterface {
  name = 'PaymentMarkedUnpaid1792500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE IF NOT EXISTS 'payment_marked_unpaid'`);
  }

  public async down(): Promise<void> {
    // Postgres does not support removing enum values; the value is harmless if left.
  }
}
