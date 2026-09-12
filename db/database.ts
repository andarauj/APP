import * as SQLite from 'expo-sqlite';
import { EXERCISE_SEED_DATA } from './exerciseSeedData';

const DB_NAME = 'changes.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbAvailable = true;
// BUGFIX: two DB-touching actions firing close together during startup (very
// common — several screens load data in parallel with Promise.all as soon as
// isReady flips true) could each see `dbInstance` as null and both call
// SQLite.openDatabaseAsync(...) concurrently, opening two separate
// connections to the same file. Caching the in-flight promise instead of
// just the resolved instance means every caller awaits the SAME open
// operation, so there's only ever one connection.
let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbAvailable) throw new Error('Database unavailable');
  if (dbInstance) return dbInstance;
  if (!openPromise) {
    openPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  dbInstance = await openPromise;
  return dbInstance;
}

export function isDbAvailable(): boolean {
  return dbAvailable;
}

/**
 * Runs one migration/seeding step in isolation. A single step failing (e.g. a
 * transient lock, or a device-specific SQLite quirk) used to throw out of the
 * whole initDatabase() call, which set dbAvailable = false for the entire
 * app session — every screen's DB calls would then fail with "Database
 * unavailable" until the app was force-closed and reopened, even though the
 * core tables were created fine and the rest of the app could have worked
 * normally. Each step is now independent: a failure is logged and skipped
 * rather than taking down every other feature with it.
 */
/** Migration steps that failed on this launch, in the order they ran. */
const failedSteps: string[] = [];

/**
 * Names of migrations that did not complete on the last init.
 *
 * A step that fails is never recorded as applied, so it is retried on the
 * next launch. This list exists so the failure is visible to the app rather
 * than living only in a console line nobody reads.
 */
export function getFailedMigrations(): readonly string[] {
  return failedSteps;
}

async function ensureMigrationLedger(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
}

async function appliedMigrations(db: SQLite.SQLiteDatabase): Promise<Set<string>> {
  try {
    const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM schema_migrations');
    return new Set(rows.map(r => r.name));
  } catch {
    // No ledger yet — every step is pending, which is the safe reading.
    return new Set();
  }
}

/**
 * Runs one migration step, at most once per database.
 *
 * Two things are being balanced here. A step that throws must not take the
 * whole app down: an early version did that, and a single failed ALTER left
 * the app showing "database unavailable" until it was force-closed, even
 * though the core tables were fine. But swallowing the error unconditionally
 * was the opposite failure — the database could carry on half-migrated
 * forever, and a screen reading a column that never got added would throw
 * "no such column" with nothing pointing at the cause.
 *
 * So: success is recorded in schema_migrations and the step never runs
 * again. Failure records nothing, meaning it is retried on the next launch,
 * and the name is kept in failedSteps for getFailedMigrations().
 */
async function runStep(
  name: string,
  step: () => Promise<void>,
  db?: SQLite.SQLiteDatabase,
  applied?: Set<string>,
): Promise<void> {
  if (applied?.has(name)) return;
  try {
    await step();
    if (db) {
      await db.runAsync(
        'INSERT OR REPLACE INTO schema_migrations (name) VALUES (?)',
        [name]
      );
    }
  } catch (err) {
    failedSteps.push(name);
    console.error(`Database init step "${name}" failed (will retry next launch):`, err);
  }
}

