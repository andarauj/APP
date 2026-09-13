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
  // Portuguese seed / Gymleco names — without these, "Elevação Lateral"
  // and "Crucifixo" occupy a compound slot.
  'elevacao', 'elevação', 'extensao', 'extensão',
  'crucifixo', 'abducao', 'abdução', 'aducao', 'adução',
  'gemeos', 'gémeos', 'crunch', 'rosca',
  'pullover', 'pec deck', 'pecdeck',
];

export function isCompoundMovement(name: string): boolean {
  return !has(norm(name), ...ISOLATION_KEYWORDS);
}

// The seed DB (free-exercise-db) tags a lot of competitive Olympic
// weightlifting / kettlebell-ballistic work under ordinary muscle groups
// (Snatch → quads, Clean → hamstrings, Split Jerk → quads...). They're
// technical, coach-taught skills, not a reasonable default pick for an
// auto-generated hypertrophy/strength day — and because their names are
// short ("Snatch", "Clean", one or two words), planGenerator's own
// prefer-the-shorter-name tie-break (see sortCandidates) was routinely
// picking them over legitimate anchor lifts like Barbell Squat or Romanian
// Deadlift. Excluded only from auto-generation's candidate pool — still
// fully searchable and addable by hand via the exercise browser.
const OLYMPIC_LIFT_KEYWORDS = ['snatch', 'clean', 'jerk'];

