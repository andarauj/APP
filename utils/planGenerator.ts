import { getAllExercises } from '@/db/exerciseDao';
import { createPlan, addExerciseToPlan } from '@/db/planDao';
import { getDatabase } from '@/db/database';
import { getMuscleRecency, getFatigueRadarExerciseData, getExerciseUsageCounts, getLastSetForExercise, getProgressionSuggestion } from '@/db/workoutDao';
import type { Exercise, MuscleGroup, PlanType, SplitType, SetType, Equipment } from '@/types';
import { MUSCLE_GROUPS_PT } from '@/types';
import type { BodyAnalysis } from './bodyAnalysis';
import { selectTodaysMuscles, muscleGroupCountForMinutes, pickMuscleNeedingMoreVolume } from './dailyWorkoutGenerator';
import { detectPerformanceRegression, detectRpeCreep } from './fatigueSignals';
import { isCompoundMovement, isOlympicLiftSpecialty } from './movementClassify';

interface DaySplit {
  label: string;
  focus: MuscleGroup[];
}

interface SplitTemplate {
  splitType: SplitType;
  days: DaySplit[];
}

const PER_SET_MINUTES = 4;
// Caps how much a well-worn exercise's session count can dominate the
// ranking — proven exercises should win, but not so absolutely that a
// 40-session staple makes every other candidate for that muscle
// permanently unreachable.
const MAX_USAGE_SESSIONS_COUNTED = 10;
// A conditioning finisher only gets added to sessions longer than this —
// on a short session, every minute is worth more spent on strength work.
const CONDITIONING_MIN_MINUTES = 60;

/**
 * Whether a session should get a general conditioning finisher — both
 * generatePlan and generateTodaysWorkout defer to this instead of each
 * having their own copy of the same >60min gate, so the rule can never
 * drift between the two generators.
 */
export function shouldAddConditioningFinisher(suggestConditioning: boolean, minutesAvailable: number): boolean {
  return suggestConditioning && minutesAvailable > CONDITIONING_MIN_MINUTES;
}

