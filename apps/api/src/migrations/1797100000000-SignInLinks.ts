import { MigrationInterface, QueryRunner } from 'typeorm';

/** One-time sign-in links an organiser sends a player who can't get in. */
export class SignInLinks1797100000000 implements MigrationInterface {
  name = 'SignInLinks1797100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS "sign_in_links" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "token_hash" character varying NOT NULL,
      "player_id" uuid NOT NULL,
      "organization_id" uuid NOT NULL,
      "created_by" character varying,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "used_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_sign_in_links" PRIMARY KEY ("id"))`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sign_in_links_token" ON "sign_in_links" ("token_hash")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_sign_in_links_player" ON "sign_in_links" ("player_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "sign_in_links"`);
  }
}
