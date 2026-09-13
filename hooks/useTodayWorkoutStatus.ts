/**
 * Drives today's scheduled workout (Discover quick action, Workout tab).
 * Reuses rolling schedule + weekly planner via scheduleResolve so screens
 * cannot disagree about what "today" means.
 */

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDatabase } from './useDatabase';
import { useAdaptiveStatus } from './useAdaptiveStatus';
import { getUnfinishedSessionWithProgress, getSessionSetsWithExercise, getSessionsForDate } from '@/db/workoutDao';
import { getRollingScheduleForPlan } from '@/utils/adaptiveService';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { resolveTodayWorkoutPriority, type TodayWorkoutPriority } from '@/utils/todayWorkoutStatus';
import { resolveTodaySlot } from '@/utils/scheduleResolve';
import { resolveScheduledPayload, type ScheduledHeroPayload } from '@/utils/scheduledWorkout';
import { resolveWeekStartDow } from '@/utils/weekStart';

export type { ScheduledHeroPayload };

export interface ActiveHeroPayload {
  sessionId: number;
  planId: number | null;
  name: string;
  elapsedSeconds: number;
  currentExerciseName: string | null;
  completedSets: number;
}

export interface CompletedHeroPayload {
  name: string;
  totalSets: number;
  totalVolume: number;
}

export interface TodayWorkoutStatus {
  priority: TodayWorkoutPriority;
  loaded: boolean;
  active: ActiveHeroPayload | null;
  scheduled: ScheduledHeroPayload | null;
  completed: CompletedHeroPayload | null;
  refresh: () => Promise<void>;
}

export function useTodayWorkoutStatus(): TodayWorkoutStatus {
  const { isReady } = useDatabase();
  const { status: adaptiveStatus } = useAdaptiveStatus();
  const [priority, setPriority] = useState<TodayWorkoutPriority>('rest');
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<ActiveHeroPayload | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledHeroPayload | null>(null);
  const [completed, setCompleted] = useState<CompletedHeroPayload | null>(null);

  const refresh = useCallback(async () => {
    if (!isReady) return;
    try {
      const now = new Date();
      const [unfinishedResult, planner, todaysSessions] = await Promise.all([
        getUnfinishedSessionWithProgress(),
        getWeeklyPlanner(),
        getSessionsForDate(now.getFullYear(), now.getMonth(), now.getDate()),
      ]);
      const hasUnfinished = !!unfinishedResult && unfinishedResult.completedSets > 0;
      const finishedToday = todaysSessions.filter(s => s.ended_at != null);
      const latestFinished = finishedToday.sort((a, b) => b.started_at - a.started_at)[0] || null;

      const today = now.getDay();
      const weekStartDow = await resolveWeekStartDow(adaptiveStatus?.weekStart ?? null);
      const rolling = adaptiveStatus
        ? await getRollingScheduleForPlan(adaptiveStatus.planId, weekStartDow)
        : null;
      const todaySlot = resolveTodaySlot(
        planner,
        rolling,
        adaptiveStatus?.planId ?? null,
        today,
        weekStartDow,
      );

      const resolved = resolveTodayWorkoutPriority({
        hasUnfinishedSession: hasUnfinished,
        isTodayBacklog: todaySlot.isBacklog,
        hasTodayEntry: todaySlot.entry != null,
        hasTodayCompleted: !!latestFinished,
      });
      setPriority(resolved);

      if (resolved === 'active' && unfinishedResult) {
        const sets = await getSessionSetsWithExercise(unfinishedResult.session.id);
        const lastSet = sets.reduce((latest: { completed_at?: number; exercise_name?: string } | null, s: { completed_at?: number; exercise_name?: string }) => (
          !latest || (s.completed_at ?? 0) > (latest.completed_at ?? 0) ? s : latest
        ), null);
        setActive({
          sessionId: unfinishedResult.session.id,
          planId: unfinishedResult.session.plan_id,
          name: unfinishedResult.session.name,
          elapsedSeconds: unfinishedResult.session.total_duration || 0,
          currentExerciseName: lastSet?.exercise_name ?? null,
          completedSets: unfinishedResult.completedSets,
        });
      } else {
        setActive(null);
      }

      if (resolved === 'completed' && latestFinished) {
        setCompleted({
          name: latestFinished.name,
          totalSets: latestFinished.total_sets,
          totalVolume: latestFinished.total_volume,
        });
      } else {
        setCompleted(null);
      }

      if ((resolved === 'overdue' || resolved === 'today') && todaySlot.entry) {
        const sameAdaptive = !!adaptiveStatus && adaptiveStatus.planId === todaySlot.entry.planId;
        setScheduled(await resolveScheduledPayload(todaySlot.entry.planId, todaySlot.entry.dayIndex, {
          weekId: sameAdaptive ? adaptiveStatus!.weekId : null,
          weekIndex: sameAdaptive ? adaptiveStatus!.weekIndex : null,
          phase: sameAdaptive ? adaptiveStatus!.phase : null,
        }));
      } else {
        setScheduled(null);
      }
    } catch (err) {
      console.error('[useTodayWorkoutStatus] failed:', err);
      setPriority('rest');
      setActive(null);
      setScheduled(null);
      setCompleted(null);
    } finally {
      setLoaded(true);
    }
  }, [isReady, adaptiveStatus]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return { priority, loaded, active, scheduled, completed, refresh };
}
