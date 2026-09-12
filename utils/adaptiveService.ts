/**
 * Adaptive engine — orchestration (see NSPI_ENGINE.md §4, §5, N4).
 *
 * The glue between the pure maths (nspi / adaptivePlan / adaptiveDecision /
 * adaptiveWeek), the adaptive_* tables (db/adaptiveDao), and the live plan
 * (plan_exercises). Two entry points:
 *
 *   - startAdaptivePlan  : turn periodization on for a plan — snapshot base
 *                          targets, open cycle 1, write the On-Ramp week,
 *                          push its targets onto the plan
 *   - closeWeekIfDue     : if the active week's window has elapsed, score it,
 *                          decide the next week, rewrite the plan targets, and
 *                          open the next week row. Idempotent — a second call
 *                          for the same transition is a no-op.
 *
 * closeWeekIfDue never throws: it is meant to run from a screen focus effect
 * on startup, and the app must survive a bad row or a locked DB.
 */

import { getDatabase } from '@/db/database';
import {
  getPlanExercisesWithDetails,
  updatePlanExercise,
  getPlanDays,
} from '@/db/planDao';
import { setPlannerDay, clearPlannerForPlan, getWeeklyPlanner } from '@/db/plannerDao';
import { getCompletedSessionCountForPlan } from '@/db/workoutDao';
import * as dao from '@/db/adaptiveDao';
import type { PlanExercise } from '@/types';
import {
  computeNspi,
  type AdaptiveGoal,
  type AdaptivePhase,
  type AdaptiveExperience,
  type NspiResult,
} from './nspi';
import {
  PHASE_LABEL_PT,
  phaseTargets,
  epley1RM,
  loadIncrement,
} from './adaptivePlan';
import {
  decideNextWeek,
  type AdaptiveDecision,
  type WeekSignal,
} from './adaptiveDecision';
import {
  assembleWeekSignal,
  weekWindow,
  weekIsOver,
  type WeekSetRow,
} from './adaptiveWeek';
import { mainPattern, movementBucket, type MovementBucketKey } from './movementClassify';

const DAY = 86400;
const nowS = () => Math.floor(Date.now() / 1000);

/** adaptive_plan.experience is stored as a plain TEXT column — normalize
 *  whatever's in there to one of the three known tiers, defensively
 *  falling back to the untouched baseline for anything unexpected. */
function normalizeExperience(raw: string | null | undefined): AdaptiveExperience {
  return raw === 'beginner' || raw === 'advanced' ? raw : 'intermediate';
}

// ---------------------------------------------------------------------------
// history helpers (read-only)
// ---------------------------------------------------------------------------

interface HistSet { weight: number; reps: number; name: string; primary_muscle: string }

/** Best estimated 1RM per main movement pattern over the last `days` — the
 *  starting baseline a new cycle is scored against. Empty for a fresh user. */
export async function computePatternBaseline(days = 120): Promise<Record<string, number>> {
  const db = await getDatabase();
  const since = nowS() - days * DAY;
  const rows = await db.getAllAsync<HistSet>(
    `SELECT ws.weight, ws.reps, e.name, e.primary_muscle
     FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.set_type != 'warmup' AND ws.reps >= 1 AND ws.completed_at >= ?`,
    [since],
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    const p = mainPattern(r.name, r.primary_muscle);
    if (!p) continue;
    const e = epley1RM(r.weight, r.reps);
    if (e > (out[p] ?? 0)) out[p] = e;
  }
  return out;
}

/** Best estimated 1RM for one exercise over the last `days` (0 if untrained). */
async function bestE1rmForExercise(exerciseId: number, days = 75): Promise<number> {
  const db = await getDatabase();
  const since = nowS() - days * DAY;
  const row = await db.getFirstAsync<{ weight: number; reps: number }>(
    `SELECT weight, reps FROM workout_sets
     WHERE exercise_id = ? AND set_type != 'warmup' AND reps >= 1 AND completed_at >= ?
     ORDER BY (weight * (1.0 + reps / 30.0)) DESC LIMIT 1`,
    [exerciseId, since],
  );
  return row ? epley1RM(row.weight, row.reps) : 0;
}

