import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * USDT/USDC payment support for international groups.
 *
 * Adds scope and currency to groups, and creates the tables for crypto wallets,
 * incoming transfers, outgoing transfers, and the HD derivation counter.
 */
export class CryptoPayments1795300000000 implements MigrationInterface {
  name = 'CryptoPayments1795300000000';

  public async up(q: QueryRunner): Promise<void> {
    // ── 1. Group scope & currency ──
    await q.query(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "scope" varchar(15) NOT NULL DEFAULT 'local'`);
    await q.query(`ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "currency" varchar(5) NOT NULL DEFAULT 'NGN'`);

    // ── 2. Group wallets ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS "group_wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "chain_family" varchar(10) NOT NULL,
        "address" varchar(64) NOT NULL,
        "derivation_index" int NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        UNIQUE("group_id", "chain_family")
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_group_wallets_address" ON "group_wallets"("address")`);

    // ── 3. Crypto transfers (incoming) ──
    await q.query(`DO $$ BEGIN CREATE TYPE "crypto_transfer_status_enum" AS ENUM ('matched', 'assigned', 'unmatched', 'ignored', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "crypto_transfers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tx_hash" varchar(128) NOT NULL,
        "chain" varchar(20) NOT NULL,
        "token" varchar(10) NOT NULL,
        "from_address" varchar(64),
        "to_address" varchar(64) NOT NULL,
        "amount" decimal(18,6) NOT NULL,
        "group_id" uuid REFERENCES "groups"("id") ON DELETE CASCADE,
        "player_id" uuid REFERENCES "players"("id") ON DELETE SET NULL,
        "payment_id" uuid REFERENCES "payments"("id") ON DELETE SET NULL,
        "status" "crypto_transfer_status_enum" NOT NULL DEFAULT 'unmatched',
        "category" varchar(20),
        "note" varchar(200),
        "block_number" bigint,
        "confirmations" int DEFAULT 0,
        "received_at" timestamp NOT NULL,
        "raw" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        UNIQUE("tx_hash", "chain")
      )
    `);

    // ── 4. Crypto outgoing transfers ──
    await q.query(`DO $$ BEGIN CREATE TYPE "crypto_payout_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "crypto_outgoing_transfers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "chain" varchar(20) NOT NULL,
        "token" varchar(10) NOT NULL,
        "amount" decimal(18,6) NOT NULL,
        "fee" decimal(18,6) DEFAULT 0,
        "to_address" varchar(64) NOT NULL,
        "tx_hash" varchar(128),
        "status" "crypto_payout_status_enum" NOT NULL DEFAULT 'pending',
        "error_message" text,
        "initiated_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "refund_player_id" uuid REFERENCES "players"("id") ON DELETE SET NULL,
        "category" varchar(20),
        "created_at" timestamp NOT NULL DEFAULT now(),
        "completed_at" timestamp
      )
    `);

    // ── 5. Wallet derivation counter ──
    await q.query(`
      CREATE TABLE IF NOT EXISTS "wallet_derivation_counter" (
        "chain_family" varchar(10) PRIMARY KEY,
        "next_index" int NOT NULL DEFAULT 0
      )
    `);
    await q.query(`
      INSERT INTO "wallet_derivation_counter" ("chain_family", "next_index")
      VALUES ('evm', 0), ('tron', 0), ('solana', 0)
      ON CONFLICT ("chain_family") DO NOTHING
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "wallet_derivation_counter"`);
    await q.query(`DROP TABLE IF EXISTS "crypto_outgoing_transfers"`);
    await q.query(`DROP TYPE IF EXISTS "crypto_payout_status_enum"`);
    await q.query(`DROP TABLE IF EXISTS "crypto_transfers"`);
    await q.query(`DROP TYPE IF EXISTS "crypto_transfer_status_enum"`);
    await q.query(`DROP TABLE IF EXISTS "group_wallets"`);
    await q.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "currency"`);
    await q.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "scope"`);
  }
}