export async function initDatabase(): Promise<void> {
  let db: SQLite.SQLiteDatabase;
  try {
    // Only the initial connection + core schema are treated as fatal: without
    // the tables existing at all, nothing in the app can function. Everything
    // after this point is best-effort.
    db = await getDatabase();

    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      primary_muscle TEXT NOT NULL,
      secondary_muscles TEXT DEFAULT '',
      equipment TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'strength',
      instructions TEXT DEFAULT '',
      user_notes TEXT DEFAULT '',
      media_uri TEXT DEFAULT '',
      alt_names TEXT DEFAULT '',
      is_custom INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      image_url TEXT DEFAULT '',
      api_id TEXT DEFAULT '',
      api_source TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      video_cached_path TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(primary_muscle);
    CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment);
    CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);

    CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      plan_type TEXT DEFAULT 'hypertrophy',
      split_type TEXT DEFAULT 'custom',
      is_auto_generated INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS plan_exercises (
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
      day_label TEXT DEFAULT '',
      day_index INTEGER DEFAULT 0,
      tempo TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plan_exercises_plan ON plan_exercises(plan_id);
    -- idx_plan_exercises_day (plan_id, day_index) is NOT created here on
    -- purpose: on a real upgrade this CREATE TABLE is a no-op (the table
    -- already exists from before day_index existed), so an index on that
    -- column here would throw "no such column" and take the whole app down
    -- — this whole block is fatal, unlike the per-step migrations below.
    -- migratePlanDays() creates it safely, after guaranteeing the column
    -- exists. Caught by db/__tests__/migrations.upgrade.test.ts, which runs
    -- these migrations against a real (pre-day_index) legacy schema.

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER DEFAULT NULL,
      day_index INTEGER DEFAULT NULL,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER DEFAULT NULL,
      total_duration INTEGER DEFAULT 0,
      total_volume REAL DEFAULT 0,
      total_sets INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON workout_sessions(started_at);

    CREATE TABLE IF NOT EXISTS workout_sets (
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
      is_pr INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id);
    CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_sets_completed ON workout_sets(completed_at);

    CREATE TABLE IF NOT EXISTS body_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER NOT NULL,
      weight REAL DEFAULT NULL,
      body_fat REAL DEFAULT NULL,
      chest REAL DEFAULT NULL,
      waist REAL DEFAULT NULL,
      hips REAL DEFAULT NULL,
      arm REAL DEFAULT NULL,
      thigh REAL DEFAULT NULL,
      back REAL DEFAULT NULL,
      photo_uri TEXT DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_body_metrics_date ON body_metrics(date);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS training_maxes (
      lift TEXT PRIMARY KEY,
      weight REAL NOT NULL,
      cycle_week INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS exercise_favorites (
      exercise_id INTEGER PRIMARY KEY,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_date ON exercise_favorites(created_at DESC);
  `);
  } catch (err) {
    // The core schema itself failed — nothing in the app can work without
    // it, so this (and only this) is a genuine fatal failure.
    console.error('Database core init failed, running in degraded mode:', err);
    dbAvailable = false;
    dbInstance = null;
    openPromise = null;
    return;
  }

  // Everything below is per-step recoverable: dedup/index cleanup, column
  // migrations, and seeding. None of these should be able to take the rest of
  // the app down if one hits a snag on a particular device — but each is now
  // recorded once it succeeds, so a step that fails is retried next launch
  // instead of being skipped forever. See runStep.
  await ensureMigrationLedger(db);
  const applied = await appliedMigrations(db);
  await runStep('dedupe exercise names', async () => {
    // BUGFIX: exercises.name had no UNIQUE constraint, so "INSERT OR IGNORE" in
    // seedMissingExercises() never actually ignored anything — every app launch
    // re-inserted all ~300+ seed exercises, duplicating them indefinitely.
    // First remove any duplicates created by previous launches, keeping the
    // lowest id per name among built-in (non-custom) exercises...
    await db.execAsync(`
      DELETE FROM exercises
      WHERE is_custom = 0
        AND id NOT IN (
          SELECT MIN(id) FROM exercises WHERE is_custom = 0 GROUP BY name
        );
    `);
    // ...then enforce it going forward with a partial unique index (custom
    // exercises created by the user are exempt, so they can freely reuse names).
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_name_unique
      ON exercises(name) WHERE is_custom = 0;
    `);
  });

  await runStep('migratePlanDays', () => migratePlanDays(db), db, applied);
  await runStep('migrateExerciseExtras', () => migrateExerciseExtras(db), db, applied);
  await runStep('migrateBodyMetricsPhoto', () => migrateBodyMetricsPhoto(db), db, applied);
  await runStep('migrateBodyMetricsBack', () => migrateBodyMetricsBack(db), db, applied);
  await runStep('migratePlanIsAutoGenerated', () => migratePlanIsAutoGenerated(db), db, applied);
  await runStep('migratePerformanceIndices', () => migratePerformanceIndices(db), db, applied);
  await runStep('migrateExerciseApiFields', () => migrateExerciseApiFields(db), db, applied);
  await runStep('migrateExerciseVideoFields', () => migrateExerciseVideoFields(db), db, applied);
  await runStep('migrateWorkoutSessionDayIndex', () => migrateWorkoutSessionDayIndex(db), db, applied);

  await runStep('seed exercises', async () => {
    const count = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM exercises WHERE is_custom = 0'
    );
    if (count && count.c === 0) {
      await seedExercises(db);
    } else {
      await seedMissingExercises(db);
    }
  });

  // Runs after seeding: on a brand-new install, the exercises this
  // populates don't exist yet until the step above creates them, so this
  // has to come after, not before.
  await runStep('migrateExerciseAltNames', () => migrateExerciseAltNames(db), db, applied);
  await runStep('migrateSecondaryMuscleTokens', () => migrateSecondaryMuscleTokens(db), db, applied);
  await runStep('migrateAdaptiveEngine', () => migrateAdaptiveEngine(db), db, applied);
  await runStep('migrateExerciseDbInstructionsPt', () => migrateExerciseDbInstructionsPt(db), db, applied);
}

