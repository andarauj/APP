/**
 * Set-pace analysis — compares how long a set actually took (timed via the
 * "Tempo de série" stopwatch in the workout screen, stored as
 * workout_sets.set_duration) against a rough "ideal" duration derived from
 * rep count, to tell whether sets are being rushed or dragged out. Not tied
 * to a specific exercise's prescribed tempo (that lives on the plan, not on
 * the logged set, and a freeform/instant workout has no plan at all) — a
 * flat seconds-per-rep assumption keeps this available for every workout.
 */

/** ~1.5s concentric + 1.5s eccentric — a controlled, unrushed rep. */
export const IDEAL_SECONDS_PER_REP = 3;

export function idealSetSeconds(reps: number, secondsPerRep = IDEAL_SECONDS_PER_REP): number {
  return Math.max(0, reps) * secondsPerRep;
}

export type PaceRating = 'fast' | 'slow' | 'good' | 'unmeasured';

/** Below this ratio of actual/ideal, a set is "rushed"; above it, "dragged out". */
const FAST_RATIO = 0.7;
const SLOW_RATIO = 1.5;

export function rateSetPace(reps: number, actualSeconds: number, secondsPerRep = IDEAL_SECONDS_PER_REP): PaceRating {
  if (actualSeconds <= 0 || reps <= 0) return 'unmeasured';
  const ideal = idealSetSeconds(reps, secondsPerRep);
  if (ideal <= 0) return 'unmeasured';
  const ratio = actualSeconds / ideal;
  if (ratio < FAST_RATIO) return 'fast';
  if (ratio > SLOW_RATIO) return 'slow';
  return 'good';
}

export interface WorkoutPaceSummary {
  measuredSets: number;
  totalSets: number;
  fastCount: number;
  slowCount: number;
  goodCount: number;
  avgActualSeconds: number;
  avgIdealSeconds: number;
  /** Majority verdict across measured sets — 'mixed' when no rating has a majority. */
  verdict: PaceRating | 'mixed';
}

export function summarizeWorkoutPace(
  sets: { reps: number; actualSeconds: number }[],
  secondsPerRep = IDEAL_SECONDS_PER_REP,
): WorkoutPaceSummary {
  const measured = sets.filter(s => s.actualSeconds > 0 && s.reps > 0);
  if (measured.length === 0) {
    return {
      measuredSets: 0, totalSets: sets.length,
      fastCount: 0, slowCount: 0, goodCount: 0,
      avgActualSeconds: 0, avgIdealSeconds: 0,
      verdict: 'unmeasured',
    };
  }

  let fastCount = 0, slowCount = 0, goodCount = 0, sumActual = 0, sumIdeal = 0;
  for (const s of measured) {
    const rating = rateSetPace(s.reps, s.actualSeconds, secondsPerRep);
    if (rating === 'fast') fastCount++;
    else if (rating === 'slow') slowCount++;
    else if (rating === 'good') goodCount++;
    sumActual += s.actualSeconds;
    sumIdeal += idealSetSeconds(s.reps, secondsPerRep);
  }

  const n = measured.length;
  let verdict: WorkoutPaceSummary['verdict'] = 'mixed';
  if (fastCount > n / 2) verdict = 'fast';
  else if (slowCount > n / 2) verdict = 'slow';
  else if (goodCount > n / 2) verdict = 'good';

  return {
    measuredSets: n,
    totalSets: sets.length,
    fastCount, slowCount, goodCount,
    avgActualSeconds: sumActual / n,
    avgIdealSeconds: sumIdeal / n,
    verdict,
  };
}
