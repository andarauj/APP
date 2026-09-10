import { compareMonths, type MonthlyRecapData } from '../monthlyRecap';

function recap(overrides: Partial<MonthlyRecapData> = {}): MonthlyRecapData {
  return {
    totalWorkouts: 0,
    totalVolume: 0,
    totalDuration: 0,
    muscleDistribution: [],
    topExercises: [],
    prCount: 0,
    ...overrides,
  };
}

describe('compareMonths', () => {
  it('reports no trend when there is no previous month at all', () => {
    const current = recap({ totalWorkouts: 12, totalVolume: 5000 });
    const result = compareMonths(current, null);
    expect(result.volumeTrend).toBeNull();
    expect(result.workoutsTrend).toBeNull();
    expect(result.workoutsDelta).toBe(12);
    expect(result.volumeDelta).toBe(5000);
  });

  it('reports no trend when the previous month had zero workouts (nothing real to compare against)', () => {
    const current = recap({ totalWorkouts: 8, totalVolume: 3000 });
    const previous = recap({ totalWorkouts: 0, totalVolume: 0 });
    const result = compareMonths(current, previous);
    expect(result.volumeTrend).toBeNull();
    expect(result.workoutsTrend).toBeNull();
  });

  it('detects a genuine increase (>5%) as "up"', () => {
    const current = recap({ totalWorkouts: 14, totalVolume: 12000 });
    const previous = recap({ totalWorkouts: 10, totalVolume: 10000 });
    const result = compareMonths(current, previous);
    expect(result.workoutsTrend).toBe('up');
    expect(result.volumeTrend).toBe('up');
  });

  it('detects a genuine decrease (>5%) as "down"', () => {
    const current = recap({ totalWorkouts: 6, totalVolume: 7000 });
    const previous = recap({ totalWorkouts: 10, totalVolume: 10000 });
    const result = compareMonths(current, previous);
    expect(result.workoutsTrend).toBe('down');
    expect(result.volumeTrend).toBe('down');
  });

  it('treats a small change (within 5%) as "stable" rather than up/down', () => {
    const current = recap({ totalWorkouts: 10, totalVolume: 10200 });
    const previous = recap({ totalWorkouts: 10, totalVolume: 10000 });
    const result = compareMonths(current, previous);
    expect(result.volumeTrend).toBe('stable');
    expect(result.workoutsTrend).toBe('stable');
  });

  it('never divides by zero when the previous month is nonzero but this specific metric was zero', () => {
    const current = recap({ totalWorkouts: 0, totalVolume: 0 });
    const previous = recap({ totalWorkouts: 8, totalVolume: 5000 });
    expect(() => compareMonths(current, previous)).not.toThrow();
    const result = compareMonths(current, previous);
    expect(result.workoutsTrend).toBe('down');
  });

  it('picks the muscle with the most sets as the top muscle', () => {
    const current = recap({
      muscleDistribution: [
        { muscle: 'chest', sets: 12 },
        { muscle: 'back', sets: 20 },
        { muscle: 'legs', sets: 8 },
      ],
    });
    const result = compareMonths(current, null);
    expect(result.topMuscle).toBe('back');
  });

  it('returns a null top muscle when nothing was trained at all', () => {
    const result = compareMonths(recap(), null);
    expect(result.topMuscle).toBeNull();
  });
});
