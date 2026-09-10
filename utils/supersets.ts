export interface SupersetCheckExercise {
  supersetGroup?: number | null;
  sets: { done: boolean }[];
}

/**
 * Given the full exercise list and which one/set-index was just completed,
 * finds the next exercise in the same superset group that still has an
 * undone set at this same round — or null if this exercise isn't part of a
 * superset, or every partner is already caught up for this round (meaning
 * a normal rest period should start instead).
 *
 * Kept as a pure function (no React state, no timers) so the pairing logic
 * itself — the part most likely to have an off-by-one or edge-case bug —
 * can be verified with plain unit tests before it's wired into the much
 * larger, harder-to-test active workout screen.
 */
export function findSupersetPartner(
  exercises: SupersetCheckExercise[],
  completedIndex: number,
  setIdx: number
): number | null {
  const group = exercises[completedIndex]?.supersetGroup;
  if (group === null || group === undefined) return null;

  for (let i = 0; i < exercises.length; i++) {
    if (i === completedIndex) continue;
    if (exercises[i].supersetGroup !== group) continue;
    const partnerSet = exercises[i].sets[setIdx];
    if (partnerSet && !partnerSet.done) return i;
  }
  return null;
}