const SPLIT_TEMPLATES: Record<number, SplitTemplate> = {
  3: {
    splitType: 'ppl',
    days: [
      { label: 'Push', focus: ['chest', 'shoulders', 'triceps'] },
      { label: 'Pull', focus: ['back', 'biceps', 'forearms'] },
      { label: 'Pernas', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },
  4: {
    splitType: 'upper_lower',
    days: [
      { label: 'Upper A', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { label: 'Lower A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { label: 'Upper B', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { label: 'Lower B', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
    ],
  },
  5: {
    splitType: 'bro',
    days: [
      { label: 'Peito', focus: ['chest'] },
      { label: 'Costas', focus: ['back', 'lats'] },
      { label: 'Pernas', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { label: 'Ombros', focus: ['shoulders', 'traps'] },
      { label: 'Bracos', focus: ['biceps', 'triceps', 'forearms'] },
    ],
  },
  6: {
    splitType: 'ppl',
    days: [
      { label: 'Push A', focus: ['chest', 'shoulders', 'triceps'] },
      { label: 'Pull A', focus: ['back', 'biceps', 'forearms'] },
      { label: 'Pernas A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { label: 'Push B', focus: ['chest', 'shoulders', 'triceps'] },
      { label: 'Pull B', focus: ['back', 'biceps', 'forearms'] },
      { label: 'Pernas B', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },
  2: {
    splitType: 'fullbody',
    days: [
      { label: 'Full Body A', focus: ['chest', 'back', 'quads', 'abs'] },
      { label: 'Full Body B', focus: ['shoulders', 'hamstrings', 'glutes', 'biceps', 'triceps'] },
    ],
  },
  1: {
    splitType: 'fullbody',
    days: [
      { label: 'Full Body', focus: ['chest', 'back', 'quads', 'shoulders', 'abs'] },
    ],
  },
};

/**
 * How many exercises a session of `minutesAvailable` gets — same formula
 * pickExercisesForDay() actually uses, kept in sync here for
 * suggestedDaysPerWeek() below.
 */
function targetExerciseCountFor(minutesAvailable: number): number {
  return Math.max(4, Math.min(8, Math.floor(minutesAvailable / PER_SET_MINUTES / 3)));
}

/**
 * Whether the chosen days/week can actually give every muscle group in its
 * busiest day at least one exercise, given how many minutes are available
 * per session — and if not, the smallest days/week that would fix it.
 *
 * Fewer days means a broader per-day focus (a 2-day Full Body split covers
 * 4 muscle groups in one session; a 5-day Bro Split covers 1). The number
 * of exercises a session gets is driven only by minutesAvailable (see
 * targetExerciseCountFor), not by how many muscle groups that day needs to
 * cover — so a short session on a broad-focus day risks some of that day's
 * muscle groups getting no exercise at all. Spreading the same weekly
 * training across more, narrower-focus days fixes that without needing a
 * longer session.
 *
 * Returns null when the current choice already covers every muscle group
 * (nothing to suggest), or when even the maximum 6 days/week wouldn't fully
 * fix it (in which case nagging about it doesn't help either).
 */
export function suggestedDaysPerWeek(daysPerWeek: number, minutesPerDay: number): number | null {
  const targetExerciseCount = targetExerciseCountFor(minutesPerDay);
  const fits = (days: number): boolean => {
    const template = SPLIT_TEMPLATES[days];
    if (!template) return true;
    const maxFocus = Math.max(...template.days.map(d => d.focus.length));
    return targetExerciseCount >= maxFocus;
  };
  if (fits(daysPerWeek)) return null;
  for (let d = daysPerWeek + 1; d <= 6; d++) {
    if (fits(d)) return d;
  }
  return null;
}

const COMPOUND_PRIORITY: Record<string, number> = {
  barbell: 0,
  dumbbell: 1,
  smith: 2,
  gymleco: 3,
  machine: 4,
  cable: 5,
  bodyweight: 6,
  kettlebell: 7,
  ez_bar: 8,
  band: 9,
  plate: 10,
  trap_bar: 11,
  other: 12,
};

export type EquipmentPreference = 'any' | 'gymleco' | 'free_weights' | 'home_dumbbell';

function matchesEquipment(ex: Exercise, pref: EquipmentPreference): boolean {
  if (pref === 'any') return true;
  if (pref === 'gymleco') return ex.equipment === 'gymleco';
  if (pref === 'free_weights') return ['barbell', 'dumbbell', 'ez_bar', 'smith', 'trap_bar'].includes(ex.equipment);
  if (pref === 'home_dumbbell') return ex.equipment === 'dumbbell' || ex.equipment === 'bodyweight';
  return true;
}

function extraSetsForFocus(muscle: MuscleGroup, focusAreas: MuscleGroup[]): number {
  return focusAreas.includes(muscle) ? 1 : 0;
}

/**
 * The first word of an exercise's name is a decent proxy for its movement
 * family in this dataset ("Supino", "Remada", "Crucifixo"...), since variants
 * of the same base movement are named "<Movement> <Variant>" (e.g. "Supino
 * com Barra" / "Supino Inclinado com Barra" / "Supino Declinado com Barra").
 */
// BUGFIX (found by reading a real generated plan): exercise names prefixed
// with an equipment brand ("Gymleco Crossover Maquina...") had their first
// word be the brand, not the movement — so "Gymleco Crossover Maquina" was
// never recognized as the same movement family as "Crossover no Cabo",
// letting the diversification pass pick BOTH as if they were different
// movements. A chest day ended up with three separate fly/crossover-pattern
// exercises and zero real bench press in its working sets — only a
// close-grip specialty variant, demoted to warmup.
const BRAND_PREFIXES = ['gymleco'];

export function movementFamily(name: string): string {
  const words = name.toLowerCase().split(' ');
  const first = BRAND_PREFIXES.includes(words[0]) ? words[1] : words[0];
  return first || words[0];
}

// Real usage history outranks everything else: an exercise the person has
// actually stuck with across several sessions is a better bet than any
// generic "barbell is usually better" guess. Sessions are capped (via
// MAX_USAGE_SESSIONS_COUNTED) so a long-time staple doesn't permanently lock
// out ever trying anything else — it still wins, but by a bounded amount,
// not an ever-growing one.
//
// BUGFIX (found by reading a real generated plan): with only equipment
// priority to sort by, same-tier ties fell back to whatever order the
// exercises came from the database in — alphabetical by name. That silently
// favored oddly-specific variants: "Supino Apertado com Barra" (close-grip)
// sorts before the plain "Supino com Barra" alphabetically, so the
// close-grip specialty version became the day's ONLY barbell press pick
// (demoted to warmup), while the actual flat bench press was never selected
// at all. Preferring the SHORTER name as a tie-breaker favors the plain,
// foundational lift ("Supino com Barra", 3 words) over qualified variants
// ("Supino Apertado/Inclinado/Isometrico com Barra", 4+ words) — a real
// anchor lift, not a specialty variant, should be the one actually
// generated for the primary lift slot.
function sortCandidates(matches: Exercise[], usageHistory?: Map<number, number>): Exercise[] {
  return [...matches].sort((a, b) => {
    // A capped session count so a long-time staple wins by a bounded
    // amount, not an ever-growing one that would permanently crowd out
    // trying anything else once it's been used a lot.
    const usageA = Math.min(usageHistory?.get(a.id) ?? 0, MAX_USAGE_SESSIONS_COUNTED);
    const usageB = Math.min(usageHistory?.get(b.id) ?? 0, MAX_USAGE_SESSIONS_COUNTED);
    if (usageA !== usageB) return usageB - usageA;

    const priorityDiff = (COMPOUND_PRIORITY[a.equipment] ?? 99) - (COMPOUND_PRIORITY[b.equipment] ?? 99);
    if (priorityDiff !== 0) return priorityDiff;
    const wordCountDiff = a.name.split(' ').length - b.name.split(' ').length;
    if (wordCountDiff !== 0) return wordCountDiff;
    return a.name.localeCompare(b.name);
  });
}

export function pickExercisesForDay(
  allExercises: Exercise[],
  focus: MuscleGroup[],
  minutesAvailable: number,
  equipmentPref: EquipmentPreference,
  focusAreas: MuscleGroup[],
  usageHistory?: Map<number, number>,
  allowedEquipment?: Equipment[],
  excludedMuscles?: MuscleGroup[],
): Exercise[] {
  const focusWithoutInjuries = excludedMuscles && excludedMuscles.length > 0
    ? focus.filter(m => !excludedMuscles.includes(m))
    : focus;
  const focusMuscles = focusAreas.length > 0
    ? [...new Set([...focusAreas.filter(m => focusWithoutInjuries.includes(m)), ...focusWithoutInjuries])]
    : focusWithoutInjuries;

  const targetExerciseCount = Math.max(
    4,
    Math.min(8, Math.floor(minutesAvailable / PER_SET_MINUTES / 3)),
  );

  const byMuscle = new Map<MuscleGroup, Exercise[]>();
  for (const muscle of focusMuscles) {
    let matches = allExercises
      .filter(e => e.primary_muscle === muscle && e.type === 'strength' && !isOlympicLiftSpecialty(e.name));

    // Fine-grained equipment (an exact checklist, e.g. from onboarding) is
    // otherwise stricter than the coarse EquipmentPreference buckets — no
    // loosening, since the person told us exactly what they have, and
    // showing something outside that list is worse than training that
    // muscle less this session. One deliberate exception, mirroring
    // matchesEquipment's own 'gymleco' handling above: the seed exercise
    // database has zero exercises actually tagged 'gymleco' (it's one gym
    // chain's own branded machines, not a distinct movement), so selecting
    // only Gymleco would otherwise silently return nothing. Generic
    // 'machine' exercises are the closest real substitute.
    if (allowedEquipment && allowedEquipment.length > 0) {
      const allowed = allowedEquipment.includes('gymleco')
        ? [...allowedEquipment, 'machine' as Equipment]
        : allowedEquipment;
      matches = matches.filter(e => allowed.includes(e.equipment));
      byMuscle.set(muscle, sortCandidates(matches, usageHistory));
      continue;
    }

    const prefMatches = matches.filter(e => matchesEquipment(e, equipmentPref));
    if (prefMatches.length >= 2) {
      matches = prefMatches;
    } else if (equipmentPref === 'gymleco') {
      matches = [...prefMatches, ...matches.filter(e => e.equipment === 'machine')];
    } else if (equipmentPref === 'home_dumbbell') {
      // Stay strictly within home equipment even when a muscle has fewer
      // than 2 dumbbell/bodyweight options — unlike the other preferences,
      // never fall back to gym-only equipment (barbell, machine, cable)
      // the person doesn't actually have at home.
      matches = prefMatches;
    }

    byMuscle.set(muscle, sortCandidates(matches, usageHistory));
  }

  const picked: Exercise[] = [];
  const usedIds = new Set<number>();
  // BUGFIX: when a muscle needed more than one exercise, the fallback loop
  // below used to walk the same equipment-priority-sorted list from the top,
  // which for muscles with many variants of one movement (e.g. flat/incline/
  // decline barbell bench press are all "barbell" and sort next to each
  // other) picked several near-identical exercises back to back — read by
  // the person as "very similar exercises" or "wrong names" repeating.
  // Tracking which movement family is already used per muscle and preferring
  // a fresh one keeps the day varied (press + fly + machine, not three bench
  // press angles).
  const usedFamilyPerMuscle = new Map<MuscleGroup, Set<string>>();

  for (const muscle of focusMuscles) {
    const candidates = byMuscle.get(muscle) || [];
    const top = candidates[0];
    if (top && !usedIds.has(top.id)) {
      picked.push(top);
      usedIds.add(top.id);
      usedFamilyPerMuscle.set(muscle, new Set([movementFamily(top.name)]));
    }
  }

  // Pass 1: for muscles still needing more volume, prefer a candidate whose
  // movement family hasn't been used yet for that muscle.
  for (const muscle of focusMuscles) {
    if (picked.length >= targetExerciseCount) break;
    const candidates = byMuscle.get(muscle) || [];
    const usedFamilies = usedFamilyPerMuscle.get(muscle) ?? new Set<string>();
    for (const c of candidates) {
      if (picked.length >= targetExerciseCount) break;
      if (usedIds.has(c.id)) continue;
      if (usedFamilies.has(movementFamily(c.name))) continue;
      picked.push(c);
      usedIds.add(c.id);
      usedFamilies.add(movementFamily(c.name));
    }
    usedFamilyPerMuscle.set(muscle, usedFamilies);
  }

  // Pass 2: only now allow repeating a movement family, for muscles that
  // genuinely don't have enough distinct variants to fill the target count.
  for (const muscle of focusMuscles) {
    if (picked.length >= targetExerciseCount) break;
    const candidates = byMuscle.get(muscle) || [];
    for (const c of candidates) {
      if (picked.length >= targetExerciseCount) break;
      if (!usedIds.has(c.id)) {
        picked.push(c);
        usedIds.add(c.id);
      }
    }
  }

  return picked.slice(0, targetExerciseCount);
}

/**
 * Groups a day's exercises by muscle, following the focus order of the split
 * (e.g. on a Push day: all chest first, then shoulders, then triceps). Within a
 * muscle the compound movements stay first, since pickExercisesForDay already
 * sorted candidates by equipment priority.
 */
export function orderByMuscleGroup(exercises: Exercise[], focusOrder: MuscleGroup[]): Exercise[] {
  const rank = new Map<MuscleGroup, number>();
  focusOrder.forEach((m, i) => rank.set(m, i));
  return [...exercises].sort((a, b) => {
    const ra = rank.get(a.primary_muscle) ?? 99;
    const rb = rank.get(b.primary_muscle) ?? 99;
    if (ra !== rb) return ra - rb;
    return (COMPOUND_PRIORITY[a.equipment] ?? 99) - (COMPOUND_PRIORITY[b.equipment] ?? 99);
  });
}

/**
 * Same suggestion logic already used when starting a workout from a plan
 * (see app/workout/active.tsx) — moved here so the PLAN itself already
 * carries a real number, like a PT handing you a program that says
 * "bench press, 4x8-12 at 60kg", not just the exercise and rep range with
 * the weight left blank until you show up. Falls back to the last weight
 * actually used, or 0 for a genuinely new exercise with no history to go
 * on — inventing a number with nothing to base it on would be worse than
 * leaving it for the person to fill in themselves.
 */
async function suggestWeightForExercise(exerciseId: number, reps: string): Promise<number> {
  const progression = await getProgressionSuggestion(exerciseId, reps);
  if (progression?.shouldProgress) return progression.suggestedWeight;
  const lastSet = await getLastSetForExercise(exerciseId);
  return lastSet ? lastSet.weight : 0;
}

/**
 * Rest by goal AND by whether the exercise is compound (multi-joint) or
 * isolation (single-joint) — see REST_INTERVAL_RESEARCH.md for full sourcing.
 * Previously a single flat number per goal, identical for a heavy squat and
 * a bicep curl in the same session. Values here are the well-established
 * *direction and rough magnitude* from the literature, not a single settled
 * number (ACSM and NSCA don't even agree with each other on hypertrophy
 * rest) — treat these as a defensible midpoint, not a precise scientific
 * constant.
 *
 * strength:    ACSM 2009 — 3-5min core lifts / 1-2min assistance work,
 *              advanced strength phase (its own compound/isolation split).
 * hypertrophy: ACSM's 1-2min baseline, weighted toward the top of that
 *              range per Schoenfeld et al. 2016 (JSCR) — a controlled trial
 *              found 3min rest produced significantly more strength AND
 *              hypertrophy than 1min — and Singer et al. 2024's Bayesian
 *              meta-analysis, which found no extra benefit past ~90s. The
 *              previous flat 30s was below every source reviewed.
 * endurance:   ACSM — <90s for >15 reps at 40-60%1RM.
 * cardio/mobility: unchanged — these goals aren't about compound/isolation
 *              strength work.
 */
const REST_SECONDS_TABLE: Record<PlanType, { compound: number; isolation: number }> = {
  strength: { compound: 240, isolation: 90 },
  hypertrophy: { compound: 120, isolation: 75 },
  endurance: { compound: 45, isolation: 30 },
  cardio: { compound: 30, isolation: 30 },
  mobility: { compound: 30, isolation: 30 },
};

export function restSecondsFor(planType: PlanType, exerciseName: string): number {
  const spec = REST_SECONDS_TABLE[planType] ?? REST_SECONDS_TABLE.hypertrophy;
  return isCompoundMovement(exerciseName) ? spec.compound : spec.isolation;
}

function setsRepsForPlanType(
  planType: PlanType,
  exerciseIndex: number,
  exerciseName: string,
  extraSets: number = 0,
): {
  sets: number; reps: string; rest: number; setType: SetType;
} {
  const isWarmup = exerciseIndex === 0;
  const rest = restSecondsFor(planType, exerciseName);
  switch (planType) {
    case 'strength':
      return {
        sets: (isWarmup ? 4 : 5) + extraSets,
        reps: isWarmup ? '5' : '3-5',
        rest,
        setType: isWarmup ? 'warmup' : 'normal',
      };
    case 'endurance':
      return { sets: 3 + extraSets, reps: '15-20', rest, setType: 'normal' };
    case 'cardio':
      return { sets: 4 + extraSets, reps: '20+', rest, setType: 'normal' };
    case 'mobility':
      return { sets: 2, reps: '10-12', rest, setType: 'normal' };
    default:
      return {
        sets: (isWarmup ? 3 : 4) + extraSets,
        reps: isWarmup ? '12-15' : '8-12',
        rest,
        setType: isWarmup ? 'warmup' : 'normal',
      };
  }
}

export interface GeneratedDay {
  label: string;
  exercises: Exercise[];
  estimatedMinutes: number;
}

export interface GenerationPreview {
  planName: string;
  planType: PlanType;
  splitType: SplitType;
  days: GeneratedDay[];
}

export function generatePreview(
  daysPerWeek: number,
  minutesPerDay: number,
  planType: PlanType,
): GenerationPreview {
  const template = SPLIT_TEMPLATES[daysPerWeek] || SPLIT_TEMPLATES[3];
  return {
    planName: `${daysPerWeek}x${minutesPerDay}min`,
    planType,
    splitType: template.splitType,
    days: template.days.map(d => ({
      label: d.label,
      exercises: [],
      estimatedMinutes: minutesPerDay,
    })),
  };
}

export async function generatePlan(
  daysPerWeek: number,
  minutesPerDay: number,
  planType: PlanType,
  options?: {
    customName?: string;
    equipmentPref?: EquipmentPreference;
    bodyAnalysis?: BodyAnalysis | null;
    /** Direct target zones (e.g. from onboarding), merged with whatever
     *  body-analysis already flagged — both mean the same thing (extra sets
     *  for that muscle), just from different sources. */
    focusAreas?: MuscleGroup[];
    /** Exact equipment checklist (e.g. from onboarding). Overrides
     *  equipmentPref's coarse buckets when present — see pickExercisesForDay. */
    allowedEquipment?: Equipment[];
    /** Muscles to leave out of every day's focus entirely (e.g. an
     *  onboarding-reported injury) — not just deprioritized, skipped. */
    excludedMuscles?: MuscleGroup[];
    /** Skip sortCandidates' usage-history bias (see its comment) for this
     *  generation. Right for the NSPI adaptive plan specifically: that cycle
     *  is supposed to build a fresh program strictly from the onboarding
     *  answers (goal/days/equipment/level), not keep re-anchoring on
     *  whatever a person already happened to log a lot of sessions with
     *  before turning it on — the opposite of what "adaptive from a clean
     *  slate" promises. Manual/plain generation paths keep the bias, where
     *  favoring an already-proven exercise is still the right default. */
    ignoreUsageHistory?: boolean;
  },
): Promise<number> {
  const template = SPLIT_TEMPLATES[daysPerWeek] || SPLIT_TEMPLATES[3];
  const allExercises = await getAllExercises();
  const usageHistory = options?.ignoreUsageHistory ? undefined : await getExerciseUsageCounts();
  const equipmentPref = options?.equipmentPref ?? 'any';
  const allowedEquipment = options?.allowedEquipment;
  const excludedMuscles = options?.excludedMuscles ?? [];
  const focusAreas = [...new Set([...(options?.bodyAnalysis?.focusAreas ?? []), ...(options?.focusAreas ?? [])])]
    .filter(m => !excludedMuscles.includes(m));
  const suggestConditioning = options?.bodyAnalysis?.suggestConditioning ?? false;

  const eqLabel = equipmentPref === 'gymleco' ? ' · Gymleco' : equipmentPref === 'free_weights' ? ' · Pesos Livres' : '';
  const focusLabel = focusAreas.length > 0 ? ' · Foco personalizado' : '';
  const planName = options?.customName?.trim() || `Plano ${daysPerWeek} dias · ${minutesPerDay}min${eqLabel}${focusLabel}`;

  // Cardio finishers cycle through a few bodyweight options (work in any gym,
  // no equipment dependency) so the same one doesn't repeat every day.
  const cardioOptions = allExercises.filter(e => e.type === 'cardio' && e.equipment === 'bodyweight');
  const fallbackCardio = allExercises.filter(e => e.type === 'cardio');

  // BUGFIX: this used to create the plan record and then insert each day's
  // exercises with a separate auto-committed write per exercise (a 6-day
  // plan could be 40+ individual commits). Besides the unnecessary I/O, it
  // meant a plan could end up half-built in the database if generation was
  // interrupted partway (app killed, an unexpected error) — some exercises
  // saved, the rest silently missing, with no way to tell from the UI.
  // Wrapping the whole thing in one transaction makes it atomic: either the
  // complete plan is saved, or (on any failure) none of it is.
  const db = await getDatabase();
  let planId!: number;

  await db.withTransactionAsync(async () => {
    planId = await createPlan(
      planName,
      `Plano gerado automaticamente: ${daysPerWeek} dias/semana, ${minutesPerDay}min/sessao, foco ${planType}${eqLabel}${focusLabel}.`,
      planType,
      template.splitType,
      true,
    );

    // BUGFIX: the day label used to be passed as the `notes` argument, so plans
    // had no real day structure and rendered as one long undivided list. Days are
    // now stored in day_label/day_index, and order_index restarts within each day.
    for (let dayIndex = 0; dayIndex < template.days.length; dayIndex++) {
      const day = template.days[dayIndex];
      const dayExercises = pickExercisesForDay(allExercises, day.focus, minutesPerDay, equipmentPref, focusAreas, usageHistory, allowedEquipment, excludedMuscles);
      // Group the day's exercises by muscle so each day reads muscle-by-muscle
      // (all chest work together, then shoulders, then triceps) instead of
      // jumping between muscle groups.
      const ordered = orderByMuscleGroup(dayExercises, day.focus);
      let orderIndex = 0;
      for (let i = 0; i < ordered.length; i++) {
        const ex = ordered[i];
        const extra = extraSetsForFocus(ex.primary_muscle, focusAreas);
        const { sets, reps, rest, setType } = setsRepsForPlanType(planType, i, ex.name, extra);
        const weightTarget = await suggestWeightForExercise(ex.id, reps);
        await addExerciseToPlan(
          planId,
          ex.id,
          sets,
          reps,
          weightTarget,
          rest,
          setType,
          null,
          '',
          orderIndex++,
          day.label,
          dayIndex,
        );
      }

      // Conditioning finisher: added per training day (not for pure mobility
      // days) when the body analysis flagged it as worth supporting a general
      // calorie deficit. This is *general* conditioning, not exercise aimed at
      // a specific body part — spot reduction isn't something training can do.
      // Only for longer sessions (>60min) — on a shorter session, every
      // minute is more valuable spent on strength work than on a cardio
      // finisher.
      if (shouldAddConditioningFinisher(suggestConditioning, minutesPerDay) && day.focus.some(f => f !== 'mobility')) {
        const pool = cardioOptions.length > 0 ? cardioOptions : fallbackCardio;
        if (pool.length > 0) {
          const finisher = pool[dayIndex % pool.length];
          await addExerciseToPlan(
            planId,
            finisher.id,
            1,
            '10-15 min',
            0,
            60,
            'normal',
            null,
            'Finisher de condicionamento geral',
            orderIndex++,
            day.label,
            dayIndex,
          );
        }
      }
    }
  });

  return planId;
}

/**
 * Generates a single day's workout right now, choosing which muscles to
 * train based on actual recent training history (see selectTodaysMuscles)
 * instead of a fixed weekly split — every session is naturally different
 * from the last, because whatever was just trained becomes the LEAST
 * overdue thing by the next time this runs. Still respects body-analysis
 * focus areas and the conditioning-finisher logic, same as generatePlan.
 *
 * Creates a small one-day plan (so the existing workout screen, rest
 * timers, and history all work completely unchanged) rather than
 * inventing a separate "session without a plan" concept.
 */
export async function generateTodaysWorkout(
  minutesAvailable: number,
  options?: {
    equipmentPref?: EquipmentPreference;
    bodyAnalysis?: BodyAnalysis | null;
  },
): Promise<number> {
  const allExercises = await getAllExercises();
  const usageHistory = await getExerciseUsageCounts();
  const muscleRecency = await getMuscleRecency();
  const equipmentPref = options?.equipmentPref ?? 'any';
  const focusAreas = options?.bodyAnalysis?.focusAreas ?? [];
  const suggestConditioning = options?.bodyAnalysis?.suggestConditioning ?? false;

  // Muscles with an active fatigue signal (see utils/fatigueSignals.ts)
  // get excluded from today's rotation — this is what turns the Fatigue
  // Radar from a screen you have to remember to check into something the
  // generator actually acts on by itself.
  const fatigueExerciseData = await getFatigueRadarExerciseData();
  const fatiguedMuscles = Array.from(new Set(
    fatigueExerciseData
      .filter(ex => detectPerformanceRegression(ex.points) !== null || detectRpeCreep(ex.rpeSets) !== null)
      .map(ex => ex.primaryMuscle as MuscleGroup)
  ));

  const muscleCount = muscleGroupCountForMinutes(minutesAvailable);
  const todaysMuscles = selectTodaysMuscles(
    muscleRecency.map(r => ({ muscle: r.muscle as MuscleGroup, daysSinceLastTrained: r.daysSinceLastTrained })),
    muscleCount,
    focusAreas,
    fatiguedMuscles,
  );

  const dateLabel = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(new Date());
  const muscleLabels = todaysMuscles.map(m => MUSCLE_GROUPS_PT[m] || m).join(', ');
  const planName = `Treino de Hoje — ${dateLabel}`;

  const cardioOptions = allExercises.filter(e => e.type === 'cardio' && e.equipment === 'bodyweight');
  const fallbackCardio = allExercises.filter(e => e.type === 'cardio');

  const db = await getDatabase();
  let planId!: number;

  await db.withTransactionAsync(async () => {
    planId = await createPlan(
      planName,
      `Gerado automaticamente com base no teu histórico recente. Foco de hoje: ${muscleLabels}.`,
      'hypertrophy',
      'custom',
      true,
    );

    const dayExercises = pickExercisesForDay(allExercises, todaysMuscles, minutesAvailable, equipmentPref, focusAreas, usageHistory);
    const ordered = orderByMuscleGroup(dayExercises, todaysMuscles);
    let orderIndex = 0;
    for (let i = 0; i < ordered.length; i++) {
      const ex = ordered[i];
      const extra = extraSetsForFocus(ex.primary_muscle, focusAreas);
      const { sets, reps, rest, setType } = setsRepsForPlanType('hypertrophy', i, ex.name, extra);
      const weightTarget = await suggestWeightForExercise(ex.id, reps);
      await addExerciseToPlan(planId, ex.id, sets, reps, weightTarget, rest, setType, null, '', orderIndex++, 'Hoje', 0);
    }

    // Same >60min gate as generatePlan — on a shorter session, every
    // minute is worth more spent on strength work than a cardio finisher.
    if (shouldAddConditioningFinisher(suggestConditioning, minutesAvailable)) {
      const pool = cardioOptions.length > 0 ? cardioOptions : fallbackCardio;
      if (pool.length > 0) {
        // Date-based rather than random — cycles through the pool day by
        // day (same reasoning as the motivational quote picker) instead of
        // an untestable random pick.
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        const finisher = pool[dayOfYear % pool.length];
        await addExerciseToPlan(planId, finisher.id, 1, '10-15 min', 0, 60, 'normal', null, 'Finisher de condicionamento geral', orderIndex++, 'Hoje', 0);
      }
    }
  });

  return planId;
}

/**
 * A single-day workout using only dumbbells and bodyweight/mat exercises —
 * for training at home with an inclined bench, a pair of dumbbells, and a
 * mat, rather than a full gym. Same one-day-plan shape as
 * generateTodaysWorkout (so the workout screen, rest timers and history all
 * work unchanged), but the muscle focus is chosen directly by the person
 * (not auto-picked from recency) and equipment is strictly home_dumbbell —
 * see matchesEquipment's home_dumbbell case, which never falls back to
 * gym-only equipment.
 */
export async function generateHomeWorkout(
  focusMuscles: MuscleGroup[],
  minutesAvailable: number,
  includeCardio: boolean,
): Promise<number> {
  const allExercises = await getAllExercises();
  const usageHistory = await getExerciseUsageCounts();

  const muscleLabels = focusMuscles.map(m => MUSCLE_GROUPS_PT[m] || m).join(', ');
  const dateLabel = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(new Date());
  const planName = `Treino em Casa — ${dateLabel}`;

  const db = await getDatabase();
  let planId!: number;

  await db.withTransactionAsync(async () => {
    planId = await createPlan(
      planName,
      `Só halteres, banco inclinado e tapete. Foco: ${muscleLabels}.`,
      'hypertrophy',
      'custom',
      true,
    );

    const dayExercises = pickExercisesForDay(allExercises, focusMuscles, minutesAvailable, 'home_dumbbell', [], usageHistory);
    const ordered = orderByMuscleGroup(dayExercises, focusMuscles);
    let orderIndex = 0;
    for (let i = 0; i < ordered.length; i++) {
      const ex = ordered[i];
      const { sets, reps, rest, setType } = setsRepsForPlanType('hypertrophy', i, ex.name);
      const weightTarget = await suggestWeightForExercise(ex.id, reps);
      await addExerciseToPlan(planId, ex.id, sets, reps, weightTarget, rest, setType, null, '', orderIndex++, 'Treino em Casa', 0);
    }

    if (includeCardio) {
      // Bodyweight only, same as the other generators' conditioning
      // finisher — no equipment needed, works in a living room.
      const cardioOptions = allExercises.filter(e => e.type === 'cardio' && e.equipment === 'bodyweight');
      if (cardioOptions.length > 0) {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        const finisher = cardioOptions[dayOfYear % cardioOptions.length];
        await addExerciseToPlan(planId, finisher.id, 1, '10-15 min', 0, 60, 'normal', null, 'Finisher de cardio', orderIndex++, 'Treino em Casa', 0);
      }
    }
  });

  return planId;
}

/**
 * Picks ONE more exercise for an already-generated "Treino de Hoje"
 * session — for when it runs longer than expected and there's real time
 * left over. Deepens whichever muscle ALREADY in today's session has the
 * fewest exercises so far (see pickMuscleNeedingMoreVolume), rather than
 * introducing a brand-new muscle group: a single extra exercise for a
 * muscle that wasn't part of the plan at all wouldn't be enough volume to
 * meaningfully train it, whereas one more exercise for a muscle already
 * being worked genuinely adds to that work.
 *
 * Deliberately doesn't write to plan_exercises — same as the existing
 * manual "Adicionar Exercício" flow in the active workout screen, adding
 * an exercise to a running session only touches the screen's own local
 * state; the actual save happens per-set, when each one is completed.
 *
 * pickExercisesForDay always returns at least 4 exercises (its own
 * internal minimum), which would be far too many for "just one more" — so
 * this only ever takes its FIRST (best-ranked) result rather than calling
 * it with some contrived tiny time budget to try to coax out fewer.
 */
export async function pickExtraExercise(
  currentExercises: { exerciseId: number; primaryMuscle: MuscleGroup }[],
  options?: {
    equipmentPref?: EquipmentPreference;
    bodyAnalysis?: BodyAnalysis | null;
  },
): Promise<Exercise | null> {
  const targetMuscle = pickMuscleNeedingMoreVolume(currentExercises.map(e => e.primaryMuscle));
  if (!targetMuscle) return null;

  const allExercises = await getAllExercises();
  const usageHistory = await getExerciseUsageCounts();
  const equipmentPref = options?.equipmentPref ?? 'any';
  const focusAreas = options?.bodyAnalysis?.focusAreas ?? [];

  // Exclude exercises already in today's session so the suggestion adds
  // genuine variety instead of just repeating one already there.
  const alreadyUsedIds = new Set(currentExercises.map(e => e.exerciseId));
  const pool = allExercises.filter(e => !alreadyUsedIds.has(e.id));

  // minutesAvailable=12 here isn't a real time budget — pickExercisesForDay
  // always returns 4+ candidates regardless (its own internal floor), this
  // just needs to be a plausible value; only the first (best-ranked)
  // result actually gets used.
  const candidates = pickExercisesForDay(pool, [targetMuscle], 12, equipmentPref, focusAreas, usageHistory);
  return candidates[0] ?? null;
}

/**
 * The day structure that will be generated for a given number of days per
 * week, so the UI can show the split (and the muscles each day trains) before
 * the user commits to generating the plan.
 */
export function getSplitDays(daysPerWeek: number): { label: string; focus: MuscleGroup[] }[] {
  const template = SPLIT_TEMPLATES[daysPerWeek] || SPLIT_TEMPLATES[3];
  return template.days.map(d => ({ label: d.label, focus: d.focus }));
}

export const AVAILABLE_DAYS = [1, 2, 3, 4, 5, 6];
export const AVAILABLE_DURATIONS = [30, 45, 60, 75, 90];
