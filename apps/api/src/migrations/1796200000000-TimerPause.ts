import { MigrationInterface, QueryRunner } from 'typeorm';

/** When the game clock was paused; null while it runs (or isn't started). */
export class TimerPause1796200000000 implements MigrationInterface {
  name = 'TimerPause1796200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "timer_paused_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "sessions" DROP COLUMN IF EXISTS "timer_paused_at"`);
  }
}
