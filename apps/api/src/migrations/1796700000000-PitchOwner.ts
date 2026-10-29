import { MigrationInterface, QueryRunner } from 'typeorm';

export class PitchOwner1796700000000 implements MigrationInterface {
  name = 'PitchOwner1796700000000';

  public async up(q: QueryRunner): Promise<void> {
    // Add pitch_owner to the users role enum
    await q.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'pitch_owner'`);

    // Pitches
    await q.query(`
      CREATE TABLE "pitches" (
        "id"                    uuid DEFAULT uuid_generate_v4() NOT NULL,
        "owner_id"              uuid NOT NULL,
        "name"                  varchar NOT NULL,
        "address"               text,
        "city"                  varchar,
        "state"                 varchar,
        "description"           text,
        "slot_duration_minutes" int NOT NULL DEFAULT 60,
        "default_price"         decimal(12,2) NOT NULL,
        "currency"              varchar(5) NOT NULL DEFAULT 'NGN',
        "share_code"            varchar NOT NULL,
        "status"                varchar NOT NULL DEFAULT 'active',
        "bank_account_number"   varchar(10),
        "bank_code"             varchar(10),
        "bank_name"             varchar,
        "account_holder_name"   varchar,
        "createdAt"             TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pitches" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_pitches_share_code" UNIQUE ("share_code"),
        CONSTRAINT "FK_pitches_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_pitches_owner_id" ON "pitches" ("owner_id")`);

    // Pitch schedules
    await q.query(`
      CREATE TABLE "pitch_schedules" (
        "id"          uuid DEFAULT uuid_generate_v4() NOT NULL,
        "pitch_id"    uuid NOT NULL,
        "day_of_week" smallint NOT NULL,
        "open_time"   varchar(5) NOT NULL,
        "close_time"  varchar(5) NOT NULL,
        "price"       decimal(12,2),
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pitch_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pitch_schedules_pitch" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_pitch_schedules_pitch_day" ON "pitch_schedules" ("pitch_id", "day_of_week")`);

    // Pitch slot overrides
    await q.query(`
      CREATE TABLE "pitch_slot_overrides" (
        "id"         uuid DEFAULT uuid_generate_v4() NOT NULL,
        "pitch_id"   uuid NOT NULL,
        "date"       date NOT NULL,
        "start_time" varchar(5) NOT NULL,
        "end_time"   varchar(5) NOT NULL,
        "type"       varchar NOT NULL,
        "price"      decimal(12,2),
        "reason"     varchar,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pitch_slot_overrides" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pitch_slot_overrides_pitch" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_pitch_slot_overrides_pitch_date" ON "pitch_slot_overrides" ("pitch_id", "date")`);

    // Pitch bookings
    await q.query(`
      CREATE TABLE "pitch_bookings" (
        "id"                    uuid DEFAULT uuid_generate_v4() NOT NULL,
        "pitch_id"              uuid NOT NULL,
        "group_id"              uuid,
        "booked_by_id"          uuid,
        "booker_name"           varchar NOT NULL,
        "booker_phone"          varchar,
        "date"                  date NOT NULL,
        "start_time"            varchar(5) NOT NULL,
        "end_time"              varchar(5) NOT NULL,
        "price"                 decimal(12,2) NOT NULL,
        "status"                varchar NOT NULL DEFAULT 'pending',
        "payment_method"        varchar NOT NULL DEFAULT 'off_platform',
        "payment_status"        varchar NOT NULL DEFAULT 'unpaid',
        "outgoing_transfer_id"  uuid,
        "notes"                 text,
        "rejection_reason"      text,
        "confirmed_at"          TIMESTAMP,
        "paid_at"               TIMESTAMP,
        "createdAt"             TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pitch_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pitch_bookings_pitch" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pitch_bookings_booked_by" FOREIGN KEY ("booked_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_pitch_bookings_pitch_date" ON "pitch_bookings" ("pitch_id", "date")`);
    await q.query(`CREATE INDEX "IDX_pitch_bookings_group" ON "pitch_bookings" ("group_id")`);
    await q.query(`CREATE INDEX "IDX_pitch_bookings_status" ON "pitch_bookings" ("status")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "pitch_bookings"`);
    await q.query(`DROP TABLE IF EXISTS "pitch_slot_overrides"`);
    await q.query(`DROP TABLE IF EXISTS "pitch_schedules"`);
    await q.query(`DROP TABLE IF EXISTS "pitches"`);
    // Note: PostgreSQL doesn't support removing values from enums easily.
  }
}
