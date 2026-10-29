import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds virtual account support to pitches so pitch owners can collect booking payments
 * directly via Payrep, then withdraw to their personal bank.
 */
export class PitchVirtualAccounts1797300000000 implements MigrationInterface {
  name = 'PitchVirtualAccounts1797300000000';

  public async up(q: QueryRunner): Promise<void> {
    // Pitch virtual account columns
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "account_number" varchar UNIQUE`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "account_name" varchar`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "virtual_bank_name" varchar`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "account_reference" varchar`);

    // bank_transfers.pitch_id
    await q.query(`ALTER TABLE "bank_transfers" ADD COLUMN IF NOT EXISTS "pitch_id" uuid`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_bank_transfers_pitch_id" ON "bank_transfers" ("pitch_id")`);
    await q.query(`ALTER TABLE "bank_transfers" ADD CONSTRAINT "FK_bank_transfers_pitch_id" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE CASCADE`);

    // outgoing_transfers.pitch_id + make group_id nullable
    await q.query(`ALTER TABLE "outgoing_transfers" ADD COLUMN IF NOT EXISTS "pitch_id" uuid`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_outgoing_transfers_pitch_id" ON "outgoing_transfers" ("pitch_id")`);
    await q.query(`ALTER TABLE "outgoing_transfers" ADD CONSTRAINT "FK_outgoing_transfers_pitch_id" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE CASCADE`);
    await q.query(`ALTER TABLE "outgoing_transfers" ALTER COLUMN "group_id" DROP NOT NULL`);

    // pitch_bookings.incoming_transfer_id
    await q.query(`ALTER TABLE "pitch_bookings" ADD COLUMN IF NOT EXISTS "incoming_transfer_id" uuid`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pitch_bookings" DROP COLUMN IF EXISTS "incoming_transfer_id"`);

    await q.query(`ALTER TABLE "outgoing_transfers" ALTER COLUMN "group_id" SET NOT NULL`);
    await q.query(`ALTER TABLE "outgoing_transfers" DROP CONSTRAINT IF EXISTS "FK_outgoing_transfers_pitch_id"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_outgoing_transfers_pitch_id"`);
    await q.query(`ALTER TABLE "outgoing_transfers" DROP COLUMN IF EXISTS "pitch_id"`);

    await q.query(`ALTER TABLE "bank_transfers" DROP CONSTRAINT IF EXISTS "FK_bank_transfers_pitch_id"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_bank_transfers_pitch_id"`);
    await q.query(`ALTER TABLE "bank_transfers" DROP COLUMN IF EXISTS "pitch_id"`);

    await q.query(`ALTER TABLE "pitches" DROP COLUMN IF EXISTS "account_reference"`);
    await q.query(`ALTER TABLE "pitches" DROP COLUMN IF EXISTS "virtual_bank_name"`);
    await q.query(`ALTER TABLE "pitches" DROP COLUMN IF EXISTS "account_name"`);
    await q.query(`ALTER TABLE "pitches" DROP COLUMN IF EXISTS "account_number"`);
  }
}
