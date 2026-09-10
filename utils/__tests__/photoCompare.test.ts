import { computeMetricDeltas, type MetricSnapshot } from '../photoCompare';

function snapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return { weight: null, body_fat: null, chest: null, back: null, waist: null, hips: null, arm: null, thigh: null, ...overrides };
}

describe('computeMetricDeltas', () => {
  it('computes a positive delta when a measurement increased', () => {
    const before = snapshot({ arm: 35 });
    const after = snapshot({ arm: 38 });
    const result = computeMetricDeltas(before, after);
    expect(result).toEqual([{ field: 'arm', before: 35, after: 38, delta: 3 }]);
  });

  it('computes a negative delta when a measurement decreased', () => {
    const before = snapshot({ waist: 95 });
    const after = snapshot({ waist: 88 });
    const result = computeMetricDeltas(before, after);
    expect(result[0].delta).toBe(-7);
  });

  it('skips a field entirely when missing from either side, rather than treating it as zero', () => {
    const before = snapshot({ weight: 80, chest: 100 });
    const after = snapshot({ weight: 78 }); // chest not recorded this time
    const result = computeMetricDeltas(before, after);
    const fields = result.map(d => d.field);
    expect(fields).toContain('weight');
    expect(fields).not.toContain('chest');
  });

  it('returns an empty array (not a crash) when nothing overlaps at all', () => {
    const before = snapshot({ weight: 80 });
    const after = snapshot({ waist: 90 });
    expect(computeMetricDeltas(before, after)).toEqual([]);
  });

  it('rounds the delta to one decimal place, avoiding floating point noise', () => {
    const before = snapshot({ weight: 80.3 });
    const after = snapshot({ weight: 78.15 });
    const result = computeMetricDeltas(before, after);
    // 78.15 - 80.3 = -2.1499999999999986 in raw floating point
    expect(result[0].delta).toBe(-2.1);
  });

  it('reports zero delta (not omitted) for a field that genuinely did not change', () => {
    const before = snapshot({ hips: 100 });
    const after = snapshot({ hips: 100 });
    const result = computeMetricDeltas(before, after);
    expect(result[0].delta).toBe(0);
  });
});
