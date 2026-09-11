/**
 * Imports the free-exercise-db dataset (876 exercises) into the local
 * exercises table.
 *
 * Source: https://github.com/yuhonas/free-exercise-db — Unlicense (public
 * domain), so there is no attribution or commercial-use restriction. The
 * JSON is vendored at assets/data/exercise-db.json so the import needs no
 * network at install time.
 *
 * Caveat worth knowing: image_url points at raw.githubusercontent.com, so
 * the illustrations themselves are fetched on first view and are NOT
 * available offline until then. Everything else (names, muscles,
 * equipment, instructions) is fully local.
 *
 * This coexists with EXERCISE_SEED_DATA: that seed holds curated
 * Portuguese names, this one adds English-named movements with artwork.
 * Rows are keyed on api_id so re-running is a no-op.
 */

import type * as SQLite from 'expo-sqlite';
import { getDatabase } from './database';

/**
 * Loaded lazily, on purpose.
 *
 * A top-level import parses 822 KB of JSON on *every* launch, including the
 * overwhelmingly common case where the table is already populated and
 * nothing needs importing. Requiring it inside the import path means the
 * cost is paid once, on first install, and never again.
 */
function loadDataset(): ImportedExercise[] {
  return require('../assets/data/exercise-db.json') as ImportedExercise[];
}

export const EXERCISE_DB_SOURCE = 'free-exercise-db';

export interface ImportedExercise {
  name: string;
  primary_muscle: string;
  secondary_muscles: string;
  equipment: string;
  type: string;
  instructions: string;
  image_url: string;
  api_id: string;
}

/** How many rows of this dataset are already in the table. */
export async function getImportedCount(db?: SQLite.SQLiteDatabase): Promise<number> {
  const conn = db ?? (await getDatabase());
  const row = await conn.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM exercises WHERE api_source = ?',
    [EXERCISE_DB_SOURCE]
  );
  return row?.c ?? 0;
}

/**
 * Inserts any dataset rows that aren't in the table yet.
 *
 * Runs inside a transaction so a failure part-way leaves the table as it
 * was rather than half-populated — the count check above would otherwise
 * read a partial import as "done" on the next launch.
 */
export async function importExerciseDb(
  db?: SQLite.SQLiteDatabase,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const conn = db ?? (await getDatabase());
  const existing = await conn.getAllAsync<{ api_id: string }>(
    'SELECT api_id FROM exercises WHERE api_source = ?',
    [EXERCISE_DB_SOURCE]
  );
  const have = new Set(existing.map(r => r.api_id));
  // Only touch the JSON once we know something might be missing.
  const pending = loadDataset().filter(e => !have.has(e.api_id));
  if (pending.length === 0) return 0;

  let inserted = 0;
  await conn.withTransactionAsync(async () => {
    // OR IGNORE: the curated Portuguese seed already owns some of these names,
    // and the dataset repeats a few of its own. exercises.name has a partial
    // UNIQUE index (is_custom = 0), so a plain INSERT throws on the first
    // collision, rolls the whole transaction back, and the rejection escapes
    // far enough to crash startup. Skipping the colliding rows keeps the
    // curated entry as the quality layer, which is the intended precedence.
    const stmt = await conn.prepareAsync(
      `INSERT OR IGNORE INTO exercises
         (name, primary_muscle, secondary_muscles, equipment, type,
          instructions, image_url, api_id, api_source, is_custom)
       VALUES ($name, $primary, $secondary, $equipment, $type,
               $instructions, $image, $apiId, $source, 0)`
    );
    try {
      let processed = 0;
      for (const ex of pending) {
        const res = await stmt.executeAsync({
          $name: ex.name,
          $primary: ex.primary_muscle,
          $secondary: ex.secondary_muscles,
          $equipment: ex.equipment,
          $type: ex.type,
          $instructions: ex.instructions,
          $image: ex.image_url,
          $apiId: ex.api_id,
          $source: EXERCISE_DB_SOURCE,
        });
        // OR IGNORE makes a skipped collision report 0 changes.
        if (res.changes > 0) inserted++;
        processed++;
        if (processed % 100 === 0) onProgress?.(processed, pending.length);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });

  onProgress?.(inserted, pending.length);
  return inserted;
}
