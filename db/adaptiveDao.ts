/**
 * Adaptive engine — data access (see NSPI_ENGINE.md §1).
 *
 * Thin CRUD over the four adaptive_* tables. No business logic here — the
 * weekly close/decide/mutate flow lives in utils/adaptiveService.ts, the
 * scoring/decision maths in utils/nspi.ts, adaptivePlan.ts, adaptiveDecision.ts.
 */

import { getDatabase } from './database';
import type { AdaptiveGoal, AdaptivePhase } from '@/utils/nspi';
import type { AdaptiveDecision } from '@/utils/adaptiveDecision';

const nowS = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// adaptive_plan
// ---------------------------------------------------------------------------

export interface AdaptivePlanRow {
  id: number;
  plan_id: number;
  goal: AdaptiveGoal;
  experience: string;
  days_per_week: number;
  session_minutes: number;
  equipment_pref: string;
  week_start_dow: number;
  created_at: number;
  active: number;
}

export async function getActiveAdaptivePlan(): Promise<AdaptivePlanRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptivePlanRow>(
    'SELECT * FROM adaptive_plan WHERE active = 1 ORDER BY id DESC LIMIT 1',
  );
  return row ?? null;
}

export async function getAdaptivePlanById(id: number): Promise<AdaptivePlanRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptivePlanRow>('SELECT * FROM adaptive_plan WHERE id = ?', [id]);
  return row ?? null;
}

/** Most recent adaptive plan regardless of active flag — the "Periodização
 *  automática" toggle in Definições needs this to turn a paused plan back on
 *  (getActiveAdaptivePlan filters active=1, which is exactly what's paused). */
export async function getLatestAdaptivePlanAny(): Promise<AdaptivePlanRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptivePlanRow>('SELECT * FROM adaptive_plan ORDER BY id DESC LIMIT 1');
  return row ?? null;
}

/** Only one adaptive plan is ever active — flip the rest off before inserting. */
export async function deactivateAllAdaptivePlans(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE adaptive_plan SET active = 0 WHERE active = 1');
}

export async function setAdaptivePlanActive(id: number, active: boolean): Promise<void> {
  const db = await getDatabase();
  if (active) await deactivateAllAdaptivePlans();
  await db.runAsync('UPDATE adaptive_plan SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

export interface NewAdaptivePlan {
  planId: number;
  goal: AdaptiveGoal;
  experience: string;
  daysPerWeek: number;
  sessionMinutes: number;
  equipmentPref: string;
  weekStartDow: number;
}

export async function createAdaptivePlan(p: NewAdaptivePlan): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO adaptive_plan
       (plan_id, goal, experience, days_per_week, session_minutes, equipment_pref, week_start_dow, created_at, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [p.planId, p.goal, p.experience, p.daysPerWeek, p.sessionMinutes, p.equipmentPref, p.weekStartDow, nowS()],
  );
  return res.lastInsertRowId as number;
}

export async function updateAdaptivePlanWeekStart(id: number, weekStartDow: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE adaptive_plan SET week_start_dow = ? WHERE id = ?', [weekStartDow, id]);
}

/** Changes the experience tier (see EXPERIENCE_ADJUST in utils/adaptivePlan.ts)
 *  — takes effect from the next phase change onward, not retroactively. */
export async function updateAdaptivePlanExperience(id: number, experience: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE adaptive_plan SET experience = ? WHERE id = ?', [experience, id]);
}

/** Changes the training goal — takes effect from the next phase change onward. */
export async function updateAdaptivePlanGoal(id: number, goal: AdaptiveGoal): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE adaptive_plan SET goal = ? WHERE id = ?', [goal, id]);
}

// ---------------------------------------------------------------------------
// adaptive_cycle
// ---------------------------------------------------------------------------

export interface AdaptiveCycleRow {
  id: number;
  adaptive_plan_id: number;
  cycle_index: number;
  baseline_json: string;
  started_at: number;
  ended_at: number | null;
}

export async function getOpenCycle(adaptivePlanId: number): Promise<AdaptiveCycleRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveCycleRow>(
    `SELECT * FROM adaptive_cycle
     WHERE adaptive_plan_id = ? AND ended_at IS NULL
     ORDER BY cycle_index DESC LIMIT 1`,
    [adaptivePlanId],
  );
  return row ?? null;
}

