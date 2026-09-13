/**
 * Weekly set-dose, frequency and RIR helpers for generated plans.
 * Numbers and confidence ratings: HYPERTROPHY_PROGRAMMING.md.
 */

import type { MuscleGroup, PlanType, SetType } from '@/types';
import type { AdaptiveExperience, AdaptiveGoal, AdaptivePhase } from './nspi';

/** Muscles the dose engine programs. Cardio / mobility / fullbody are ignored. */
export const PROGRAMMABLE_MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'traps', 'lats',
];

export interface VolumeLandmarks {
  min: number;
  start: number;
  cap: number;
}

export type DoseStatus = 'low' | 'ok' | 'high';

export interface DoseExercise {
  muscle: string;
  sets: number;
  setType?: SetType | string;
  dayIndex: number;
  name?: string;
  compound?: boolean;
}

export interface AllocatableExercise {
  key: string;
  muscle: MuscleGroup | string;
  compound: boolean;
  setType?: SetType | string;
}

export interface DoseAuditRow {
  muscle: MuscleGroup;
  planned: number;
  min: number;
  start: number;
  cap: number;
  frequency: number;
  status: DoseStatus;
}

export const SETS_PER_EXERCISE_MIN = 3;
export const SETS_PER_EXERCISE_MAX = 6;
export const FOCUS_SET_BONUS = 2;
/** Same 4 min/set the generator uses for session-length estimates. */
export const DOSE_MINUTES_PER_SET = 4;

const EXPERIENCE_INDEX: Record<AdaptiveExperience, 0 | 1 | 2> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

/** Hypertrophy / endurance start–cap; strength is a lower band. Heuristic. */
const HYPERTROPHY_START = [8, 10, 12] as const;
const HYPERTROPHY_CAP = [16, 18, 20] as const;
const HYPERTROPHY_MIN = [6, 8, 10] as const;
const STRENGTH_START = [6, 8, 10] as const;
const STRENGTH_CAP = [12, 14, 16] as const;
const STRENGTH_MIN = [4, 6, 8] as const;

export function usesDoseEngine(planType: PlanType): boolean {
  return planType === 'hypertrophy' || planType === 'strength' || planType === 'endurance';
}

export function planTypeForGoal(goal: AdaptiveGoal): PlanType {
  return goal === 'strength' ? 'strength' : 'hypertrophy';
}

/** Lats share the back weekly budget (costas + dorsais). */
export function doseMuscle(muscle: string): MuscleGroup | null {
  if (muscle === 'lats') return 'back';
  if ((PROGRAMMABLE_MUSCLES as string[]).includes(muscle) && muscle !== 'lats') {
    return muscle as MuscleGroup;
  }
  return null;
}

export function weeklySetLandmarks(
  planType: PlanType,
  experience: AdaptiveExperience = 'intermediate',
  focusMuscles: MuscleGroup[] = [],
): Record<MuscleGroup, VolumeLandmarks> {
  const i = EXPERIENCE_INDEX[experience] ?? 1;
  const strength = planType === 'strength';
  const base: VolumeLandmarks = strength
    ? { min: STRENGTH_MIN[i], start: STRENGTH_START[i], cap: STRENGTH_CAP[i] }
    : { min: HYPERTROPHY_MIN[i], start: HYPERTROPHY_START[i], cap: HYPERTROPHY_CAP[i] };

  const out = {} as Record<MuscleGroup, VolumeLandmarks>;
  for (const muscle of PROGRAMMABLE_MUSCLES) {
    const key = doseMuscle(muscle);
    if (!key) continue;
    if (out[key]) continue;
    const focused = focusMuscles.some(f => doseMuscle(f) === key);
    const start = Math.min(base.cap, base.start + (focused ? FOCUS_SET_BONUS : 0));
    out[key] = { min: base.min, start, cap: base.cap };
  }
  return out;
}

function isHardSet(setType?: string): boolean {
  return setType !== 'warmup';
}

