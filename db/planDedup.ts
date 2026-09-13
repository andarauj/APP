/**
 * Idempotent cleanup of duplicated / redundant plan_exercises rows.
 * Used by migratePurgeDuplicatePlanItems — keep SQLite here, classification
 * in movementClassify so generator and migration share the same caps.
 */
import type * as SQLite from 'expo-sqlite';
import {
  movementSubcategory,
  subcategoryCap,
} from '@/utils/movementClassify';

export function idsOverSubcategoryCap(
  rows: { id: number; name: string; primary_muscle: string; type?: string }[],
): number[] {
  const counts = new Map<string, number>();
  const extra: number[] = [];
  for (const row of rows) {
    const sub = movementSubcategory(row.name, row.primary_muscle, row.type ?? 'strength');
    const n = (counts.get(sub) ?? 0) + 1;
    counts.set(sub, n);
    if (n > subcategoryCap(sub)) extra.push(row.id);
  }
  return extra;
}

/** Same exercise listed twice on the same plan day — keep the earliest row. */
export async function purgeDuplicatePlanExercises(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM plan_exercises
    WHERE id NOT IN (
      SELECT MIN(id) FROM plan_exercises
      GROUP BY plan_id, COALESCE(day_index, 0), exercise_id
    );
  `);
}

/**
 * Auto-generated templates that stacked the same movement (two crossovers,
 * three bench angles) drop the extras. Manual plans are left alone.
 */
export async function pruneRedundantAutoPlanSlots(db: SQLite.SQLiteDatabase): Promise<void> {
  const plans = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM workout_plans WHERE is_auto_generated = 1',
  );
  for (const plan of plans) {
    const rows = await db.getAllAsync<{
      id: number;
      day_index: number;
      name: string;
      primary_muscle: string;
      type: string;
    }>(
      `SELECT pe.id, pe.day_index, e.name, e.primary_muscle, COALESCE(e.type, 'strength') AS type
       FROM plan_exercises pe
       JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.plan_id = ?
       ORDER BY pe.day_index, pe.order_index, pe.id`,
      [plan.id],
    );
    const byDay = new Map<number, typeof rows>();
    for (const row of rows) {
      const list = byDay.get(row.day_index) ?? [];
      list.push(row);
      byDay.set(row.day_index, list);
    }
    const toDelete: number[] = [];
    for (const dayRows of byDay.values()) {
      toDelete.push(...idsOverSubcategoryCap(dayRows));
    }
    for (const id of toDelete) {
      await db.runAsync('DELETE FROM plan_exercises WHERE id = ?', [id]);
    }
  }
}

export async function migrateExerciseMovementType(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = (await db.getAllAsync<{ name: string }>('PRAGMA table_info(exercises)')).map(c => c.name);
  if (!cols.includes('movement_type')) {
    await db.execAsync(`ALTER TABLE exercises ADD COLUMN movement_type TEXT DEFAULT ''`);
  }
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    primary_muscle: string;
    type: string;
  }>(
    `SELECT id, name, primary_muscle, COALESCE(type, 'strength') AS type
     FROM exercises
     WHERE movement_type IS NULL OR movement_type = ''`,
  );
  for (const row of rows) {
    const mt = movementSubcategory(row.name, row.primary_muscle, row.type);
    await db.runAsync('UPDATE exercises SET movement_type = ? WHERE id = ?', [mt, row.id]);
  }
}

export async function migratePurgeDuplicatePlanItems(db: SQLite.SQLiteDatabase): Promise<void> {
  await purgeDuplicatePlanExercises(db);
  await pruneRedundantAutoPlanSlots(db);
}