export async function getLatestCycle(adaptivePlanId: number): Promise<AdaptiveCycleRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveCycleRow>(
    'SELECT * FROM adaptive_cycle WHERE adaptive_plan_id = ? ORDER BY cycle_index DESC LIMIT 1',
    [adaptivePlanId],
  );
  return row ?? null;
}

export async function createCycle(
  adaptivePlanId: number,
  cycleIndex: number,
  baseline: Record<string, number>,
): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO adaptive_cycle (adaptive_plan_id, cycle_index, baseline_json, started_at)
     VALUES (?, ?, ?, ?)`,
    [adaptivePlanId, cycleIndex, JSON.stringify(baseline ?? {}), nowS()],
  );
  return res.lastInsertRowId as number;
}

export async function endCycle(cycleId: number, endedAt = nowS()): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE adaptive_cycle SET ended_at = ? WHERE id = ?', [endedAt, cycleId]);
}

export function parseBaseline(row: AdaptiveCycleRow | null): Record<string, number> {
  if (!row) return {};
  try {
    const v = JSON.parse(row.baseline_json);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// adaptive_week
// ---------------------------------------------------------------------------

export interface AdaptiveWeekRow {
  id: number;
  cycle_id: number;
  week_index: number;
  phase: AdaptivePhase;
  is_bridge: number;
  planned_json: string;
  nspi_load: number | null;
  nspi_volume: number | null;
  nspi_balance: number | null;
  nspi_score: number | null;
  decision: AdaptiveDecision | null;
  recap_json: string | null;
  week_start: number;
  week_end: number;
  status: 'active' | 'done' | 'planned';
}

export interface NewAdaptiveWeek {
  cycleId: number;
  weekIndex: number;
  phase: AdaptivePhase;
  isBridge: boolean;
  planned: unknown;
  weekStart: number;
  weekEnd: number;
  /** Week 1 of a new cycle is 'active'; pre-materialized future weeks are 'planned'. */
  status?: 'active' | 'planned';
  /** Set only for the very first week of a plan, so the Weekly Recap screen
   *  has something to show ("porquê começamos aqui") before any week has
   *  actually closed. Every later week's recap comes from closeWeekRow. */
  recap?: unknown;
}

export async function insertWeek(w: NewAdaptiveWeek): Promise<number> {
  const db = await getDatabase();
  const status = w.status ?? 'active';
  const res = await db.runAsync(
    `INSERT INTO adaptive_week
       (cycle_id, week_index, phase, is_bridge, planned_json, week_start, week_end, status, recap_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      w.cycleId, w.weekIndex, w.phase, w.isBridge ? 1 : 0, JSON.stringify(w.planned ?? {}), w.weekStart, w.weekEnd,
      status,
      w.recap !== undefined ? JSON.stringify(w.recap) : null,
    ],
  );
  return res.lastInsertRowId as number;
}

/** The week row (if any) already covering this plan's `weekStart`. */
export async function getWeekForPlanAtStart(
  adaptivePlanId: number,
  weekStart: number,
): Promise<AdaptiveWeekRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveWeekRow>(
    `SELECT w.* FROM adaptive_week w
     JOIN adaptive_cycle c ON w.cycle_id = c.id
     WHERE c.adaptive_plan_id = ? AND w.week_start = ?
     ORDER BY w.id DESC LIMIT 1`,
    [adaptivePlanId, weekStart],
  );
  return row ?? null;
}

export async function promotePlannedWeek(
  weekId: number,
  patch: { planned: unknown; phase: AdaptivePhase; isBridge: boolean },
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE adaptive_week
     SET planned_json = ?, phase = ?, is_bridge = ?, status = 'active'
     WHERE id = ?`,
    [JSON.stringify(patch.planned ?? {}), patch.phase, patch.isBridge ? 1 : 0, weekId],
  );
}

/** Slide leftover planned weeks forward when an extra hold/bridge week is inserted. */
export async function shiftWeeksOnOrAfter(
  cycleId: number,
  fromStart: number,
  deltaSec: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE adaptive_week
     SET week_start = week_start + ?, week_end = week_end + ?, week_index = week_index + 1
     WHERE cycle_id = ? AND week_start >= ? AND status = 'planned'`,
    [deltaSec, deltaSec, cycleId, fromStart],
  );
}

export async function updateWeekPlannedJson(weekId: number, planned: unknown): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE adaptive_week SET planned_json = ? WHERE id = ?',
    [JSON.stringify(planned ?? {}), weekId],
  );
}

