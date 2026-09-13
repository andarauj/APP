/**
 * Workout hub helpers — one plan, one day list, one engine.
 * Does not invent a second generator or agenda.
 */

import type { Exercise, MuscleGroup, PlanType, WorkoutPlan } from '@/types';
import {
  addExerciseToPlan,
  addPlanDay,
  createPlan,
  filterUserSelectablePlans,
  getAllPlans,
  getPlanById,
  getPlanDaySlots,
  getPlanExercisesWithDetails,
  MAX_PLAN_DAYS,
  setPlanDaySlots,
  type PlanDaySlot,
} from '@/db/planDao';
import { getPlanSessionRows, getExerciseUsageCounts } from '@/db/workoutDao';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { getAllExercises } from '@/db/exerciseDao';
import { ensureExerciseCatalog, getDatabase } from '@/db/database';
import {
  fitDayToMinutes,
  pickExercisesForDay,
  restSecondsFor,
  type FittedDayExercise,
} from './planGenerator';
import { buildPlanOverview, type OverviewWeek } from './plannedWorkout';
import { getAllWeeksForPlan } from '@/db/adaptiveDao';
import { refreshPlannedWeeksFromTemplate } from './adaptiveService';
import type { AdaptiveStatus } from './adaptiveService';
import { estimateDayMinutes } from './workoutTime';
import { PHASE_LABEL_PT } from './adaptivePlan';
import type { AdaptivePhase } from './nspi';

/** Thrown when Build for Me targets a workout_plans row that no longer exists. */
export class PlanMissingError extends Error {
  constructor(planId: number) {
    super(`Plan ${planId} not found`);
    this.name = 'PlanMissingError';
  }
}

export const WEEKDAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const;

export function formatWeekPhaseBadge(weekIndex: number, phase: string): string {
  const label = PHASE_LABEL_PT[phase as AdaptivePhase] ?? phase;
  return `Semana ${weekIndex} · ${label}`;
}
export const DEFAULT_DAY_WEEKDAYS = [1, 3, 5, 2, 4, 6]; // Mon Wed Fri Tue Thu Sat

export type WorkoutDayState = 'planned' | 'in_progress' | 'completed';

export function focusMusclesForDayLabel(label: string): MuscleGroup[] {
  const s = label.toLowerCase();
  if (/push|peito|chest/.test(s)) return ['chest', 'shoulders', 'triceps'];
  if (/pull|costas|back/.test(s)) return ['back', 'biceps', 'forearms'];
  if (/leg|perna|lower|quad/.test(s)) return ['quads', 'hamstrings', 'glutes', 'calves'];
  if (/upper|superior/.test(s)) return ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
  if (/full|corpo|inteiro/.test(s)) return ['chest', 'back', 'quads', 'shoulders', 'abs'];
  if (/ombro|shoulder/.test(s)) return ['shoulders', 'triceps'];
  if (/arm|braço/.test(s)) return ['biceps', 'triceps'];
  return ['chest', 'back', 'quads', 'shoulders'];
}

export function mergeDaySlots(
  jsonSlots: Omit<PlanDaySlot, 'exercise_count'>[],
  exerciseDays: { day_index: number; day_label: string; exercise_count: number }[],
): PlanDaySlot[] {
  const byIndex = new Map<number, PlanDaySlot>();
  for (const d of jsonSlots) {
    byIndex.set(d.day_index, { ...d, exercise_count: 0 });
  }
  for (const d of exerciseDays) {
    const prev = byIndex.get(d.day_index);
    byIndex.set(d.day_index, {
      day_index: d.day_index,
      day_label: prev?.day_label || d.day_label,
      weekday: prev?.weekday,
      exercise_count: d.exercise_count,
    });
  }
  return [...byIndex.values()].sort((a, b) => a.day_index - b.day_index);
}

export function weekdayForSlot(slot: PlanDaySlot, index: number): number {
  if (typeof slot.weekday === 'number') return slot.weekday;
  return DEFAULT_DAY_WEEKDAYS[index] ?? ((1 + index * 2) % 7);
}

