import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDatabase } from './useDatabase';
import { useAdaptiveStatus } from './useAdaptiveStatus';
import { getUnfinishedSessionWithProgress, getPlanSessionRows } from '@/db/workoutDao';
import {
  dayStateFromSessions,
  exercisesForDay,
  estimateExercisesMinutes,
  loadWorkoutPlanView,
  weekdayForSlot,
  type WorkoutDayState,
} from '@/utils/workoutHub';
import type { PlanDaySlot } from '@/db/planDao';
import type { WorkoutPlan } from '@/types';
import type { OverviewWeek } from '@/utils/plannedWorkout';

export interface HubDay {
  day_index: number;
  day_label: string;
  weekday: number;
  exercise_count: number;
  estimatedMinutes: number;
  state: WorkoutDayState;
  weekId?: number;
  weekIndex?: number;
  phase?: string;
}

export function useWorkoutHub() {
  const { isReady } = useDatabase();
  const { status: adaptive, loaded: adaptiveLoaded, refresh: refreshAdaptive } = useAdaptiveStatus();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [slots, setSlots] = useState<PlanDaySlot[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<OverviewWeek[]>([]);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(1);
  const [dayLimit, setDayLimit] = useState(6);
  const [loaded, setLoaded] = useState(false);
  const [unfinishedDayIndex, setUnfinishedDayIndex] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!isReady) return;
    const view = await loadWorkoutPlanView(adaptive);
    const unfinished = await getUnfinishedSessionWithProgress().catch(() => null);
    const uid = unfinished && unfinished.session.plan_id === view.plan?.id
      ? unfinished.session.day_index
      : null;
    setUnfinishedDayIndex(uid);
    setPlan(view.plan);
    setSlots(view.slots);
    setExercises(view.exercises);
    setWeeks(view.weeks);
    setCurrentWeekIndex(view.currentWeekIndex);
    setDayLimit(view.dayLimit);
    setLoaded(true);
  }, [isReady, adaptive]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const now = Math.floor(Date.now() / 1000);
  const activeWeek = weeks.find(w => w.weekIndex === currentWeekIndex) ?? weeks[0];
  const weekStart = now - ((new Date().getDay() + 6) % 7) * 86400;
  const weekEnd = weekStart + 7 * 86400;

  const [sessionRows, setSessionRows] = useState<{ day_index?: number | null; ended_at?: number | null; started_at: number }[]>([]);

  const days: HubDay[] = slots.map((s, i) => {
    const weekday = s.weekday ?? weekdayForSlot(s, i);
    const dayEx = exercisesForDay(exercises, s.day_index);
    const overview = activeWeek?.workouts.find(w => w.dayIndex === s.day_index);
    const state: WorkoutDayState = overview
      ? (overview.state === 'completed' ? 'completed' : (unfinishedDayIndex === s.day_index ? 'in_progress' : 'planned'))
      : dayStateFromSessions(s.day_index, sessionRows, weekStart, weekEnd, unfinishedDayIndex);
    return {
      day_index: s.day_index,
      day_label: s.day_label,
      weekday,
      exercise_count: dayEx.length || s.exercise_count,
      estimatedMinutes: estimateExercisesMinutes(dayEx.length ? dayEx : (overview?.exercises ?? []).map(e => ({
        sets: e.sets,
        rest_seconds: e.rest,
      }))),
      state,
      weekId: overview?.weekId ?? adaptive?.weekId,
      weekIndex: activeWeek?.weekIndex ?? adaptive?.weekIndex,
      phase: activeWeek?.phase ?? adaptive?.phase,
    };
  });

  const loadSessions = useCallback(async () => {
    if (!plan) { setSessionRows([]); return; }
    const rows = await getPlanSessionRows(plan.id).catch(() => []);
    setSessionRows(rows);
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions]),
  );

  return {
    plan,
    days,
    exercises,
    weeks,
    currentWeekIndex,
    dayLimit,
    loaded: loaded && adaptiveLoaded,
    adaptive,
    unfinishedDayIndex,
    reload,
    refreshAdaptive,
  };
}
