import { computeHeatmapIntensities } from '../trainingHeatmap';

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
