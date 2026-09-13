import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDatabase } from './useDatabase';
import { useAdaptiveStatus } from './useAdaptiveStatus';
import { getSessionsForDate } from '@/db/workoutDao';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { getRollingScheduleForPlan } from '@/utils/adaptiveService';
import { buildEffectivePlanner, resolveDaySlot } from '@/utils/scheduleResolve';
import { buildRollingNextDays, type CalendarDay } from '@/utils/rollingCalendar';
import { resolveScheduledPayload, type ScheduledHeroPayload } from '@/utils/scheduledWorkout';
import { resolveWeekStartDow } from '@/utils/weekStart';

export interface UpcomingScheduleDay extends CalendarDay {
  scheduled: ScheduledHeroPayload | null;
  completed: boolean;
  isBacklog: boolean;
  isSkipped: boolean;
}

export function useUpcomingSchedule(count = 5) {
  const { isReady } = useDatabase();
  const { status: adaptiveStatus } = useAdaptiveStatus();
  const [days, setDays] = useState<UpcomingScheduleDay[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!isReady) return;
    try {
      const cells = buildRollingNextDays(count);
      const planner = await getWeeklyPlanner();
      const weekStartDow = await resolveWeekStartDow(adaptiveStatus?.weekStart ?? null);
      const rolling = adaptiveStatus
        ? await getRollingScheduleForPlan(adaptiveStatus.planId, weekStartDow)
        : null;
      const today = new Date().getDay();
      const effective = buildEffectivePlanner(
        planner,
        rolling,
        adaptiveStatus?.planId ?? null,
        today,
        weekStartDow,
      );

      const resolved = await Promise.all(cells.map(async cell => {
        const slot = resolveDaySlot(cell.weekday, effective, rolling);
        const sessions = await getSessionsForDate(
          cell.date.getFullYear(),
          cell.date.getMonth(),
          cell.date.getDate(),
        );
        const finished = sessions.some(s => s.ended_at != null);
        let scheduled: ScheduledHeroPayload | null = null;
        if (slot.entry) {
          const inActiveWeek = !!adaptiveStatus
            && adaptiveStatus.planId === slot.entry.planId
            && cell.date.getTime() / 1000 >= adaptiveStatus.weekStart
            && cell.date.getTime() / 1000 < adaptiveStatus.weekEnd;
          scheduled = await resolveScheduledPayload(slot.entry.planId, slot.entry.dayIndex, {
            weekId: inActiveWeek ? adaptiveStatus!.weekId : null,
            weekIndex: inActiveWeek ? adaptiveStatus!.weekIndex : null,
            phase: inActiveWeek ? adaptiveStatus!.phase : null,
          });
        }
        return {
          ...cell,
          scheduled,
          completed: finished,
          isBacklog: slot.isBacklog,
          isSkipped: slot.isSkipped,
        };
      }));
      setDays(resolved);
    } catch (err) {
      console.error('[useUpcomingSchedule] failed:', err);
      setDays([]);
    } finally {
      setLoaded(true);
    }
  }, [isReady, adaptiveStatus, count]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return { days, loaded, refresh };
}
