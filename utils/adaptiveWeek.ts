/**
 * Adaptive engine — weekly window + signal assembly (see NSPI_ENGINE.md §2, §4).
 *
 * Pure helpers the orchestration service leans on:
 *   - weekWindow          : the [start, end) epoch-second bounds of a training
 *                           week, aligned to the user's chosen start weekday
 *   - assembleWeekSignal  : turn a week's logged sets + plan targets into the
 *                           NSPI result and the WeekSignal decideNextWeek needs
 *
 * No DB, no clock of its own (callers pass `now`), so it is fully testable.
 */

import { computeNspi, type AdaptiveGoal, type AdaptivePhase, type LoadPoint, type NspiResult } from './nspi';
import { epley1RM } from './adaptivePlan';
import { mainPattern, tallyMovementBuckets, type MovementBucketKey } from './movementClassify';
import type { WeekSignal } from './adaptiveDecision';

const DAY = 86400;

/** Midnight (local) of the most recent `weekStartDow` on or before `now`. */
export function startOfAdaptiveWeek(now: Date, weekStartDow: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight today
  const dow = d.getDay(); // 0=Sun..6=Sat
  const back = (dow - weekStartDow + 7) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

/**
 * Epoch-second bounds of a training week.
 * @param weeksAgo 0 = the week in progress, 1 = the week that just finished, …
 * @returns { start, end } with end exclusive (start of the following week)
 */
export function weekWindow(now: Date, weekStartDow: number, weeksAgo = 0): { start: number; end: number } {
  const curStart = startOfAdaptiveWeek(now, weekStartDow);
  const start = Math.floor(curStart.getTime() / 1000) - weeksAgo * 7 * DAY;
  return { start, end: start + 7 * DAY };
}

/** True once `now` has crossed into the week after `weekEnd` (epoch seconds). */
export function weekIsOver(weekEnd: number, now: Date): boolean {
  return Math.floor(now.getTime() / 1000) >= weekEnd;
}

export interface WeekSetRow {
  exerciseId: number;
  name: string;
  primaryMuscle: string;
  equipment: string;
  weight: number;
  reps: number;
  rpe: number | null;
  setType: string; // 'warmup' | 'normal' | 'failure' | 'dropset' | ...
}

export interface AssembleInput {
  phase: AdaptivePhase;
  goal: AdaptiveGoal;
  isBridge: boolean;
  /** every set logged inside the week window */
  sets: WeekSetRow[];
  /** working sets the week's plan prescribed (sum of plan_exercises.sets) */
  setsPlanned: number;
  /** e1RM per main pattern at the start of the current cycle */
  baseline: Partial<Record<string, number>>;
  /** phase's target sets per movement bucket, for the "no bucket < 50%" check */
  bucketTargets?: Partial<Record<MovementBucketKey, number>>;
  /** previous weekly NSPI scores, newest first — only drives the trend arrow */
  previousScores?: number[];
}

export interface AssembledWeek {
  nspi: NspiResult;
  weekSignal: WeekSignal;
  /** best e1RM seen this week per main pattern — for baseline bumps + recap */
  patternE1rm: Record<string, number>;
  effectiveSets: number;
}

const isEffective = (s: WeekSetRow) => s.setType !== 'warmup' && s.reps >= 1;

/**
 * Collapse a week of logged sets into the two things the engine consumes: the
 * NSPI result (shown + stored) and the WeekSignal (fed to decideNextWeek).
 */
export function assembleWeekSignal(input: AssembleInput): AssembledWeek {
  const effective = input.sets.filter(isEffective);

  // --- load: best e1RM per main pattern this week vs the cycle baseline ---
  const patternE1rm: Record<string, number> = {};
  for (const s of effective) {
    const p = mainPattern(s.name, s.primaryMuscle);
    if (!p) continue;
    const e = epley1RM(s.weight, s.reps);
    if (e > (patternE1rm[p] ?? 0)) patternE1rm[p] = e;
  }
  const patterns = new Set<string>([...Object.keys(patternE1rm), ...Object.keys(input.baseline)]);
  const load: LoadPoint[] = Array.from(patterns).map(pattern => ({
    pattern,
    e1rmThisWeek: patternE1rm[pattern] ?? 0,
    e1rmBaseline: input.baseline[pattern] ?? 0,
  }));

  // --- movement balance ---
  const movement = tallyMovementBuckets(
    effective.map(s => ({ name: s.name, primaryMuscle: s.primaryMuscle, equipment: s.equipment })),
  );

  const nspi = computeNspi({
    phase: input.phase,
    goal: input.goal,
    load,
    effectiveSetsDone: effective.length,
    setsPlanned: input.setsPlanned,
    movement,
    previousScores: input.previousScores,
  });

  // --- extra signals for the weekly decision ---
  const rpes = effective.map(s => s.rpe).filter((r): r is number => r != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  let minBucketRatio = 1;
  if (input.bucketTargets) {
    const setsByBucket = new Map(movement.map(b => [b.bucket, b.sets]));
    const ratios: number[] = [];
    for (const [bucket, target] of Object.entries(input.bucketTargets)) {
      if (target && target > 0) ratios.push((setsByBucket.get(bucket as MovementBucketKey) ?? 0) / target);
    }
    if (ratios.length) minBucketRatio = Math.min(...ratios);
  }

  const weekSignal: WeekSignal = {
    phase: input.phase,
    nspiLoad: nspi.load,
    nspiVolume: nspi.volume,
    nspiBalance: nspi.balance,
    avgRpe: avgRpe == null ? null : Math.round(avgRpe * 10) / 10,
    minBucketRatio,
    isBridge: input.isBridge,
  };

  return { nspi, weekSignal, patternE1rm, effectiveSets: effective.length };
}