export async function deletePlannedWeeksForCycle(cycleId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM adaptive_week WHERE cycle_id = ? AND status = 'planned'`,
    [cycleId],
  );
}

export interface WeekClose {
  nspiLoad: number;
  nspiVolume: number;
  nspiBalance: number;
  nspiScore: number;
  decision: AdaptiveDecision;
  recap: unknown;
}

export async function closeWeekRow(weekId: number, c: WeekClose): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE adaptive_week
     SET nspi_load = ?, nspi_volume = ?, nspi_balance = ?, nspi_score = ?,
         decision = ?, recap_json = ?, status = 'done'
     WHERE id = ?`,
    [c.nspiLoad, c.nspiVolume, c.nspiBalance, c.nspiScore, c.decision, JSON.stringify(c.recap ?? {}), weekId],
  );
}

export async function getWeekById(weekId: number): Promise<AdaptiveWeekRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveWeekRow>(
    'SELECT * FROM adaptive_week WHERE id = ?',
    [weekId],
  );
  return row ?? null;
}

export async function getActiveWeek(cycleId: number): Promise<AdaptiveWeekRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveWeekRow>(
    `SELECT * FROM adaptive_week WHERE cycle_id = ? AND status = 'active'
     ORDER BY week_index DESC LIMIT 1`,
    [cycleId],
  );
  return row ?? null;
}

export async function getLatestWeekForPlan(adaptivePlanId: number): Promise<AdaptiveWeekRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveWeekRow>(
    `SELECT w.* FROM adaptive_week w
     JOIN adaptive_cycle c ON w.cycle_id = c.id
     WHERE c.adaptive_plan_id = ?
     ORDER BY w.week_start DESC, w.id DESC LIMIT 1`,
    [adaptivePlanId],
  );
  return row ?? null;
}

/** Weeks for a plan, newest first — feeds decideNextWeek's `recent` and the
 *  NSPI trend / recap history. */
export async function getRecentWeeksForPlan(adaptivePlanId: number, limit = 6): Promise<AdaptiveWeekRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<AdaptiveWeekRow>(
    `SELECT w.* FROM adaptive_week w
     JOIN adaptive_cycle c ON w.cycle_id = c.id
     WHERE c.adaptive_plan_id = ?
     ORDER BY w.week_start DESC, w.id DESC LIMIT ?`,
    [adaptivePlanId, limit],
  );
}

export async function weekExistsForStart(cycleId: number, weekStart: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM adaptive_week WHERE cycle_id = ? AND week_start = ?',
    [cycleId, weekStart],
  );
  return (row?.c ?? 0) > 0;
}

