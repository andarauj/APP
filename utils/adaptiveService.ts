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
} from '@/db/planDao';
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
