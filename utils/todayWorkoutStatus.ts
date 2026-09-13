export type TodayWorkoutPriority = 'active' | 'overdue' | 'today' | 'completed' | 'rest';

export interface TodayWorkoutSignals {
  /** A session with ended_at IS NULL and at least one logged set — the
   *  same "unfinished" concept app/(tabs)/start.tsx already recovers from
   *  (crash/close mid-workout), reused here rather than re-derived. */
  hasUnfinishedSession: boolean;
  /** Today's slot in the active adaptive plan's rolling schedule is
   *  standing in for an earlier missed day (RollingScheduleEntry.isBacklog
   *  from utils/adaptiveService.ts) — the plan itself decided today's
   *  workout is "make-up work", not new ground. */
  isTodayBacklog: boolean;
  /** Something — adaptive-rolled or manually assigned via the weekly
   *  planner — is scheduled for today, and it's not backlog. */
  hasTodayEntry: boolean;
  /** A completed session was already logged today for the scheduled plan. */
  hasTodayCompleted?: boolean;
}

/**
 * The landing dashboard's hero card shows exactly one state, chosen by
 * strict priority: a session already in progress always wins (finishing
 * what's open matters more than what's nominally scheduled), then a
 * missed day standing in for today, then today's own scheduled day, and
 * only once none of those apply does it fall back to a rest-day prompt.
 */
export function resolveTodayWorkoutPriority(signals: TodayWorkoutSignals): TodayWorkoutPriority {
  if (signals.hasUnfinishedSession) return 'active';
  // Finished today beats backlog/schedule — the person already trained.
  if (signals.hasTodayCompleted) return 'completed';
  if (signals.isTodayBacklog) return 'overdue';
  if (signals.hasTodayEntry) return 'today';
  return 'rest';
}

/** Time-of-day greeting in PT-PT. */
export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 19) return 'Boa tarde';
  return 'Boa noite';
}
