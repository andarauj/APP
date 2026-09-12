/**
 * Covers the migration ledger.
 *
 * The behaviour being protected: a migration that throws must not be
 * recorded as applied, so it runs again on the next launch. The previous
 * implementation logged the error and moved on, which meant a database
 * could stay half-migrated indefinitely — a screen reading a column that
 * never got added would then fail with "no such column" and nothing
 * pointing at the cause.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- each test needs a
   fresh '../database' module after jest.resetModules() (beforeEach below);
   a top-level import would be cached once and never reflect that reset. */

const mockExecAsync = jest.fn();
const mockRunAsync = jest.fn();
const mockGetAllAsync = jest.fn();
const mockGetFirstAsync = jest.fn();
const mockStatement = {
  executeAsync: jest.fn().mockResolvedValue(undefined),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

// Must be `mock`-prefixed: jest.mock factories may not close over other
// out-of-scope variables.
const mockDb = {
  execAsync: mockExecAsync,
  runAsync: mockRunAsync,
  getAllAsync: mockGetAllAsync,
  getFirstAsync: mockGetFirstAsync,
  prepareAsync: async () => mockStatement,
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => mockDb,
}));

/** Names written to schema_migrations across the calls made so far. */
function recordedNames(): string[] {
  return mockRunAsync.mock.calls
    .filter(c => String(c[0]).includes('schema_migrations'))
    .map(c => (c[1] as unknown[])[0] as string);
}

beforeEach(() => {
  jest.resetModules();
  mockExecAsync.mockReset().mockResolvedValue(undefined);
  mockRunAsync.mockReset().mockResolvedValue(undefined);
  mockGetAllAsync.mockReset().mockResolvedValue([]);
  mockGetFirstAsync.mockReset().mockResolvedValue(null);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('migration ledger', () => {
  it('records a step that succeeds', async () => {
    const { initDatabase } = require('../database');
    await initDatabase();

    const names = recordedNames();
    expect(names).toContain('migratePlanDays');
    expect(names.length).toBeGreaterThan(0);
  });

  it('does not record a step that throws', async () => {
    // Fail every ALTER, which is what the column migrations issue.
    mockExecAsync.mockImplementation(async (sql: string) => {
      if (String(sql).includes('ALTER TABLE')) throw new Error('disk I/O error');
    });

    const { initDatabase, getFailedMigrations } = require('../database');
    await initDatabase();

    // A failed step leaves no ledger row, so the next launch retries it.
    const failed = getFailedMigrations();
    expect(failed.length).toBeGreaterThan(0);
    for (const name of failed) {
      expect(recordedNames()).not.toContain(name);
    }
  });

  it('surfaces failures instead of only logging them', async () => {
    mockExecAsync.mockImplementation(async (sql: string) => {
      if (String(sql).includes('ALTER TABLE')) throw new Error('disk I/O error');
    });

    const { initDatabase, getFailedMigrations } = require('../database');
    await initDatabase();

    expect(getFailedMigrations().length).toBeGreaterThan(0);
  });

  it('skips steps already in the ledger', async () => {
    mockGetAllAsync.mockImplementation(async (sql: string) => {
      if (String(sql).includes('schema_migrations')) {
        return [{ name: 'migratePlanDays' }, { name: 'migrateExerciseExtras' }];
      }
      return [];
    });

    const { initDatabase } = require('../database');
    await initDatabase();

    // Already applied — must not be written a second time.
    expect(recordedNames()).not.toContain('migratePlanDays');
    expect(recordedNames()).not.toContain('migrateExerciseExtras');
  });

  it('reports nothing failed on a clean run', async () => {
    const { initDatabase, getFailedMigrations } = require('../database');
    await initDatabase();

    expect(getFailedMigrations()).toEqual([]);
  });
});
