import { suggestSetAdjustment } from '../autoRegulation';

describe('suggestSetAdjustment', () => {
  it('returns null with fewer than 3 historical points — not enough to trust', () => {
    expect(suggestSetAdjustment(9, [7, 7.5])).toBeNull();
  });

  it('returns null with no history at all', () => {
    expect(suggestSetAdjustment(9, [])).toBeNull();
  });

  it('suggests decreasing weight when RPE is meaningfully higher than usual', () => {
    const result = suggestSetAdjustment(9, [7, 7, 7.5]);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('decrease');
    expect(result!.suggestedWeightDeltaPercent).toBeLessThan(0);
  });

  it('does not flag a small, normal RPE difference (< 1.5 points)', () => {
    const result = suggestSetAdjustment(8, [7, 7.5, 7]);
    expect(result).toBeNull();
  });

  it('suggests increasing weight when RPE is meaningfully LOWER than usual AND genuinely easy', () => {
    const result = suggestSetAdjustment(6, [8, 8, 8.5]);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('increase');
    expect(result!.suggestedWeightDeltaPercent).toBeGreaterThan(0);
  });

  it('does NOT suggest increasing when RPE is lower than usual but still genuinely hard (>7)', () => {
    // 8 vs a typical 9.5 is a meaningful drop, but RPE 8 is still hard —
    // not really an invitation to add more load.
    const result = suggestSetAdjustment(8, [9.5, 9.5, 9.5]);
    expect(result).toBeNull();
  });

  it('returns null when RPE is right in line with the historical average', () => {
    const result = suggestSetAdjustment(7.5, [7, 7.5, 8, 7.5]);
    expect(result).toBeNull();
  });

  it('reports the historical average rounded to one decimal', () => {
    const result = suggestSetAdjustment(9, [7, 7, 7.5]);
    expect(result!.historicalAvgRpe).toBeCloseTo(7.17, 1);
  });

  it('never crashes on an unusual but valid RPE range', () => {
    expect(() => suggestSetAdjustment(10, [6, 6, 6])).not.toThrow();
    expect(() => suggestSetAdjustment(1, [9, 9, 9])).not.toThrow();
  });
});
