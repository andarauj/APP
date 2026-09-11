import { computeHeatmapIntensities, aggregateWeeklyConsistency } from '../trainingHeatmap';

describe('computeHeatmapIntensities', () => {
  it('gives intensity 0 to every day when there is no data at all', () => {
    const days = [{ date: '2026-08-01', sets: 0 }, { date: '2026-08-02', sets: 0 }];
    const result = computeHeatmapIntensities(days);
    expect(result.every(d => d.intensity === 0)).toBe(true);
  });

  it('always gives intensity 0 to a rest day, regardless of other days\' scale', () => {
    const days = [
      { date: '2026-08-01', sets: 0 },
      { date: '2026-08-02', sets: 30 },
      { date: '2026-08-03', sets: 25 },
    ];
    const result = computeHeatmapIntensities(days);
    expect(result[0].intensity).toBe(0);
  });

  it('scales relative to the person\'s own data — a light user\'s "high" day is still recognized', () => {
    // Someone who only ever does 2-6 sets a day (short sessions) should
    // still get a meaningful spread of intensities, not everything crammed
    // into the lowest bucket because it's tiny by some fixed global scale.
    const days = [
      { date: '2026-08-01', sets: 2 },
      { date: '2026-08-02', sets: 4 },
      { date: '2026-08-03', sets: 6 },
    ];
    const result = computeHeatmapIntensities(days);
    const intensities = result.map(d => d.intensity);
    expect(new Set(intensities).size).toBeGreaterThan(1); // not all identical
    expect(result[2].intensity).toBeGreaterThan(result[0].intensity); // more sets -> higher bucket
  });

  it('never produces an intensity outside 0-4', () => {
    const days = Array.from({ length: 50 }, (_, i) => ({ date: `d${i}`, sets: i * 3 }));
    const result = computeHeatmapIntensities(days);
    for (const d of result) {
      expect(d.intensity).toBeGreaterThanOrEqual(0);
      expect(d.intensity).toBeLessThanOrEqual(4);
    }
  });

  it('handles a single training day without crashing', () => {
    const days = [{ date: '2026-08-01', sets: 12 }];
    expect(() => computeHeatmapIntensities(days)).not.toThrow();
    expect(computeHeatmapIntensities(days)[0].intensity).toBeGreaterThan(0);
  });

  it('preserves the original date and sets values unchanged', () => {
    const days = [{ date: '2026-08-01', sets: 15 }];
    const result = computeHeatmapIntensities(days);
    expect(result[0].date).toBe('2026-08-01');
    expect(result[0].sets).toBe(15);
  });
});

// 2026-08-02 is a Sunday — a clean week-start anchor for these tests.
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysFrom(start: string, sets: number[]): { date: string; sets: number }[] {
  const startDate = new Date(start + 'T00:00:00');
  return sets.map((s, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return { date: dateKey(d), sets: s };
  });
}

describe('aggregateWeeklyConsistency', () => {
  it('returns empty for no data', () => {
    expect(aggregateWeeklyConsistency([])).toEqual([]);
  });

  it('groups a Sunday-anchored run into whole weeks, summing sets and counting trained days', () => {
    const days = daysFrom('2026-08-02', [5, 0, 8, 0, 10, 0, 3, 4, 4, 4, 4, 4, 4, 4]);
    const weeks = aggregateWeeklyConsistency(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStart).toBe('2026-08-02');
    expect(weeks[0].totalSets).toBe(5 + 8 + 10 + 3);
    expect(weeks[0].daysTrained).toBe(4);
    expect(weeks[1].totalSets).toBe(28);
    expect(weeks[1].daysTrained).toBe(7);
  });

  it('pads a run that does not start on Sunday so weeks stay aligned', () => {
    // Start on a Wednesday (3 days into the week) — the total across all
    // real days must still be preserved regardless of the leading pad.
    const days = daysFrom('2026-08-05', [2, 2, 2, 2, 2]);
    const weeks = aggregateWeeklyConsistency(days);
    const totalAcrossWeeks = weeks.reduce((s, w) => s + w.totalSets, 0);
    expect(totalAcrossWeeks).toBe(10);
    const daysAcrossWeeks = weeks.reduce((s, w) => s + w.daysTrained, 0);
    expect(daysAcrossWeeks).toBe(5);
  });

  it('gives intensity 0 to a week with no sets, regardless of other weeks', () => {
    const days = daysFrom('2026-08-02', [0, 0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10, 10]);
    const weeks = aggregateWeeklyConsistency(days);
    expect(weeks[0].totalSets).toBe(0);
    expect(weeks[0].intensity).toBe(0);
    expect(weeks[1].intensity).toBeGreaterThan(0);
  });

  it('scales intensity relative to the person\'s own weeks', () => {
    const days = daysFrom('2026-08-02', [
      ...Array(7).fill(2),  // light week: 14 sets
      ...Array(7).fill(6),  // medium week: 42 sets
      ...Array(7).fill(12), // heavy week: 84 sets
    ]);
    const weeks = aggregateWeeklyConsistency(days);
    expect(weeks).toHaveLength(3);
    expect(weeks[2].intensity).toBeGreaterThan(weeks[0].intensity);
  });

  it('never produces an intensity outside 0-4', () => {
    const days = daysFrom('2026-08-02', Array.from({ length: 70 }, (_, i) => (i * 3) % 40));
    const weeks = aggregateWeeklyConsistency(days);
    for (const w of weeks) {
      expect(w.intensity).toBeGreaterThanOrEqual(0);
      expect(w.intensity).toBeLessThanOrEqual(4);
    }
  });
});