export function countPlannedWeeklySets(exercises: DoseExercise[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ex of exercises) {
    if (!isHardSet(ex.setType)) continue;
    const muscle = doseMuscle(ex.muscle);
    if (!muscle) continue;
    counts[muscle] = (counts[muscle] ?? 0) + Math.max(0, Number(ex.sets) || 0);
  }
  return counts;
}

export function countMuscleFrequency(exercises: DoseExercise[]): Record<string, number> {
  const days = new Map<string, Set<number>>();
  for (const ex of exercises) {
    if (!isHardSet(ex.setType)) continue;
    const muscle = doseMuscle(ex.muscle);
    if (!muscle) continue;
    if (!days.has(muscle)) days.set(muscle, new Set());
    days.get(muscle)!.add(Number(ex.dayIndex) || 0);
  }
  const out: Record<string, number> = {};
  for (const [muscle, set] of days) out[muscle] = set.size;
  return out;
}

export function rirToRpe(rir: number): number {
  return Math.max(0, Math.min(10, 10 - rir));
}

export function formatRirHint(rir: number): string {
  return `RIR ${rir} (RPE ~${rirToRpe(rir)})`;
}

/**
 * Hypertrophy 1–3 (closer as the block intensifies). Strength compounds stay
 * further from failure. Endurance 1–2. Heuristic defaults — see the md file.
 */
export function targetRirFor(
  planType: PlanType,
  opts?: { phase?: AdaptivePhase; compound?: boolean },
): number {
  const phase = opts?.phase;
  const compound = opts?.compound ?? true;

  if (planType === 'endurance') return 2;
  if (planType === 'cardio' || planType === 'mobility') return 3;

  if (planType === 'strength') {
    if (phase === 'deload') return 5;
    if (phase === 'on_ramp') return 4;
    if (phase === 'intensification') return compound ? 2 : 1;
    return compound ? 3 : 2;
  }

  // hypertrophy (and unknown → hypertrophy table)
  if (phase === 'deload') return 4;
  if (phase === 'on_ramp') return 3;
  if (phase === 'intensification') return 1;
  return 2;
}

export function auditTrainingDose(
  exercises: DoseExercise[],
  planType: PlanType,
  experience: AdaptiveExperience = 'intermediate',
  focusMuscles: MuscleGroup[] = [],
): DoseAuditRow[] {
  if (!usesDoseEngine(planType)) return [];
  const landmarks = weeklySetLandmarks(planType, experience, focusMuscles);
  const planned = countPlannedWeeklySets(exercises);
  const frequency = countMuscleFrequency(exercises);
  const muscles = new Set([
    ...Object.keys(planned),
    ...Object.keys(frequency),
  ]);
  const rows: DoseAuditRow[] = [];
  for (const raw of muscles) {
    const muscle = doseMuscle(raw);
    if (!muscle) continue;
    const marks = landmarks[muscle];
    if (!marks) continue;
    const sets = planned[muscle] ?? 0;
    let status: DoseStatus = 'ok';
    if (sets < marks.min) status = 'low';
    else if (sets > marks.cap) status = 'high';
    rows.push({
      muscle,
      planned: sets,
      min: marks.min,
      start: marks.start,
      cap: marks.cap,
      frequency: frequency[muscle] ?? 0,
      status,
    });
  }
  return rows.sort((a, b) => a.muscle.localeCompare(b.muscle));
}

function clampSets(n: number): number {
  return Math.max(SETS_PER_EXERCISE_MIN, Math.min(SETS_PER_EXERCISE_MAX, Math.round(n)));
}

/**
 * Split a muscle's weekly `start` across its exercises. Compounds get the
 * remainder first. Optional session-time budget scales the whole week down.
 */
