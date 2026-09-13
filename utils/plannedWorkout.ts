/**
 * Public planned-workout engine.
 *
 * Adaptive Plan → Weeks → Scheduled workouts → Exercises.
 * Deterministic from (template, goal, experience, weekStart, weekday map).
 * Opening the UI never regenerates this.
 */

import type { AdaptiveExperience, AdaptiveGoal, AdaptivePhase } from './nspi';
import {
  buildMesocycleWeeks,
  completedDayIndexesInWindow,
  mesocyclePhaseSchedule,
  mesocycleLengthForExperience,
  parsePlannedDays,
  snapshotWorkoutsForPhase,
  weekForDate,
  workoutCompletionStates,
  type MesocycleExercise,
  type MesocycleWorkout,
  type TemplateExercise,
} from './mesocycleMaterialize';
import { nudgeAccessoryVolume } from './movementBalance';

export interface GenerateMesocycleInput {
  template: TemplateExercise[];
  goal: AdaptiveGoal;
  experience: AdaptiveExperience;
  weekStart: number;
  weekdayByDayIndex?: Record<number, number>;
  length?: 4 | 5 | 6;
  planId?: number;
}

export interface PlannedWorkout {
  id: string;
  planId: number;
  weekIndex: number;
  weekId?: number;
  phase: AdaptivePhase;
  dayIndex: number;
  weekday: number;
  scheduledDate: number;
  name: string;
  exercises: MesocycleExercise[];
}

export interface PlannedWeek {
  weekIndex: number;
  phase: AdaptivePhase;
  isBridge: boolean;
  status: 'active' | 'planned' | 'done';
  weekStart: number;
  weekEnd: number;
  workouts: PlannedWorkout[];
}

export interface GeneratedMesocycle {
  length: 4 | 5 | 6;
  weeks: PlannedWeek[];
}

const DAY = 86400;

export function weekStartDowFromEpoch(weekStart: number): number {
  return new Date(weekStart * 1000).getDay();
}

export function scheduledDateForWeekday(weekStart: number, weekday: number): number {
  const startDow = weekStartDowFromEpoch(weekStart);
  const offset = (weekday - startDow + 7) % 7;
  return weekStart + offset * DAY;
}

export function plannedWorkoutId(weekIndex: number, dayIndex: number): string {
  return `w${weekIndex}-d${dayIndex}`;
}

export function defaultWeekdaysForDays(dayIndexes: number[], weekStartDow: number): Record<number, number> {
  const unique = [...new Set(dayIndexes)].sort((a, b) => a - b);
  const out: Record<number, number> = {};
  const gap = unique.length <= 1 ? 0 : Math.max(1, Math.floor(6 / unique.length));
  unique.forEach((dayIndex, i) => {
    out[dayIndex] = (weekStartDow + i * gap) % 7;
  });
  return out;
}

export function attachSchedule(
  workouts: MesocycleWorkout[],
  weekStart: number,
  weekIndex: number,
  phase: AdaptivePhase,
  weekdayByDayIndex: Record<number, number>,
  planId = 0,
): PlannedWorkout[] {
  const startDow = weekStartDowFromEpoch(weekStart);
  return workouts.map(w => {
    const weekday = weekdayByDayIndex[w.dayIndex] ?? ((startDow + w.dayIndex) % 7);
    return {
      id: plannedWorkoutId(weekIndex, w.dayIndex),
      planId,
      weekIndex,
      phase,
      dayIndex: w.dayIndex,
      weekday,
      scheduledDate: scheduledDateForWeekday(weekStart, weekday),
      name: w.dayLabel,
      exercises: w.exercises,
    };
  });
}

export function generateMesocycle(input: GenerateMesocycleInput): GeneratedMesocycle {
  const length = input.length ?? mesocycleLengthForExperience(input.experience);
  const schedule = mesocyclePhaseSchedule(length);
  const weekStartDow = weekStartDowFromEpoch(input.weekStart);
  const dayIndexes = [...new Set(input.template.map(t => Number(t.day_index ?? 0)))];
  const weekdays = input.weekdayByDayIndex && Object.keys(input.weekdayByDayIndex).length > 0
    ? input.weekdayByDayIndex
    : defaultWeekdaysForDays(dayIndexes, weekStartDow);

  const weeks: PlannedWeek[] = schedule.map((slot, i) => {
    const weekStart = input.weekStart + i * 7 * DAY;
    let workouts = snapshotWorkoutsForPhase(input.template, slot.phase, input.goal, input.experience, slot.weekInPhase);
    workouts = nudgeAccessoryVolume(workouts);
    return {
      weekIndex: i + 1,
      phase: slot.phase,
      isBridge: slot.isBridge,
      status: i === 0 ? 'active' : 'planned',
      weekStart,
      weekEnd: weekStart + 7 * DAY,
      workouts: attachSchedule(workouts, weekStart, i + 1, slot.phase, weekdays, input.planId ?? 0),
    };
  });

  return { length, weeks };
}