async function fetchWeekSets(weekStart: number, weekEnd: number): Promise<WeekSetRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    exercise_id: number; name: string; primary_muscle: string; equipment: string;
    weight: number; reps: number; rpe: number | null; set_type: string;
  }>(
    `SELECT ws.exercise_id, e.name, e.primary_muscle, e.equipment,
            ws.weight, ws.reps, ws.rpe, ws.set_type
     FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.completed_at >= ? AND ws.completed_at < ?`,
    [weekStart, weekEnd],
  );
  return rows.map(r => ({
    exerciseId: r.exercise_id,
    name: r.name,
    primaryMuscle: r.primary_muscle,
    equipment: r.equipment,
    weight: r.weight,
    reps: r.reps,
    rpe: r.rpe,
    setType: r.set_type,
  }));
}

// ---------------------------------------------------------------------------
// plan mutation (no transaction of its own — the caller owns one)
// ---------------------------------------------------------------------------

export interface WeeklyRecap {
  phaseFrom: AdaptivePhase;
  phaseTo: AdaptivePhase;
  decision: AdaptiveDecision | 'start';
  changed: string[];
  why: string[];
  expect: string;
  nspi: { score: number; load: number; volume: number; balance: number; trend: NspiResult['trend'] } | null;
}

interface AppliedSnapshot {
  phase: AdaptivePhase;
  goal: AdaptiveGoal;
  appliedAt: number;
  setsPlanned: number;
  bucketTargets: Partial<Record<MovementBucketKey, number>>;
  exercises: { exerciseId: number; sets: number; reps: string; weight: number }[];
}

interface ApplyResult {
  changed: string[];
  snapshot: AppliedSnapshot;
}

/**
 * Rewrite every plan_exercises row (sets / reps / weight) to the targets for
 * `phase`, and roll adaptive_exercise_state forward. Exercises and day order
 * are never touched — periodization adjusts the numbers, not the plan itself.
 */
