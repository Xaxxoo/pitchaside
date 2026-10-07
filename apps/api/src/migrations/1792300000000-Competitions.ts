import { MigrationInterface, QueryRunner } from 'typeorm';

export class Competitions1792300000000 implements MigrationInterface {
  name = 'Competitions1792300000000';

  public async up(q: QueryRunner): Promise<void> {
    // Enum types
    await q.query(`CREATE TYPE "public"."competitions_format_enum" AS ENUM('knockout', 'league')`);
    await q.query(`CREATE TYPE "public"."competitions_scope_enum" AS ENUM('nationwide', 'state', 'city')`);
    await q.query(`CREATE TYPE "public"."competitions_status_enum" AS ENUM('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')`);
    await q.query(`CREATE TYPE "public"."competitions_visibility_enum" AS ENUM('public', 'invite_only')`);
    await q.query(`CREATE TYPE "public"."competition_teams_registration_status_enum" AS ENUM('pending_payment', 'confirmed', 'withdrawn', 'disqualified')`);
    await q.query(`CREATE TYPE "public"."competition_matches_status_enum" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'walkover')`);

    // competitions table
    await q.query(`CREATE TABLE IF NOT EXISTS "competitions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" character varying NOT NULL,
      "description" text,
      "format" "public"."competitions_format_enum" NOT NULL,
      "scope" "public"."competitions_scope_enum" NOT NULL,
      "state" character varying,
      "city" character varying,
      "visibility" "public"."competitions_visibility_enum" NOT NULL DEFAULT 'public',
      "status" "public"."competitions_status_enum" NOT NULL DEFAULT 'draft',
      "entry_fee" numeric(12,2) NOT NULL DEFAULT 0,
      "max_teams" integer NOT NULL DEFAULT 32,
      "min_players_per_team" integer NOT NULL DEFAULT 5,
      "max_players_per_team" integer NOT NULL DEFAULT 25,
      "registration_deadline" TIMESTAMP,
      "start_date" date,
      "end_date" date,
      "rules" text,
      "invite_code" character varying,
      "account_number" character varying,
      "account_name" character varying,
      "bank_name" character varying,
      "account_reference" character varying,
      "created_by_user_id" uuid,
      "organization_id" uuid NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_competitions_invite_code" UNIQUE ("invite_code"),
      CONSTRAINT "PK_competitions" PRIMARY KEY ("id"),
      CONSTRAINT "FK_competitions_user" FOREIGN KEY ("created_by_user_id")
        REFERENCES "users"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_competitions_organization" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE
    )`);

    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_competitions_status_visibility" ON "competitions" ("status", "visibility")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_competitions_scope_state" ON "competitions" ("scope", "state")`);

    // competition_teams table
    await q.query(`CREATE TABLE IF NOT EXISTS "competition_teams" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "competition_id" uuid NOT NULL,
      "name" character varying NOT NULL,
      "captain_name" character varying NOT NULL,
      "captain_phone" character varying NOT NULL,
      "captain_email" character varying,
      "registration_status" "public"."competition_teams_registration_status_enum" NOT NULL DEFAULT 'pending_payment',
      "paid_at" TIMESTAMP,
      "group_id" uuid,
      "organization_id" uuid,
      "seed" integer,
      "payment_ref" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_competition_team_name" UNIQUE ("competition_id", "name"),
      CONSTRAINT "UQ_competition_team_payment_ref" UNIQUE ("payment_ref"),
      CONSTRAINT "PK_competition_teams" PRIMARY KEY ("id"),
      CONSTRAINT "FK_competition_teams_competition" FOREIGN KEY ("competition_id")
        REFERENCES "competitions"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_competition_teams_organization" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE SET NULL
    )`);

    // competition_matches table
    await q.query(`CREATE TABLE IF NOT EXISTS "competition_matches" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "competition_id" uuid NOT NULL,
      "home_team_id" uuid,
      "away_team_id" uuid,
      "round" integer NOT NULL,
      "match_number" integer NOT NULL,
      "scheduled_date" date,
      "scheduled_time" character varying(5),
      "venue" character varying,
      "home_score" integer,
      "away_score" integer,
      "home_penalties" integer,
      "away_penalties" integer,
      "winner_id" uuid,
      "status" "public"."competition_matches_status_enum" NOT NULL DEFAULT 'scheduled',
      "notes" text,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_competition_matches" PRIMARY KEY ("id"),
      CONSTRAINT "FK_competition_matches_competition" FOREIGN KEY ("competition_id")
        REFERENCES "competitions"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_competition_matches_home_team" FOREIGN KEY ("home_team_id")
        REFERENCES "competition_teams"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_competition_matches_away_team" FOREIGN KEY ("away_team_id")
        REFERENCES "competition_teams"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_competition_matches_winner" FOREIGN KEY ("winner_id")
        REFERENCES "competition_teams"("id") ON DELETE SET NULL
    )`);

    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_competition_matches_round" ON "competition_matches" ("competition_id", "round")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_competition_matches_status" ON "competition_matches" ("competition_id", "status")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "competition_matches"`);
    await q.query(`DROP TABLE IF EXISTS "competition_teams"`);
    await q.query(`DROP TABLE IF EXISTS "competitions"`);
    await q.query(`DROP TYPE IF EXISTS "public"."competition_matches_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "public"."competition_teams_registration_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "public"."competitions_visibility_enum"`);
    await q.query(`DROP TYPE IF EXISTS "public"."competitions_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "public"."competitions_scope_enum"`);
    await q.query(`DROP TYPE IF EXISTS "public"."competitions_format_enum"`);
  }
}
