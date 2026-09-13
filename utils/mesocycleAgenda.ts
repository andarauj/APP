/**
 * Mesocycle agenda — the missing link between the weekly template
 * (plan_exercises + weeklyPlanner) and "Ver o meu plano".
 *
 * The engine never pre-creates future adaptive_week rows: closeWeekIfDue
 * writes the next week only after the current window ends. The planner is
 * a repeating weekday map, not a dated calendar. This module projects the
 * next weeks in memory so the UI can show exercises / sets / reps / load /
 * phase / date without inventing persisted weeks.
 */

import type { PlannerEntry, WeeklyPlanner } from '@/db/plannerDao';
import type { AdaptivePhase, AdaptiveGoal, AdaptiveExperience } from './nspi';
import {
  epley1RM,
  loadIncrement,
  nextPhase,
  phaseTargets,
} from './adaptivePlan';
/** Subset of adaptiveService.RollingScheduleEntry — kept local to avoid a cycle. */
export interface AgendaRollingEntry {
  weekday: number;
  dayIndex: number;
  isBacklog: boolean;
  isSkipped: boolean;
}

export interface AgendaExerciseRow {
  exercise_id: number;
  exercise_name: string;
  primary_muscle: string;
  equipment: string;
  day_index: number;
  day_label: string;
  sets: number;
  reps_target: string;
  weight_target: number;
  base_sets?: number;
}

export interface ProjectedExercise {
  name: string;
  sets: number;
  reps: string;
  weight: number;
  muscle: string;
}

export interface ResolvedAgendaDay {
  entry: PlannerEntry | null;
  isSkipped: boolean;
  isBacklog: boolean;
}

/** Active-week dates keep current-phase numbers; later dates walk PHASE_ORDER. */
export function phaseForDate(
  dateMs: number,
  weekStartS: number,
  weekEndS: number,
  currentPhase: AdaptivePhase,
): AdaptivePhase {
  const dateS = Math.floor(dateMs / 1000);
  if (dateS < weekEndS) return currentPhase;
  const weekSec = 7 * 86400;
  const weeksAhead = Math.floor((dateS - weekEndS) / weekSec) + 1;
  let phase = currentPhase;
  for (let i = 0; i < weeksAhead; i++) {
    phase = nextPhase(phase).phase;
  }
  return phase;
}

export function isDateInActiveWeek(dateMs: number, weekStartS: number, weekEndS: number): boolean {
  const dateS = Math.floor(dateMs / 1000);
  return dateS >= weekStartS && dateS < weekEndS;
}

/**
 * Current adaptive week: prefer the rolling schedule (same as Hoje).
 * Other weeks: repeating weeklyPlanner template.
 */
export function resolveAgendaDay(
  weekday: number,
  planner: WeeklyPlanner,
  rolling: AgendaRollingEntry[] | null,
  useRolling: boolean,
  fallbackPlanId?: number | null,
): ResolvedAgendaDay {
  if (useRolling && rolling && rolling.length > 0) {
    const hit = rolling.find(r => r.weekday === weekday);
    if (hit) {
      const template = planner[weekday];
      const planId = template?.planId ?? fallbackPlanId ?? 0;
      if (!planId) return { entry: null, isSkipped: hit.isSkipped, isBacklog: hit.isBacklog };
      return {
        entry: { planId, dayIndex: hit.dayIndex },
        isSkipped: hit.isSkipped,
        isBacklog: hit.isBacklog,
      };
    }
  }
  const entry = planner[weekday] ?? null;
  return { entry, isSkipped: false, isBacklog: false };
}

export function projectPrescription(
  baseSets: number,
  currentWeight: number,
  equipment: string,
  phase: AdaptivePhase,
  goal: AdaptiveGoal,
  experience: AdaptiveExperience,
): { sets: number; reps: string; weight: number } {
  const increment = loadIncrement(equipment);
  const e1rm = currentWeight > 0 ? epley1RM(currentWeight, 8) : 0;
  const t = phaseTargets(phase, goal, baseSets, e1rm, 0, increment, experience);
  return {
    sets: t.targetSets,
    reps: `${t.repLow}-${t.repHigh}`,
    weight: t.targetWeight > 0 ? t.targetWeight : currentWeight,
  };
}

export function exercisesForDay(
  rows: AgendaExerciseRow[],
  dayIndex: number,
  opts?: {
    projectPhase?: AdaptivePhase;
    keepCurrentNumbers?: boolean;
    goal?: AdaptiveGoal;
    experience?: AdaptiveExperience;
  },
): ProjectedExercise[] {
  const forDay = rows.filter(r => Number(r.day_index) === Number(dayIndex));
  return forDay.map(r => {
    if (opts?.keepCurrentNumbers || !opts?.projectPhase || !opts.goal || !opts.experience) {
      return {
        name: r.exercise_name,
        sets: r.sets,
        reps: r.reps_target || '—',
        weight: r.weight_target || 0,
        muscle: r.primary_muscle || '',
      };
    }
    const projected = projectPrescription(
      r.base_sets && r.base_sets > 0 ? r.base_sets : r.sets,
      r.weight_target || 0,
      r.equipment || '',
      opts.projectPhase,
      opts.goal,
      opts.experience,
    );
    return {
      name: r.exercise_name,
      sets: projected.sets,
      reps: projected.reps,
      weight: projected.weight,
      muscle: r.primary_muscle || '',
    };
  });
}

export function groupExercisesByDay(rows: AgendaExerciseRow[]): Record<number, AgendaExerciseRow[]> {
  const out: Record<number, AgendaExerciseRow[]> = {};
  for (const r of rows) {
    const idx = Number(r.day_index);
    if (!out[idx]) out[idx] = [];
    out[idx].push(r);
  }
  return out;
}
