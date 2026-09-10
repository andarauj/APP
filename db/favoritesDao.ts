/**
 * Exercise favorites DAO — bookmark/save favorite exercises
 */

import { getDatabase } from './database';
import type { Exercise } from '@/types';

/**
 * Toggle exercise favorite status
 */
export async function toggleExerciseFavorite(exerciseId: number): Promise<boolean> {
  const db = await getDatabase();
  const isFavorited = await isExerciseFavorite(exerciseId);

  if (isFavorited) {
    await db.runAsync('DELETE FROM exercise_favorites WHERE exercise_id = ?', [exerciseId]);
    return false;
  } else {
    await db.runAsync('INSERT INTO exercise_favorites (exercise_id) VALUES (?)', [exerciseId]);
    return true;
  }
}

/**
 * Check if exercise is favorited
 */
export async function isExerciseFavorite(exerciseId: number): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM exercise_favorites WHERE exercise_id = ?',
    [exerciseId]
  );
  return (result?.count ?? 0) > 0;
}

/**
 * Get all favorite exercises with full details
 */
export async function getFavoriteExercises(): Promise<Exercise[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Exercise>(
    `SELECT e.* FROM exercises e
     JOIN exercise_favorites f ON e.id = f.exercise_id
     ORDER BY f.created_at DESC`
  );
}

/**
 * Get count of favorite exercises
 */
export async function getFavoritesCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM exercise_favorites'
  );
  return result?.count ?? 0;
}

/**
 * Clear all favorites
 */
export async function clearFavorites(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM exercise_favorites');
}

/**
 * Get favorite exercises filtered by muscle group
 */
export async function getFavoritesByMuscle(muscle: string): Promise<Exercise[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Exercise>(
    `SELECT e.* FROM exercises e
     JOIN exercise_favorites f ON e.id = f.exercise_id
     WHERE e.primary_muscle = ?
     ORDER BY f.created_at DESC`,
    [muscle]
  );
}

/**
 * Get recently added favorites (last N)
 */
export async function getRecentFavorites(limit: number = 10): Promise<Exercise[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Exercise>(
    `SELECT e.* FROM exercises e
     JOIN exercise_favorites f ON e.id = f.exercise_id
     ORDER BY f.created_at DESC
     LIMIT ?`,
    [limit]
  );
}
