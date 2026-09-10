import type { WorkoutPlan } from '@/types';

export interface PlanGroup {
  name: string;
  plans: WorkoutPlan[];
}

/**
 * Groups plans by exact name, preserving the order names first appear in
 * (matches how they arrive — most-recently-updated first, per
 * getAllPlans's own ORDER BY). A person who recreates or iterates on a
 * plan with the same name (e.g. rebuilding "Peito" after changing it up)
 * sees ONE card for "Peito" in the list, not one per version — tapping it
 * is what surfaces the individual versions to pick from.
 */
export function groupPlansByName(plans: WorkoutPlan[]): PlanGroup[] {
  const groups = new Map<string, WorkoutPlan[]>();
  const order: string[] = [];

  for (const plan of plans) {
    if (!groups.has(plan.name)) {
      groups.set(plan.name, []);
      order.push(plan.name);
    }
    groups.get(plan.name)!.push(plan);
  }

  return order.map(name => ({ name, plans: groups.get(name)! }));
}
