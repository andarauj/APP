/**
 * Adaptive engine — movement classification (see NSPI_ENGINE.md §2.1, §2.3).
 *
 * Two pure lookups the weekly signal assembly needs:
 *   - movementBucket : which of the six balance buckets an exercise trains
 *                      (push/pull × horizontal/vertical, quad, hinge)
 *   - mainPattern    : which big compound lift it is, for the load axis
 *                      (squat / bench / row / deadlift / ohp) — isolation and
 *                      accessory work returns null and is ignored for e1RM
 *
 * Keyword-first (exercise names in the DB are English, from free-exercise-db),
 * with the primary muscle as a fallback so a renamed or unusual variant still
 * lands somewhere sensible. No network, no data files — just string rules,
 * same spirit as utils/autoRegulation.ts.
 */

export type MovementBucketKey =
  | 'horiz_push' | 'vert_push'
  | 'horiz_pull' | 'vert_pull'
  | 'quad' | 'hinge';

export type MainPattern = 'squat' | 'bench' | 'row' | 'deadlift' | 'ohp';

const norm = (s: string) => (s || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (h: string, ...needles: string[]) => needles.some(n => h.includes(n));

/**
 * The compound lift this exercise represents, or null for accessory work.
 * Used to track best-set e1RM per pattern against the cycle baseline.
 */
export function mainPattern(name: string, primaryMuscle = ''): MainPattern | null {
  const n = norm(name);
  const m = norm(primaryMuscle);

  // Deadlift family first — "romanian deadlift" also contains no "squat"/"row"
  // but we want it under the hinge-y deadlift pattern for load tracking.
  if (has(n, 'deadlift', 'dead lift')) return 'deadlift';
  if (has(n, 'good morning')) return 'deadlift';

  // Row family — before "bench" so "bent over row" / "seal row on bench"
  // don't get misc, and exclude upright rows (that's a vertical press-ish
  // delt move, not a horizontal pull compound).
  if (has(n, 'row') && !has(n, 'upright')) return 'row';
  if (has(n, 'pendlay')) return 'row';

  // Horizontal press
  if (has(n, 'bench press', 'chest press', 'floor press', 'dumbbell press') && m !== 'shoulders') return 'bench';
  if (n === 'bench' || n.startsWith('bench ')) return 'bench';

  // Vertical press
  if (has(n, 'overhead press', 'shoulder press', 'military press', 'strict press', 'push press', 'z press', 'arnold press')) return 'ohp';
  if (has(n, 'ohp')) return 'ohp';

  // Squat family — after deadlift so "squat" in "zercher squat" etc. is safe;
  // "hack squat" / "split squat" / "front squat" all count.
  if (has(n, 'squat')) return 'squat';

  return null;
}

/**
 * One of the six movement-balance buckets, or null when the exercise is arms /
 * abs / calves / cardio (not part of the balance model).
 */
export function movementBucket(name: string, primaryMuscle = '', equipment = ''): MovementBucketKey | null {
  const n = norm(name);
  const m = norm(primaryMuscle);

  // --- explicit name rules (win over the muscle fallback) ---

  // Vertical pull: pulldowns, pull-ups, chin-ups, pullovers
  if (has(n, 'pulldown', 'pull down', 'pull up', 'pullup', 'chin up', 'chinup', 'pullover', 'lat pull')) {
    return 'vert_pull';
  }
  // Horizontal pull: rows, face pulls, rear-delt work, reverse fly
  if (has(n, 'row') && !has(n, 'upright')) return 'horiz_pull';
  if (has(n, 'face pull', 'rear delt', 'reverse fly', 'reverse pec', 'pendlay')) return 'horiz_pull';

  // Vertical push: overhead / shoulder pressing, lateral & front raises, upright row
  if (has(n, 'overhead press', 'shoulder press', 'military press', 'push press', 'arnold press', 'z press', 'strict press')) {
    return 'vert_push';
  }
  if (has(n, 'lateral raise', 'side raise', 'front raise', 'upright row', 'ohp')) return 'vert_push';

  // Horizontal push: bench, chest press, push-ups, dips, flyes, crossovers
  if (has(n, 'bench press', 'chest press', 'floor press', 'push up', 'pushup', 'chest fly', 'chest dip', 'pec deck', 'cable crossover', 'incline press', 'decline press')) {
    return 'horiz_push';
  }
  if (n === 'dip' || has(n, 'chest dip', 'ring dip')) return 'horiz_push';

  // Hinge: deadlift, RDL, good morning, hip thrust, glute bridge, back
  // extension, leg curl, swings, pull-throughs
  if (has(n, 'deadlift', 'dead lift', 'romanian', ' rdl', 'good morning', 'hip thrust', 'glute bridge', 'back extension', 'hyperextension', 'leg curl', 'lying curl', 'nordic', 'pull through', 'pull-through', 'kettlebell swing', 'hip hinge', 'cable pull through')) {
    return 'hinge';
  }

  // Quad: squat, leg press, lunge, split squat, step-up, hack squat, leg
  // extension, sissy squat
  if (has(n, 'squat', 'leg press', 'lunge', 'split squat', 'step up', 'step-up', 'leg extension', 'sissy', 'hack ', 'bulgarian', 'box jump', 'wall sit')) {
    return 'quad';
  }

  // --- muscle fallback ---
  switch (m) {
    case 'chest':      return 'horiz_push';
    case 'shoulders':  return 'vert_push';
    case 'back':
    case 'lats':       return has(n, 'pull') ? 'vert_pull' : 'horiz_pull';
    case 'traps':      return 'horiz_pull';
    case 'quads':      return 'quad';
    case 'hamstrings':
    case 'glutes':     return 'hinge';
    default:           return null; // biceps, triceps, forearms, abs, calves, cardio, ...
  }
}

/**
 * True multi-joint ("compound") vs. single-joint ("isolation") movement —
 * a different question from movementBucket above, which groups by
 * movement-pattern *balance* and would wrongly call a lateral raise
 * "vert_push", lumping it in with overhead pressing. This is used instead
 * for rest-interval prescription (see PERIODIZATION_RESEARCH.md and
 * restSecondsFor in utils/planGenerator.ts), where a lateral raise and an
 * overhead press need very different rest despite sharing a bucket.
 *
 * Isolation movements have a small, fairly closed vocabulary (curl,
 * extension, raise, fly, pushdown, kickback, shrug...), so those are
 * enumerated directly; everything else typed 'strength' defaults to
 * compound, since most distinctly-named exercises in this dataset
 * (presses, rows, pulls, squats, lunges, cleans...) genuinely are — a leg
 * press or a pull-up is multi-joint even though neither is one of the
 * mainPattern() "big five" barbell lifts.
 */
const ISOLATION_KEYWORDS = [
  'curl', 'extension', 'raise', 'fly', 'flye', 'crossover', 'cross over',
  'pushdown', 'push down', 'kickback', 'kick back', 'shrug', 'preacher',
  'concentration',
];

export function isCompoundMovement(name: string): boolean {
  return !has(norm(name), ...ISOLATION_KEYWORDS);
}

/** Tally a list of trained sets into the six-bucket shape computeNspi wants. */
export function tallyMovementBuckets(
  sets: { name: string; primaryMuscle?: string; equipment?: string }[],
): { bucket: MovementBucketKey; sets: number }[] {
  const counts = new Map<MovementBucketKey, number>();
  for (const s of sets) {
    const b = movementBucket(s.name, s.primaryMuscle ?? '', s.equipment ?? '');
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([bucket, n]) => ({ bucket, sets: n }));
}