export async function resolvePrimaryPlan(adaptivePlanId?: number | null): Promise<WorkoutPlan | null> {
  if (adaptivePlanId) {
    const adaptive = await getPlanById(adaptivePlanId);
    if (adaptive) return adaptive;
  }
  const selectable = filterUserSelectablePlans(await getAllPlans());
  if (selectable[0]) return selectable[0];
  const all = await getAllPlans();
  return all[0] ?? null;
}

export async function createBlankWeeklyPlan(): Promise<number> {
  const id = await createPlan('O meu plano', '', 'hypertrophy', 'custom', false);
  await setPlanDaySlots(id, [
    { day_index: 0, day_label: 'Workout Day #1', weekday: 1 },
    { day_index: 1, day_label: 'Workout Day #2', weekday: 3 },
    { day_index: 2, day_label: 'Workout Day #3', weekday: 5 },
  ]);
  return id;
}

export async function addNextPlanDay(planId: number): Promise<PlanDaySlot> {
  const slots = await getPlanDaySlots(planId);
  const n = slots.length + 1;
  const weekday = DEFAULT_DAY_WEEKDAYS[slots.length];
  return addPlanDay(planId, `Workout Day #${n}`, weekday);
}

export function dayStateFromSessions(
  dayIndex: number,
  sessions: { day_index?: number | null; ended_at?: number | null; started_at: number }[],
  weekStart: number,
  weekEnd: number,
  unfinishedDayIndex: number | null,
): WorkoutDayState {
  if (unfinishedDayIndex === dayIndex) return 'in_progress';
  const done = sessions.some(s =>
    s.ended_at != null
    && s.day_index === dayIndex
    && s.started_at >= weekStart
    && s.started_at < weekEnd,
  );
  return done ? 'completed' : 'planned';
}

export async function loadWorkoutPlanView(adaptive: AdaptiveStatus | null): Promise<{
  plan: WorkoutPlan | null;
  slots: PlanDaySlot[];
  exercises: any[];
  weeks: OverviewWeek[];
  currentWeekIndex: number;
  dayLimit: number;
}> {
  const plan = await resolvePrimaryPlan(adaptive?.planId);
  if (!plan) {
    return { plan: null, slots: [], exercises: [], weeks: [], currentWeekIndex: 1, dayLimit: MAX_PLAN_DAYS };
  }

  const [slots, exercises, planner] = await Promise.all([
    getPlanDaySlots(plan.id),
    getPlanExercisesWithDetails(plan.id),
    getWeeklyPlanner().catch(() => ({})),
  ]);

  const slotted = slots.map((s, i) => {
    const fromPlanner = Object.entries(planner).find(([, e]) =>
      e && e.planId === plan.id && e.dayIndex === s.day_index,
    );
    return {
      ...s,
      weekday: fromPlanner ? Number(fromPlanner[0]) : weekdayForSlot(s, i),
    };
  });

  let weeks: OverviewWeek[] = [];
  let currentWeekIndex = 1;
  if (adaptive) {
    const [rawWeeks, sessions] = await Promise.all([
      getAllWeeksForPlan(adaptive.adaptivePlanId),
      getPlanSessionRows(plan.id),
    ]);
    const weekdayByDayIndex: Record<number, number> = {};
    slotted.forEach(s => {
      if (s.weekday != null) weekdayByDayIndex[s.day_index] = s.weekday;
    });
    const overview = buildPlanOverview(rawWeeks, sessions, plan.id, weekdayByDayIndex);
    weeks = overview.weeks;
    currentWeekIndex = overview.currentWeekIndex;
  }

  return {
    plan,
    slots: slotted,
    exercises,
    weeks,
    currentWeekIndex,
    dayLimit: MAX_PLAN_DAYS,
  };
}

export function exercisesForDay(exercises: any[], dayIndex: number): any[] {
  return exercises.filter(e => (e.day_index ?? 0) === dayIndex);
}

export function estimateExercisesMinutes(dayExercises: any[]): number {
  return estimateDayMinutes(dayExercises.map(e => ({
    sets: e.sets,
    restSeconds: e.rest_seconds,
  })));
}