/**
 * Back-fills the Portuguese instruction text onto free-exercise-db rows that
 * were imported before the vendored dataset was translated (PT-PT). A plain
 * data UPDATE keyed on api_id — no ALTER — and a no-op on a fresh install
 * where the seed already carried the translated text.
 */
async function migrateExerciseDbInstructionsPt(db: SQLite.SQLiteDatabase): Promise<void> {
  const dataset = require('../assets/data/exercise-db.json') as {
    api_id?: string;
    instructions?: string;
  }[];
  for (const ex of dataset) {
    const id = ex.api_id?.trim();
    const text = ex.instructions?.trim();
    if (!id || !text) continue;
    await db.runAsync(
      `UPDATE exercises SET instructions = ?
       WHERE api_id = ? AND api_source = 'free-exercise-db' AND instructions != ?`,
      [text, id, text],
    );
  }
}

/**
 * Tables for the adaptive periodization engine (see NSPI_ENGINE.md §1).
 * All CREATE ... IF NOT EXISTS, no ALTER on existing tables — safe on a real
 * upgrade and re-runnable.
 */
async function migrateAdaptiveEngine(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS adaptive_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      goal TEXT NOT NULL,
      experience TEXT NOT NULL,
      days_per_week INTEGER NOT NULL,
      session_minutes INTEGER NOT NULL,
      equipment_pref TEXT NOT NULL DEFAULT 'any',
      week_start_dow INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS adaptive_cycle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adaptive_plan_id INTEGER NOT NULL,
      cycle_index INTEGER NOT NULL,
      baseline_json TEXT NOT NULL DEFAULT '{}',
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS adaptive_week (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER NOT NULL,
      week_index INTEGER NOT NULL,
      phase TEXT NOT NULL,
      is_bridge INTEGER NOT NULL DEFAULT 0,
      planned_json TEXT NOT NULL DEFAULT '{}',
      nspi_load REAL, nspi_volume REAL, nspi_balance REAL, nspi_score REAL,
      decision TEXT,
      recap_json TEXT,
      week_start INTEGER NOT NULL,
      week_end INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_adaptive_week_cycle ON adaptive_week(cycle_id, week_index);

    CREATE TABLE IF NOT EXISTS adaptive_exercise_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adaptive_plan_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      base_sets INTEGER NOT NULL DEFAULT 3,
      current_weight REAL NOT NULL DEFAULT 0,
      current_reps_low INTEGER NOT NULL DEFAULT 8,
      current_reps_high INTEGER NOT NULL DEFAULT 12,
      step_stall_count INTEGER NOT NULL DEFAULT 0,
      last_progressed_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_adaptive_exstate
      ON adaptive_exercise_state(adaptive_plan_id, exercise_id);
  `);
}

/**
 * The curated seed used a few non-standard tokens in secondary_muscles
 * ("hip", "hips", "legs") that don't map to a Portuguese label, so they
 * rendered raw. Normalise them to the canonical groups. Idempotent.
 */
async function migrateSecondaryMuscleTokens(db: SQLite.SQLiteDatabase): Promise<void> {
  // NOTE: SQLite's TRIM does NOT support the `TRIM(BOTH x FROM y)` standard-SQL
  // form (that was the original bug here — "near ',': syntax error"). SQLite
  // uses TRIM(str, chars), which strips any leading/trailing chars in `chars`.
  await db.execAsync(`
    UPDATE exercises SET secondary_muscles =
      TRIM(
        REPLACE(REPLACE(REPLACE(',' || secondary_muscles || ',',
          ',hips,', ',glutes,'), ',hip,', ',glutes,'), ',legs,', ',quads,'),
        ','
      )
    WHERE secondary_muscles LIKE '%hip%' OR secondary_muscles LIKE '%legs%';
  `);
}

/**
 * Adds day_label/day_index to plan_exercises on databases created before
 * multi-day plans existed. Previously the auto-generator wrote the day name
 * ("Push", "Pull", ...) into the `notes` column, so every plan rendered as one
 * long undivided list. We add the real columns and recover the day names from
 * notes where they look like a day label, so existing plans keep their split.
 */
async function migratePlanDays(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(plan_exercises)`);
  const names = cols.map(c => c.name);

  if (!names.includes('day_label')) {
    await db.execAsync(`ALTER TABLE plan_exercises ADD COLUMN day_label TEXT DEFAULT ''`);
  }
  if (!names.includes('day_index')) {
    await db.execAsync(`ALTER TABLE plan_exercises ADD COLUMN day_index INTEGER DEFAULT 0`);
  }
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_plan_exercises_day ON plan_exercises(plan_id, day_index)`);

  // Recover day names that the old generator stored in `notes`.
  const legacy = await db.getAllAsync<{ plan_id: number; notes: string }>(
    `SELECT DISTINCT plan_id, notes FROM plan_exercises
     WHERE (day_label IS NULL OR day_label = '') AND notes IS NOT NULL AND notes != ''`
  );
  const dayNamePattern = /^(Push|Pull|Pernas|Peito|Costas|Ombros|Bracos|Braços|Upper|Lower|Full Body)/i;
  const perPlan = new Map<number, string[]>();
  for (const row of legacy) {
    if (!dayNamePattern.test(row.notes)) continue;
    if (!perPlan.has(row.plan_id)) perPlan.set(row.plan_id, []);
    const list = perPlan.get(row.plan_id)!;
    if (!list.includes(row.notes)) list.push(row.notes);
  }
  for (const [planId, labels] of perPlan) {
    for (let i = 0; i < labels.length; i++) {
      await db.runAsync(
        `UPDATE plan_exercises SET day_label = ?, day_index = ?, notes = ''
         WHERE plan_id = ? AND notes = ?`,
        [labels[i], i, planId, labels[i]]
      );
    }
  }
}

/**
 * Adds the columns behind personal notes, user-supplied media and tempo.
 * - exercises.user_notes: sticky per-exercise notes ("banco na posicao 4"),
 *   shown every time that exercise comes up in a workout.
 * - exercises.media_uri: a photo/video the user attached themselves, which
 *   avoids shipping (or licensing) a bundled exercise media pack.
 * - plan_exercises.tempo: rep cadence such as "3-1-2-0".
 */
async function migrateExerciseExtras(db: SQLite.SQLiteDatabase): Promise<void> {
  const exCols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(exercises)`)).map(c => c.name);
  if (!exCols.includes('user_notes')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN user_notes TEXT DEFAULT ''`);
  }
  if (!exCols.includes('media_uri')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN media_uri TEXT DEFAULT ''`);
  }

  const peCols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(plan_exercises)`)).map(c => c.name);
  if (!peCols.includes('tempo')) {
    await db.execAsync(`ALTER TABLE plan_exercises ADD COLUMN tempo TEXT DEFAULT ''`);
  }
}

/** Adds the progress-photo column to body_metrics for devices upgrading from
 *  before photo tracking existed. */
async function migrateBodyMetricsPhoto(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(body_metrics)`)).map(c => c.name);
  if (!cols.includes('photo_uri')) {
    await db.execAsync(`ALTER TABLE body_metrics ADD COLUMN photo_uri TEXT DEFAULT NULL`);
  }
}

