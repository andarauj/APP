import { getWeekById } from '@/db/adaptiveDao';
import { getPlanById, getPlanExercisesWithDetails } from '@/db/planDao';
import { MUSCLE_GROUPS_PT, type MuscleGroup } from '@/types';
import { parsePlannedDays } from '@/utils/mesocycleMaterialize';
import { estimateDayMinutes } from '@/utils/workoutTime';

export interface ScheduledHeroPayload {
  planId: number;
  dayIndex: number;
  planName: string;
  dayLabel: string;
  estimatedMinutes: number;
  exerciseCount: number;
  muscles: string[];
  weekId?: number | null;
  weekIndex?: number | null;
  phase?: string | null;
}

export interface ScheduledExerciseRow {
  id: number;
  exercise_name: string;
  sets: number;
  reps_target: string;
  weight_target: number;
  target_rir: number | null;
  rest_seconds: number;
}

/** Shared payload for "what is this planned day" — Discover, Workout, Progress. */
export async function resolveScheduledPayload(
  planId: number,
  dayIndex: number,
  origin?: { weekId?: number | null; weekIndex?: number | null; phase?: string | null },
): Promise<ScheduledHeroPayload | null> {
  const plan = await getPlanById(planId);
  if (!plan) return null;

  if (origin?.weekId) {
    const week = await getWeekById(origin.weekId);
    const snap = week ? parsePlannedDays(week.planned_json).find(d => Number(d.dayIndex) === Number(dayIndex)) : null;
    if (snap && snap.exercises.length > 0) {
      const muscles = Array.from(new Set(snap.exercises.map(e => MUSCLE_GROUPS_PT[e.muscle as MuscleGroup] || e.muscle).filter(Boolean)));
      return {
        planId,
        dayIndex,
        planName: plan.name,
        dayLabel: snap.dayLabel || 'Treino',
        estimatedMinutes: estimateDayMinutes(snap.exercises.map(e => ({ sets: e.sets, restSeconds: e.rest }))),
        exerciseCount: snap.exercises.length,
        muscles,
        weekId: origin.weekId,
        weekIndex: origin.weekIndex ?? week?.week_index ?? null,
        phase: origin.phase ?? week?.phase ?? null,
      };
    }
  }

  const allExercises = await getPlanExercisesWithDetails(planId);
  const dayExercises = allExercises.filter((e: { day_index?: number }) => (e.day_index ?? 0) === dayIndex);
  if (dayExercises.length === 0) return null;
  const muscles = Array.from(new Set(
    dayExercises
      .map((e: { primary_muscle?: string }) => MUSCLE_GROUPS_PT[e.primary_muscle as MuscleGroup] || e.primary_muscle)
      .filter((m): m is string => !!m),
  ));
  return {
    planId,
    dayIndex,
    planName: plan.name,
    dayLabel: (dayExercises[0] as { day_label?: string }).day_label || 'Treino',
    estimatedMinutes: estimateDayMinutes(dayExercises.map((e: { sets: number; rest_seconds?: number }) => ({ sets: e.sets, restSeconds: e.rest_seconds ?? 0 }))),
    exerciseCount: dayExercises.length,
    muscles,
    weekId: origin?.weekId ?? null,
    weekIndex: origin?.weekIndex ?? null,
    phase: origin?.phase ?? null,
  };
}

export async function getScheduledDayExercises(
  planId: number,
  dayIndex: number,
  weekId?: number | null,
): Promise<ScheduledExerciseRow[]> {
  if (weekId) {
    const week = await getWeekById(weekId);
    const snap = week ? parsePlannedDays(week.planned_json).find(d => Number(d.dayIndex) === Number(dayIndex)) : null;
    if (snap && snap.exercises.length > 0) {
      return snap.exercises.map((e, i) => ({
        id: e.exerciseId ?? i,
        exercise_name: e.name,
        sets: e.sets,
        reps_target: String(e.reps),
        weight_target: e.weight ?? 0,
        target_rir: e.targetRir ?? null,
        rest_seconds: e.rest ?? 0,
      }));
    }
  }

  const allExercises = await getPlanExercisesWithDetails(planId);
  return allExercises
    .filter((e: { day_index?: number }) => (e.day_index ?? 0) === dayIndex)
    .map((e: {
      id: number;
      exercise_name?: string;
      name?: string;
      sets: number;
      reps_target?: string;
      reps?: string;
      weight_target?: number;
      target_rir?: number | null;
      rest_seconds?: number;
    }) => ({
      id: e.id,
      exercise_name: e.exercise_name || e.name || 'Exercício',
      sets: e.sets,
      reps_target: e.reps_target || String(e.reps ?? ''),
      weight_target: e.weight_target ?? 0,
      target_rir: e.target_rir ?? null,
      rest_seconds: e.rest_seconds ?? 0,
    }));
}
