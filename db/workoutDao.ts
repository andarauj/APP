import { getDatabase } from './database';
import type { WorkoutSession, WorkoutSet, SetType, PersonalRecord } from '@/types';
import { calculate1RM } from '@/utils/calculators';

/**
 * SQLite expression: effective kg for a set. Bodyweight @ 0 kg uses the
 * athlete's latest scale weight so calisthenics contribute to tonnage.
 * Kept as a shared fragment so finishSessionAsIs / weekly volume / history
 * stay consistent with the live workout screen.
 */
const EFFECTIVE_LOAD_SQL = `CASE
  WHEN ws.weight > 0 THEN ws.weight
  WHEN e.equipment = 'bodyweight' THEN COALESCE(
    (SELECT bm.weight FROM body_metrics bm WHERE bm.weight IS NOT NULL ORDER BY bm.date DESC LIMIT 1),
    0
  )
  ELSE 0
END`;
export async function createSession(name: string, planId: number | null, dayIndex: number | null = null): Promise<number> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const result = await db.runAsync(
    'INSERT INTO workout_sessions (plan_id, day_index, name, started_at) VALUES (?, ?, ?, ?)',
    [planId, dayIndex, name, now]
  );
  return result.lastInsertRowId as number;
}

export async function updateSession(session: Partial<WorkoutSession> & { id: number }): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];
  if (session.name !== undefined) { fields.push('name = ?'); params.push(session.name); }
  if (session.ended_at !== undefined) { fields.push('ended_at = ?'); params.push(session.ended_at); }
  if (session.total_duration !== undefined) { fields.push('total_duration = ?'); params.push(session.total_duration); }
  if (session.total_volume !== undefined) { fields.push('total_volume = ?'); params.push(session.total_volume); }
  if (session.total_sets !== undefined) { fields.push('total_sets = ?'); params.push(session.total_sets); }
  if (session.notes !== undefined) { fields.push('notes = ?'); params.push(session.notes); }
  if (fields.length === 0) return;
  params.push(session.id);
  await db.runAsync(`UPDATE workout_sessions SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function getSessionById(id: number): Promise<WorkoutSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM workout_sessions WHERE id = ?', [id]);
  return row as WorkoutSession | null;
}

export async function getAllSessions(limit = 100, offset = 0): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    // Only completed workouts. A session row is created when a workout starts,
    // so an app kill mid-workout used to leave a phantom 0-minute "workout"
    // in the history and inflate the streak.
    'SELECT * FROM workout_sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  return rows as WorkoutSession[];
}

/** How many completed sessions a plan has had since `sinceTs` (epoch
 *  seconds) — the "rolling workouts" queue (see adaptiveService's
 *  computeRollingSchedule) uses this count to know how far through this
 *  week's sequence of days the person actually is, regardless of which
 *  weekday each one landed on. */
export async function getCompletedSessionCountForPlan(planId: number, sinceTs: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM workout_sessions WHERE plan_id = ? AND ended_at IS NOT NULL AND started_at >= ?',
    [planId, sinceTs]
  );
  return row?.c ?? 0;
}

export async function getRecentSessions(days: number): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await db.getAllAsync(
    'SELECT * FROM workout_sessions WHERE started_at >= ? ORDER BY started_at DESC',
    [cutoff]
  );
  return rows as WorkoutSession[];
}

export async function getSessionSets(sessionId: number): Promise<WorkoutSet[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT * FROM workout_sets WHERE session_id = ? ORDER BY set_index',
    [sessionId]
  );
  return rows as WorkoutSet[];
}

export async function getSessionSetsWithExercise(sessionId: number): Promise<any[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT ws.*, e.name as exercise_name, e.primary_muscle, e.equipment
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ?
     ORDER BY ws.exercise_id, ws.set_index`,
    [sessionId]
  );
  return rows;
}

export async function addSet(
  sessionId: number,
  exerciseId: number,
  setIndex: number,
  reps: number,
  weight: number,
  rpe: number | null,
  restSeconds: number,
  setDuration: number,
  setType: SetType
): Promise<{ id: number; isPr: boolean }> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);

  // Check for PR (warmup sets never count as/against a PR — see checkPR)
  const isPr = setType !== 'warmup' && await checkPR(exerciseId, weight, reps);

  const result = await db.runAsync(
    `INSERT INTO workout_sets (session_id, exercise_id, set_index, reps, weight, rpe, rest_seconds, set_duration, set_type, completed_at, is_pr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, exerciseId, setIndex, reps, weight, rpe, restSeconds, setDuration, setType, now, isPr ? 1 : 0]
  );
  return { id: result.lastInsertRowId as number, isPr };
}

async function checkPR(exerciseId: number, weight: number, reps: number): Promise<boolean> {
  const db = await getDatabase();
  // BUGFIX: warmup sets were included in the historical max, letting a light
  // warmup set count towards (or even trigger) a personal record.
  const row = await db.getFirstAsync<{ max_w: number; max_r: number }>(
    "SELECT MAX(weight) as max_w, MAX(reps) as max_r FROM workout_sets WHERE exercise_id = ? AND set_type != 'warmup'",
    [exerciseId]
  );
  if (!row) return true;
  const newPr = weight > (row.max_w || 0) || (weight === (row.max_w || 0) && reps > (row.max_r || 0));
  return newPr;
}

export async function deleteSet(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM workout_sets WHERE id = ?', [id]);
}

/**
 * Corrects an already-logged set (reps/weight/RPE) — for the workout screen
 * letting a completed set stay editable to fix a typo, instead of only
 * updating on-screen state with no way to persist it (the same trap RPE
 * editing used to fall into before it was locked post-completion; see the
 * comment on SetRow's RPE cell in app/workout/active.tsx). Does not
 * recompute is_pr — a correction retroactively changing what the true max
 * was would require re-checking every set logged after this one too, which
 * is a bigger, separate concern than fixing a mistyped number.
 */
export async function updateWorkoutSet(
  id: number,
  patch: { reps?: number; weight?: number; rpe?: number | null },
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const params: any[] = [];
  if (patch.reps !== undefined) { fields.push('reps = ?'); params.push(patch.reps); }
  if (patch.weight !== undefined) { fields.push('weight = ?'); params.push(patch.weight); }
  if (patch.rpe !== undefined) { fields.push('rpe = ?'); params.push(patch.rpe); }
  if (fields.length === 0) return;
  params.push(id);
  await db.runAsync(`UPDATE workout_sets SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function getLastSetForExercise(exerciseId: number): Promise<WorkoutSet | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT * FROM workout_sets WHERE exercise_id = ? ORDER BY completed_at DESC LIMIT 1',
    [exerciseId]
  );
  return row as WorkoutSet | null;
}

