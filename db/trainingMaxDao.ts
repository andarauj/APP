import { getDatabase } from './database';
import type { FiveThreeOneLift } from '@/utils/fiveThreeOne';

export interface TrainingMaxRow {
  lift: FiveThreeOneLift;
  weight: number;
  cycle_week: number;
  updated_at: number;
}

export async function getAllTrainingMaxes(): Promise<TrainingMaxRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrainingMaxRow>('SELECT * FROM training_maxes');
  return rows;
}

export async function setTrainingMax(lift: FiveThreeOneLift, weight: number): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    `INSERT INTO training_maxes (lift, weight, cycle_week, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(lift) DO UPDATE SET weight = excluded.weight, updated_at = excluded.updated_at`,
    [lift, weight, now]
  );
}

/** Advances a lift to its next cycle week (1→2→3→4→1, wrapping), and bumps
 *  the training max automatically when a full 4-week cycle completes. */
export async function advanceTrainingMaxWeek(lift: FiveThreeOneLift, currentWeight: number, nextWeight: number): Promise<void> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.getFirstAsync<{ cycle_week: number }>('SELECT cycle_week FROM training_maxes WHERE lift = ?', [lift]);
  const currentWeek = row?.cycle_week ?? 1;
  const finishingCycle = currentWeek >= 4;
  await db.runAsync(
    `INSERT INTO training_maxes (lift, weight, cycle_week, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(lift) DO UPDATE SET weight = excluded.weight, cycle_week = excluded.cycle_week, updated_at = excluded.updated_at`,
    [lift, finishingCycle ? nextWeight : currentWeight, finishingCycle ? 1 : currentWeek + 1, now]
  );
}