export function allocateWorkingSets(
  exercises: AllocatableExercise[],
  planType: PlanType,
  experience: AdaptiveExperience = 'intermediate',
  focusMuscles: MuscleGroup[] = [],
  minutesBudget?: { days: number; minutesPerDay: number },
): Map<string, number> {
  const assigned = new Map<string, number>();
  const working = exercises.filter(ex => isHardSet(ex.setType) && doseMuscle(ex.muscle));
  if (working.length === 0 || !usesDoseEngine(planType)) return assigned;

  const landmarks = weeklySetLandmarks(planType, experience, focusMuscles);
  const byMuscle = new Map<MuscleGroup, AllocatableExercise[]>();
  for (const ex of working) {
    const muscle = doseMuscle(ex.muscle)!;
    if (!byMuscle.has(muscle)) byMuscle.set(muscle, []);
    byMuscle.get(muscle)!.push(ex);
  }

  for (const [muscle, group] of byMuscle) {
    const marks = landmarks[muscle];
    if (!marks) {
      for (const ex of group) assigned.set(ex.key, SETS_PER_EXERCISE_MIN);
      continue;
    }
    const n = group.length;
    const target = marks.start;
    const ordered = [...group].sort((a, b) => Number(b.compound) - Number(a.compound));
    const base = Math.floor(target / n);
    let remainder = target - base * n;
    for (const ex of ordered) {
      let sets = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (ex.compound) sets += 0; // remainder already prefers compounds
      assigned.set(ex.key, clampSets(sets));
    }
    let allocated = ordered.reduce((s, ex) => s + (assigned.get(ex.key) ?? 0), 0);
    let guard = 0;
    while (allocated < target && guard < 24) {
      let grew = false;
      for (const ex of ordered) {
        const cur = assigned.get(ex.key) ?? SETS_PER_EXERCISE_MIN;
        if (cur >= SETS_PER_EXERCISE_MAX) continue;
        if (allocated >= marks.cap) break;
        assigned.set(ex.key, cur + 1);
        allocated += 1;
        grew = true;
        if (allocated >= target) break;
      }
      if (!grew) break;
      guard += 1;
    }
  }

  if (minutesBudget && minutesBudget.days > 0 && minutesBudget.minutesPerDay > 0) {
    const maxSets = Math.max(
      working.length * SETS_PER_EXERCISE_MIN,
      Math.floor((minutesBudget.days * minutesBudget.minutesPerDay) / DOSE_MINUTES_PER_SET),
    );
    const total = [...assigned.values()].reduce((s, n) => s + n, 0);
    if (total > maxSets && total > 0) {
      const scale = maxSets / total;
      for (const [key, sets] of assigned) {
        assigned.set(key, clampSets(sets * scale));
      }
    }
  }

  return assigned;
}

/**
 * Preview audit from a split's focus lists (one placeholder exercise per
 * muscle, capped by the same exercise-count formula the generator uses).
 */
export function previewDoseForSplit(
  days: { focus: readonly MuscleGroup[] }[],
  minutesPerDay: number,
  planType: PlanType,
  experience: AdaptiveExperience = 'intermediate',
  focusMuscles: MuscleGroup[] = [],
): DoseAuditRow[] {
  if (!usesDoseEngine(planType)) return [];
  const perDay = Math.max(4, Math.min(8, Math.floor(minutesPerDay / DOSE_MINUTES_PER_SET / 3)));
  const placeholders: AllocatableExercise[] = [];
  const doseExercises: DoseExercise[] = [];
  days.forEach((day, dayIndex) => {
    const focus = day.focus.filter(m => doseMuscle(m));
    focus.slice(0, perDay).forEach((muscle, i) => {
      const key = `${dayIndex}-${muscle}-${i}`;
      placeholders.push({ key, muscle, compound: i === 0 });
    });
  });
  const sets = allocateWorkingSets(
    placeholders,
    planType,
    experience,
    focusMuscles,
    { days: days.length, minutesPerDay },
  );
  for (const ex of placeholders) {
    doseExercises.push({
      muscle: String(ex.muscle),
      sets: sets.get(ex.key) ?? SETS_PER_EXERCISE_MIN,
      dayIndex: Number(String(ex.key).split('-')[0]) || 0,
      compound: ex.compound,
    });
  }
  return auditTrainingDose(doseExercises, planType, experience, focusMuscles);
}
