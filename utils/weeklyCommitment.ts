export interface WeekDayStatus {
  weekday: number; // 0=Sun..6=Sat
  planned: boolean;
  planLabel: string | null;
  completed: boolean;
  isToday: boolean;
  isPast: boolean; // strictly before today
}

export interface WeeklyCommitment {
  days: WeekDayStatus[];
  plannedCount: number;
  completedOfPlanned: number;
  /** Trained on a day with nothing assigned — still counts as showing up,
   *  just not toward "did you do what you told yourself you'd do". */
  extraCompletedCount: number;
  /** Null when nothing was planned for the week at all — there's no
   *  meaningful adherence percentage to compute against zero commitments,
   *  and 0% would misleadingly read as "you failed" rather than "you
   *  never set anything up". Only counts days up to and including today,
   *  so a Tuesday check-in isn't penalized for Friday not having happened
   *  yet. */
  adherencePercent: number | null;
}

/**
 * Combines the weekly planner (what the person told themselves they'd do)
 * with which days actually had a completed session, into a single "how's
 * this week gone" picture — the adherence percentage this app has never
 * shown before, since Progress Index's consistency component compares
 * against your own rolling average, not an explicit commitment you set.
 */
export function computeWeeklyCommitment(
  plannerByWeekday: Record<number, { planId: number; dayIndex: number } | undefined>,
  planLabels: Record<number, string>, // planId -> display label, e.g. "Peito"
  completedWeekdays: Set<number>, // weekdays (0-6) with at least one completed session this week
  todayWeekday: number,
): WeeklyCommitment {
  const days: WeekDayStatus[] = [];
  let plannedCount = 0;
  let completedOfPlanned = 0;
  let extraCompletedCount = 0;

  for (let weekday = 0; weekday < 7; weekday++) {
    const entry = plannerByWeekday[weekday];
    const planned = entry !== undefined;
    const completed = completedWeekdays.has(weekday);
    const isPast = weekday < todayWeekday;
    const isToday = weekday === todayWeekday;

    if (planned) {
      plannedCount++;
      if (completed) completedOfPlanned++;
    } else if (completed) {
      extraCompletedCount++;
    }

    days.push({
      weekday,
      planned,
      planLabel: planned ? (planLabels[entry!.planId] ?? 'Treino') : null,
      completed,
      isToday,
      isPast,
    });
  }

  // Adherence only counts planned days up to and including today — a
  // Tuesday check shouldn't be judged against Friday's not-yet-happened
  // planned session.
  const relevantPlanned = days.filter(d => d.planned && (d.isPast || d.isToday));
  const relevantCompleted = relevantPlanned.filter(d => d.completed).length;
  const adherencePercent = relevantPlanned.length > 0
    ? Math.round((relevantCompleted / relevantPlanned.length) * 100)
    : null;

  return { days, plannedCount, completedOfPlanned, extraCompletedCount, adherencePercent };
}
