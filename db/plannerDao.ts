import { getSetting, setSetting } from './settingsDao';

export interface PlannerEntry {
  planId: number;
  dayIndex: number;
}

export type WeeklyPlanner = Record<number, PlannerEntry | undefined>; // 0=Dom..6=Sab

const KEY = 'weeklyPlanner';

/**
 * A weekly training schedule — "Monday: Push, Wednesday: Pull..." — inspired
 * by EvolveYou's weekly planner. Stored as a single JSON blob in settings
 * (small, always-together data), keyed by weekday 0=Sunday..6=Saturday to
 * match the convention already used by the workout reminders.
 */
export async function getWeeklyPlanner(): Promise<WeeklyPlanner> {
  const raw = await getSetting(KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const result: WeeklyPlanner = {};
    for (const [day, entry] of Object.entries(parsed)) {
      const d = Number(day);
      if (d >= 0 && d <= 6 && entry && typeof entry === 'object') {
        const e = entry as any;
        if (typeof e.planId === 'number' && typeof e.dayIndex === 'number') {
          result[d] = { planId: e.planId, dayIndex: e.dayIndex };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function setPlannerDay(weekday: number, entry: PlannerEntry | null): Promise<void> {
  const current = await getWeeklyPlanner();
  if (entry) {
    current[weekday] = entry;
  } else {
    delete current[weekday];
  }
  await setSetting(KEY, JSON.stringify(current));
}

/** Clears any planner days pointing at a plan (called when a plan is deleted). */
export async function clearPlannerForPlan(planId: number): Promise<void> {
  const current = await getWeeklyPlanner();
  let changed = false;
  for (const day of Object.keys(current)) {
    if (current[Number(day)]?.planId === planId) {
      delete current[Number(day)];
      changed = true;
    }
  }
  if (changed) await setSetting(KEY, JSON.stringify(current));
}
