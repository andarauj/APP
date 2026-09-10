import { analyzeBody, detectMeasurementTrend } from '../bodyAnalysis';
import type { BodyMetric } from '@/types';

function metric(overrides: Partial<BodyMetric> = {}): BodyMetric {
  return {
    id: 1,
    date: 0,
    weight: null,
    body_fat: null,
    chest: null,
    waist: null,
    hips: null,
    arm: null,
    thigh: null,
    back: null,
    photo_uri: null,
    ...overrides,
  };
}

describe('detectMeasurementTrend', () => {
  it('returns null with fewer than 3 measurements — not enough to call it a trend', () => {
    expect(detectMeasurementTrend([90, 92])).toBeNull();
  });

  it('detects a sustained increase across several measurements', () => {
    const result = detectMeasurementTrend([90, 91, 96, 97]);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('increasing');
  });

  it('detects a sustained decrease across several measurements', () => {
    const result = detectMeasurementTrend([97, 96, 91, 90]);
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('decreasing');
  });

  it('does not flag normal small fluctuation as a trend', () => {
    const result = detectMeasurementTrend([90, 91, 90, 91]);
    expect(result).toBeNull();
  });

  it('is not thrown off by a single noisy outlier reading, given enough surrounding data', () => {
    // One odd high reading among several stable ones — with enough points,
    // it gets diluted into the average rather than swinging it past the
    // threshold. (With very few points, a single outlier CAN still move a
    // half-average enough to register — an honest limitation of comparing
    // averages rather than something more outlier-resistant like a median;
    // this test verifies the method works as intended once there's a
    // reasonable amount of surrounding data, not that it's outlier-proof
    // at any sample size.)
    const result = detectMeasurementTrend([90, 90, 90, 96, 90, 90, 90]);
    expect(result).toBeNull();
  });

  it('respects a custom minimum change threshold', () => {
    const values = [90, 91, 92, 93]; // +3cm total
    expect(detectMeasurementTrend(values, 5)).toBeNull(); // below a looser 5cm threshold
    expect(detectMeasurementTrend(values, 2)).not.toBeNull(); // above a tighter 2cm threshold
  });

  it('reports the measurement count and rounds the change reasonably', () => {
    const result = detectMeasurementTrend([90, 90, 95, 95]);
    expect(result!.measurementCount).toBe(4);
    expect(result!.totalChangeCm).toBeGreaterThan(0);
  });
});

describe('analyzeBody waist trend integration', () => {
  it('is null when no history is provided at all', () => {
    const result = analyzeBody(metric({ waist: 90 }));
    expect(result.waistTrend).toBeNull();
  });

  it('is null when history has fewer than 3 waist readings', () => {
    const history = [metric({ waist: 88 }), metric({ waist: 90 })];
    const result = analyzeBody(metric({ waist: 90 }), null, history);
    expect(result.waistTrend).toBeNull();
  });

  it('reflects a real increasing trend from the provided history', () => {
    const history = [
      metric({ waist: 88 }),
      metric({ waist: 89 }),
      metric({ waist: 94 }),
      metric({ waist: 95 }),
    ];
    const result = analyzeBody(metric({ waist: 95 }), null, history);
    expect(result.waistTrend).not.toBeNull();
    expect(result.waistTrend!.direction).toBe('increasing');
  });

  it('skips history entries where waist was not recorded, without crashing', () => {
    const history = [
      metric({ waist: 88 }),
      metric({ waist: null }),
      metric({ waist: 94 }),
      metric({ waist: 95 }),
    ];
    expect(() => analyzeBody(metric({ waist: 95 }), null, history)).not.toThrow();
  });
});

describe('analyzeBody', () => {
  it('returns hasData=false with no measurements at all', () => {
    const result = analyzeBody(null);
    expect(result.hasData).toBe(false);
    expect(result.focusAreas).toEqual([]);
  });

  it('flags small arms relative to legs for extra biceps/triceps volume', () => {
    const result = analyzeBody(metric({ arm: 30, thigh: 70 })); // ratio 0.43 < 0.45
    expect(result.hasData).toBe(true);
    expect(result.focusAreas).toContain('biceps');
  });

  it('flags small legs relative to arms for extra quad volume', () => {
    const result = analyzeBody(metric({ arm: 42, thigh: 65 })); // ratio 0.646 > 0.62
    expect(result.focusAreas).toContain('quads');
  });

  it('does not flag anything for well-balanced proportions', () => {
    // arm/thigh ~0.55 (mid-range), chest/waist and thigh/chest also mid-range
    const result = analyzeBody(metric({ arm: 38, thigh: 68, chest: 100, waist: 82 }));
    const highSeverity = result.imbalances.filter(i => i.severity === 'high');
    expect(highSeverity.length).toBe(0);
  });

  it('NEVER implies exercise can spot-reduce fat from a body part', () => {
    // A body composition signal that should trigger the conditioning note,
    // not a claim that ab/cardio work burns fat specifically off the waist.
    const result = analyzeBody(metric({ waist: 95, hips: 100 })); // ratio 0.95 > 0.9
    expect(result.suggestConditioning).toBe(true);

    const allText = [
      result.summary,
      result.conditioningNote,
      ...result.imbalances.map(i => i.description),
    ].join(' ').toLowerCase();

    // Regression guard for the spot-reduction myth this app used to imply.
    expect(allText).not.toMatch(/reduzir gordura abdominal/);
    expect(allText).not.toMatch(/queimar gordura da barriga/);
    expect(allText).not.toMatch(/foca em abdominais e cardio para reduzir/);
  });

  it('computes BMI only when both height and weight are available', () => {
    const withHeight = analyzeBody(metric({ weight: 80 }), 180);
    expect(withHeight.bmi).toBeCloseTo(80 / (1.8 * 1.8), 2);

    const noHeight = analyzeBody(metric({ weight: 80 }), null);
    expect(noHeight.bmi).toBeNull();

    const noWeight = analyzeBody(metric({}), 180);
    expect(noWeight.bmi).toBeNull();
  });

  it('caps focusAreas at 4 and prioritizes higher severity first', () => {
    const result = analyzeBody(metric({ arm: 28, thigh: 70, chest: 90, waist: 95 }));
    expect(result.focusAreas.length).toBeLessThanOrEqual(4);
    const severityOrder = { high: 0, medium: 1, low: 2 };
    const severities = result.imbalances.map(i => severityOrder[i.severity]);
    for (let i = 1; i < severities.length; i++) {
      expect(severities[i]).toBeGreaterThanOrEqual(severities[i - 1]);
    }
  });
});
