import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { getAllPlans, deletePlan, duplicatePlan, getPlanDayCounts, filterUserSelectablePlans } from '@/db/planDao';
import { clearPlannerForPlan } from '@/db/plannerDao';
import { hapticWarning } from '@/utils/haptics';
import { groupPlansByName, type PlanGroup } from '@/utils/planGrouping';
import type { WorkoutPlan } from '@/types';

/**
 * Shared state + actions behind "my plans" — load, delete, duplicate,
 * quick-start, and the multi-version group picker. Used by both the
 * standalone Planos screen (app/(tabs)/plans.tsx) and the "Meus Planos"
 * sub-tab inside Treino, so the two don't drift into two different ideas
 * of what deleting or duplicating a plan actually does.
 */
export function usePlansManager() {
  const router = useRouter();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [dayCounts, setDayCounts] = useState<Record<number, number>>({});
  const [openGroup, setOpenGroup] = useState<PlanGroup | null>(null);

  const load = useCallback(async () => {
    try {
      // Exclusively plans the person built themselves — the 5/3/1 generator
      // makes its own plan behind the scenes, but that lives in the
      // calendar as a record of what happened each day, not here as
      // something to reopen and reuse deliberately.
      const data = filterUserSelectablePlans(await getAllPlans());
      setPlans(data);
      const counts = await getPlanDayCounts(data.map(p => p.id));
      setDayCounts(counts);
    } catch (err) {
      console.error('Failed to load plans:', err);
      setPlans([]);
    }
  }, []);

  const handleDelete = (plan: WorkoutPlan) => {
    Alert.alert('Eliminar plano', `Eliminar "${plan.name}"?\nIsto não elimina o histórico de treinos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          hapticWarning();
          await deletePlan(plan.id);
          // A plan removed from the weekly planner would otherwise leave a
          // day pointing at a plan that no longer exists.
          await clearPlannerForPlan(plan.id);
          // If this was the last version in an open group modal, close it
          // rather than leaving it showing a now-empty list.
          setOpenGroup(g => {
            if (!g) return g;
            const remaining = g.plans.filter(p => p.id !== plan.id);
            return remaining.length > 0 ? { ...g, plans: remaining } : null;
          });
          load();
        }
      },
    ]);
  };

  const handleDuplicate = async (plan: WorkoutPlan) => {
    await duplicatePlan(plan.id);
    load();
  };

  /**
   * Single-day plans jump straight in (with an explicit dayIndex so
   * active.tsx never falls back to loading every day combined into one
   * session); multi-day plans open the plan detail screen instead, where
   * the day tabs let the person pick which day to train.
   */
  const handleQuickStart = (plan: WorkoutPlan) => {
    const days = dayCounts[plan.id] ?? 1;
    if (days > 1) {
      router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
    } else {
      router.push({ pathname: '/workout/active', params: { planId: plan.id, planName: plan.name, dayIndex: '0' } });
    }
  };

  const handleOpenGroup = (group: PlanGroup) => {
    if (group.plans.length === 1) {
      router.push({ pathname: '/plan/[id]', params: { id: group.plans[0].id } });
    } else {
      setOpenGroup(group);
    }
  };

  const groups = groupPlansByName(plans);

  return {
    plans, dayCounts, groups, openGroup, setOpenGroup,
    load, handleDelete, handleDuplicate, handleQuickStart, handleOpenGroup,
  };
}
