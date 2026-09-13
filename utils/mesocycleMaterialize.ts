/**
 * Persistable mesocycle — Adaptive Plan → Weeks → Workouts → Exercises.
 *
 * The engine used to insert only the active adaptive_week. Future phases
 * were preview cards with no rows and no prescriptions. This module is the
 * single builder/reader for the week snapshot stored in planned_json.
 *
 * Snapshots are deterministic from (template, phase, goal, experience).
 * Opening the plan UI never regenerates random exercises.
 */

import type { AdaptiveDecision } from './adaptiveDecision';
import {
  PHASE_ORDER,
  epley1RM,
  loadIncrement,
  phaseTargets,
} from './adaptivePlan';
import type { AdaptiveExperience, AdaptiveGoal, AdaptivePhase } from './nspi';
import { planTypeForGoal, targetRirFor } from './trainingDose';
import { isCompoundMovement } from './movementClassify';

export interface MesocycleExercise {
  exerciseId: number;
  name: string;
  muscle: string;
  order: number;
  sets: number;
  reps: string;
  weight: number;
  rest: number;
  targetRir?: number | null;
}

export interface MesocycleWorkout {
  dayIndex: number;
  dayLabel: string;
  weekday?: number;
  scheduledDate?: number;
  exercises: MesocycleExercise[];
}

export interface MesocyclePhaseSlot {
  phase: AdaptivePhase;
  isBridge: boolean;
  /** 0-based index among slots of this same phase (accumulation week 2 = 1). */
  weekInPhase: number;
}

/** 4 = classic PHASE_ORDER; 5 = extra accumulation; 6 = extra intensification. */
export function mesocycleLengthForExperience(experience: AdaptiveExperience): 4 | 5 | 6 {
  if (experience === 'beginner') return 4;
  if (experience === 'advanced') return 6;
  return 5;
}

function withWeekInPhase(slots: { phase: AdaptivePhase; isBridge: boolean }[]): MesocyclePhaseSlot[] {
  const seen: Partial<Record<AdaptivePhase, number>> = {};
  return slots.map(slot => {
    const weekInPhase = seen[slot.phase] ?? 0;
    seen[slot.phase] = weekInPhase + 1;
    return { ...slot, weekInPhase };
  });
}

export function mesocyclePhaseSchedule(length: 4 | 5 | 6 = 4): MesocyclePhaseSlot[] {
  if (length === 5) {
    return withWeekInPhase([
      { phase: 'on_ramp', isBridge: false },
      { phase: 'accumulation', isBridge: false },
      { phase: 'accumulation', isBridge: true },
      { phase: 'intensification', isBridge: false },
      { phase: 'deload', isBridge: false },
    ]);
  }
  if (length === 6) {
    return withWeekInPhase([
      { phase: 'on_ramp', isBridge: false },
      { phase: 'accumulation', isBridge: false },
      { phase: 'accumulation', isBridge: true },
      { phase: 'intensification', isBridge: false },
      { phase: 'intensification', isBridge: true },
      { phase: 'deload', isBridge: false },
    ]);
  }
  return withWeekInPhase(PHASE_ORDER.map(phase => ({ phase, isBridge: false })));
}

/** Remaining slots after already-persisted weeks. Never inserts a 5th week
 *  into a cycle that already closed the 4-phase set (has a deload). */
export function remainingScheduleSlots(
  existing: { phase: AdaptivePhase; week_index: number }[],
  schedule: MesocyclePhaseSlot[],
): MesocyclePhaseSlot[] {
  if (existing.length >= schedule.length) return [];
  if (existing.length >= 4 && existing.some(w => w.phase === 'deload')) return [];
  return schedule.slice(existing.length);
}

export interface MesocycleWeekView {
  weekIndex: number;
  phase: AdaptivePhase;
  status: 'active' | 'planned' | 'done';
  isBridge: boolean;
  workouts: MesocycleWorkout[];
}

export interface TemplateExercise {
  exercise_id: number;
  exercise_name?: string;
  primary_muscle?: string;
  equipment?: string;
  day_index?: number;
  day_label?: string;
  order_index?: number;
  sets: number;
  reps_target?: string;
  weight_target?: number;
  rest_seconds?: number;
  base_sets?: number;
}

export interface PlannedSnapshot {
  phase?: AdaptivePhase;
  goal?: AdaptiveGoal;
  appliedAt?: number;
  setsPlanned?: number;
  bucketTargets?: Record<string, number>;
  exercises?: { exerciseId: number; sets: number; reps: string; weight: number }[];
  days?: MesocycleWorkout[];
}

export function prescriptionValid(ex: MesocycleExercise): boolean {
  return (
    Number(ex.exerciseId) > 0
    && Number(ex.sets) > 0
    && typeof ex.reps === 'string'
    && ex.reps.length > 0
    && Number.isFinite(Number(ex.weight))
    && Number(ex.order) >= 0
  );
}

export function groupWorkoutsFromTemplate(
  rows: TemplateExercise[],
  prescriptionFor: (row: TemplateExercise, index: number) => { sets: number; reps: string; weight: number; targetRir?: number | null },
): MesocycleWorkout[] {
  const days = new Map<number, MesocycleWorkout>();
  rows.forEach((row, index) => {
    const dayIndex = Number(row.day_index ?? 0);
    if (!days.has(dayIndex)) {
      days.set(dayIndex, {
        dayIndex,
        dayLabel: (row.day_label && row.day_label.trim()) || `Treino ${dayIndex + 1}`,
        exercises: [],
      });
    }
    const p = prescriptionFor(row, index);
    days.get(dayIndex)!.exercises.push({
      exerciseId: Number(row.exercise_id),
      name: row.exercise_name || '',
      muscle: row.primary_muscle || '',
      order: row.order_index ?? days.get(dayIndex)!.exercises.length,
      sets: p.sets,
      reps: p.reps,
      weight: p.weight,
      rest: row.rest_seconds ?? 0,
      targetRir: p.targetRir ?? null,
    });
  });
  return [...days.values()].sort((a, b) => a.dayIndex - b.dayIndex);
}

