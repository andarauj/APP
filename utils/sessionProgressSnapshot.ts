/**
 * Derive mini-player progress labels from logged session sets.
 * Pure helper so it can be unit-tested without SQLite.
 */
export function sessionProgressFromSets(
  sets: { exercise_name?: string; completed_at?: number | null }[],
  fallbackExerciseName: string,
): { doneSets: number; currentExerciseName: string } {
  const doneSets = sets.length;
  if (doneSets === 0) {
    return { doneSets: 0, currentExerciseName: fallbackExerciseName };
  }
  // Most recently completed set's exercise is the best "where you left off" label.
  let latest = sets[0];
  for (const s of sets) {
    if ((s.completed_at ?? 0) >= (latest.completed_at ?? 0)) latest = s;
  }
  return {
    doneSets,
    currentExerciseName: latest.exercise_name || fallbackExerciseName,
  };
}
