import type { PlanType } from '@/types';
import type { AdaptiveGoal } from '@/utils/nspi';

export type TrainingGoalUi = 'hypertrophy' | 'strength' | 'endurance' | 'recomp';

export const TRAINING_GOAL_OPTIONS: { key: TrainingGoalUi; label: string }[] = [
  { key: 'hypertrophy', label: 'Hipertrofia' },
  { key: 'strength', label: 'Força' },
  { key: 'endurance', label: 'Resistência' },
  { key: 'recomp', label: 'Recomp' },
];

export function adaptiveGoalFromUi(goal: TrainingGoalUi): AdaptiveGoal {
  if (goal === 'strength') return 'strength';
  if (goal === 'hypertrophy') return 'bulking';
  return 'general';
}

export function planTypeFromUi(goal: TrainingGoalUi): PlanType {
  if (goal === 'strength') return 'strength';
  if (goal === 'endurance') return 'endurance';
  return 'hypertrophy';
}

export function uiGoalFromStored(goal?: AdaptiveGoal | null, planType?: PlanType | null): TrainingGoalUi {
  if (planType === 'endurance') return 'endurance';
  if (goal === 'strength' || planType === 'strength') return 'strength';
  if (goal === 'cutting' || goal === 'general') return 'recomp';
  return 'hypertrophy';
}