/** Phase-adjusted snapshot for one week, from the plan template + base sets. */
export function snapshotWorkoutsForPhase(
  template: TemplateExercise[],
  phase: AdaptivePhase,
  goal: AdaptiveGoal,
  experience: AdaptiveExperience,
  weekInPhase = 0,
): MesocycleWorkout[] {
  return groupWorkoutsFromTemplate(template, (row) => {
    const baseSets = row.base_sets && row.base_sets > 0 ? row.base_sets : row.sets;
    const currentWeight = row.weight_target || 0;
    const increment = loadIncrement(row.equipment || '');
    const e1rm = currentWeight > 0 ? epley1RM(currentWeight, 8) : 0;
    const t = phaseTargets(phase, goal, baseSets, e1rm, 0, increment, experience, weekInPhase);
    const targetRir = targetRirFor(planTypeForGoal(goal), {
      phase,
      compound: isCompoundMovement(row.exercise_name || ''),
    });
    return {
      sets: t.targetSets,
      reps: `${t.repLow}-${t.repHigh}`,
      weight: t.targetWeight > 0 ? t.targetWeight : currentWeight,
      targetRir,
    };
  });
}

export function buildMesocycleWeeks(
  template: TemplateExercise[],
  goal: AdaptiveGoal,
  experience: AdaptiveExperience,
  phases: AdaptivePhase[] = PHASE_ORDER,
): MesocycleWeekView[] {
  return phases.map((phase, i) => {
    const weekInPhase = phases.slice(0, i).filter(p => p === phase).length;
    return {
      weekIndex: i + 1,
      phase,
      status: i === 0 ? 'active' : 'planned',
      isBridge: false,
      workouts: snapshotWorkoutsForPhase(template, phase, goal, experience, weekInPhase),
    };
  });
}

export function parsePlannedSnapshot(json: string | null | undefined): PlannedSnapshot {
  if (!json) return {};
  try {
    const v = typeof json === 'string' ? JSON.parse(json) : json;
    return v && typeof v === 'object' ? v as PlannedSnapshot : {};
  } catch {
    return {};
  }
}

export function parsePlannedDays(json: string | null | undefined): MesocycleWorkout[] {
  const snap = parsePlannedSnapshot(json);
  if (Array.isArray(snap.days) && snap.days.length > 0) return snap.days;
  return [];
}

export function mesocycleFromWeekRows(
  weeks: { week_index: number; phase: AdaptivePhase; status: string; is_bridge?: number; planned_json: string }[],
): MesocycleWeekView[] {
  return weeks.map(w => ({
    weekIndex: w.week_index,
    phase: w.phase,
    status: w.status === 'done' || w.status === 'planned' || w.status === 'active' ? w.status : 'planned',
    isBridge: !!w.is_bridge,
    workouts: parsePlannedDays(w.planned_json),
  }));
}

export function weekForDate<T extends { week_start: number; week_end: number }>(
  weeks: T[],
  dateMs: number,
): T | null {
  const s = Math.floor(dateMs / 1000);
  return weeks.find(w => s >= w.week_start && s < w.week_end) ?? null;
}

export function completedDayIndexesInWindow(
  sessions: { plan_id?: number | null; day_index?: number | null; ended_at?: number | null; started_at: number }[],
  weekStart: number,
  weekEnd: number,
  planId: number,
): number[] {
  const done = new Set<number>();
  for (const s of sessions) {
    if (!s.ended_at || s.plan_id !== planId || s.day_index == null) continue;
    if (s.started_at < weekStart || s.started_at >= weekEnd) continue;
    done.add(Number(s.day_index));
  }
  return [...done];
}

export function workoutCompletionStates(
  workouts: MesocycleWorkout[],
  completedDayIndexes: Iterable<number>,
): { dayIndex: number; dayLabel: string; state: 'completed' | 'planned' }[] {
  const done = new Set([...completedDayIndexes].map(Number));
  return workouts.map(w => ({
    dayIndex: w.dayIndex,
    dayLabel: w.dayLabel,
    state: done.has(w.dayIndex) ? 'completed' : 'planned',
  }));
}

export type NextWeekOpenStrategy = 'noop' | 'promote' | 'insert-shift' | 'insert' | 'wrap';

/**
 * How closeWeekIfDue should open the next week now that future adaptive_week
 * rows may already exist as status='planned'.
 */
export function nextWeekOpenStrategy(
  existingNext: { status: string; phase: AdaptivePhase } | null,
  decision: { nextPhase: AdaptivePhase; decision: AdaptiveDecision; wrapsCycle: boolean },
): NextWeekOpenStrategy {
  if (decision.wrapsCycle) return 'wrap';
  if (!existingNext) return 'insert';
  if (existingNext.status === 'active' || existingNext.status === 'done') return 'noop';
  if (
    existingNext.status === 'planned'
    && existingNext.phase === decision.nextPhase
    && decision.decision === 'advance'
  ) {
    return 'promote';
  }
  if (existingNext.status === 'planned') return 'insert-shift';
  return 'insert';
}

export function missingPhasesInCycle(
  existingPhases: Iterable<AdaptivePhase>,
  phases: AdaptivePhase[] = PHASE_ORDER,
): AdaptivePhase[] {
  const have = new Set(existingPhases);
  return phases.filter(p => !have.has(p));
}