/**
 * The previous session's own reps/weight for this exercise, keyed by
 * set_index. Distinct from getLastSetForExercise (which only ever returns
 * the single most recent SET, not one per position) — reading ANTERIOR
 * from that would show the same one number for every row of a multi-set
 * exercise, or worse, whatever the CURRENT set's own editable field holds
 * once someone types into it, since active.tsx used to fall back to the
 * live field for that column.
 */
export async function getLastSessionSetsByIndex(exerciseId: number): Promise<Record<number, { reps: number; weight: number }>> {
  const db = await getDatabase();
  const lastSession = await db.getFirstAsync<{ session_id: number }>(
    'SELECT session_id FROM workout_sets WHERE exercise_id = ? ORDER BY completed_at DESC LIMIT 1',
    [exerciseId]
  );
  if (!lastSession) return {};
  const sets = await db.getAllAsync<{ set_index: number; reps: number; weight: number }>(
    'SELECT set_index, reps, weight FROM workout_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_index',
    [lastSession.session_id, exerciseId]
  );
  const byIndex: Record<number, { reps: number; weight: number }> = {};
  for (const s of sets) byIndex[s.set_index] = { reps: s.reps, weight: s.weight };
  return byIndex;
}

export async function getSetsForExerciseHistory(exerciseId: number, limit = 50): Promise<WorkoutSet[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT * FROM workout_sets WHERE exercise_id = ? ORDER BY completed_at DESC LIMIT ?',
    [exerciseId, limit]
  );
  return rows as WorkoutSet[];
}

export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const db = await getDatabase();
  // date_achieved must come from the set that actually holds the PR
  // (max weight, then max reps), not MAX(completed_at) across the group —
  // a later lighter set would otherwise steal the date (and callers that
  // mistakenly *1000 that value paint year ~58668 on top).
  const rows = await db.getAllAsync(
    `SELECT ws.exercise_id, e.name as exercise_name, e.equipment,
      MAX(ws.weight) as max_weight,
      MAX(ws.reps) as max_reps,
      MAX(ws.weight * ws.reps) as max_volume,
      (
        SELECT ws2.completed_at FROM workout_sets ws2
        WHERE ws2.exercise_id = ws.exercise_id AND ws2.set_type != 'warmup'
        ORDER BY ws2.weight DESC, ws2.reps DESC, ws2.completed_at DESC
        LIMIT 1
      ) as date_achieved
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.set_type != 'warmup'
     GROUP BY ws.exercise_id
     HAVING MAX(ws.weight) > 0 OR e.equipment = 'bodyweight'
     ORDER BY max_weight DESC, max_reps DESC`
  );
  return rows.map((r: any) => {
    const isBodyweight = r.equipment === 'bodyweight' && !(r.max_weight > 0);
    return {
      exercise_id: r.exercise_id,
      exercise_name: r.exercise_name,
      max_weight: r.max_weight || 0,
      max_reps: r.max_reps || 0,
      max_volume: r.max_volume || 0,
      estimated_1rm: isBodyweight ? 0 : calculate1RM(r.max_weight || 0, r.max_reps || 1),
      date_achieved: r.date_achieved,
      is_bodyweight: isBodyweight ? 1 : 0,
    };
  });
}