async function applyPhaseToPlan(
  adaptivePlanId: number,
  planId: number,
  phase: AdaptivePhase,
  goal: AdaptiveGoal,
  experience: AdaptiveExperience,
  opts: { seedBaseSets?: boolean } = {},
): Promise<ApplyResult> {
  const exs = await getPlanExercisesWithDetails(planId);
  const states = await dao.getExerciseStates(adaptivePlanId);
  const stateByEx = new Map(states.map(s => [s.exercise_id, s]));

  let setsBefore = 0;
  let setsAfter = 0;
  let weightUps = 0;
  let weightDowns = 0;
  let repWindow: string | null = null;

  const snapshotExercises: AppliedSnapshot['exercises'] = [];
  const bucketTargets: Partial<Record<MovementBucketKey, number>> = {};

  for (const pe of exs) {
    const state = stateByEx.get(pe.exercise_id);
    const baseSets = opts.seedBaseSets || !state ? pe.sets : state.base_sets;
    const prevWeight = state?.current_weight ?? pe.weight_target ?? 0;
    const stall = state?.step_stall_count ?? 0;
    const increment = loadIncrement(pe.equipment ?? '');

    let e1rm = await bestE1rmForExercise(pe.exercise_id);
    if (e1rm <= 0 && prevWeight > 0) e1rm = epley1RM(prevWeight, 8); // rough fallback

    const t = phaseTargets(phase, goal, baseSets, e1rm, stall, increment, experience);
    const newWeight = t.targetWeight > 0 ? t.targetWeight : (pe.weight_target || prevWeight || 0);
    const newReps = `${t.repLow}-${t.repHigh}`;
    const newSets = t.targetSets;

    setsBefore += pe.sets;
    setsAfter += newSets;
    if (newWeight > prevWeight + 0.01) weightUps++;
    else if (newWeight < prevWeight - 0.01) weightDowns++;
    repWindow = newReps;

    const updated: PlanExercise = {
      id: pe.id,
      plan_id: pe.plan_id,
      exercise_id: pe.exercise_id,
      order_index: pe.order_index,
      sets: newSets,
      reps_target: newReps,
      weight_target: Math.round(newWeight * 100) / 100,
      rest_seconds: pe.rest_seconds,
      set_type: pe.set_type,
      superset_group: pe.superset_group,
      day_label: pe.day_label ?? '',
      day_index: pe.day_index ?? 0,
      tempo: pe.tempo ?? '',
      notes: pe.notes ?? '',
    };
    await updatePlanExercise(updated);

    const progressed = newWeight > prevWeight + 0.01;
    const newStall = progressed ? 0 : (t.targetWeight > 0 ? stall + 1 : stall);
    await dao.upsertExerciseState(adaptivePlanId, pe.exercise_id, {
      baseSets,
      currentWeight: updated.weight_target,
      repsLow: t.repLow,
      repsHigh: t.repHigh,
      stallCount: newStall,
      lastProgressedAt: progressed ? nowS() : (state?.last_progressed_at ?? null),
    });

    snapshotExercises.push({ exerciseId: pe.exercise_id, sets: newSets, reps: newReps, weight: updated.weight_target });
    const bucket = movementBucket(pe.exercise_name ?? '', pe.primary_muscle ?? '', pe.equipment ?? '');
    if (bucket) bucketTargets[bucket] = (bucketTargets[bucket] ?? 0) + newSets;
  }

  const changed: string[] = [];
  const setDelta = setsAfter - setsBefore;
  if (setDelta > 0) changed.push(`Volume: +${setDelta} séries no total (fase ${PHASE_LABEL_PT[phase]}).`);
  else if (setDelta < 0) changed.push(`Volume: ${setDelta} séries no total (fase ${PHASE_LABEL_PT[phase]}).`);
  if (weightUps > 0) changed.push(`Peso alvo mais alto em ${weightUps} exercício${weightUps > 1 ? 's' : ''}.`);
  if (weightDowns > 0) changed.push(`Peso alvo reduzido em ${weightDowns} exercício${weightDowns > 1 ? 's' : ''}.`);
  if (repWindow) changed.push(`Janela de reps desta fase: ${repWindow.replace('-', '–')}.`);
  if (changed.length === 0) changed.push('Alvos mantidos — mesma fase, mesma carga.');

  return {
    changed,
    snapshot: {
      phase,
      goal,
      appliedAt: nowS(),
      setsPlanned: setsAfter,
      bucketTargets,
      exercises: snapshotExercises,
    },
  };
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

export interface StartAdaptiveOptions {
  planId: number;
  goal: AdaptiveGoal;
  experience: string;
  daysPerWeek: number;
  sessionMinutes: number;
  equipmentPref: string;
  weekStartDow: number;
  now?: Date;
}

export interface StartAdaptiveResult {
  adaptivePlanId: number;
  cycleId: number;
  weekId: number;
  recap: WeeklyRecap;
}

/**
 * Spreads a plan's training days evenly across the week starting TODAY, e.g.
 * 3 days from a Thursday start lands on Thu/Sat/Mon, 2 days on Thu/Sun, 6 on
 * Thu-Tue with Wed as the lone rest day — floor(i*7/daysCount) is the
 * standard even-spacing formula. Weekday indices follow the app's existing
 * 0=Sun..6=Sat convention (see WEEKDAY_LABELS in utils/reminders.ts and
 * db/plannerDao.ts).
 *
 * BUGFIX: this used to anchor on weekStartDow (the "which day does your
 * training week start" answer, e.g. Monday) instead of today. weekStartDow
 * is a real, separate concept — it still anchors the NSPI cycle's own
 * scoring window (see weekWindow/startOfAdaptiveWeek in adaptiveWeek.ts) —
 * but using it here too meant a plan started on, say, a Thursday with a
 * Monday-anchored 3-day split (Mon/Wed/Fri) had already missed two of this
 * week's three active days, leaving the very first actually-reachable
 * session up to 4 days away. Anchoring on today instead guarantees the
 * offset-0 day is always today, so the cycle's first session is today (if
 * today is meant to be a training day at all) or the soonest day after —
 * never a day that's already passed this week.
 */
export function distributeDaysAcrossWeek(daysCount: number, todayDow: number): number[] {
  if (daysCount <= 0) return [];
  const n = Math.min(daysCount, 7);
  return Array.from({ length: n }, (_, i) => (todayDow + Math.floor((i * 7) / n)) % 7);
}

// ---------------------------------------------------------------------------
// rolling workouts (zero treinos perdidos)
// ---------------------------------------------------------------------------

export interface RollingScheduleEntry {
  weekday: number;   // 0=Sun..6=Sat
  dayIndex: number;  // which plan_exercises day_index this weekday shows
  isBacklog: boolean; // true only for today, and only when it's standing in for a missed earlier day
  /** True only for a day strictly before today whose native slot was never
   *  actually completed — see computeRollingSchedule's past-day comment.
   *  Always false for today/backlog/upcoming entries. A caller rendering a
   *  weekly grid should not show this day's dayIndex as if it happened. */
  isSkipped: boolean;
}

/**
 * Pure core of "rolling workouts". The weekly planner is a fixed recurring
 * template (Mon→Push, Wed→Pull, ...) with no idea whether any session ever
 * actually happened — so today just showed whatever weekday it is,
 * regardless of whether an earlier day in the sequence got skipped. This
 * recomputes what today (and the rest of the week) should show once actual
 * completions are taken into account, without needing a new "pending
 * session" table: it only needs how many of this plan's sessions have
 * completed since the week started, and treats that count as "how far
 * through the day-sequence the person really is."
 *
 * Days strictly before today keep their native dayIndex — this doesn't
 * rewrite history, only what's still ahead — but each is also marked
 * `isSkipped` when it falls beyond how many sessions actually completed
 * this week (BUGFIX, reported: with 0 sessions done all week, the weekly
 * grid still showed Mon–Fri's native plan names as if those workouts had
 * happened, when in fact none had and the very first one had rolled all the
 * way to today). Completions are assumed to consume past native slots in
 * chronological order — the same assumption the forward cascade already
 * relies on — so slot index `i` (0 = the earliest past native day) is
 * `isSkipped: i >= completedCount`: the first `completedCount` past slots
 * are treated as done, everything past that was never trained.
 *
 * From today onward, slot k (0 = today, 1 = the next scheduled day after
 * today, ...) shows day-sequence position `completedCount + k`, cycling
 * through the plan's days with `% planDayIndices.length`.
 *
 * BUGFIX (reported with an exact worked example: Peito→Costas→Pernas→
 * Ombros, Peito still pending, yet a later calendar day showed "Costas" as
 * if it had already happened): the cascade used to only ever force ONE
 * catch-up day — today — then resume on the plan's next NATIVE day,
 * silently treating any non-native day in between as a normal rest day even
 * while still behind. That let a person who missed an entire week "skip
 * over" the backlog on their rest days instead of catching up on them,
 * breaking strict sequence order ($S_m$ with $m \ge k$ could appear before
 * $S_k$ was ever done). The debt — how many native slots have already
 * elapsed before today with nothing completed for them — is now paid down
 * one session per calendar day, native or not, starting from today, until
 * it reaches zero; only once caught up does a non-native day return to
 * being a genuine rest day and the cascade resume its native-only pace. So
 * with 0 sessions done on a Mon–Fri plan and today Saturday: Saturday = the
 * oldest missed session, Sunday = the next one in sequence (even though
 * Sunday was never native), then Monday resumes normally.
 */
export function computeRollingSchedule(
  scheduledWeekdays: number[],
  planDayIndices: number[],
  completedCount: number,
  today: number,
  weekStartDow: number,
): RollingScheduleEntry[] {
  const D = planDayIndices.length;
  if (D === 0) return [];
  const offset = (wd: number) => (wd - weekStartDow + 7) % 7;
  const todayOffset = offset(today);
  const nativeSet = new Set(scheduledWeekdays);
  const sorted = [...nativeSet].sort((a, b) => offset(a) - offset(b));

  const past = sorted.filter(wd => offset(wd) < todayOffset);
  const elapsedBeforeToday = past.length;

  const result: RollingScheduleEntry[] = past.map((wd, i) => ({
    weekday: wd,
    dayIndex: planDayIndices[i % D],
    isBacklog: false,
    isSkipped: i >= completedCount,
  }));

  // How many sessions behind as of today. Each calendar day from today
  // onward — whether native or not — pays down one unit of this debt; a
  // day only reverts to being a genuine rest day once it's fully paid off.
  let debt = Math.max(0, elapsedBeforeToday - completedCount);
  let k = completedCount;

  for (let off = todayOffset; off <= 6; off++) {
    const wd = (weekStartDow + off) % 7;
    const isNative = nativeSet.has(wd);
    if (wd === today) {
      // "isBacklog" stays scoped to today only (see the interface's own
      // doc comment) — it marks "this is standing in for a missed day",
      // which is only meaningful for the one day the person can act on
      // right now. A later catch-up day hasn't arrived yet, so it isn't
      // "late" — it's just next in an accelerated sequence.
      if (debt > 0 || isNative) {
        result.push({ weekday: wd, dayIndex: planDayIndices[k % D], isBacklog: debt > 0, isSkipped: false });
        k += 1;
        if (debt > 0) debt -= 1;
      }
      continue;
    }
    if (debt > 0) {
      result.push({ weekday: wd, dayIndex: planDayIndices[k % D], isBacklog: false, isSkipped: false });
      k += 1;
      debt -= 1;
    } else if (isNative) {
      result.push({ weekday: wd, dayIndex: planDayIndices[k % D], isBacklog: false, isSkipped: false });
      k += 1;
    }
    // else: debt is paid off and this day was never native — a genuine
    // rest day, no entry.
  }

  return result;
}

/**
 * Weekdays, within the current rolling week, that fall strictly before
 * today but aren't part of this plan's own scheduledWeekdays.
 *
 * BUGFIX: computeRollingSchedule only ever returns entries for days IT
 * knows about — this plan's own native days, plus whatever today's forced
 * catch-up covers. A weekday outside that set simply isn't in its result,
 * which is correct for computeRollingSchedule itself. But the weekly grid
 * (app/(tabs)/start.tsx's effectivePlanner) used to fill that gap by
 * falling back to whatever the RAW weekly planner separately had on that
 * day — which can be a stale or manually-assigned different plan's entry
 * left over from before this one became active. For a day still in the
 * future that's harmless (mixing plans across days is a supported, manual
 * feature). For a day in the PAST, once this plan is actively tracking a
 * rolling schedule, showing that stale entry reads as "a workout happened
 * here" when this plan's own sequence has nothing to say about that day at
 * all — exactly the confusion "isSkipped" exists to prevent, just for a
 * day the plan was never even scheduled on. Callers should treat every
 * weekday this returns as unassigned, not fall back to raw planner data.
 */
export function pastWeekdaysWithoutTracking(
  scheduledWeekdays: number[],
  today: number,
  weekStartDow: number,
): number[] {
  const offset = (wd: number) => (wd - weekStartDow + 7) % 7;
  const todayOffset = offset(today);
  const scheduled = new Set(scheduledWeekdays);
  const result: number[] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (offset(wd) < todayOffset && !scheduled.has(wd)) result.push(wd);
  }
  return result;
}

