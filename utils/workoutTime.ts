/**
 * Estimated session duration for a training day — used by the "Plano" tab's
 * day preview so the person can see roughly how long a day will take before
 * starting it, not just which exercises are in it.
 *
 * Three factors, as asked: time under the bar for each set, the rest
 * between sets, and the time it takes to switch to the next exercise
 * (walking to new equipment, changing the weight on the bar/machine).
 */

export interface DayExerciseTime {
  sets: number;
  restSeconds: number;
}

/** Time actually performing one working set — reps plus brief setup. */
const EXEC_SECONDS_PER_SET = 35;
/** Time to switch exercise (equipment, weight change) between exercises. */
const TRANSITION_SECONDS = 45;

export function estimateDaySeconds(exercises: DayExerciseTime[]): number {
  if (exercises.length === 0) return 0;
  let total = 0;
  for (const ex of exercises) {
    const sets = Math.max(0, ex.sets);
    const rest = Math.max(0, ex.restSeconds);
    // Rest happens between sets, not after the last one of the exercise —
    // whatever comes next (transition or end of workout) covers that gap.
    total += sets * EXEC_SECONDS_PER_SET + Math.max(0, sets - 1) * rest;
  }
  total += TRANSITION_SECONDS * Math.max(0, exercises.length - 1);
  return total;
}

export function estimateDayMinutes(exercises: DayExerciseTime[]): number {
  return Math.round(estimateDaySeconds(exercises) / 60);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