export async function getExerciseProgressChart(exerciseId: number): Promise<{ date: number; weight: number; volume: number; reps: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT MAX(ws.weight) as weight,
            SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})) as volume,
            MAX(ws.reps) as reps,
            ws.completed_at as date
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.exercise_id = ?
     GROUP BY date(ws.completed_at, 'unixepoch')
     ORDER BY ws.completed_at ASC LIMIT 60`,
    [exerciseId]
  );
  return rows as any[];
}

export async function getStreakData(): Promise<{ currentStreak: number; longestStreak: number; totalWorkouts: number }> {
  const db = await getDatabase();
  const sessions = await db.getAllAsync<{ started_at: number }>(
    'SELECT started_at FROM workout_sessions WHERE ended_at IS NOT NULL ORDER BY started_at ASC'
  );
  if (sessions.length === 0) return { currentStreak: 0, longestStreak: 0, totalWorkouts: 0 };

  const days = new Set<string>();
  for (const s of sessions) {
    const d = new Date(s.started_at * 1000);
    days.add(d.toDateString());
  }

  const sortedDays = Array.from(days).sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 1;

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  // Current streak: count backwards from today or yesterday
  if (days.has(today) || days.has(yesterday)) {
    let checkDate = days.has(today) ? new Date() : new Date(Date.now() - 86400000);
    currentStreak = 0;
    while (days.has(checkDate.toDateString())) {
      currentStreak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    }
  }

  return { currentStreak, longestStreak, totalWorkouts: sessions.length };
}


export async function getWorkoutDatesByMonth(year: number, month: number): Promise<number[]> {
  const db = await getDatabase();
  const start = new Date(year, month, 1).getTime() / 1000;
  const end = new Date(year, month + 1, 0, 23, 59, 59).getTime() / 1000;
  const rows = await db.getAllAsync<{ started_at: number }>(
    'SELECT started_at FROM workout_sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at <= ?',
    [start, end]
  );
  return rows.map(r => new Date(r.started_at * 1000).getDate());
}

/**
 * The finished workout sessions for one specific calendar day — used by the
 * history calendar so tapping a day (previously not tappable at all) shows
 * what was actually trained that day instead of just a coloured dot.
 */
export async function getSessionsForDate(year: number, month: number, day: number): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const start = Math.floor(new Date(year, month, day, 0, 0, 0).getTime() / 1000);
  const end = Math.floor(new Date(year, month, day, 23, 59, 59).getTime() / 1000);
  const rows = await db.getAllAsync(
    'SELECT * FROM workout_sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at <= ? ORDER BY started_at DESC',
    [start, end]
  );
  return rows as WorkoutSession[];
}

/**
 * Returns a workout that was started but never finished (e.g. the app was
 * killed mid-session), so the user can resume or discard it instead of the
 * row lingering in the database forever.
 */
export async function getUnfinishedSession(): Promise<WorkoutSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT * FROM workout_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
  );
  return (row as WorkoutSession) || null;
}

/**
 * getUnfinishedSession plus how many sets it actually has logged — the
 * session row alone can't answer "was anything actually done here", which
 * app/(tabs)/start.tsx's recovery banner needs to decide between silently
 * discarding an empty draft (see the silent-discard rule in its own
 * comment) and surfacing a real "you have a workout in progress" prompt.
 */
export async function getUnfinishedSessionWithProgress(): Promise<{ session: WorkoutSession; completedSets: number } | null> {
  const session = await getUnfinishedSession();
  if (!session) return null;
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM workout_sets WHERE session_id = ?',
    [session.id]
  );
  return { session, completedSets: row?.c ?? 0 };
}

/**
 * Ends a session using whatever is already logged for it, without needing
 * the active workout screen's own live React state — the "Concluir o que
 * foi feito" recovery action runs from app/(tabs)/start.tsx, which never
 * mounted that screen for this session. total_duration is deliberately
 * left untouched: it already holds whatever completeSet's own checkpoint
 * last wrote (see app/workout/active.tsx), which is the real active-time
 * total: recomputing from `now - started_at` here would inflate it with
 * however long the session sat abandoned before this was called.
 */
export async function finishSessionAsIs(sessionId: number): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ sets: number; volume: number }>(
    `SELECT COUNT(*) as sets,
            COALESCE(SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})), 0) as volume
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ? AND ws.set_type != 'warmup'`,
    [sessionId]
  );
  await updateSession({
    id: sessionId,
    ended_at: Math.floor(Date.now() / 1000),
    total_sets: row?.sets ?? 0,
    total_volume: row?.volume ?? 0,
  });
}

export async function discardSession(sessionId: number): Promise<void> {
  const db = await getDatabase();
  // BUGFIX: this used to be two separate statements (delete the sets, then
  // delete the session). If the app was interrupted between them, the
  // session row would survive as an empty orphan. workout_sets.session_id
  // already has ON DELETE CASCADE, so deleting the session alone removes its
  // sets automatically, atomically, in one statement.
  await db.runAsync('DELETE FROM workout_sessions WHERE id = ?', [sessionId]);
}

/**
 * Working sets per muscle group over the last N days. Set count (not tonnage)
 * is the metric hypertrophy programming is usually planned around, and warmup
 * sets are excluded so the number reflects real stimulus.
 */
export async function getWeeklyVolumeByMuscle(days = 7): Promise<{ muscle: string; sets: number; volume: number }[]> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await db.getAllAsync<{ muscle: string; sets: number; volume: number }>(
    `SELECT e.primary_muscle AS muscle,
            COUNT(*) AS sets,
            COALESCE(SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})), 0) AS volume
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed_at >= ? AND ws.set_type != 'warmup'
     GROUP BY e.primary_muscle
     ORDER BY sets DESC`,
    [since]
  );
  return rows;
}

export interface ProgressionSuggestion {
  shouldProgress: boolean;
  suggestedWeight: number;
  reason: string;
  /** For bodyweight: suggested target reps on the next session. */
  suggestedReps?: number;
  isBodyweight?: boolean;
}

/**
 * Double progression: once every working set of the last session hit the top
 * of the target rep range, suggest a small load increase. Increment scales
 * with the working weight, since +2.5kg is trivial on a leg press but large
 * on a lateral raise.
 */
export async function getProgressionSuggestion(
  exerciseId: number,
  repsTarget: string
): Promise<ProgressionSuggestion | null> {
  const db = await getDatabase();

  const lastSession = await db.getFirstAsync<{ session_id: number }>(
    `SELECT session_id FROM workout_sets
     WHERE exercise_id = ? AND set_type != 'warmup'
     ORDER BY completed_at DESC LIMIT 1`,
    [exerciseId]
  );
  if (!lastSession) return null;

  const sets = await db.getAllAsync<{ reps: number; weight: number }>(
    `SELECT reps, weight FROM workout_sets
     WHERE session_id = ? AND exercise_id = ? AND set_type != 'warmup'`,
    [lastSession.session_id, exerciseId]
  );
  if (sets.length === 0) return null;

  // "8-12" -> 12, "10" -> 10, "20+" -> no ceiling to clear
  const topRep = parseInt(repsTarget.split('-').pop()?.replace(/\D/g, '') || '0');
  if (!topRep) return null;

  const weight = Math.max(...sets.map(s => s.weight));
  const allHitTop = sets.every(s => s.reps >= topRep);

  // Bodyweight / unloaded: progress by reps, not kg.
  if (weight <= 0) {
    if (!allHitTop) {
      return {
        shouldProgress: false,
        suggestedWeight: 0,
        reason: '',
        suggestedReps: topRep,
        isBodyweight: true,
      };
    }
    return {
      shouldProgress: true,
      suggestedWeight: 0,
      suggestedReps: topRep + 2,
      isBodyweight: true,
      reason: `Fizeste ${topRep}+ reps em todas as séries — tenta ${topRep + 2} na próxima`,
    };
  }

  if (!allHitTop) {
    return { shouldProgress: false, suggestedWeight: weight, reason: '', isBodyweight: false };
  }

  const increment = weight >= 100 ? 5 : weight >= 40 ? 2.5 : weight >= 20 ? 2 : 1;
  return {
    shouldProgress: true,
    suggestedWeight: weight + increment,
    reason: `Fizeste ${topRep}+ reps em todas as series com ${weight}kg`,
    isBodyweight: false,
  };
}

/** Copies a previous session's exercises/sets as the starting point for a new one. */
export async function getSessionTemplate(sessionId: number): Promise<{
  exercise_id: number; name: string; primary_muscle: string; equipment: string;
  sets: number; reps: number; weight: number; rest_seconds: number; image_url: string;
}[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT ws.exercise_id, e.name, e.primary_muscle, e.equipment, e.image_url,
            COUNT(*) AS sets,
            CAST(AVG(ws.reps) AS INTEGER) AS reps,
            MAX(ws.weight) AS weight,
            CAST(AVG(NULLIF(ws.rest_seconds, 0)) AS INTEGER) AS rest_seconds
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.session_id = ? AND ws.set_type != 'warmup'
     GROUP BY ws.exercise_id
     ORDER BY MIN(ws.id)`,
    [sessionId]
  );
  return rows.map(r => ({ ...r, rest_seconds: r.rest_seconds || 90, image_url: r.image_url || '' }));
}

