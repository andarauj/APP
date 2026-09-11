/**
 * Real-SQL upgrade coverage for db/database.ts's migration sequence.
 *
 * db/__tests__/migrations.test.ts already covers the ledger's *behaviour*
 * (a failed step is retried, a succeeded one isn't) against a fully mocked
 * expo-sqlite — every call resolves, nothing actually executes SQL. That
 * mock cannot catch a genuinely broken statement: `migrateSecondaryMuscleTokens`
 * shipped with `TRIM(BOTH ',' FROM x)` (Postgres syntax, invalid in SQLite)
 * and passed tsc, lint and that whole suite — the mock happily "ran" SQL it
 * never parsed. It only surfaced on a real device, months of launches later.
 *
 * This file backs the same mock shape with Node's built-in `node:sqlite`
 * engine instead, so `execAsync`/`runAsync`/... actually execute real SQL
 * and a syntax error fails the test the same way it fails on a phone.
 *
 * It also covers the specific gap flagged in ESTADO.md as unverified: a
 * real upgrade from an old install, not just a fresh one. "Old" here means
 * a schema hand-built to match the app's *original* CREATE TABLE
 * statements — before every ALTER-based migration in database.ts existed —
 * seeded with representative rows, then upgraded by running today's
 * initDatabase() against it.
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';

// ---------------------------------------------------------------------------
// A thin expo-sqlite-shaped async wrapper around a real node:sqlite handle.
// Only the methods db/database.ts's migrations and seed helpers actually call.
// ---------------------------------------------------------------------------

function normalizeParams(params: unknown): any[] {
  if (params == null) return [];
  if (Array.isArray(params)) return params;
  // expo-sqlite's prepareAsync().executeAsync({ $name: value }) style.
  if (typeof params === 'object') return [params];
  return [params];
}

function mockWrapRawDb(raw: DatabaseSync) {
  return {
    execAsync: async (sql: string) => {
      raw.exec(sql);
    },
    runAsync: async (sql: string, params: unknown = []) => {
      const stmt = raw.prepare(sql);
      const info = stmt.run(...normalizeParams(params));
      return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
    },
    getAllAsync: async (sql: string, params: unknown = []) => {
      const stmt = raw.prepare(sql);
      return stmt.all(...normalizeParams(params));
    },
    getFirstAsync: async (sql: string, params: unknown = []) => {
      const stmt = raw.prepare(sql);
      const row = stmt.get(...normalizeParams(params));
      return row ?? null;
    },
    prepareAsync: async (sql: string) => {
      const stmt: StatementSync = raw.prepare(sql);
      return {
        executeAsync: async (params: unknown) => {
          const info = stmt.run(...normalizeParams(params));
          return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
        },
        finalizeAsync: async () => {},
      };
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

// jest.mock factories can't close over ordinary out-of-scope variables —
// only `mock`-prefixed ones survive Jest's hoisting. See migrations.test.ts.
let mockRawDb: DatabaseSync;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => mockWrapRawDb(mockRawDb),
}));

/** Every column a real early install's `exercises` table would NOT have had
 *  yet — added later by migrateExerciseExtras / migrateExerciseAltNames /
 *  migrateExerciseApiFields / migrateExerciseVideoFields. */
