export interface MonthlyRecapData {
  totalWorkouts: number;
  totalVolume: number;
  totalDuration: number;
  muscleDistribution: { muscle: string; sets: number }[];
  topExercises: { name: string; setCount: number }[];
  prCount: number;
}

export type TrendDirection = 'up' | 'down' | 'stable' | null;

export interface MonthlyComparison {
  workoutsDelta: number;
  volumeDelta: number;
  volumeTrend: TrendDirection;
  workoutsTrend: TrendDirection;
  topMuscle: string | null;
}

/**
 * Compares this month's recap against the previous month's — the trend
 * arrows shown on the recap screen. A month with literally nothing logged
 * yet (e.g. the very first month using the app, or the recap is opened for
 * the current, still-in-progress month before anything happened) has no
 * meaningful "previous" to compare against, so trends stay null rather than
 * showing a misleading 100%-up arrow from a zero baseline.
 */
export function compareMonths(current: MonthlyRecapData, previous: MonthlyRecapData | null): MonthlyComparison {
  const topMuscle = current.muscleDistribution.length > 0
    ? current.muscleDistribution.reduce((best, m) => (m.sets > best.sets ? m : best)).muscle
    : null;

  if (!previous || previous.totalWorkouts === 0) {
    return { workoutsDelta: current.totalWorkouts, volumeDelta: current.totalVolume, volumeTrend: null, workoutsTrend: null, topMuscle };
  }

  const workoutsDelta = current.totalWorkouts - previous.totalWorkouts;
  const volumeDelta = current.totalVolume - previous.totalVolume;

  const trendFrom = (delta: number, baseline: number): TrendDirection => {
    if (baseline === 0) return delta > 0 ? 'up' : null;
    const ratio = delta / baseline;
    if (ratio > 0.05) return 'up';
    if (ratio < -0.05) return 'down';
    return 'stable';
  };

  return {
    workoutsDelta,
    volumeDelta,
    volumeTrend: trendFrom(volumeDelta, previous.totalVolume),
    workoutsTrend: trendFrom(workoutsDelta, previous.totalWorkouts),
    topMuscle,
  };
}
