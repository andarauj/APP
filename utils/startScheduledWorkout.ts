import type { Router } from 'expo-router';
import type { TodayWorkoutStatus } from '@/hooks/useTodayWorkoutStatus';
import { plannedWorkoutRouteParams } from '@/utils/plannedWorkout';
import type { ScheduledHeroPayload } from '@/utils/scheduledWorkout';

export function pushPlannedWorkout(router: Router, scheduled: ScheduledHeroPayload): void {
  router.push({
    pathname: '/workout/active',
    params: plannedWorkoutRouteParams({
      planId: scheduled.planId,
      planName: `${scheduled.planName} · ${scheduled.dayLabel}`,
      dayIndex: scheduled.dayIndex,
      weekId: scheduled.weekId,
      weekIndex: scheduled.weekIndex,
      phase: scheduled.phase,
    }),
  });
}

export function launchTodayFromStatus(router: Router, status: TodayWorkoutStatus): 'started' | 'completed' | 'rest' {
  if (status.priority === 'active' && status.active) {
    router.push({
      pathname: '/workout/active',
      params: {
        planId: String(status.active.planId ?? 0),
        planName: status.active.name,
        resumeSessionId: String(status.active.sessionId),
      },
    });
    return 'started';
  }
  if ((status.priority === 'today' || status.priority === 'overdue') && status.scheduled) {
    pushPlannedWorkout(router, status.scheduled);
    return 'started';
  }
  if (status.priority === 'completed') return 'completed';
  return 'rest';
}
