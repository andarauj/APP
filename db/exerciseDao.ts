import { getDatabase } from './database';
import type { Exercise, MuscleGroup, Equipment, ExerciseType } from '@/types';

function mapExercise(row: any): Exercise {
  return {
    id: row.id,
    name: row.name,
    primary_muscle: row.primary_muscle as MuscleGroup,
    secondary_muscles: row.secondary_muscles || '',
    equipment: row.equipment as Equipment,
    type: row.type as ExerciseType,
    instructions: row.instructions || '',
    is_custom: row.is_custom || 0,
    created_at: row.created_at,
    image_url: row.image_url || '',
    api_id: row.api_id || '',
    api_source: row.api_source || '',
    user_notes: row.user_notes || '',
    media_uri: row.media_uri || '',
    alt_names: row.alt_names || '',
  };
}

export async function getAllExercises(): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM exercises ORDER BY name COLLATE NOCASE');
  return rows.map(mapExercise);
}

export async function getExercisesByMuscle(muscle: MuscleGroup): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT * FROM exercises WHERE primary_muscle = ? OR secondary_muscles LIKE ? ORDER BY name COLLATE NOCASE',
    [muscle, `%${muscle}%`]
  );
  return rows.map(mapExercise);
}

/**
 * Searches the exercise library.
 *
 * `limit` exists because the library is ~1400 rows: an empty query with no
 * filters previously returned every one of them, and the three exercise
 * pickers (active workout, plan editor, plan builder) each rendered the
 * whole set into a FlatList. The default is generous enough that a real
 * search is never truncated in practice while keeping the unfiltered case
 * bounded. Pass a larger value, or Infinity, where a complete list is
 * genuinely needed.
 */
export async function searchExercises(
  query: string,
  filters?: { muscle?: MuscleGroup | null; equipment?: Equipment | null; type?: ExerciseType | null },
  limit: number = 100
): Promise<Exercise[]> {
  const db = await getDatabase();
  let sql = 'SELECT * FROM exercises WHERE 1=1';
  const params: any[] = [];
  if (query.trim()) {
    sql += ' AND (name LIKE ? OR alt_names LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }
  if (filters?.muscle) {
    sql += ' AND (primary_muscle = ? OR secondary_muscles LIKE ?)';
    params.push(filters.muscle, `%${filters.muscle}%`);
  }
  if (filters?.equipment) {
    sql += ' AND equipment = ?';
    params.push(filters.equipment);
  }
  if (filters?.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }
  sql += ' ORDER BY name COLLATE NOCASE';
  if (Number.isFinite(limit)) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  const rows = await db.getAllAsync(sql, params);
  return rows.map(mapExercise);
}

export async function getExerciseById(id: number): Promise<Exercise | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [id]);
  return row ? mapExercise(row) : null;
}

export async function createCustomExercise(
  name: string,
  primaryMuscle: MuscleGroup,
  secondaryMuscles: string,
  equipment: Equipment,
  type: ExerciseType,
  instructions: string
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO exercises (name, primary_muscle, secondary_muscles, equipment, type, instructions, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [name, primaryMuscle, secondaryMuscles, equipment, type, instructions]
  );
  return result.lastInsertRowId as number;
}

export async function deleteCustomExercise(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM exercises WHERE id = ? AND is_custom = 1', [id]);
}

/**
 * How many plans include this exercise, and how many sets have been logged
 * against it. Both `plan_exercises.exercise_id` and `workout_sets.exercise_id`
 * cascade-delete when their exercise is removed, so deleting an exercise that
 * is actually in use silently strips it out of plans and destroys the
 * person's logged history for it — this lets the UI warn before that happens.
 */
export async function getExerciseUsage(id: number): Promise<{ planCount: number; setCount: number }> {
  const db = await getDatabase();
  const [planRow, setRow] = await Promise.all([
    db.getFirstAsync<{ c: number }>('SELECT COUNT(DISTINCT plan_id) as c FROM plan_exercises WHERE exercise_id = ?', [id]),
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM workout_sets WHERE exercise_id = ?', [id]),
  ]);
  return { planCount: planRow?.c || 0, setCount: setRow?.c || 0 };
}

export async function getExerciseCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM exercises');
  return row?.c || 0;
}

/** Sticky notes the user keeps for an exercise (seat height, grip, machine no.). */
export async function setExerciseUserNotes(exerciseId: number, notes: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE exercises SET user_notes = ? WHERE id = ?', [notes, exerciseId]);
}

/** A photo or video the user attached to an exercise from their own device. */
export async function setExerciseMedia(exerciseId: number, uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE exercises SET media_uri = ? WHERE id = ?', [uri, exerciseId]);
}

/**
 * Alternative exercises for the same primary muscle — for when a machine is
 * taken. Ranked by matching equipment first, then by what the user has
 * actually trained before.
 */
export async function getAlternativeExercises(exerciseId: number, limit = 8): Promise<Exercise[]> {
  const db = await getDatabase();
  const base = await db.getFirstAsync<{ primary_muscle: string; equipment: string }>(
    'SELECT primary_muscle, equipment FROM exercises WHERE id = ?',
    [exerciseId]
  );
  if (!base) return [];
  const rows = await db.getAllAsync<Exercise>(
    `SELECT e.*,
            (SELECT COUNT(*) FROM workout_sets ws WHERE ws.exercise_id = e.id) AS history_count
     FROM exercises e
     WHERE e.primary_muscle = ? AND e.id != ? AND e.type = 'strength'
     ORDER BY (e.equipment = ?) DESC, history_count DESC, e.name
     LIMIT ?`,
    [base.primary_muscle, exerciseId, base.equipment, limit]
  );
  return rows;
}

export async function getExerciseByName(name: string): Promise<Exercise | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM exercises WHERE name = ? COLLATE NOCASE LIMIT 1', [name]);
  return row ? mapExercise(row) : null;
}