export function applySnapshotToPlanExercises<T extends {
  exercise_id: number;
  sets: number;
  reps_target: string;
  weight_target: number;
  rest_seconds?: number;
  target_rir?: number | null;
}>(planExs: T[], workout: MesocycleWorkout | null | undefined): T[] {
  if (!workout || workout.exercises.length === 0) return planExs;
  return planExs.map(pe => {
    const snap = workout.exercises.find(e => Number(e.exerciseId) === Number(pe.exercise_id));
    if (!snap) return pe;
    return {
      ...pe,
      sets: snap.sets,
      reps_target: snap.reps,
      weight_target: snap.weight,
      rest_seconds: snap.rest > 0 ? snap.rest : (pe.rest_seconds ?? 0),
      target_rir: snap.targetRir ?? pe.target_rir ?? null,
    };
  });
}

export interface OverviewWorkout {
  id: string;
  weekId?: number;
  name: string;
  dayIndex: number;
  scheduledDate?: number;
  weekday?: number;
  state: 'completed' | 'planned';
  exercises: MesocycleExercise[];
}

export interface OverviewWeek {
  weekId?: number;
  weekIndex: number;
  phase: AdaptivePhase;
  status: string;
  isBridge: boolean;
  workouts: OverviewWorkout[];
}

/** Selector for "Ver o meu plano": planned workouts + completed sessions.
 *  Weekday / date come from weeklyPlanner at read time — not a second copy
 *  stored in planned_json. */
export function buildPlanOverview(
  weeks: {
    id?: number;
    week_index: number;
    phase: AdaptivePhase;
    status: string;
    is_bridge?: number;
    week_start: number;
    week_end: number;
    planned_json: string;
  }[],
  sessions: { plan_id?: number | null; day_index?: number | null; ended_at?: number | null; started_at: number }[],
  planId: number,
  weekdayByDayIndex: Record<number, number> = {},
): { currentWeekIndex: number; weeks: OverviewWeek[] } {
  const current = weeks.find(w => w.status === 'active') ?? weeks[0];
  return {
    currentWeekIndex: current?.week_index ?? 1,
    weeks: weeks.map(w => {
      const raw = parsePlannedDays(w.planned_json);
      const completed = completedDayIndexesInWindow(sessions, w.week_start, w.week_end, planId);
      const states = workoutCompletionStates(raw, completed);
      return {
        weekId: w.id,
        weekIndex: w.week_index,
        phase: w.phase,
        status: w.status,
        isBridge: !!w.is_bridge,
        workouts: raw.map((workout, i) => {
          const weekday = weekdayByDayIndex[workout.dayIndex] ?? workout.weekday;
          return {
            id: plannedWorkoutId(w.week_index, workout.dayIndex),
            weekId: w.id,
            name: workout.dayLabel,
            dayIndex: workout.dayIndex,
            weekday,
            scheduledDate: weekday != null
              ? scheduledDateForWeekday(w.week_start, weekday)
              : workout.scheduledDate,
            state: states[i]?.state ?? 'planned',
            exercises: workout.exercises,
          };
        }),
      };
    }),
  };
}

export function plannedWorkoutRouteParams(opts: {
  planId: number;
  planName: string;
  dayIndex: number;
  weekId?: number | null;
  weekIndex?: number | null;
  phase?: string | null;
}): Record<string, string> {
  const params: Record<string, string> = {
    planId: String(opts.planId),
    planName: opts.planName,
    dayIndex: String(opts.dayIndex),
  };
  if (opts.weekId != null && opts.weekId > 0) params.weekId = String(opts.weekId);
  if (opts.weekIndex != null && opts.weekIndex > 0) params.weekIndex = String(opts.weekIndex);
  if (opts.phase) params.phase = opts.phase;
  return params;
}

export function resolvePlannedWorkoutForDate(
  weeks: { id?: number; week_index: number; phase: AdaptivePhase; week_start: number; week_end: number; planned_json: string }[],
  dateMs: number,
  dayIndex: number,
): { week: typeof weeks[number]; workout: MesocycleWorkout } | null {
  const week = weekForDate(weeks, dateMs);
  if (!week) return null;
  const workout = parsePlannedDays(week.planned_json).find(d => Number(d.dayIndex) === Number(dayIndex));
  if (!workout || workout.exercises.length === 0) return null;
  return { week, workout };
}

/** Re-export so tests / callers can still use the 4-week template builder. */
export { buildMesocycleWeeks, mesocyclePhaseSchedule, mesocycleLengthForExperience };