export interface MostTrainedExercise {
  exercise_id: number;
  name: string;
  primary_muscle: string;
  equipment: string;
  set_count: number;
  last_trained: number;
}

/** Exercises ranked by how many sets you've logged for them recently. */
export async function getMostTrainedExercises(limit = 5, days = 60): Promise<MostTrainedExercise[]> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = await db.getAllAsync<MostTrainedExercise>(
    `SELECT e.id as exercise_id, e.name, e.primary_muscle, e.equipment,
            COUNT(*) as set_count, MAX(ws.completed_at) as last_trained
     FROM workout_sets ws
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed_at >= ? AND ws.set_type != 'warmup'
     GROUP BY ws.exercise_id
     ORDER BY set_count DESC, last_trained DESC
     LIMIT ?`,
    [since, limit]
  );
  return rows;
}

export interface MostUsedPlan {
  plan_id: number;
  name: string;
  session_count: number;
  last_used: number;
}

/** Plans ranked by how many times you've started a workout from them. */
export async function getMostUsedPlans(limit = 3): Promise<MostUsedPlan[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MostUsedPlan>(
    `SELECT s.plan_id as plan_id, p.name as name,
            COUNT(*) as session_count, MAX(s.started_at) as last_used
     FROM workout_sessions s
     JOIN workout_plans p ON s.plan_id = p.id
     WHERE s.plan_id IS NOT NULL AND s.ended_at IS NOT NULL
     GROUP BY s.plan_id
     ORDER BY session_count DESC, last_used DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

export interface TrainingTip {
  type: 'warning' | 'info' | 'positive';
  title: string;
  detail: string;
}

/**
 * Rule-based training insights derived from recent logged history — not an
 * AI/LLM call (the app is fully offline), just explainable heuristics a
 * coach might mention: muscles going untrained while others get frequent
 * work, volume dropping off, or an exercise's weight stalling for several
 * sessions in a row. Each rule is self-contained so one failing silently
 * doesn't block the others.
 */
export async function getTrainingTips(): Promise<TrainingTip[]> {
  const db = await getDatabase();
  const tips: TrainingTip[] = [];
  const now = Math.floor(Date.now() / 1000);

  try {
    // 1) Muscles trained in the last 30 days but neglected in the last 10.
    const recentMuscles = await db.getAllAsync<{ muscle: string; last: number }>(
      `SELECT e.primary_muscle as muscle, MAX(ws.completed_at) as last
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.set_type != 'warmup'
         AND e.primary_muscle NOT IN ('cardio','fullbody','mobility')
       GROUP BY e.primary_muscle`,
      [now - 30 * 86400]
    );
    const stale = recentMuscles.filter(m => now - m.last > 10 * 86400 && now - m.last < 30 * 86400);
    if (stale.length > 0) {
      tips.push({
        type: 'warning',
        title: `${stale.length > 1 ? 'Grupos musculares' : 'Grupo muscular'} sem treino há mais de 10 dias`,
        detail: stale.map(s => MUSCLE_LABEL(s.muscle)).join(', '),
      });
    }
  } catch { /* one rule failing shouldn't block the others */ }

  try {
    // 2) This week's volume vs the previous week.
    const thisWeek = await db.getFirstAsync<{ v: number }>(
      `SELECT COALESCE(SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})),0) as v
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.set_type != 'warmup'`,
      [now - 7 * 86400]
    );
    const lastWeek = await db.getFirstAsync<{ v: number }>(
      `SELECT COALESCE(SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})),0) as v
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.completed_at < ? AND ws.set_type != 'warmup'`,
      [now - 14 * 86400, now - 7 * 86400]
    );
    const tv = thisWeek?.v || 0;
    const lv = lastWeek?.v || 0;
    if (lv > 0 && tv < lv * 0.6) {
      tips.push({
        type: 'warning',
        title: 'Volume mais baixo que a semana passada',
        detail: `${Math.round(tv)}kg esta semana vs ${Math.round(lv)}kg na anterior — está tudo bem?`,
      });
    } else if (lv > 0 && tv > lv * 1.3) {
      tips.push({
        type: 'positive',
        title: 'Volume em subida',
        detail: `${Math.round(tv)}kg esta semana, acima dos ${Math.round(lv)}kg da anterior. Boa progressão.`,
      });
    }
  } catch { /* ignore */ }

  try {
    // 3) An exercise trained 4+ times recently with no weight increase at all.
    const stalled = await db.getAllAsync<{ name: string; sessions: number; maxw: number; minw: number }>(
      `SELECT e.name as name, COUNT(DISTINCT ws.session_id) as sessions,
              MAX(ws.weight) as maxw, MIN(ws.weight) as minw
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.set_type NOT IN ('warmup','failure')
       GROUP BY ws.exercise_id
       HAVING sessions >= 4 AND maxw = minw AND maxw > 0
       LIMIT 1`,
      [now - 45 * 86400]
    );
    if (stalled.length > 0) {
      tips.push({
        type: 'info',
        title: `"${stalled[0].name}" está estagnado`,
        detail: `Mesmo peso nas últimas ${stalled[0].sessions} sessões. Considera subir a carga, mudar as reps, ou trocar de exercício.`,
      });
    }
  } catch { /* ignore */ }

  try {
    // 4) No workouts logged in the last 5+ days despite an established habit.
    const last = await db.getFirstAsync<{ t: number }>(
      `SELECT MAX(started_at) as t FROM workout_sessions WHERE ended_at IS NOT NULL`
    );
    const totalSessions = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM workout_sessions WHERE ended_at IS NOT NULL`
    );
    if (last?.t && (totalSessions?.c || 0) >= 3) {
      const daysSince = Math.floor((now - last.t) / 86400);
      if (daysSince >= 5 && daysSince < 30) {
        tips.push({
          type: 'warning',
          title: `${daysSince} dias sem treinar`,
          detail: 'Já lá vai um tempo desde o último treino registado.',
        });
      }
    }
  } catch { /* ignore */ }

  return tips;
}

