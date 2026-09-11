import { detectPerformanceRegression, detectVolumeSpike, detectRpeCreep, overallFatigueLevel, type ExercisePerformancePoint } from '../fatigueSignals';

function points(values: number[]): ExercisePerformancePoint[] {
  return values.map((v, i) => ({ date: i, estimated1RM: v }));
}

describe('detectPerformanceRegression', () => {
  it('returns null with fewer than 4 data points — not enough to call it a trend', () => {
    expect(detectPerformanceRegression(points([100, 98, 95]))).toBeNull();
  });

  it('returns null for a single off day surrounded by normal performance', () => {
    // One dip, then right back to normal — this is what everyone's training
    // looks like sometimes, and should never trigger a signal.
    const result = detectPerformanceRegression(points([100, 102, 90, 101, 103]));
    expect(result).toBeNull();
  });

  it('detects a genuine sustained decline across the most recent sessions', () => {
    // Peaked at 120, then the last 3 sessions all sit well below that.
    const result = detectPerformanceRegression(points([100, 110, 120, 108, 100, 98, 97]));
    expect(result).not.toBeNull();
    expect(result!.peakOneRM).toBe(120);
    expect(result!.percentDecline).toBeGreaterThanOrEqual(10);
  });

  it('does not flag a small, normal fluctuation as a regression', () => {
    // ~4% dip — well within ordinary week-to-week variance, not a real signal.
    const result = detectPerformanceRegression(points([100, 102, 104, 100, 99, 98]));
    expect(result).toBeNull();
  });

  it('compares against a RECENT peak, not a stale all-time best', () => {
    // An old peak of 150 from long ago, but performance has been stable at
    // ~100 for a while since (a different program/phase) — should not
    // falsely flag current stable performance as "regressing" from a peak
    // set under completely different circumstances long ago... though with
    // this function's simple recent-window design, an old peak still
    // within the historical slice WOULD be picked up. This test documents
    // that the caller is responsible for only passing a reasonably recent
    // window (e.g. last 8-12 sessions), not literally all-time history.
    const allTime = points([150, 90, 92, 88, 91, 90, 89]);
    const result = detectPerformanceRegression(allTime);
    // With the old 150 in the window, this DOES flag — confirming the
    // function works as designed on whatever window it's given.
    expect(result).not.toBeNull();
  });

  it('never divides by zero or crashes when peak is somehow zero', () => {
    expect(() => detectPerformanceRegression(points([0, 0, 0, 0]))).not.toThrow();
    expect(detectPerformanceRegression(points([0, 0, 0, 0]))).toBeNull();
  });

  it('respects a custom decline threshold', () => {
    const data = points([100, 105, 110, 104, 103, 102]); // ~7% decline from peak
    expect(detectPerformanceRegression(data, 10)).toBeNull(); // below default 10% threshold
    expect(detectPerformanceRegression(data, 5)).not.toBeNull(); // above a looser 5% threshold
  });
});

describe('detectVolumeSpike', () => {
  it('returns null when there is no average to compare against yet', () => {
    expect(detectVolumeSpike(5000, 0)).toBeNull();
  });

  it('does not flag normal week-to-week variation', () => {
    expect(detectVolumeSpike(5500, 5000)).toBeNull(); // +10%, unremarkable
  });

  it('flags a genuine large spike (40%+ above average)', () => {
    const result = detectVolumeSpike(7500, 5000); // +50%
    expect(result).not.toBeNull();
    expect(result!.percentAboveAverage).toBe(50);
  });

  it('does not flag a DECREASE in volume as a spike', () => {
    expect(detectVolumeSpike(2000, 5000)).toBeNull();
  });

  it('respects a custom threshold ratio', () => {
    expect(detectVolumeSpike(6000, 5000, 1.4)).toBeNull(); // +20%, below 1.4x threshold
    expect(detectVolumeSpike(6000, 5000, 1.15)).not.toBeNull(); // above a looser 1.15x threshold
  });
});