async function migrateBodyMetricsBack(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(body_metrics)`)).map(c => c.name);
  if (!cols.includes('back')) {
    await db.execAsync(`ALTER TABLE body_metrics ADD COLUMN back REAL DEFAULT NULL`);
  }
}

async function migratePlanIsAutoGenerated(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(workout_plans)`)).map(c => c.name);
  if (!cols.includes('is_auto_generated')) {
    await db.execAsync(`ALTER TABLE workout_plans ADD COLUMN is_auto_generated INTEGER DEFAULT 0`);
    // Retroactively flag plans the Treino Inteligente generator already
    // created before this column existed — its name is a specific,
    // distinctive pattern ("Treino de Hoje — DD/MM") unlikely to collide
    // with something a person named themselves, so this is safe. Older
    // multi-day generatePlan() plans aren't retroactively flagged (their
    // names are more generic, like "Plano 3 dias · 60min", which COULD
    // plausibly be a name someone chose manually) — worst case, a few of
    // those show up under "Meus Planos" until the person deletes them,
    // which is a much smaller cost than hiding a genuine manual plan.
    await db.execAsync(`UPDATE workout_plans SET is_auto_generated = 1 WHERE name LIKE 'Treino de Hoje — %'`);
    // BUGFIX (found in a self-audit): the 5/3/1 generator was ALSO missing
    // this flag — it's just as auto-generated as Treino Inteligente (exact
    // lifts and weights come from the person's Training Maxes, not a
    // manual choice), so it belongs under the same "not a manual plan"
    // umbrella, not mixed into "Meus Planos".
    await db.execAsync(`UPDATE workout_plans SET is_auto_generated = 1 WHERE name LIKE '5/3/1 — Semana %'`);
  }
}

