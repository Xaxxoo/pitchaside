import { MigrationInterface, QueryRunner } from 'typeorm';

/** Players' "Yes, I've paid" confirmations, used to pair transfers that carry no reference. */
export class PaymentClaims1792400000000 implements MigrationInterface {
  name = 'PaymentClaims1792400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      CREATE TYPE "payment_claims_status_enum" AS ENUM ('pending', 'matched');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`CREATE TABLE IF NOT EXISTS "payment_claims" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "group_id" uuid NOT NULL,
      "player_id" uuid NOT NULL,
      "amount" numeric(12,2) NOT NULL,
      "status" "payment_claims_status_enum" NOT NULL DEFAULT 'pending',
      "transfer_id" uuid,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_payment_claims" PRIMARY KEY ("id"),
      CONSTRAINT "FK_payment_claims_group" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_payment_claims_player" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_payment_claims_transfer" FOREIGN KEY ("transfer_id") REFERENCES "bank_transfers"("id") ON DELETE SET NULL
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_claims_group_status" ON "payment_claims" ("group_id", "status")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "payment_claims"`);
    await q.query(`DROP TYPE IF EXISTS "payment_claims_status_enum"`);
  }
}
