/**
 * Pure helpers for the unified Plans list — kept free of React so unit
 * tests can lock the empty-state / filter rules without mounting screens.
 */

export type PlansFilterTab = 'todos' | 'gerados' | 'manuais';

export function shouldShowPlansEmpty(
  manualGroupCount: number,
  hasActiveAdaptive: boolean
): boolean {
  return manualGroupCount === 0 && !hasActiveAdaptive;
}

export function filterPlanGroupsByTab<T extends { plans: { is_auto_generated: number }[] }>(
  groups: T[],
  tab: PlansFilterTab
): T[] {
  if (tab === 'gerados') {
    return groups.filter(g => g.plans.some(p => p.is_auto_generated === 1));
  }
  if (tab === 'manuais') {
    return groups.filter(g => g.plans.some(p => p.is_auto_generated === 0));
  }
  return groups;
}