function MUSCLE_LABEL(muscle: string): string {
  const map: Record<string, string> = {
    chest: 'Peito', back: 'Costas', shoulders: 'Ombros', biceps: 'Bíceps',
    triceps: 'Tríceps', forearms: 'Antebraços', abs: 'Abdominais', quads: 'Quadríceps',
    hamstrings: 'Isquiotibiais', glutes: 'Glúteos', calves: 'Gémeos', traps: 'Trapézios', lats: 'Dorsais',
  };
  return map[muscle] || muscle;
}

/**
 * Gathers everything computeProgressIndex() needs from the database. Kept
 * separate from the scoring math itself (utils/progressIndex.ts) so the
 * formula stays a pure, independently testable function.
 */
export async function getProgressIndexData(): Promise<{
  sessionsThisWeek: number;
  avgSessionsPerWeek: number;
  volumeThisWeek: number;
  avgWeeklyVolume: number;
  muscleSetsRecent: { muscle: string; sets: number }[];
  prCountRecent: number;
  exercisesTrainedRecent: number;
}> {
  const db = await getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  const WEEK = 7 * DAY;

  const thisWeekStart = now - WEEK;
  const historyStart = now - 5 * WEEK; // this week + 4 prior weeks of baseline

  const [thisWeekRow, historyRows, muscleSets, prRow] = await Promise.all([
    db.getFirstAsync<{ sessions: number; volume: number }>(
      `SELECT COUNT(DISTINCT ws.session_id) as sessions,
              COALESCE(SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})), 0) as volume
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.set_type != 'warmup'`,
      [thisWeekStart]
    ),
    // One row per the 4 prior weeks (excluding the current one), used to
    // compute the person's own recent-average baseline.
    db.getAllAsync<{ sessions: number; volume: number }>(
      `SELECT COUNT(DISTINCT ws.session_id) as sessions,
              COALESCE(SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})), 0) as volume
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.completed_at < ? AND ws.set_type != 'warmup'
       GROUP BY CAST((? - ws.completed_at) / ? AS INTEGER)`,
      [historyStart, thisWeekStart, thisWeekStart, WEEK]
    ),
    db.getAllAsync<{ muscle: string; sets: number }>(
      `SELECT e.primary_muscle as muscle, COUNT(*) as sets
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.set_type != 'warmup'
       GROUP BY e.primary_muscle`,
      [now - 14 * DAY]
    ),
    db.getFirstAsync<{ prCount: number; exCount: number }>(
      `SELECT COUNT(*) as prCount, COUNT(DISTINCT exercise_id) as exCount
       FROM workout_sets WHERE completed_at >= ? AND is_pr = 1`,
      [now - 30 * DAY]
    ),
  ]);

  // exercisesTrainedRecent should count every distinct exercise trained in
  // the last 30 days, not just the ones that happened to score a PR — a
  // second query keeps the intent of each clear rather than overloading one.
  const exTrainedRow = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(DISTINCT exercise_id) as c FROM workout_sets WHERE completed_at >= ? AND set_type != 'warmup'`,
    [now - 30 * DAY]
  );

  const avgSessions = historyRows.length > 0
    ? historyRows.reduce((s, r) => s + r.sessions, 0) / historyRows.length
    : 0;
  const avgVolume = historyRows.length > 0
    ? historyRows.reduce((s, r) => s + r.volume, 0) / historyRows.length
    : 0;

  return {
    sessionsThisWeek: thisWeekRow?.sessions || 0,
    avgSessionsPerWeek: avgSessions,
    volumeThisWeek: thisWeekRow?.volume || 0,
    avgWeeklyVolume: avgVolume,
    muscleSetsRecent: muscleSets,
    prCountRecent: prRow?.prCount || 0,
    exercisesTrainedRecent: exTrainedRow?.c || 0,
  };
}

/**
 * Raw aggregated data for one calendar month — the basis for the "O teu
 * mês" recap screen. Takes an explicit year/month rather than "last N
 * days" (unlike getWeeklyVolumeByMuscle/getMostTrainedExercises) so past
 * months can be viewed too, not just a rolling window from today.
 */
export async function getMonthlyRecapData(year: number, month: number): Promise<{
  totalWorkouts: number;
  totalVolume: number;
  totalDuration: number;
  muscleDistribution: { muscle: string; sets: number }[];
  topExercises: { name: string; setCount: number }[];
  prCount: number;
}> {
  const db = await getDatabase();
  const start = Math.floor(new Date(year, month, 1).getTime() / 1000);
  const end = Math.floor(new Date(year, month + 1, 1).getTime() / 1000);

  const [sessionRow, muscleRows, exerciseRows, prRow] = await Promise.all([
    db.getFirstAsync<{ c: number; volume: number; duration: number }>(
      `SELECT COUNT(*) as c, COALESCE(SUM(total_volume), 0) as volume, COALESCE(SUM(total_duration), 0) as duration
       FROM workout_sessions WHERE started_at >= ? AND started_at < ? AND ended_at IS NOT NULL`,
      [start, end]
    ),
    db.getAllAsync<{ muscle: string; sets: number }>(
      `SELECT e.primary_muscle as muscle, COUNT(*) as sets
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.completed_at < ? AND ws.set_type != 'warmup'
       GROUP BY e.primary_muscle ORDER BY sets DESC`,
      [start, end]
    ),
    db.getAllAsync<{ name: string; setCount: number }>(
      `SELECT e.name as name, COUNT(*) as setCount
       FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at >= ? AND ws.completed_at < ? AND ws.set_type != 'warmup'
       GROUP BY ws.exercise_id ORDER BY setCount DESC LIMIT 3`,
      [start, end]
    ),
    db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM workout_sets WHERE completed_at >= ? AND completed_at < ? AND is_pr = 1`,
      [start, end]
    ),
  ]);

  return {
    totalWorkouts: sessionRow?.c || 0,
    totalVolume: sessionRow?.volume || 0,
    totalDuration: sessionRow?.duration || 0,
    muscleDistribution: muscleRows,
    topExercises: exerciseRows,
    prCount: prRow?.c || 0,
  };
}