/** Any week row for this plan already covering `weekStart` (across cycles). */
export async function planWeekExistsForStart(adaptivePlanId: number, weekStart: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM adaptive_week w
     JOIN adaptive_cycle c ON w.cycle_id = c.id
     WHERE c.adaptive_plan_id = ? AND w.week_start = ?`,
    [adaptivePlanId, weekStart],
  );
  return (row?.c ?? 0) > 0;
}

export interface AdaptiveWeekWithCycle extends AdaptiveWeekRow {
  cycle_index: number;
}

/** Every week for a plan, oldest first, with its cycle_index attached —
 *  feeds the "Progressão do treino" chart and per-week cards on the plan
 *  overview screen (app/adaptive/plan.tsx). Realistically small (a handful
 *  of rows per month) so no pagination. */
export async function getAllWeeksForPlan(adaptivePlanId: number): Promise<AdaptiveWeekWithCycle[]> {
  const db = await getDatabase();
  return db.getAllAsync<AdaptiveWeekWithCycle>(
    `SELECT w.*, c.cycle_index as cycle_index FROM adaptive_week w
     JOIN adaptive_cycle c ON w.cycle_id = c.id
     WHERE c.adaptive_plan_id = ?
     ORDER BY w.week_start ASC, w.id ASC`,
    [adaptivePlanId],
  );
}

export async function getLatestRecapWeek(adaptivePlanId: number): Promise<AdaptiveWeekRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveWeekRow>(
    `SELECT w.* FROM adaptive_week w
     JOIN adaptive_cycle c ON w.cycle_id = c.id
     WHERE c.adaptive_plan_id = ? AND w.recap_json IS NOT NULL
     ORDER BY w.week_start DESC, w.id DESC LIMIT 1`,
    [adaptivePlanId],
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// adaptive_exercise_state
// ---------------------------------------------------------------------------

export interface AdaptiveExerciseStateRow {
  id: number;
  adaptive_plan_id: number;
  exercise_id: number;
  base_sets: number;
  current_weight: number;
  current_reps_low: number;
  current_reps_high: number;
  step_stall_count: number;
  last_progressed_at: number | null;
}

export async function getExerciseStates(adaptivePlanId: number): Promise<AdaptiveExerciseStateRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<AdaptiveExerciseStateRow>(
    'SELECT * FROM adaptive_exercise_state WHERE adaptive_plan_id = ?',
    [adaptivePlanId],
  );
}

export async function getExerciseState(
  adaptivePlanId: number,
  exerciseId: number,
): Promise<AdaptiveExerciseStateRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AdaptiveExerciseStateRow>(
    'SELECT * FROM adaptive_exercise_state WHERE adaptive_plan_id = ? AND exercise_id = ?',
    [adaptivePlanId, exerciseId],
  );
  return row ?? null;
}

export interface ExerciseStatePatch {
  baseSets?: number;
  currentWeight?: number;
  repsLow?: number;
  repsHigh?: number;
  stallCount?: number;
  lastProgressedAt?: number | null;
}

export async function upsertExerciseState(
  adaptivePlanId: number,
  exerciseId: number,
  patch: ExerciseStatePatch,
): Promise<void> {
  const db = await getDatabase();
  const existing = await getExerciseState(adaptivePlanId, exerciseId);
  if (!existing) {
    await db.runAsync(
      `INSERT INTO adaptive_exercise_state
         (adaptive_plan_id, exercise_id, base_sets, current_weight, current_reps_low, current_reps_high, step_stall_count, last_progressed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adaptivePlanId, exerciseId,
        patch.baseSets ?? 3,
        patch.currentWeight ?? 0,
        patch.repsLow ?? 8,
        patch.repsHigh ?? 12,
        patch.stallCount ?? 0,
        patch.lastProgressedAt ?? null,
      ],
    );
    return;
  }
  const fields: string[] = [];
  const params: any[] = [];
  if (patch.baseSets !== undefined) { fields.push('base_sets = ?'); params.push(patch.baseSets); }
  if (patch.currentWeight !== undefined) { fields.push('current_weight = ?'); params.push(patch.currentWeight); }
  if (patch.repsLow !== undefined) { fields.push('current_reps_low = ?'); params.push(patch.repsLow); }
  if (patch.repsHigh !== undefined) { fields.push('current_reps_high = ?'); params.push(patch.repsHigh); }
  if (patch.stallCount !== undefined) { fields.push('step_stall_count = ?'); params.push(patch.stallCount); }
  if (patch.lastProgressedAt !== undefined) { fields.push('last_progressed_at = ?'); params.push(patch.lastProgressedAt); }
  if (fields.length === 0) return;
  params.push(adaptivePlanId, exerciseId);
  await db.runAsync(
    `UPDATE adaptive_exercise_state SET ${fields.join(', ')} WHERE adaptive_plan_id = ? AND exercise_id = ?`,
    params,
  );
}

/** Wipe everything for a plan — used when the user turns the engine off and
 *  starts fresh, so a stale cycle can't resurface. */
export async function getAdaptivePlansForWorkoutPlan(planId: number): Promise<AdaptivePlanRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<AdaptivePlanRow>(
    'SELECT * FROM adaptive_plan WHERE plan_id = ? ORDER BY id DESC',
    [planId],
  );
}

/** Drops NSPI/mesocycle rows for a workout_plans.id. Sessions stay. */
export async function deleteAdaptiveDataForWorkoutPlan(workoutPlanId: number): Promise<void> {
  const rows = await getAdaptivePlansForWorkoutPlan(workoutPlanId);
  for (const row of rows) {
    await deleteAdaptivePlanData(row.id);
  }
}

export async function deleteAdaptivePlanData(adaptivePlanId: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM adaptive_week WHERE cycle_id IN
         (SELECT id FROM adaptive_cycle WHERE adaptive_plan_id = ?)`,
      [adaptivePlanId],
    );
    await db.runAsync('DELETE FROM adaptive_cycle WHERE adaptive_plan_id = ?', [adaptivePlanId]);
    await db.runAsync('DELETE FROM adaptive_exercise_state WHERE adaptive_plan_id = ?', [adaptivePlanId]);
    await db.runAsync('DELETE FROM adaptive_plan WHERE id = ?', [adaptivePlanId]);
  });
}