/**
 * DB-orchestrating wrapper: reads this plan's current weekly assignment,
 * its distinct days, and how many of its sessions have completed since the
 * adaptive week started, then applies computeRollingSchedule. Returns null
 * when the plan has no days yet (nothing to roll) rather than an empty
 * schedule, so callers can tell "no plan" apart from "plan not scheduled
 * on any day this week".
 */
export async function getRollingScheduleForPlan(
  planId: number,
  weekStartDow: number,
  now: Date = new Date(),
): Promise<RollingScheduleEntry[] | null> {
  const [planner, planDays] = await Promise.all([getWeeklyPlanner(), getPlanDays(planId)]);
  if (planDays.length === 0) return null;

  const scheduledWeekdays = Object.entries(planner)
    .filter(([, entry]) => entry?.planId === planId)
    .map(([weekday]) => Number(weekday));
  if (scheduledWeekdays.length === 0) return null;

  const { start } = weekWindow(now, weekStartDow, 0);
  const completedCount = await getCompletedSessionCountForPlan(planId, start);
  const planDayIndices = planDays.map(d => d.day_index);

  return computeRollingSchedule(scheduledWeekdays, planDayIndices, completedCount, now.getDay(), weekStartDow);
}

/** Map the onboarding goal keys to the four adaptive goals. */
export function goalFromOnboarding(key: string): AdaptiveGoal {
  switch (key) {
    case 'strength': return 'strength';
    case 'muscle': return 'bulking';
    case 'fatloss': return 'cutting';
    default: return 'general';
  }
}