/**
 * The raw numbers the achievement system checks against. prCount counts
 * every individual PR *event* (is_pr=1 rows), not distinct exercises with a
 * best record — someone who broke the same lift's PR five times over the
 * year should see that reflected, not collapsed into "1 exercise has a PR".
 */
export async function getAchievementStats(): Promise<{
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  prCount: number;
  totalVolume: number;
  firstWorkoutAt: number | null;
}> {
  const db = await getDatabase();
  const [streak, prRow, volumeRow, firstRow] = await Promise.all([
    getStreakData(),
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM workout_sets WHERE is_pr = 1'),
    db.getFirstAsync<{ v: number }>('SELECT COALESCE(SUM(total_volume), 0) as v FROM workout_sessions WHERE ended_at IS NOT NULL'),
    db.getFirstAsync<{ started_at: number }>('SELECT MIN(started_at) as started_at FROM workout_sessions WHERE ended_at IS NOT NULL'),
  ]);
  return {
    totalWorkouts: streak.totalWorkouts,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    prCount: prRow?.c || 0,
    totalVolume: volumeRow?.v || 0,
    firstWorkoutAt: firstRow?.started_at ?? null,
  };
}

/**
 * Days since each of the 10 rotation muscles was last trained — the raw
 * input for selectTodaysMuscles(). A muscle with no rows at all yet gets
 * null (never trained), matching the "most overdue of all" case that
 * function treats specially.
 */
export async function getMuscleRecency(): Promise<{ muscle: string; daysSinceLastTrained: number | null }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ muscle: string; last_trained: number | null }>(
    `SELECT e.primary_muscle as muscle, MAX(ws.completed_at) as last_trained
     FROM exercises e
     LEFT JOIN workout_sets ws ON ws.exercise_id = e.id AND ws.set_type != 'warmup'
     WHERE e.primary_muscle IN ('chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','abs')
     GROUP BY e.primary_muscle`
  );
  const now = Math.floor(Date.now() / 1000);
  return rows.map(r => ({
    muscle: r.muscle,
    daysSinceLastTrained: r.last_trained ? Math.floor((now - r.last_trained) / 86400) : null,
  }));
}

/**
 * One row per day for the last `daysBack` days (today inclusive), with the
 * number of working sets logged that day — zero-filled for rest days so
 * the heatmap always has a complete, gap-free grid to render. Buckets by
 * LOCAL calendar day in JS (matching getMonthlyRecapData's approach)
 * rather than a SQL date function, so "today" means today in the person's
 * own timezone, not UTC.
 */
