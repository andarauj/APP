/**
 * Single read-model for "what is scheduled on weekday W".
 *
 * weeklyPlanner is the user's recurring intent. The adaptive rolling
 * schedule is a derived overlay for the current week (never persisted).
 * Hoje, the Progresso hero, the commitment strip, and the plan agenda
 * all go through these helpers so they cannot disagree.
 */

import type { PlannerEntry, WeeklyPlanner } from '@/db/plannerDao';
import { pastWeekdaysWithoutTracking } from './adaptiveService';

export interface RollingLike {
  weekday: number;
  dayIndex: number;
  isBacklog?: boolean;
  isSkipped?: boolean;
}

export interface ResolvedScheduleDay {
  entry: PlannerEntry | null;
  isBacklog: boolean;
  isSkipped: boolean;
}

/**
 * Same merge start.tsx used to inline: rolling dayIndex wins for the
 * active adaptive plan, then past weekdays this plan never tracked are
 * dropped so a stale other-plan slot cannot look like a completed day.
 */
export function buildEffectivePlanner(
  planner: WeeklyPlanner,
  rolling: RollingLike[] | null | undefined,
  adaptivePlanId: number | null | undefined,
  today: number,
  weekStartDow: number,
): WeeklyPlanner {
  if (!adaptivePlanId || !rolling || rolling.length === 0) return planner;
  const merged: WeeklyPlanner = { ...planner };
  for (const entry of rolling) {
    merged[entry.weekday] = { planId: adaptivePlanId, dayIndex: entry.dayIndex };
  }
  const scheduledWeekdays = Object.entries(planner)
    .filter(([, entry]) => entry?.planId === adaptivePlanId)
    .map(([wd]) => Number(wd));
  for (const wd of pastWeekdaysWithoutTracking(scheduledWeekdays, today, weekStartDow)) {
    delete merged[wd];
  }
  return merged;
}

export function resolveDaySlot(
  weekday: number,
  planner: WeeklyPlanner,
  rolling?: RollingLike[] | null,
): ResolvedScheduleDay {
  const roll = rolling?.find(r => r.weekday === weekday);
  return {
    entry: planner[weekday] ?? null,
    isBacklog: roll?.isBacklog ?? false,
    isSkipped: roll?.isSkipped ?? false,
  };
}

/** Today's slot after the same merge Hoje and the Progresso hero share. */
export function resolveTodaySlot(
  planner: WeeklyPlanner,
  rolling: RollingLike[] | null | undefined,
  adaptivePlanId: number | null | undefined,
  today: number,
  weekStartDow: number,
): ResolvedScheduleDay {
  const effective = buildEffectivePlanner(planner, rolling, adaptivePlanId, today, weekStartDow);
  return resolveDaySlot(today, effective, rolling);
}

export function weekdayByDayIndexFromPlanner(
  planner: WeeklyPlanner,
  planId: number,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [wd, entry] of Object.entries(planner)) {
    if (entry && Number(entry.planId) === Number(planId)) {
      out[entry.dayIndex] = Number(wd);
    }
  }
  return out;
}