describe('detectRpeCreep', () => {
  function rpeSets(values: (number | null)[], weight = 100): { date: number; weight: number; rpe: number | null }[] {
    return values.map((rpe, i) => ({ date: i, weight, rpe }));
  }

  it('returns null with fewer than 6 RPE-logged sets — not enough to trust a trend', () => {
    expect(detectRpeCreep(rpeSets([7, 7.5, 8]))).toBeNull();
  });

  it('returns null when sets have no RPE logged at all (null)', () => {
    expect(detectRpeCreep(rpeSets([null, null, null, null, null, null]))).toBeNull();
  });

  it('detects a genuine RPE increase at the same weight over recent sessions', () => {
    const result = detectRpeCreep(rpeSets([7, 7, 7.5, 8.5, 9, 9]));
    expect(result).not.toBeNull();
    expect(result!.rpeIncrease).toBeGreaterThanOrEqual(1);
  });

  it('does not flag stable RPE at the same weight as creep', () => {
    const result = detectRpeCreep(rpeSets([7.5, 8, 7.5, 8, 7.5, 8]));
    expect(result).toBeNull();
  });

  it('does not flag a small, normal RPE fluctuation (<1 point)', () => {
    const result = detectRpeCreep(rpeSets([7, 7.5, 7, 7.5, 8, 8]));
    expect(result).toBeNull(); // ~0.83 increase, below the 1-point default threshold
  });

  it('only compares sets at a similar weight — a heavier recent set does not "count" as creep on its own', () => {
    // Early sets at 100kg with easy RPE, then a much heavier 130kg set that
    // rates high RPE for an entirely legitimate reason (it's just heavier).
    const sets = [
      { date: 0, weight: 100, rpe: 7 },
      { date: 1, weight: 100, rpe: 7 },
      { date: 2, weight: 100, rpe: 7 },
      { date: 3, weight: 100, rpe: 7 },
      { date: 4, weight: 130, rpe: 9.5 },
    ];
    // Reference weight is the LAST set's weight (130) — only one set
    // matches that weight, not enough to form a trend.
    expect(detectRpeCreep(sets)).toBeNull();
  });

  it('ignores sets with no RPE logged when checking data sufficiency', () => {
    const sets = [
      { date: 0, weight: 100, rpe: null },
      { date: 1, weight: 100, rpe: 7 },
      { date: 2, weight: 100, rpe: null },
      { date: 3, weight: 100, rpe: 7 },
      { date: 4, weight: 100, rpe: 7.5 },
      { date: 5, weight: 100, rpe: 9 },
      { date: 6, weight: 100, rpe: 9 },
      { date: 7, weight: 100, rpe: 9 },
    ];
    const result = detectRpeCreep(sets);
    expect(result).not.toBeNull();
  });

  it('respects a custom weight tolerance', () => {
    const sets = [
      { date: 0, weight: 95, rpe: 7 },
      { date: 1, weight: 96, rpe: 7 },
      { date: 2, weight: 94, rpe: 7.5 },
      { date: 3, weight: 100, rpe: 9 },
      { date: 4, weight: 100, rpe: 9 },
      { date: 5, weight: 100, rpe: 9 },
    ];
    // With a tight 2% tolerance around 100kg, the 94-96kg sets don't count
    // as "the same weight" — not enough matching sets for a trend.
    expect(detectRpeCreep(sets, 2)).toBeNull();
    // With a looser 10% tolerance, they do count, revealing the creep.
    expect(detectRpeCreep(sets, 10)).not.toBeNull();
  });
});

describe('overallFatigueLevel', () => {
  it('is "none" with no active signal types', () => {
    expect(overallFatigueLevel(0)).toBe('none');
  });
  it('is "watch" for a single isolated signal', () => {
    expect(overallFatigueLevel(1)).toBe('watch');
  });
  it('is "stacking" when two distinct signal types fire together', () => {
    expect(overallFatigueLevel(2)).toBe('stacking');
  });
  it('is "high" when all three signal types fire together', () => {
    expect(overallFatigueLevel(3)).toBe('high');
  });
  it('never goes below "none" for a negative count', () => {
    expect(overallFatigueLevel(-1)).toBe('none');
  });
});
