import { MigrationInterface, QueryRunner } from 'typeorm';

/** Receipts on "I've paid", and the organiser's answer: confirmed on the receipt, or not received. */
export class PaymentReceipts1797000000000 implements MigrationInterface {
  name = 'PaymentReceipts1797000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."payment_claims_status_enum" ADD VALUE IF NOT EXISTS 'confirmed'`);
    await q.query(`ALTER TYPE "public"."payment_claims_status_enum" ADD VALUE IF NOT EXISTS 'rejected'`);
    await q.query(`CREATE TABLE IF NOT EXISTS "payment_receipts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "group_id" uuid NOT NULL,
      "player_id" uuid NOT NULL,
      "data" bytea NOT NULL,
      "mime" character varying(20) NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_payment_receipts" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_receipts_group" ON "payment_receipts" ("group_id")`);
    await q.query(`ALTER TABLE "payment_claims" ADD COLUMN IF NOT EXISTS "receipt_id" uuid`);
    await q.query(`ALTER TABLE "payment_claims" ADD COLUMN IF NOT EXISTS "decided_by" character varying`);
    await q.query(`ALTER TABLE "payment_claims" ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "payment_claims" ADD COLUMN IF NOT EXISTS "note" character varying(200)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "payment_claims" DROP COLUMN IF EXISTS "note"`);
    await q.query(`ALTER TABLE "payment_claims" DROP COLUMN IF EXISTS "decided_at"`);
    await q.query(`ALTER TABLE "payment_claims" DROP COLUMN IF EXISTS "decided_by"`);
    await q.query(`ALTER TABLE "payment_claims" DROP COLUMN IF EXISTS "receipt_id"`);
    await q.query(`DROP TABLE IF EXISTS "payment_receipts"`);
  }
}