/**
 * Session-resilience recovery (app/(tabs)/start.tsx, app/workout/active.tsx)
 * needs to know which day of a multi-day plan a resumed session was
 * actually on, to reload the right exercise list — that was never stored
 * anywhere; a session only ever remembered its plan_id, not the specific
 * day within it. NULL for a plan with only one day, and for any session
 * that predates this column (resume for those falls back to loading the
 * whole plan rather than one day, same as before this existed).
 */
async function migrateWorkoutSessionDayIndex(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(workout_sessions)`)).map(c => c.name);
  if (!cols.includes('day_index')) {
    await db.execAsync(`ALTER TABLE workout_sessions ADD COLUMN day_index INTEGER DEFAULT NULL`);
  }
}

/**
 * BUGFIX (reported: "faltam exercícios tipo Dumbbell Rear Delt Raise"): the
 * exercise ALREADY existed ("Crucifixo Inverso com Halteres") — the real
 * gap was that search only ever matched the Portuguese name, so an English
 * term (common when someone's describing a workout they saw on English-
 * language fitness content, exactly what prompted this) found nothing even
 * though the exercise was right there. Seeds a handful of common English
 * synonyms for the exercises most likely to be searched that way — not
 * all 560 exercises at once (too large a one-off edit to do reliably), but
 * the specific ones that came up while researching workouts for this
 * person, plus their close relatives.
 */
async function migrateExerciseAltNames(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(exercises)`)).map(c => c.name);
  if (!cols.includes('alt_names')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN alt_names TEXT DEFAULT ''`);
  }
  // Idempotent regardless of whether the column already existed — always
  // safe to re-run with the current mapping (a plain UPDATE, not an ALTER).
  const synonyms: [string, string][] = [
    ['Crucifixo Inverso com Halteres', 'Dumbbell Rear Delt Raise, Dumbbell Reverse Fly, Bent Over Rear Delt Fly'],
    ['Crucifixo Inverso na Maquina', 'Machine Rear Delt Fly, Reverse Pec Deck'],
    ['Crucifixo Inverso no Cabo', 'Cable Rear Delt Fly, Cable Reverse Fly'],
    ['Face Pull', 'Rope Face Pull'],
    ['Face Pull no Cabo', 'Rope Face Pull, Cable Face Pull'],
    ['Elevacao Lateral com Halteres', 'Dumbbell Lateral Raise, DB Lateral Raise, Side Raise'],
    ['Elevacao Lateral no Cabo', 'Cable Lateral Raise'],
    ['Elevacao Frontal com Halteres', 'Dumbbell Front Raise, DB Front Raise'],
    ['Elevacao Frontal com Barra', 'Barbell Front Raise'],
    ['Press Militar com Barra', 'Barbell Overhead Press, OHP, Military Press'],
    ['Press Militar Sentado', 'Seated Overhead Press, Seated Shoulder Press'],
    ['Agachamento Frontal', 'Front Squat'],
    ['Hip Thrust com Barra', 'Barbell Hip Thrust'],
    ['Hip Thrust com Halter', 'Dumbbell Hip Thrust'],
    ['Stiff com Halteres', 'Dumbbell RDL, Dumbbell Romanian Deadlift, Stiff Leg Deadlift'],
    ['Stiff com Barra', 'Barbell RDL, Romanian Deadlift, RDL'],
    ['Extensao de Triceps na Polia', 'Cable Tricep Extension, Tricep Pushdown'],
  ];
  for (const [name, altNames] of synonyms) {
    await db.runAsync(`UPDATE exercises SET alt_names = ? WHERE name = ? AND is_custom = 0`, [altNames, name]);
  }
}

/**
 * workout_sets.completed_at is filtered/sorted by heavily — weekly volume,
 * most-trained exercises, training tips, progress charts, CSV export,
 * calendar day lookups — but had no index. Benchmarked with ~40k rows (an
 * 8-year, 4x/week training history): this turns a full table scan into an
 * indexed range search, ~5x faster, with the gap widening the more history
 * accumulates.
 */
async function migratePerformanceIndices(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_sets_completed ON workout_sets(completed_at)`);
}