export async function startAdaptivePlan(opts: StartAdaptiveOptions): Promise<StartAdaptiveResult> {
  const now = opts.now ?? new Date();
  const db = await getDatabase();

  // Whatever plan the outgoing adaptive cycle was running on — needed below
  // to clear ITS weekday slots out of the planner. Read before
  // deactivateAllAdaptivePlans() makes it unreachable as "the active one".
  const previousActive = await dao.getActiveAdaptivePlan();

  await dao.deactivateAllAdaptivePlans();
  const adaptivePlanId = await dao.createAdaptivePlan({
    planId: opts.planId,
    goal: opts.goal,
    experience: opts.experience,
    daysPerWeek: opts.daysPerWeek,
    sessionMinutes: opts.sessionMinutes,
    equipmentPref: opts.equipmentPref,
    weekStartDow: opts.weekStartDow,
  });

  const baseline = await computePatternBaseline();
  const cycleId = await dao.createCycle(adaptivePlanId, 1, baseline);

  const win = weekWindow(now, opts.weekStartDow, 0);

  let applied!: ApplyResult;
  let weekId!: number;
  let recap!: WeeklyRecap;
  await db.withTransactionAsync(async () => {
    applied = await applyPhaseToPlan(adaptivePlanId, opts.planId, 'on_ramp', opts.goal, normalizeExperience(opts.experience), { seedBaseSets: true });
    recap = {
      phaseFrom: 'on_ramp',
      phaseTo: 'on_ramp',
      decision: 'start',
      changed: applied.changed,
      why: ['Plano adaptativo ligado — começamos numa semana de adaptação para reencontrar as cargas.'],
      expect: 'Semana de adaptação: reps altas, RPE 6–7, técnica antes de carga.',
      nspi: null,
    };
    weekId = await dao.insertWeek({
      cycleId,
      weekIndex: 1,
      phase: 'on_ramp',
      isBridge: false,
      planned: applied.snapshot,
      weekStart: win.start,
      weekEnd: win.end,
      recap,
    });
  });

  // Without this, "Plano Adaptativo" generated a real plan but left the
  // weekly planner (PLANEADOR SEMANAL) untouched — the person had to know to
  // go assign each day by hand before the app would ever show them "Treino
  // de hoje". Claiming the plan's own days here is what makes turning on
  // periodization actually produce a schedule, not just a plan sitting
  // unassigned.
  //
  // BUGFIX: switching from one adaptive plan to another (e.g. via "Criar
  // plano novo") only ever wrote the NEW plan's days, never removed the
  // OUTGOING plan's — a weekday the old distribution touched but the new one
  // doesn't kept showing that stale plan/day, no longer backed by any active
  // cycle. Clearing the previous plan's slots first (only when it's actually
  // a different plan — reapplying periodization to the same plan shouldn't
  // wipe anything) keeps the grid showing only what's real right now.
  if (previousActive && previousActive.plan_id !== opts.planId) {
    await clearPlannerForPlan(previousActive.plan_id);
  }
  const planDays = await getPlanDays(opts.planId);
  const weekdays = distributeDaysAcrossWeek(planDays.length, now.getDay());
  for (let i = 0; i < planDays.length; i++) {
    await setPlannerDay(weekdays[i], { planId: opts.planId, dayIndex: planDays[i].day_index });
  }

  return { adaptivePlanId, cycleId, weekId, recap };
}

