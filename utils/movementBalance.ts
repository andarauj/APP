/**
 * Push vs pull accessory nudge for a planned week.
 *
 * Main lifts (squat / bench / OHP / deadlift / row compounds) are never
 * edited to "fix" a small imbalance — only isolation / accessory rows
 * gain or lose one set when the ratio is clearly off.
 */

import { mainPattern, movementBucket } from './movementClassify';
import type { MesocycleWorkout } from './mesocycleMaterialize';

const PUSH_BUCKETS = new Set(['horiz_push', 'vert_push']);
const PULL_BUCKETS = new Set(['horiz_pull', 'vert_pull']);
const IMBALANCE = 1.25;

function isMainLift(name: string, muscle: string): boolean {
  const p = mainPattern(name, muscle);
  return p === 'squat' || p === 'bench' || p === 'deadlift' || p === 'ohp' || p === 'row';
}

function sideOf(name: string, muscle: string): 'push' | 'pull' | null {
  const bucket = movementBucket(name, muscle);
  if (!bucket) return null;
  if (PUSH_BUCKETS.has(bucket)) return 'push';
  if (PULL_BUCKETS.has(bucket)) return 'pull';
  return null;
}

export function pushPullSetCounts(workouts: MesocycleWorkout[]): { push: number; pull: number } {
  let push = 0;
  let pull = 0;
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const side = sideOf(ex.name, ex.muscle);
      if (side === 'push') push += ex.sets;
      else if (side === 'pull') pull += ex.sets;
    }
  }
  return { push, pull };
}

/** Returns a new week (does not mutate). No-op when already balanced. */
export function nudgeAccessoryVolume(workouts: MesocycleWorkout[]): MesocycleWorkout[] {
  const { push, pull } = pushPullSetCounts(workouts);
  if (push === 0 || pull === 0) return workouts;
  const pushHeavy = push / pull >= IMBALANCE;
  const pullHeavy = pull / push >= IMBALANCE;
  if (!pushHeavy && !pullHeavy) return workouts;

  const want: 'pull' | 'push' = pushHeavy ? 'pull' : 'push';
  let adjusted = false;
  return workouts.map(w => ({
    ...w,
    exercises: w.exercises.map(ex => {
      if (adjusted) return ex;
      if (isMainLift(ex.name, ex.muscle)) return ex;
      if (sideOf(ex.name, ex.muscle) !== want) return ex;
      adjusted = true;
      return { ...ex, sets: ex.sets + 1 };
    }),
  }));
}
