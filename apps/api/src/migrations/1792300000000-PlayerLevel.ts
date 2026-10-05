import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlayerLevel1792300000000 implements MigrationInterface {
  name = 'PlayerLevel1792300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "level" character varying(16)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "players" DROP COLUMN IF EXISTS "level"`);
  }
}
