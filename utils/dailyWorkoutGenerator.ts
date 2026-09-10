import type { MuscleGroup } from '@/types';

// The same 10 major muscle groups used elsewhere (Progress Index balance
// component) — cardio/mobility/fullbody/forearms/traps are supplementary,
// not "a muscle to rotate through" in this sense.
export const ROTATION_MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs',
];

export interface MuscleRecency {
  muscle: MuscleGroup;
  /** Days since this muscle was last trained, or null if never. */
  daysSinceLastTrained: number | null;
}

/** How many distinct muscle groups a session should target for a given
 *  time budget — matches pickExercisesForDay's own 4-7 total exercise
 *  range, spread so each muscle gets at least ~2 exercises rather than
 *  being starved by too many muscles competing for too few slots. */
export function muscleGroupCountForMinutes(minutes: number): number {
  if (minutes <= 45) return 2;
  if (minutes <= 60) return 3;
  return 4;
}

const NEVER_TRAINED_SCORE = 999;
// A focus-area muscle (from body measurement analysis) gets a modest boost
// — enough to win a close call between similarly-recent muscles, but never
// enough to override genuine recency (a muscle trained yesterday should
// still lose to one untouched for a week, focus area or not).
const FOCUS_BONUS = 2;

/**
 * Picks which muscles today's workout should target — the ones "most
 * overdue" for training, by days since last trained, with a modest nudge
 * toward focus areas identified from body measurements — and excludes any
 * muscle in `excludedMuscles` entirely, rather than just deprioritizing it
 * by a few points. A points penalty could still lose to a large recency
 * gap (a muscle overdue by ten days would out-rank a fatigued one overdue
 * by four even with a real penalty applied) — an exclusion is unambiguous.
 * Used both for muscles with an active fatigue signal (see
 * utils/fatigueSignals.ts) AND for muscles already present in today's
 * workout when adding one more exercise mid-session — same underlying
 * need either way ("don't pick this one again"), so one parameter serves
 * both callers. Only falls back to including an excluded muscle in the
 * rare case where excluding all of them would leave the day empty.
 *
 * Ties (e.g. a fresh user who hasn't trained anything yet) break by the
 * order muscles were given in, so callers should pass `recency` in a
 * sensible default order.
 *
 * This is what makes every generated day naturally different from the
 * last: whichever muscles were just trained drop to the bottom of the
 * ranking the moment they're logged, surfacing whatever's actually been
 * neglected — not a repeating fixed weekly pattern.
 */
export function selectTodaysMuscles(
  recency: MuscleRecency[],
  muscleCount: number,
  focusAreas: MuscleGroup[] = [],
  excludedMuscles: MuscleGroup[] = [],
): MuscleGroup[] {
  const scored = recency.map(r => {
    const base = r.daysSinceLastTrained === null ? NEVER_TRAINED_SCORE : r.daysSinceLastTrained;
    const bonus = focusAreas.includes(r.muscle) ? FOCUS_BONUS : 0;
    return { muscle: r.muscle, score: base + bonus };
  });
  // Stable sort (guaranteed by the JS spec) preserves the input order for
  // ties, which is why a sensible default muscle order matters for a
  // brand-new user with nothing trained yet.
  scored.sort((a, b) => b.score - a.score);

  const fresh = scored.filter(s => !excludedMuscles.includes(s.muscle));
  if (fresh.length >= muscleCount) {
    return fresh.slice(0, muscleCount).map(s => s.muscle);
  }
  if (fresh.length > 0) {
    // Fewer fresh muscles than the target count — a shorter, more focused
    // session for what's actually ready beats forcing in an excluded one.
    return fresh.map(s => s.muscle);
  }
  // Extreme edge case: every rotation muscle is currently excluded. An
  // empty result would be worse than reusing something — fall back to the
  // least-bad (highest-score) options rather than returning nothing at all.
  const excluded = scored.filter(s => excludedMuscles.includes(s.muscle));
  return excluded.slice(0, muscleCount).map(s => s.muscle);
}

/**
 * Given the muscles already in today's session (one entry per exercise,
 * duplicates expected), picks which one deserves one more exercise —
 * whichever has the FEWEST exercises so far, ties broken by whichever
 * appeared first in the session. Used for "Gerar Exercício" when there's
 * extra time: deepening a muscle already being trained today gives it a
 * meaningfully bigger stimulus, whereas spreading onto a brand-new muscle
 * with a single exercise wouldn't really be enough volume to matter for
 * that muscle on its own.
 */
export function pickMuscleNeedingMoreVolume(currentExerciseMuscles: MuscleGroup[]): MuscleGroup | null {
  if (currentExerciseMuscles.length === 0) return null;

  const counts = new Map<MuscleGroup, number>();
  const order: MuscleGroup[] = [];
  for (const m of currentExerciseMuscles) {
    if (!counts.has(m)) { counts.set(m, 0); order.push(m); }
    counts.set(m, counts.get(m)! + 1);
  }

  let best = order[0];
  let bestCount = counts.get(best)!;
  for (const m of order) {
    const c = counts.get(m)!;
    if (c < bestCount) { bestCount = c; best = m; }
  }
  return best;
}
