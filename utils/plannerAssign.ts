import { getWeeklyPlanner, setPlannerDay, type PlannerEntry, type WeeklyPlanner } from '@/db/plannerDao';
import { getPlanDays } from '@/db/planDao';
import { distributeDaysAcrossWeek } from '@/utils/adaptiveService';

/**
 * Shared weekly-planner assignment helpers used by Hoje (start.tsx) and
 * Ver Plano (InteractivePlanAgenda). Persistence stays in plannerDao;
 * these wrap move/assign so screens don't reimplement the same SQLite calls.
 */

/**
 * If this plan has training days but no weekday slots, claim them the same
 * way startAdaptivePlan does. Existing users who turned the engine on
 * before planner auto-assign (or whose slots were cleared) otherwise see
 * every future day as "Descanso" on Ver o meu plano.
 */
export async function ensurePlannerForPlan(
  planId: number,
  now: Date = new Date(),
): Promise<WeeklyPlanner> {
  const current = await getWeeklyPlanner();
  if (Object.values(current).some(e => e?.planId === planId)) return current;
  const planDays = await getPlanDays(planId);
  if (planDays.length === 0) return current;
  const weekdays = distributeDaysAcrossWeek(planDays.length, now.getDay());
  for (let i = 0; i < planDays.length; i++) {
    await setPlannerDay(weekdays[i], { planId, dayIndex: planDays[i].day_index });
  }
  return getWeeklyPlanner();
}

/** Assign (or clear) a weekday slot in the weekly planner. */
export async function assignPlannerDay(
  weekday: number,
  entry: PlannerEntry | null,
): Promise<void> {
  await setPlannerDay(weekday, entry);
}

/**
 * Move an existing planner entry from one weekday to another.
 * Overwrites the target slot; clears the source. No-op if same weekday.
 */
export async function movePlannerEntry(
  fromWeekday: number,
  toWeekday: number,
  entry: PlannerEntry,
): Promise<WeeklyPlanner> {
  if (fromWeekday === toWeekday) {
    return { [fromWeekday]: entry };
  }
  await setPlannerDay(toWeekday, entry);
  await setPlannerDay(fromWeekday, null);
  return { [toWeekday]: entry };
}

/**
 * Move or swap weekday slots. Empty target → move; occupied → swap.
 * Used by drag-and-drop so dropping on a filled day exchanges them.
 */
export async function relocatePlannerEntry(
  fromWeekday: number,
  toWeekday: number,
  entry: PlannerEntry,
  targetEntry: PlannerEntry | null | undefined,
): Promise<void> {
  if (fromWeekday === toWeekday) return;
  if (targetEntry) {
    await setPlannerDay(toWeekday, entry);
    await setPlannerDay(fromWeekday, targetEntry);
    return;
  }
  await movePlannerEntry(fromWeekday, toWeekday, entry);
}

/** Pure preview of planner state after a move (for optimistic UI / tests). */
export function previewMovePlanner(
  planner: WeeklyPlanner,
  fromWeekday: number,
  toWeekday: number,
  entry: PlannerEntry,
): WeeklyPlanner {
  const next = { ...planner };
  if (fromWeekday !== toWeekday) delete next[fromWeekday];
  next[toWeekday] = entry;
  return next;
}

/** Pure preview after relocate (move or swap). */
export function previewRelocatePlanner(
  planner: WeeklyPlanner,
  fromWeekday: number,
  toWeekday: number,
  entry: PlannerEntry,
): WeeklyPlanner {
  if (fromWeekday === toWeekday) return planner;
  const next = { ...planner };
  const target = planner[toWeekday] ?? null;
  if (target) {
    next[toWeekday] = entry;
    next[fromWeekday] = target;
  } else {
    delete next[fromWeekday];
    next[toWeekday] = entry;
  }
  return next;
}
