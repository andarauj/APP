/**
 * Whether a set in an exercise should reject input because it isn't its
 * turn yet. Only the first undone set accepts weight/reps/RPE and can be
 * marked complete; sets further down wait their turn. A set that's already
 * done is never locked — it stays editable so a mistake can be corrected
 * (see updateWorkoutSet in db/workoutDao.ts for how that correction
 * actually persists).
 *
 * Kept as a pure function (no React state) so this — the part most likely
 * to have an off-by-one, same reasoning as utils/supersets.ts — can be
 * verified with plain unit tests before it's wired into the much larger,
 * harder-to-test active workout screen.
 */
export function isSetLocked(sets: { done: boolean }[], setIdx: number): boolean {
  const set = sets[setIdx];
  if (!set || set.done) return false;
  const firstUndoneIdx = sets.findIndex(s => !s.done);
  // firstUndoneIdx === -1 can't actually happen here (set.done is already
  // false), but guarding it keeps this correct even if that ever changes.
  return firstUndoneIdx !== -1 && setIdx !== firstUndoneIdx;
}
