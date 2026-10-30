import { MigrationInterface, QueryRunner } from 'typeorm';

/** Photos of a pitch: kept like player photos, listed on the pitch in order (first is the cover). */
export class PitchPhotos1797500000000 implements MigrationInterface {
  name = 'PitchPhotos1797500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "photo_keys" text[] NOT NULL DEFAULT '{}'`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pitch_photos" (
        "key"       varchar(32) NOT NULL,
        "pitch_id"  uuid NOT NULL,
        "data"      bytea NOT NULL,
        "mime"      varchar(20) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pitch_photos" PRIMARY KEY ("key"),
        CONSTRAINT "FK_pitch_photos_pitch" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pitch_photos_pitch" ON "pitch_photos" ("pitch_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "pitch_photos"`);
    await q.query(`ALTER TABLE "pitches" DROP COLUMN IF EXISTS "photo_keys"`);
  }
}
