import { MigrationInterface, QueryRunner } from 'typeorm';

/** What a pitch owner tells groups about the pitch: how to find it, its size, surface and facilities. */
export class PitchDetails1797400000000 implements MigrationInterface {
  name = 'PitchDetails1797400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "map_url" varchar(500)`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "directions" varchar(160)`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "a_side" smallint`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "surface" varchar(20)`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "length_m" smallint`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "width_m" smallint`);
    await q.query(`ALTER TABLE "pitches" ADD COLUMN IF NOT EXISTS "facilities" text[] NOT NULL DEFAULT '{}'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const c of ['map_url', 'directions', 'a_side', 'surface', 'length_m', 'width_m', 'facilities']) {
      await q.query(`ALTER TABLE "pitches" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