// ---------------------------------------------------------------------------
// weekly close
// ---------------------------------------------------------------------------

export interface CloseWeekResult {
  closedWeekId: number;
  newWeekId: number;
  decision: AdaptiveDecision;
  phaseFrom: AdaptivePhase;
  phaseTo: AdaptivePhase;
  cycleWrapped: boolean;
  nspi: NspiResult;
  recap: WeeklyRecap;
}

function rowToWeekSignal(r: dao.AdaptiveWeekRow): WeekSignal {
  return {
    phase: r.phase,
    nspiLoad: r.nspi_load ?? 50,
    nspiVolume: r.nspi_volume ?? 0,
    nspiBalance: r.nspi_balance ?? 0,
    avgRpe: null,
    minBucketRatio: 1,
    isBridge: !!r.is_bridge,
  };
}

function parsePlanned(json: string): Partial<AppliedSnapshot> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/**
 * If the active week's window has fully elapsed, close it (score + decide) and
 * open the next week with rewritten plan targets. Returns null when nothing is
 * due, when there is no active adaptive plan, or on any error.
 */
export async function closeWeekIfDue(now: Date = new Date()): Promise<CloseWeekResult | null> {
  try {
    const plan = await dao.getActiveAdaptivePlan();
    if (!plan) return null;

    const cycle = await dao.getOpenCycle(plan.id);
    if (!cycle) return null;

    const activeWeek = await dao.getActiveWeek(cycle.id);
    if (!activeWeek) return null;

    if (!weekIsOver(activeWeek.week_end, now)) return null;

    const nextStart = activeWeek.week_end;
    if (await dao.planWeekExistsForStart(plan.id, nextStart)) return null; // already transitioned

    const goal = plan.goal;
    const experience = normalizeExperience(plan.experience);
    const planned = parsePlanned(activeWeek.planned_json);
    const baseline = dao.parseBaseline(cycle);

    const weekSets = await fetchWeekSets(activeWeek.week_start, activeWeek.week_end);

    const recentRows = await dao.getRecentWeeksForPlan(plan.id, 5);
    const doneRows = recentRows.filter(r => r.status === 'done' && r.id !== activeWeek.id);
    const previousScores = doneRows.map(r => r.nspi_score ?? 0);

    let setsPlanned = planned.setsPlanned ?? 0;
    if (!setsPlanned) {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ s: number }>(
        'SELECT COALESCE(SUM(sets),0) as s FROM plan_exercises WHERE plan_id = ?',
        [plan.plan_id],
      );
      setsPlanned = row?.s ?? 0;
    }

    const assembled = assembleWeekSignal({
      phase: activeWeek.phase,
      goal,
      isBridge: !!activeWeek.is_bridge,
      sets: weekSets,
      setsPlanned,
      baseline,
      bucketTargets: planned.bucketTargets,
      previousScores,
    });

    const states = await dao.getExerciseStates(plan.id);
    const stallCount = states.length ? Math.max(0, ...states.map(s => s.step_stall_count)) : 0;

    const decision = decideNextWeek({
      current: assembled.weekSignal,
      recent: doneRows.map(rowToWeekSignal),
      goal,
      stallCount,
      fatigueFlag: false,
      experience,
    });

    const db = await getDatabase();
    let applied!: ApplyResult;
    let newWeekId!: number;
    let cycleWrapped = false;

    await db.withTransactionAsync(async () => {
      // 1. rewrite the plan for the next phase
      applied = await applyPhaseToPlan(plan.id, plan.plan_id, decision.nextPhase, goal, experience);

      // 2. cycle bookkeeping
      let targetCycleId = cycle.id;
      let nextWeekIndex = activeWeek.week_index + 1;
      if (decision.wrapsCycle) {
        cycleWrapped = true;
        await dao.endCycle(cycle.id, nextStart);
        const mergedBaseline: Record<string, number> = { ...baseline };
        for (const [p, v] of Object.entries(assembled.patternE1rm)) {
          if (v > (mergedBaseline[p] ?? 0)) mergedBaseline[p] = v;
        }
        targetCycleId = await dao.createCycle(plan.id, cycle.cycle_index + 1, mergedBaseline);
        nextWeekIndex = 1;
      }

      // 3. build + store the recap on the week we're closing
      const recap: WeeklyRecap = {
        phaseFrom: activeWeek.phase,
        phaseTo: decision.nextPhase,
        decision: decision.decision,
        changed: applied.changed,
        why: decision.reasons,
        expect: decision.expect,
        nspi: {
          score: assembled.nspi.score,
          load: assembled.nspi.load,
          volume: assembled.nspi.volume,
          balance: assembled.nspi.balance,
          trend: assembled.nspi.trend,
        },
      };
      await dao.closeWeekRow(activeWeek.id, {
        nspiLoad: assembled.nspi.load,
        nspiVolume: assembled.nspi.volume,
        nspiBalance: assembled.nspi.balance,
        nspiScore: assembled.nspi.score,
        decision: decision.decision,
        recap,
      });

      // 4. open the next week
      newWeekId = await dao.insertWeek({
        cycleId: targetCycleId,
        weekIndex: nextWeekIndex,
        phase: decision.nextPhase,
        isBridge: decision.decision === 'bridge',
        planned: applied.snapshot,
        weekStart: nextStart,
        weekEnd: nextStart + 7 * DAY,
      });
    });

    const recap: WeeklyRecap = {
      phaseFrom: activeWeek.phase,
      phaseTo: decision.nextPhase,
      decision: decision.decision,
      changed: applied.changed,
      why: decision.reasons,
      expect: decision.expect,
      nspi: {
        score: assembled.nspi.score,
        load: assembled.nspi.load,
        volume: assembled.nspi.volume,
        balance: assembled.nspi.balance,
        trend: assembled.nspi.trend,
      },
    };

    return {
      closedWeekId: activeWeek.id,
      newWeekId,
      decision: decision.decision,
      phaseFrom: activeWeek.phase,
      phaseTo: decision.nextPhase,
      cycleWrapped,
      nspi: assembled.nspi,
      recap,
    };
  } catch (err) {
    console.warn('[adaptive] closeWeekIfDue failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// read model for the UI (N5)
// ---------------------------------------------------------------------------

export interface AdaptiveStatus {
  /** utils/adaptiveDao adaptive_plan.id — for exercise-state lookups. */
  adaptivePlanId: number;
  /** The underlying workout_plans.id this periodization is applied to. */
  planId: number;
  active: boolean;
  goal: AdaptiveGoal;
  experience: AdaptiveExperience;
  cycleIndex: number;
  weekIndex: number;
  phase: AdaptivePhase;
  isBridge: boolean;
  weekStart: number;
  weekEnd: number;
  latestRecap: WeeklyRecap | null;
  latestNspi: NspiResult | null;
}

/** Everything the phase badge / NSPI card / recap banner need in one call. */
export async function getAdaptiveStatus(): Promise<AdaptiveStatus | null> {
  try {
    const plan = await dao.getActiveAdaptivePlan();
    if (!plan) return null;
    const cycle = await dao.getOpenCycle(plan.id) ?? await dao.getLatestCycle(plan.id);
    if (!cycle) return null;
    const week = (await dao.getActiveWeek(cycle.id)) ?? (await dao.getLatestWeekForPlan(plan.id));
    if (!week) return null;

    const recapRow = await dao.getLatestRecapWeek(plan.id);
    let latestRecap: WeeklyRecap | null = null;
    let latestNspi: NspiResult | null = null;
    if (recapRow?.recap_json) {
      try { latestRecap = JSON.parse(recapRow.recap_json) as WeeklyRecap; } catch { latestRecap = null; }
    }
    const scoredRow = recapRow && recapRow.nspi_score != null ? recapRow : null;
    if (scoredRow) {
      latestNspi = computeNspi({
        phase: scoredRow.phase,
        goal: plan.goal,
        load: [],
        effectiveSetsDone: 0,
        setsPlanned: 0,
        movement: [],
      });
      // The stored axes are the source of truth; recompute only fills the shape.
      latestNspi = {
        ...latestNspi,
        score: scoredRow.nspi_score ?? latestNspi.score,
        load: scoredRow.nspi_load ?? latestNspi.load,
        volume: scoredRow.nspi_volume ?? latestNspi.volume,
        balance: scoredRow.nspi_balance ?? latestNspi.balance,
        trend: latestRecap?.nspi?.trend ?? null,
      };
    }

    return {
      adaptivePlanId: plan.id,
      planId: plan.plan_id,
      active: plan.active === 1,
      goal: plan.goal,
      experience: normalizeExperience(plan.experience),
      cycleIndex: cycle.cycle_index,
      weekIndex: week.week_index,
      phase: week.phase,
      isBridge: !!week.is_bridge,
      weekStart: week.week_start,
      weekEnd: week.week_end,
      latestRecap,
      latestNspi,
    };
  } catch (err) {
    console.warn('[adaptive] getAdaptiveStatus failed:', err);
    return null;
  }
}