/**
 * Adds image_url, api_id, and api_source columns for storing ExerciseDB integration data.
 * Idempotent: checks if columns exist before adding.
 */
async function migrateExerciseApiFields(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(exercises)`)).map(c => c.name);
  if (!cols.includes('image_url')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN image_url TEXT DEFAULT ''`);
  }
  if (!cols.includes('api_id')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN api_id TEXT DEFAULT ''`);
  }
  if (!cols.includes('api_source')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN api_source TEXT DEFAULT ''`);
  }
}

/**
 * The video_* columns are vestigial.
 *
 * They were filled by a generator that stored `youtube.com/results?...`
 * search links — not videos — which the UI then opened in an external
 * browser. That whole path is gone; exercises now show the dataset
 * illustration in image_url instead.
 *
 * The columns stay because dropping them on an installed database buys a
 * migration risk for no benefit. What this does clear is the stale search
 * links, so nothing can surface them again.
 */
async function migrateExerciseVideoFields(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(exercises)`)).map(c => c.name);
  if (!cols.includes('video_url')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN video_url TEXT DEFAULT ''`);
  }
  if (!cols.includes('video_cached_path')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN video_cached_path TEXT DEFAULT ''`);
  }
  await db.runAsync(
    `UPDATE exercises SET video_url = '' WHERE video_url LIKE '%youtube.com/results%'`
  );
}

async function seedExercises(db: SQLite.SQLiteDatabase): Promise<void> {
  const stmt = await db.prepareAsync(
    `INSERT INTO exercises (name, primary_muscle, secondary_muscles, equipment, type, instructions, is_custom)
     VALUES ($name, $primary_muscle, $secondary_muscles, $equipment, $type, $instructions, 0)`
  );
  try {
    for (const ex of EXERCISE_SEED_DATA) {
      await stmt.executeAsync({
        $name: ex.name,
        $primary_muscle: ex.primary_muscle,
        $secondary_muscles: ex.secondary_muscles,
        $equipment: ex.equipment,
        $type: ex.type,
        $instructions: ex.instructions,
      });
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

async function seedMissingExercises(db: SQLite.SQLiteDatabase): Promise<void> {
  const stmt = await db.prepareAsync(
    `INSERT OR IGNORE INTO exercises (name, primary_muscle, secondary_muscles, equipment, type, instructions, is_custom)
     VALUES ($name, $primary_muscle, $secondary_muscles, $equipment, $type, $instructions, 0)`
  );
  try {
    for (const ex of EXERCISE_SEED_DATA) {
      await stmt.executeAsync({
        $name: ex.name,
        $primary_muscle: ex.primary_muscle,
        $secondary_muscles: ex.secondary_muscles,
        $equipment: ex.equipment,
        $type: ex.type,
        $instructions: ex.instructions,
      });
    }
  } finally {
    await stmt.finalizeAsync();
  }
}