const LEGACY_SCHEMA = `
  CREATE TABLE exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    primary_muscle TEXT NOT NULL,
    secondary_muscles TEXT DEFAULT '',
    equipment TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'strength',
    instructions TEXT DEFAULT '',
    is_custom INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    plan_type TEXT DEFAULT 'hypertrophy',
    split_type TEXT DEFAULT 'custom',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE plan_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    order_index INTEGER DEFAULT 0,
    sets INTEGER DEFAULT 3,
    reps_target TEXT DEFAULT '8-12',
    weight_target REAL DEFAULT 0,
    rest_seconds INTEGER DEFAULT 30,
    set_type TEXT DEFAULT 'normal',
    superset_group INTEGER DEFAULT NULL,
    notes TEXT DEFAULT ''
  );
  CREATE TABLE workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER DEFAULT NULL,
    name TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER DEFAULT NULL,
    total_duration INTEGER DEFAULT 0,
    total_volume REAL DEFAULT 0,
    total_sets INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
  );
  CREATE TABLE workout_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    set_index INTEGER DEFAULT 0,
    reps INTEGER DEFAULT 0,
    weight REAL DEFAULT 0,
    rpe INTEGER DEFAULT NULL,
    rest_seconds INTEGER DEFAULT 0,
    set_duration INTEGER DEFAULT 0,
    set_type TEXT DEFAULT 'normal',
    completed_at INTEGER DEFAULT (strftime('%s','now')),
    is_pr INTEGER DEFAULT 0
  );
  CREATE TABLE body_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date INTEGER NOT NULL,
    weight REAL DEFAULT NULL,
    body_fat REAL DEFAULT NULL,
    chest REAL DEFAULT NULL,
    waist REAL DEFAULT NULL,
    hips REAL DEFAULT NULL,
    arm REAL DEFAULT NULL,
    thigh REAL DEFAULT NULL
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

function columnsOf(raw: DatabaseSync, table: string): string[] {
  return (raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);
}

function tableExists(raw: DatabaseSync, table: string): boolean {
  const row = raw.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(table);
  return !!row;
}

beforeEach(() => {
  jest.resetModules();
  mockRawDb = new DatabaseSync(':memory:');
});

afterEach(() => {
  mockRawDb.close();
});

describe('fresh install (no pre-existing schema)', () => {
  it('completes every migration with real SQLite and builds the full current schema', async () => {
    const { initDatabase, getFailedMigrations } = require('../database');
    await initDatabase();

    expect(getFailedMigrations()).toEqual([]);

    // Spot-check columns that only exist because a migration added them —
    // on a fresh install they come from the CREATE TABLE itself, but this
    // still proves the statement is valid SQL and the table is queryable.
    expect(columnsOf(mockRawDb, 'exercises')).toEqual(expect.arrayContaining([
      'user_notes', 'media_uri', 'alt_names', 'image_url', 'api_id', 'api_source', 'video_url', 'video_cached_path',
    ]));
    expect(columnsOf(mockRawDb, 'plan_exercises')).toEqual(expect.arrayContaining(['day_label', 'day_index', 'tempo']));
    expect(columnsOf(mockRawDb, 'workout_plans')).toEqual(expect.arrayContaining(['is_auto_generated']));
    expect(columnsOf(mockRawDb, 'body_metrics')).toEqual(expect.arrayContaining(['photo_uri', 'back']));

    // The NSPI engine's tables (this session's own migration).
    for (const t of ['adaptive_plan', 'adaptive_cycle', 'adaptive_week', 'adaptive_exercise_state']) {
      expect(tableExists(mockRawDb, t)).toBe(true);
    }
  });

  it('running initDatabase twice is idempotent — no migration is applied a second time', async () => {
    const { initDatabase, getFailedMigrations } = require('../database');
    await initDatabase();
    const namesAfterFirst = (mockRawDb.prepare('SELECT name FROM schema_migrations ORDER BY name').all() as { name: string }[]).map(r => r.name);
    expect(namesAfterFirst.length).toBeGreaterThan(0);

    await initDatabase(); // same module instance -> same cached dbInstance, same raw DB
    expect(getFailedMigrations()).toEqual([]);
    const namesAfterSecond = (mockRawDb.prepare('SELECT name FROM schema_migrations ORDER BY name').all() as { name: string }[]).map(r => r.name);
    expect(namesAfterSecond).toEqual(namesAfterFirst);
  });
});

describe('upgrade from a real old install', () => {
  /** Seeds the legacy (pre-migration) schema plus rows a genuine years-old
   *  install would still have sitting in it. */
  function seedLegacyInstall() {
    mockRawDb.exec(LEGACY_SCHEMA);
    mockRawDb.exec(`
      INSERT INTO exercises (id, name, primary_muscle, equipment, is_custom) VALUES
        (1, 'Supino com Barra', 'chest', 'barbell', 0),
        (2, 'Agachamento', 'quads', 'barbell', 0);

      INSERT INTO workout_plans (id, name, plan_type, split_type) VALUES
        (1, 'Treino de Hoje — 03/01', 'hypertrophy', 'custom'),
        (2, 'O meu plano ABC', 'hypertrophy', 'ppl');

      INSERT INTO workout_sessions (id, plan_id, name, started_at, ended_at, total_sets) VALUES
        (1, 1, 'Treino de Hoje — 03/01', 1700000000, 1700003600, 3);

      INSERT INTO workout_sets (id, session_id, exercise_id, reps, weight, completed_at) VALUES
        (1, 1, 1, 8, 60, 1700000100);

      INSERT INTO body_metrics (id, date, weight) VALUES (1, 1700000000, 82.5);
    `);
    // A plan whose day split was still encoded in `notes`, the way the old
    // generator wrote it — this is exactly what migratePlanDays recovers.
    const stmt = mockRawDb.prepare(
      `INSERT INTO plan_exercises (plan_id, exercise_id, order_index, sets, notes) VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(2, 1, 0, 3, 'Push');
    stmt.run(2, 2, 1, 3, 'Pull');
  }

  it('adds every missing column, creates the new tables, and never fails a step', async () => {
    seedLegacyInstall();
    const { initDatabase, getFailedMigrations } = require('../database');
    await initDatabase();

    expect(getFailedMigrations()).toEqual([]);

    expect(columnsOf(mockRawDb, 'exercises')).toEqual(expect.arrayContaining([
      'user_notes', 'media_uri', 'alt_names', 'image_url', 'api_id', 'api_source', 'video_url', 'video_cached_path',
    ]));
    expect(columnsOf(mockRawDb, 'plan_exercises')).toEqual(expect.arrayContaining(['day_label', 'day_index', 'tempo']));
    expect(columnsOf(mockRawDb, 'workout_plans')).toEqual(expect.arrayContaining(['is_auto_generated']));
    expect(columnsOf(mockRawDb, 'body_metrics')).toEqual(expect.arrayContaining(['photo_uri', 'back']));
    for (const t of ['adaptive_plan', 'adaptive_cycle', 'adaptive_week', 'adaptive_exercise_state']) {
      expect(tableExists(mockRawDb, t)).toBe(true);
    }
  });

  it('preserves every pre-existing row exactly (ids, values, foreign keys)', async () => {
    seedLegacyInstall();
    const { initDatabase } = require('../database');
    await initDatabase();

    const exercises = mockRawDb.prepare('SELECT id, name, primary_muscle FROM exercises WHERE id IN (1,2) ORDER BY id').all();
    expect(exercises).toEqual([
      { id: 1, name: 'Supino com Barra', primary_muscle: 'chest' },
      { id: 2, name: 'Agachamento', primary_muscle: 'quads' },
    ]);

    const session = mockRawDb.prepare('SELECT id, plan_id, total_sets FROM workout_sessions WHERE id = 1').get();
    expect(session).toEqual({ id: 1, plan_id: 1, total_sets: 3 });

    const set = mockRawDb.prepare('SELECT session_id, exercise_id, reps, weight FROM workout_sets WHERE id = 1').get();
    expect(set).toEqual({ session_id: 1, exercise_id: 1, reps: 8, weight: 60 });

    const metric = mockRawDb.prepare('SELECT weight FROM body_metrics WHERE id = 1').get();
    expect(metric).toEqual({ weight: 82.5 });
  });

  it('recovers day names that the old generator had stuffed into notes (migratePlanDays)', async () => {
    seedLegacyInstall();
    const { initDatabase } = require('../database');
    await initDatabase();

    const rows = mockRawDb.prepare(
      `SELECT exercise_id, day_label, day_index, notes FROM plan_exercises WHERE plan_id = 2 ORDER BY day_index`
    ).all() as { exercise_id: number; day_label: string; day_index: number; notes: string }[];

    expect(rows).toEqual([
      { exercise_id: 1, day_label: 'Push', day_index: 0, notes: '' },
      { exercise_id: 2, day_label: 'Pull', day_index: 1, notes: '' },
    ]);
  });

  it('retroactively flags the auto-generated "Treino de Hoje" plan (migratePlanIsAutoGenerated)', async () => {
    seedLegacyInstall();
    const { initDatabase } = require('../database');
    await initDatabase();

    const auto = mockRawDb.prepare('SELECT is_auto_generated FROM workout_plans WHERE id = 1').get() as { is_auto_generated: number };
    const manual = mockRawDb.prepare('SELECT is_auto_generated FROM workout_plans WHERE id = 2').get() as { is_auto_generated: number };
    expect(auto.is_auto_generated).toBe(1);
    expect(manual.is_auto_generated).toBe(0);
  });
});