export async function getTrainingHeatmapData(daysBack = 91): Promise<{ date: string; sets: number }[]> {
  const db = await getDatabase();
  const now = new Date();
  const since = Math.floor(now.getTime() / 1000) - daysBack * 86400;

  const rows = await db.getAllAsync<{ completed_at: number }>(
    `SELECT completed_at FROM workout_sets WHERE completed_at >= ? AND set_type != 'warmup'`,
    [since]
  );

  const countsByDay = new Map<string, number>();
  for (const row of rows) {
    const d = new Date(row.completed_at * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
  }

  const days: { date: string; sets: number }[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ date: key, sets: countsByDay.get(key) || 0 });
  }
  return days;
}

/**
 * Raw data for the Fatigue Signals radar: per-session estimated 1RM history
 * for the person's most-trained exercises recently, for
 * detectPerformanceRegression to check for a sustained decline. Limited to
 * a recent window (last ~90 days of exercise selection, last ~10 sessions
 * per exercise) deliberately — comparing against a truly ancient peak from
 * a different training phase wouldn't be a fair or useful comparison.
 */
export async function getFatigueRadarExerciseData(topN = 6, sessionWindow = 10): Promise<{
  exerciseId: number;
  exerciseName: string;
  primaryMuscle: string;
  points: { date: number; estimated1RM: number }[];
  rpeSets: { date: number; weight: number; rpe: number | null }[];
}[]> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;

  const topExercises = await db.getAllAsync<{ exercise_id: number; name: string; primary_muscle: string }>(
    `SELECT e.id as exercise_id, e.name, e.primary_muscle, COUNT(*) as cnt
     FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed_at >= ? AND ws.set_type = 'normal'
     GROUP BY ws.exercise_id ORDER BY cnt DESC LIMIT ?`,
    [since, topN]
  );

  const results: { exerciseId: number; exerciseName: string; primaryMuscle: string; points: { date: number; estimated1RM: number }[]; rpeSets: { date: number; weight: number; rpe: number | null }[] }[] = [];

  for (const ex of topExercises) {
    const sets = await db.getAllAsync<{ session_id: number; weight: number; reps: number; rpe: number | null; date: number }>(
      `SELECT ws.session_id, ws.weight, ws.reps, ws.rpe, s.started_at as date
       FROM workout_sets ws JOIN workout_sessions s ON ws.session_id = s.id
       WHERE ws.exercise_id = ? AND ws.set_type = 'normal'
       ORDER BY s.started_at DESC LIMIT 300`,
      [ex.exercise_id]
    );

    // Best estimated 1RM per session (a session's best set represents that
    // day's performance better than any single set, or an average that
    // would be dragged down by lighter warm-up-adjacent working sets).
    const bySession = new Map<number, { date: number; maxOneRM: number }>();
    for (const s of sets) {
      const oneRM = calculate1RM(s.weight, s.reps);
      const existing = bySession.get(s.session_id);
      if (!existing || oneRM > existing.maxOneRM) {
        bySession.set(s.session_id, { date: s.date, maxOneRM: oneRM });
      }
    }

    const points = Array.from(bySession.values())
      .sort((a, b) => a.date - b.date)
      .slice(-sessionWindow)
      .map(p => ({ date: p.date, estimated1RM: p.maxOneRM }));

    // Every individual set (not collapsed to one per session) chronological
    // — detectRpeCreep needs each set's own weight/RPE pairing, not a
    // per-session best.
    const rpeSets = sets
      .slice()
      .sort((a, b) => a.date - b.date)
      .slice(-60) // enough sets to cover sessionWindow sessions even at several sets each
      .map(s => ({ date: s.date, weight: s.weight, rpe: s.rpe }));

    results.push({ exerciseId: ex.exercise_id, exerciseName: ex.name, primaryMuscle: ex.primary_muscle, points, rpeSets });
  }

  return results;
}

/**
 * How much the person has actually used each exercise recently — the basis
 * for preferring exercises with a real track record over the generator's
 * generic equipment-priority guess (barbell > dumbbell > ...), which has
 * no idea whether THIS person actually gets on well with barbell work.
 * Session count (not raw set count) so someone doing 10 sets in one
 * session doesn't outrank someone who's used an exercise steadily across
 * 8 separate sessions — consistency over time is the more meaningful
 * signal for "this is working for them".
 */
export async function getExerciseUsageCounts(daysBack = 180): Promise<Map<number, number>> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - daysBack * 86400;
  const rows = await db.getAllAsync<{ exercise_id: number; session_count: number }>(
    `SELECT exercise_id, COUNT(DISTINCT session_id) as session_count
     FROM workout_sets
     WHERE completed_at >= ? AND set_type != 'warmup'
     GROUP BY exercise_id`,
    [since]
  );
  return new Map(rows.map(r => [r.exercise_id, r.session_count]));
}

/**
 * Past RPE values logged for this exercise at a similar weight, from
 * sessions BEFORE the current one — the comparison baseline for in-workout
 * auto-regulation (see utils/autoRegulation.ts). Excludes the current
 * session on purpose: comparing a set against earlier sets from the SAME
 * session wouldn't answer "is this harder than usual for me", just
 * "harder than 10 minutes ago", which isn't the same question.
 */
export async function getHistoricalRpeAtWeight(
  exerciseId: number,
  targetWeight: number,
  excludeSessionId: number,
  weightTolerancePercent = 5,
): Promise<number[]> {
  const db = await getDatabase();
  const tolerance = targetWeight * (weightTolerancePercent / 100);
  const rows = await db.getAllAsync<{ weight: number; rpe: number | null }>(
    `SELECT weight, rpe FROM workout_sets
     WHERE exercise_id = ? AND set_type = 'normal' AND session_id != ? AND rpe IS NOT NULL
     ORDER BY completed_at DESC LIMIT 60`,
    [exerciseId, excludeSessionId]
  );
  return rows
    .filter(r => Math.abs(r.weight - targetWeight) <= tolerance)
    .map(r => r.rpe as number);
}

