import { MigrationInterface, QueryRunner } from 'typeorm';

export class OutgoingTransfers1791200000000 implements MigrationInterface {
  name = 'OutgoingTransfers1791200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN CREATE TYPE "public"."outgoing_transfers_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await q.query(`CREATE TABLE IF NOT EXISTS "outgoing_transfers" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "group_id" uuid NOT NULL,
      "amount" numeric(12,2) NOT NULL,
      "fee" numeric(12,2) NOT NULL DEFAULT 0,
      "beneficiary_account" character varying NOT NULL,
      "beneficiary_name" character varying NOT NULL,
      "beneficiary_bank_code" character varying(10) NOT NULL,
      "beneficiary_bank_name" character varying NOT NULL,
      "narration" character varying,
      "status" "public"."outgoing_transfers_status_enum" NOT NULL DEFAULT 'pending',
      "provider_reference" character varying,
      "error_message" character varying,
      "initiated_by_id" uuid,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "completed_at" TIMESTAMP,
      CONSTRAINT "UQ_outgoing_transfers_provider_ref" UNIQUE ("provider_reference"),
      CONSTRAINT "PK_outgoing_transfers" PRIMARY KEY ("id"),
      CONSTRAINT "FK_outgoing_transfers_group" FOREIGN KEY ("group_id")
        REFERENCES "groups"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_outgoing_transfers_user" FOREIGN KEY ("initiated_by_id")
        REFERENCES "users"("id") ON DELETE SET NULL
    )`);

    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_outgoing_transfers_group" ON "outgoing_transfers" ("group_id")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_outgoing_transfers_status" ON "outgoing_transfers" ("status")`);

    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "transfer_pin" character varying`);
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "transfer_pin_set_at" TIMESTAMP`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "transfer_pin_set_at"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "transfer_pin"`);
    await q.query(`DROP TABLE IF EXISTS "outgoing_transfers"`);
    await q.query(`DROP TYPE IF EXISTS "public"."outgoing_transfers_status_enum"`);
  }
}
