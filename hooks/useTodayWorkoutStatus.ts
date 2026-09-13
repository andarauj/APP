/**
 * Drives the landing dashboard's hero card (app/(tabs)/index.tsx). Reuses
 * the exact same primitives app/(tabs)/start.tsx's "Instantâneo"/"Plano"
 * tabs already use — getUnfinishedSessionWithProgress for crash/close
 * recovery, getRollingScheduleForPlan for the adaptive engine's backlog
 * decision — rather than re-deriving that logic a second time, which would
 * risk the two screens disagreeing about what "today" means. Only the
 * priority selection (see utils/todayWorkoutStatus.ts) and the rich
 * per-priority payload below are new; the underlying signals are borrowed,
 * not recomputed.
 */

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDatabase } from './useDatabase';
import { useAdaptiveStatus } from './useAdaptiveStatus';
import { getUnfinishedSessionWithProgress, getSessionSetsWithExercise, getSessionsForDate } from '@/db/workoutDao';
import { getRollingScheduleForPlan, type RollingScheduleEntry } from '@/utils/adaptiveService';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { getPlanById, getPlanExercisesWithDetails } from '@/db/planDao';
import { estimateDayMinutes } from '@/utils/workoutTime';
import { MUSCLE_GROUPS_PT, type MuscleGroup } from '@/types';
import { resolveTodayWorkoutPriority, type TodayWorkoutPriority } from '@/utils/todayWorkoutStatus';

export interface ActiveHeroPayload {
  sessionId: number;
  planId: number | null;
  name: string;
  elapsedSeconds: number;
  currentExerciseName: string | null;
  completedSets: number;
}

export interface ScheduledHeroPayload {
  planId: number;
  dayIndex: number;
  planName: string;
  dayLabel: string;
  estimatedMinutes: number;
  exerciseCount: number;
  muscles: string[];
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
  scheduled: ScheduledHeroPayload | null; // populated for both 'overdue' and 'today'
  completed: CompletedHeroPayload | null;
  refresh: () => Promise<void>;
}

async function resolveScheduledPayload(planId: number, dayIndex: number): Promise<ScheduledHeroPayload | null> {
  const [plan, allExercises] = await Promise.all([
    getPlanById(planId),
    getPlanExercisesWithDetails(planId),
  ]);
  if (!plan) return null;
  const dayExercises = allExercises.filter((e: any) => (e.day_index ?? 0) === dayIndex);
  if (dayExercises.length === 0) return null;
  const muscles = Array.from(new Set(dayExercises.map((e: any) => MUSCLE_GROUPS_PT[e.primary_muscle as MuscleGroup] || e.primary_muscle)));
  return {
    planId,
    dayIndex,
    planName: plan.name,
    dayLabel: dayExercises[0].day_label || 'Treino',
    estimatedMinutes: estimateDayMinutes(dayExercises.map((e: any) => ({ sets: e.sets, restSeconds: e.rest_seconds }))),
    exerciseCount: dayExercises.length,
    muscles,
  };
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
      // Mirrors start.tsx's silent-discard rule for display purposes only —
      // a session with 0 logged sets isn't "in progress" from the person's
      // point of view. The actual DB cleanup still happens in start.tsx,
      // whichever screen the person visits first; this hook only reads.
      const hasUnfinished = !!unfinishedResult && unfinishedResult.completedSets > 0;
      const finishedToday = todaysSessions.filter(s => s.ended_at != null);
      const latestFinished = finishedToday.sort((a, b) => b.started_at - a.started_at)[0] || null;

      const today = now.getDay();
      let rollingEntry: RollingScheduleEntry | null = null;
      if (adaptiveStatus) {
        const weekStartDow = new Date(adaptiveStatus.weekStart * 1000).getDay();
        const schedule = await getRollingScheduleForPlan(adaptiveStatus.planId, weekStartDow);
        rollingEntry = schedule?.find(e => e.weekday === today) ?? null;
      }
      const plannedToday = planner[today] ?? null;
      const hasTodayEntry = !!rollingEntry || !!plannedToday;

      const resolved = resolveTodayWorkoutPriority({
        hasUnfinishedSession: hasUnfinished,
        isTodayBacklog: rollingEntry?.isBacklog ?? false,
        hasTodayEntry,
        hasTodayCompleted: !!latestFinished,
      });
      setPriority(resolved);

      if (resolved === 'active' && unfinishedResult) {
        const sets = await getSessionSetsWithExercise(unfinishedResult.session.id);
        const lastSet = sets.reduce((latest: any, s: any) => (!latest || s.completed_at > latest.completed_at ? s : latest), null);
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

      if (resolved === 'overdue' || resolved === 'today') {
        const planId = adaptiveStatus && rollingEntry ? adaptiveStatus.planId : plannedToday!.planId;
        const dayIndex = adaptiveStatus && rollingEntry ? rollingEntry.dayIndex : plannedToday!.dayIndex;
        setScheduled(await resolveScheduledPayload(planId, dayIndex));
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