/**
 * Which weekdays (0=Sun..6=Sat) had at least one COMPLETED session in the
 * current calendar week — the other half of the weekly commitment picture
 * alongside the weekly planner (see utils/weeklyCommitment.ts). Computed
 * in JS from local weekday, not a SQL date function, matching how the rest
 * of the app already handles calendar-day boundaries (e.g.
 * getMonthlyRecapData).
 */
export async function getThisWeekCompletedDays(): Promise<Set<number>> {
  const db = await getDatabase();
  const now = new Date();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const since = Math.floor(startOfWeek.getTime() / 1000);

  const rows = await db.getAllAsync<{ started_at: number }>(
    `SELECT started_at FROM workout_sessions WHERE started_at >= ? AND ended_at IS NOT NULL`,
    [since]
  );

  const days = new Set<number>();
  for (const row of rows) {
    days.add(new Date(row.started_at * 1000).getDay());
  }
  return days;
}

/**
 * Histórico completo de sessões com paginação — para o novo ecrã de histórico.
 * Retorna sessões ordenadas por data (mais recente primeiro).
 */
export async function getSessionHistory(limit = 50, offset = 0): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT * FROM workout_sessions 
     WHERE ended_at IS NOT NULL 
     ORDER BY started_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows as WorkoutSession[];
}

/**
 * Progressão completa de um exercício — todos os sets ao longo do tempo.
 * Usado para gráfico de progressão e análise detalhada.
 */
export async function getExerciseProgression(exerciseId: number, daysBack = 180): Promise<
  {
    date: number; // timestamp
    weight: number;
    reps: number;
    rpe: number | null;
    setType: SetType;
    sessionName: string;
  }[]
> {
  const db = await getDatabase();
  const since = Math.floor(Date.now() / 1000) - daysBack * 86400;
  const rows = await db.getAllAsync(
    `SELECT 
       ws.weight, ws.reps, ws.rpe, ws.set_type, ws.completed_at, wh.name
     FROM workout_sets ws
     JOIN workout_sessions wh ON ws.session_id = wh.id
     WHERE ws.exercise_id = ? AND ws.completed_at >= ?
     ORDER BY ws.completed_at ASC`,
    [exerciseId, since]
  );
  
  return rows.map((r: any) => ({
    date: r.completed_at,
    weight: r.weight,
    reps: r.reps,
    rpe: r.rpe,
    setType: r.set_type,
    sessionName: r.name,
  }));
}

/**
 * Volume semanal por músculo — útil para visualizar distribuição.
 * Retorna as últimas N semanas.
 */
export async function getWeeklyVolumeHistory(weeksBack = 12): Promise<
  {
    weekStart: string; // "2026-W37"
    muscle: string;
    volume: number;
    sets: number;
  }[]
> {
  const db = await getDatabase();
  const now = new Date();
  const results: any[] = [];

  for (let w = weeksBack - 1; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - w * 7);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const startTs = Math.floor(weekStart.getTime() / 1000);
    const endTs = Math.floor(weekEnd.getTime() / 1000);
    const weekLabel = `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getDate() + 6) / 7)}`;

    const rows = await db.getAllAsync<{ primary_muscle: string; volume: number; sets: number }>(
      `SELECT 
         e.primary_muscle,
         SUM(ws.reps * (${EFFECTIVE_LOAD_SQL})) as volume,
         COUNT(*) as sets
       FROM workout_sets ws
       JOIN exercises e ON ws.exercise_id = e.id
       WHERE ws.completed_at BETWEEN ? AND ? AND ws.set_type = 'normal'
       GROUP BY e.primary_muscle`,
      [startTs, endTs]
    );

    for (const row of rows) {
      results.push({
        weekStart: weekLabel,
        muscle: row.primary_muscle,
        volume: row.volume || 0,
        sets: row.sets || 0,
      });
    }
  }

  return results;
}

/**
 * Próxima sugestão de progressão para um exercício.
 * Baseado no último set e histórico recente.
 */
export async function getProgressionSuggestionForExercise(exerciseId: number): Promise<{
  suggestedWeight: number;
  lastWeight: number;
  lastReps: number;
  reasoning: string;
} | null> {
  const db = await getDatabase();
  const lastSet = await getLastSetForExercise(exerciseId);
  if (!lastSet) return null;

  // Histórico dos últimos 8 sets
  const history = await db.getAllAsync<{ weight: number; reps: number }>(
    `SELECT weight, reps FROM workout_sets 
     WHERE exercise_id = ? AND set_type = 'normal'
     ORDER BY completed_at DESC LIMIT 8`,
    [exerciseId]
  );

  if (history.length === 0) return null;

  const avgReps = history.reduce((sum, s) => sum + s.reps, 0) / history.length;
  let suggestedWeight = lastSet.weight;
  let reasoning = '';

  if (avgReps >= 12) {
    suggestedWeight = lastSet.weight * 1.025; // +2.5%
    reasoning = 'Reps altas — aumenta peso';
  } else if (avgReps >= 8 && avgReps < 10) {
    suggestedWeight = lastSet.weight * 1.05; // +5%
    reasoning = 'Progressão saudável — +5%';
  } else if (avgReps < 5) {
    suggestedWeight = lastSet.weight * 0.975; // -2.5%
    reasoning = 'Reps baixas — reduz peso';
  }

  return {
    suggestedWeight: Math.round(suggestedWeight * 100) / 100,
    lastWeight: lastSet.weight,
    lastReps: lastSet.reps,
    reasoning,
  };
}
