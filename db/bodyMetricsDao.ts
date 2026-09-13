/**
 * Body metrics DAO — weight tracking, measurements, trends
 */

import { getDatabase } from './database';
import type { BodyMetric } from '@/types';

/**
 * Add or update body metric for today
 */
export async function recordBodyMetric(metric: Partial<Omit<BodyMetric, 'id'>>): Promise<BodyMetric> {
  const db = await getDatabase();
  const today = Math.floor(Date.now() / 1000);
  
  // Check if exists for today
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM body_metrics WHERE date = ?',
    [today]
  );

  if (existing) {
    // Update
    await db.runAsync(
      `UPDATE body_metrics SET weight=?, body_fat=?, chest=?, waist=?, hips=?, arm=?, thigh=?, back=?, photo_uri=? WHERE id=?`,
      [
        metric.weight ?? null,
        metric.body_fat ?? null,
        metric.chest ?? null,
        metric.waist ?? null,
        metric.hips ?? null,
        metric.arm ?? null,
        metric.thigh ?? null,
        metric.back ?? null,
        metric.photo_uri ?? null,
        existing.id,
      ]
    );
    return { ...metric, id: existing.id } as BodyMetric;
  } else {
    // Insert
    const result = await db.runAsync(
      `INSERT INTO body_metrics (date, weight, body_fat, chest, waist, hips, arm, thigh, back, photo_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metric.date ?? today,
        metric.weight ?? null,
        metric.body_fat ?? null,
        metric.chest ?? null,
        metric.waist ?? null,
        metric.hips ?? null,
        metric.arm ?? null,
        metric.thigh ?? null,
        metric.back ?? null,
        metric.photo_uri ?? null,
      ]
    );
    return { ...metric, id: result.lastInsertRowId } as BodyMetric;
  }
}

/**
 * Get body metric for a specific date (Unix timestamp)
 */
export async function getBodyMetricForDate(date: number): Promise<BodyMetric | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<BodyMetric>(
    'SELECT * FROM body_metrics WHERE date = ? LIMIT 1',
    [date]
  );
}

/**
 * Get latest body metric
 */
export async function getLatestBodyMetric(): Promise<BodyMetric | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<BodyMetric>(
    'SELECT * FROM body_metrics ORDER BY date DESC LIMIT 1'
  );
}

/** Most recent scale weight in kg, or null if the user has never logged one. */
export async function getLatestBodyWeightKg(): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ weight: number | null }>(
    'SELECT weight FROM body_metrics WHERE weight IS NOT NULL ORDER BY date DESC LIMIT 1'
  );
  return row?.weight ?? null;
}

/**
 * Get weight trend (last N days)
 */
export async function getWeightTrend(days: number = 90): Promise<BodyMetric[]> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return await db.getAllAsync<BodyMetric>(
    'SELECT * FROM body_metrics WHERE date >= ? AND weight IS NOT NULL ORDER BY date ASC',
    [since]
  );
}

/**
 * Get body fat trend
 */
export async function getBodyFatTrend(days: number = 90): Promise<BodyMetric[]> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return await db.getAllAsync<BodyMetric>(
    'SELECT * FROM body_metrics WHERE date >= ? AND body_fat IS NOT NULL ORDER BY date ASC',
    [since]
  );
}

/**
 * Get measurements history
 */
export async function getMeasurementsHistory(days: number = 180): Promise<BodyMetric[]> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return await db.getAllAsync<BodyMetric>(
    `SELECT * FROM body_metrics 
     WHERE date >= ? AND (chest IS NOT NULL OR waist IS NOT NULL OR arm IS NOT NULL OR thigh IS NOT NULL)
     ORDER BY date DESC`,
    [since]
  );
}

/**
 * Calculate weight change (current vs N days ago)
 */
export async function getWeightChange(days: number = 7): Promise<{ current: number | null; previous: number | null; delta: number | null }> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;
  // Nobody weighs themselves on an exact schedule. The previous reading is
  // the most recent one at or before the target day, tolerating up to
  // another full window further back; beyond that the two points are too
  // far apart to call it an N-day change.
  const oldestUseful = since - days * 86400;

  const current = await db.getFirstAsync<{ weight: number | null }>(
    'SELECT weight FROM body_metrics WHERE date = (SELECT MAX(date) FROM body_metrics WHERE weight IS NOT NULL) LIMIT 1'
  );

  const previous = await db.getFirstAsync<{ weight: number | null }>(
    'SELECT weight FROM body_metrics WHERE date <= ? AND date >= ? AND weight IS NOT NULL ORDER BY date DESC LIMIT 1',
    [since, oldestUseful]
  );

  // Explicit null checks rather than falsiness: a stored 0 is bad data, but
  // silently reporting it as "no reading" hides that from the caller.
  const currentWeight = current?.weight ?? null;
  const previousWeight = previous?.weight ?? null;

  if (currentWeight === null || previousWeight === null) {
    return { current: currentWeight, previous: previousWeight, delta: null };
  }

  return {
    current: currentWeight,
    previous: previousWeight,
    delta: currentWeight - previousWeight,
  };
}

/**
 * Get weight average (last N days)
 */
export async function getAverageWeight(days: number = 7): Promise<number | null> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const result = await db.getFirstAsync<{ avg: number }>(
    'SELECT AVG(weight) as avg FROM body_metrics WHERE date >= ? AND weight IS NOT NULL',
    [since]
  );

  return result?.avg ?? null;
}

/**
 * Deletes the entry for a given day.
 *
 * Named for the key it uses: there is also deleteBodyMetric(id) below, and
 * these two used to share a name across two files. Passing an id here would
 * have silently deleted whatever row happened to carry that timestamp.
 */
export async function deleteBodyMetricForDate(date: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM body_metrics WHERE date = ?', [date]);
}

/** Deletes a single entry by its row id. */
export async function deleteBodyMetric(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM body_metrics WHERE id = ?', [id]);
}

/** Inserts a new entry, without the upsert-on-date behaviour of recordBodyMetric. */
export async function addBodyMetric(metric: Omit<BodyMetric, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO body_metrics (date, weight, body_fat, chest, waist, hips, arm, thigh, back, photo_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [metric.date, metric.weight, metric.body_fat, metric.chest, metric.waist,
     metric.hips, metric.arm, metric.thigh, metric.back ?? null, metric.photo_uri ?? null]
  );
  return result.lastInsertRowId as number;
}

/** Attaches or clears the progress photo on an entry. */
export async function setBodyMetricPhoto(id: number, photoUri: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE body_metrics SET photo_uri = ? WHERE id = ?', [photoUri, id]);
}

/**
 * Get all body metrics (for export)
 */
export async function getAllBodyMetrics(): Promise<BodyMetric[]> {
  const db = await getDatabase();
  return await db.getAllAsync<BodyMetric>(
    'SELECT * FROM body_metrics ORDER BY date DESC'
  );
}

/**
 * Entries with a progress photo, oldest first — the order a before/after
 * timeline reads naturally.
 */
export async function getBodyMetricsWithPhotos(): Promise<BodyMetric[]> {
  const db = await getDatabase();
  return await db.getAllAsync<BodyMetric>(
    "SELECT * FROM body_metrics WHERE photo_uri IS NOT NULL AND photo_uri != '' ORDER BY date ASC"
  );
}