export async function addCatalogExerciseToDay(
  planId: number,
  exercise: { id: number; name: string },
  dayIndex: number,
  dayLabel: string,
  existingCount: number,
  planType: PlanType = 'hypertrophy',
): Promise<void> {
  await addExerciseToPlan(
    planId,
    exercise.id,
    4,
    '8-10',
    0,
    restSecondsFor(planType, exercise.name),
    'normal',
    null,
    '',
    existingCount,
    dayLabel,
    dayIndex,
  );
  await refreshPlannedWeeksFromTemplate(planId).catch(() => 0);
}

export async function buildDayForMe(
  planId: number,
  dayIndex: number,
  dayLabel: string,
  minutes = 60,
  planType: PlanType = 'hypertrophy',
): Promise<number> {
  await ensureExerciseCatalog();

  const plan = await getPlanById(planId);
  if (!plan) throw new PlanMissingError(planId);

  const [all, usage, existing] = await Promise.all([
    getAllExercises(),
    getExerciseUsageCounts(),
    getPlanExercisesWithDetails(planId),
  ]);
  const already = new Set(exercisesForDay(existing, dayIndex).map(e => e.exercise_id));
  const pool = all.filter(e => !already.has(e.id));
  const focus = focusMusclesForDayLabel(dayLabel);
  const picked = pickExercisesForDay(pool, focus, minutes, 'any', [], usage, undefined, undefined, planType, 'intermediate', dayLabel);
  let fitted: FittedDayExercise[] = fitDayToMinutes(picked, minutes, planType);

  // Empty pick / thin catalog: fall back to 1–2 foundational strength rows
  // for the day's focus instead of returning 0 or throwing.
  if (fitted.length === 0) {
    fitted = fallbackFittedExercises(pool.length > 0 ? pool : all, focus, planType, already);
  }

  const db = await getDatabase();
  let inserted = 0;
  let order = already.size;
  await db.withTransactionAsync(async () => {
    for (const row of fitted) {
      if (already.has(row.exercise.id)) continue;
      try {
        await addExerciseToPlan(
          planId,
          row.exercise.id,
          row.sets,
          row.reps,
          0,
          row.rest,
          row.setType,
          null,
          '',
          order++,
          dayLabel,
          dayIndex,
        );
        inserted += 1;
      } catch (err) {
        // Single bad FK / row must not abort the whole day — try a generic
        // substitute for this slot when possible.
        console.error('[buildDayForMe] insert failed, trying fallback:', err);
        const alt = fallbackFittedExercises(all, focus, planType, already).find(
          f => f.exercise.id !== row.exercise.id && !already.has(f.exercise.id),
        );
        if (!alt) continue;
        try {
          await addExerciseToPlan(
            planId,
            alt.exercise.id,
            alt.sets,
            alt.reps,
            0,
            alt.rest,
            alt.setType,
            null,
            '',
            order++,
            dayLabel,
            dayIndex,
          );
          already.add(alt.exercise.id);
          inserted += 1;
        } catch (err2) {
          console.error('[buildDayForMe] fallback insert failed:', err2);
        }
      }
    }
  });

  await refreshPlannedWeeksFromTemplate(planId).catch(() => 0);
  return inserted;
}

/** Prefer short foundational lifts per focus muscle; else any strength row. */
function fallbackFittedExercises(
  catalog: Exercise[],
  focus: MuscleGroup[],
  planType: PlanType,
  already: Set<number>,
): FittedDayExercise[] {
  const strength = catalog.filter(e => e.type === 'strength' && !already.has(e.id));
  const byFocus = focus
    .map(m => strength
      .filter(e => e.primary_muscle === m)
      .sort((a, b) => a.name.split(' ').length - b.name.split(' ').length)[0])
    .filter((e): e is Exercise => !!e);
  const picks = (byFocus.length > 0 ? byFocus : strength.slice(0, 2)).slice(0, 2);
  return picks.map(exercise => ({
    exercise,
    sets: 3,
    reps: '8-12',
    rest: restSecondsFor(planType, exercise.name),
    setType: 'normal' as const,
  }));
}
