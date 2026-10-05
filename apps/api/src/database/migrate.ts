import { DataSource } from 'typeorm';

/**
 * The newest migration that every existing database already has.
 *
 * Until production ran with NODE_ENV=production, TypeORM's `synchronize` kept its tables in
 * step with the entities and no migration ever ran there. So on a database that already has
 * tables, the migrations up to here are recorded as done without running them: their
 * structure is already in place, and their one-off data changes (old team names, phone-keyed
 * player accounts, the Pulse → Payrep bank rename, …) were never part of production's history
 * and shouldn't be replayed years later. Everything after this runs for real.
 */
export const BASELINE_UP_TO = 1792100000000; // GroupLocation

type Log = (message: string) => void;

/** TypeORM's own name/timestamp for a migration: the class name ends in its 13-digit timestamp. */
function identify(migration: { name?: string; constructor: { name: string } }) {
  const name = migration.name ?? migration.constructor.name;
  const timestamp = Number(name.match(/(\d{13})$/)?.[1]);
  return { name, timestamp };
}

/**
 * Records the migrations up to BASELINE_UP_TO as done on a database that was built by
 * `synchronize` (it has tables, but not their migration history). Returns how many it recorded.
 * Safe to run every time: anything already recorded is left alone, and a brand-new empty
 * database gets nothing, so all its migrations run from the start.
 */
export async function baselineMigrations(dataSource: DataSource, log: Log = () => {}): Promise<number> {
  const runner = dataSource.createQueryRunner();
  try {
    if (!(await runner.hasTable('users'))) return 0;

    const table = dataSource.options.migrationsTableName ?? 'migrations';
    await runner.query(
      `CREATE TABLE IF NOT EXISTS "${table}" ("id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_${table}_id" PRIMARY KEY ("id"))`,
    );
    const done = new Set<string>((await runner.query(`SELECT "name" FROM "${table}"`)).map((r: { name: string }) => r.name));

    let recorded = 0;
    for (const migration of dataSource.migrations) {
      const { name, timestamp } = identify(migration);
      if (!(timestamp <= BASELINE_UP_TO) || done.has(name)) continue;
      await runner.query(`INSERT INTO "${table}" ("timestamp", "name") VALUES ($1, $2)`, [timestamp, name]);
      recorded++;
    }
    if (recorded) log(`Recorded ${recorded} migration(s) up to ${BASELINE_UP_TO} as already applied (schema came from synchronize)`);
    return recorded;
  } finally {
    await runner.release();
  }
}

/** Brings the database up to date: baseline if needed, then every pending migration, each in its own transaction. */
export async function runMigrations(dataSource: DataSource, log: Log = console.log): Promise<void> {
  if (!dataSource.isInitialized) await dataSource.initialize();
  try {
    await baselineMigrations(dataSource, log);
    const ran = await dataSource.runMigrations({ transaction: 'each' });
    log(ran.length ? `Ran ${ran.length} migration(s): ${ran.map((m) => m.name).join(', ')}` : 'Database is up to date');
  } finally {
    await dataSource.destroy();
  }
}