export function isOlympicLiftSpecialty(name: string): boolean {
  return has(norm(name), ...OLYMPIC_LIFT_KEYWORDS);
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

/**
 * Fine-grained movement slot used by plan generation — one subcategory per
 * pattern (chest press vs chest fly), not the six NSPI balance buckets.
 */
export type MovementSubcategory =
  | 'chest_compound'
  | 'chest_isolation'
  | 'shoulder_press'
  | 'shoulder_isolation'
  | 'rear_delt'
  | 'tricep_compound'
  | 'tricep_extension'
  | 'back_horizontal'
  | 'back_vertical'
  | 'back_isolation'
  | 'bicep_curl'
  | 'forearm'
  | 'quad_compound'
  | 'quad_isolation'
  | 'hinge_compound'
  | 'hamstring_isolation'
  | 'glute_compound'
  | 'glute_isolation'
  | 'calf_raise'
  | 'abs'
  | 'cardio'
  | 'mobility'
  | 'other';

export type MovementSlot = MovementSubcategory[];

/** Hard cap: at most two compounds of the same pattern in one routine. */
export const MAX_PER_COMPOUND_SUBCATEGORY = 2;
/** Isolation patterns stay at one pick (no two cable crossovers on Push A). */
export const MAX_PER_ISOLATION_SUBCATEGORY = 1;

const ISOLATION_SUBCATEGORIES = new Set<MovementSubcategory>([
  'chest_isolation',
  'shoulder_isolation',
  'rear_delt',
  'tricep_extension',
  'back_isolation',
  'bicep_curl',
  'forearm',
  'quad_isolation',
  'hamstring_isolation',
  'glute_isolation',
  'calf_raise',
]);

export function subcategoryCap(sub: MovementSubcategory): number {
  return ISOLATION_SUBCATEGORIES.has(sub)
    ? MAX_PER_ISOLATION_SUBCATEGORY
    : MAX_PER_COMPOUND_SUBCATEGORY;
}

export function muscleForSubcategory(sub: MovementSubcategory): string | null {
  switch (sub) {
    case 'chest_compound':
    case 'chest_isolation':
      return 'chest';
    case 'shoulder_press':
    case 'shoulder_isolation':
    case 'rear_delt':
      return 'shoulders';
    case 'tricep_compound':
    case 'tricep_extension':
      return 'triceps';
    case 'back_horizontal':
    case 'back_vertical':
    case 'back_isolation':
      return 'back';
    case 'bicep_curl':
      return 'biceps';
    case 'forearm':
      return 'forearms';
    case 'quad_compound':
    case 'quad_isolation':
      return 'quads';
    case 'hinge_compound':
    case 'hamstring_isolation':
      return 'hamstrings';
    case 'glute_compound':
    case 'glute_isolation':
      return 'glutes';
    case 'calf_raise':
      return 'calves';
    case 'abs':
      return 'abs';
    default:
      return null;
  }
}

/**
 * Stable movement_type for catalogue rows and generator caps.
 * EN + PT names; muscle is the fallback when the name is unusual.
 */
export function movementSubcategory(
  name: string,
  primaryMuscle = '',
  exerciseType = 'strength',
): MovementSubcategory {
  const n = norm(name);
  const m = norm(primaryMuscle);
  if (exerciseType === 'cardio' || m === 'cardio') return 'cardio';
  if (exerciseType === 'mobility' || m === 'mobility') return 'mobility';

  if (has(n, 'face pull', 'rear delt', 'reverse fly', 'reverse pec', 'crucifixo inverso')) {
    return 'rear_delt';
  }

  if (has(n, 'crossover', 'cross over', 'fly', 'flye', 'crucifixo', 'pec deck', 'pecdeck', 'pullover')) {
    if (has(n, 'inverso', 'reverse')) return 'rear_delt';
    if (m === 'back') return 'back_isolation';
    return 'chest_isolation';
  }

  if (has(
    n,
    'overhead press', 'shoulder press', 'military press', 'strict press',
    'push press', 'z press', 'arnold press', 'desenvolvimento',
    'press de ombro', 'press militar',
  )) {
    return 'shoulder_press';
  }
  if (
    has(n, 'lateral raise', 'side raise', 'front raise', 'elevacao lateral', 'elevação lateral', 'elevacao frontal', 'elevação frontal')
    && !has(n, 'gemeo', 'gémeo', 'calf', 'panturrilha')
  ) {
    return 'shoulder_isolation';
  }

  if (has(
    n,
    'pushdown', 'push down', 'kickback', 'skull',
    'overhead extension', 'extensao de tricep', 'extensão de tríceps',
    'extensao de triceps', 'triceps no cabo', 'tríceps no cabo',
  )) {
    return 'tricep_extension';
  }

  if (has(
    n,
    'pulldown', 'pull down', 'pull-up', 'pullup', 'pull up',
    'chin up', 'chinup', 'chin-up', 'lat pull', 'puxada', 'barra fixa',
  )) {
    return 'back_vertical';
  }
  if (has(n, 'row') && !has(n, 'upright')) return 'back_horizontal';
  if (has(n, 'remada')) return 'back_horizontal';

  if (has(n, 'leg curl', 'lying curl', 'nordic', 'curl de perna', 'curl nordico', 'curl nórdico')) {
    return 'hamstring_isolation';
  }
  if (has(n, 'curl') || has(n, 'rosca')) return 'bicep_curl';
  if (m === 'forearms' || has(n, 'wrist', 'forearm', 'antebraco', 'antebraço')) return 'forearm';

  if (has(n, 'leg extension', 'extensao de perna', 'extensão de perna', 'extensao de pernas', 'extensão de pernas')) {
    return 'quad_isolation';
  }
  if (has(n, 'calf', 'gemeo', 'gémeo', 'panturrilha')) return 'calf_raise';
  if (m === 'abs' || has(n, 'crunch', 'plank', 'prancha', 'sit up', 'sit-up', 'abdominal')) return 'abs';

  if (has(n, 'deadlift', 'dead lift', 'levantamento terra', 'good morning', 'hip thrust', 'glute bridge', 'ponte de glute', 'ponte de glúte')) {
    if (m === 'glutes' || has(n, 'bridge', 'thrust', 'ponte')) return 'glute_compound';
    return 'hinge_compound';
  }
  if (has(n, 'squat', 'agachamento', 'leg press', 'lunge', 'afunda', 'hack ')) return 'quad_compound';

  const compound = isCompoundMovement(name);
  if (m === 'chest') return compound ? 'chest_compound' : 'chest_isolation';
  if (m === 'shoulders') return compound ? 'shoulder_press' : 'shoulder_isolation';
  if (m === 'triceps') return compound ? 'tricep_compound' : 'tricep_extension';
  if (m === 'back' || m === 'lats' || m === 'traps') {
    if (!compound) return 'back_isolation';
    return has(n, 'pull', 'puxada', 'barra') ? 'back_vertical' : 'back_horizontal';
  }
  if (m === 'biceps') return 'bicep_curl';
  if (m === 'quads') return compound ? 'quad_compound' : 'quad_isolation';
  if (m === 'hamstrings') return compound ? 'hinge_compound' : 'hamstring_isolation';
  if (m === 'glutes') return compound ? 'glute_compound' : 'glute_isolation';
  if (m === 'calves') return 'calf_raise';
  if (m === 'forearms') return 'forearm';
  return 'other';
}

const PUSH_SLOTS: MovementSlot[] = [
  ['chest_compound'],
  ['chest_isolation'],
  ['shoulder_press', 'shoulder_isolation'],
  ['tricep_extension', 'tricep_compound'],
];

const PULL_SLOTS: MovementSlot[] = [
  ['back_vertical'],
  ['back_horizontal'],
  ['bicep_curl'],
];

const LEG_SLOTS: MovementSlot[] = [
  ['quad_compound'],
  ['hinge_compound', 'glute_compound'],
  ['quad_isolation', 'hamstring_isolation', 'glute_isolation'],
  ['calf_raise'],
];

/**
 * Logical slot order for a split day. Null for a single-muscle / ad-hoc
 * focus so existing ranking (usage, mixed equipment) stays in charge.
 */
export function slotsForDay(focus: string[], dayLabel?: string): MovementSlot[] | null {
  const label = (dayLabel ?? '').toLowerCase();
  const hasMuscle = (m: string) => focus.includes(m);
  if (label.includes('push') || (hasMuscle('chest') && hasMuscle('shoulders') && hasMuscle('triceps') && !hasMuscle('back'))) {
    return PUSH_SLOTS;
  }
  if (label.includes('pull') || (hasMuscle('back') && hasMuscle('biceps') && !hasMuscle('chest') && !hasMuscle('quads'))) {
    return PULL_SLOTS;
  }
  if (
    label.includes('perna') || label.includes('leg') || label.includes('lower')
    || (hasMuscle('quads') && hasMuscle('hamstrings') && !hasMuscle('chest') && !hasMuscle('back'))
  ) {
    return LEG_SLOTS;
  }
  return null;
}
