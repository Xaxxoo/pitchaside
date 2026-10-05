import { BASELINE_UP_TO, baselineMigrations } from './migrate';

class InitialSchema1790509519543 {}
class GroupLocation1792100000000 {}
class TransferPinLockout1792200000000 {}

/** A DataSource whose migrations table holds `recorded`, with or without existing tables. */
function fakeDataSource({ hasTables, recorded = [] as string[] }: { hasTables: boolean; recorded?: string[] }) {
  const inserted: { timestamp: number; name: string }[] = [];
  const runner = {
    hasTable: async () => hasTables,
    query: async (sql: string, params?: [number, string]) => {
      if (sql.startsWith('SELECT')) return recorded.map((name) => ({ name }));
      if (sql.startsWith('INSERT')) inserted.push({ timestamp: params![0], name: params![1] });
      return [];
    },
    release: async () => {},
  };
  const dataSource = {
    options: {},
    migrations: [new InitialSchema1790509519543(), new GroupLocation1792100000000(), new TransferPinLockout1792200000000()],
    createQueryRunner: () => runner,
  };
  return { dataSource: dataSource as any, inserted };
}

describe('migration baseline', () => {
  it('records the migrations up to the baseline on a database built by synchronize, not later ones', async () => {
    const { dataSource, inserted } = fakeDataSource({ hasTables: true });
    expect(await baselineMigrations(dataSource)).toBe(2);
    expect(inserted.map((m) => m.name)).toEqual(['InitialSchema1790509519543', 'GroupLocation1792100000000']);
    expect(inserted.every((m) => m.timestamp <= BASELINE_UP_TO)).toBe(true);
  });

  it('leaves migrations that are already recorded alone', async () => {
    const { dataSource, inserted } = fakeDataSource({ hasTables: true, recorded: ['InitialSchema1790509519543'] });
    expect(await baselineMigrations(dataSource)).toBe(1);
    expect(inserted.map((m) => m.name)).toEqual(['GroupLocation1792100000000']);
  });

  it('does nothing on a brand-new database, so every migration runs from the start', async () => {
    const { dataSource, inserted } = fakeDataSource({ hasTables: false });
    expect(await baselineMigrations(dataSource)).toBe(0);
    expect(inserted).toEqual([]);
  });
});
