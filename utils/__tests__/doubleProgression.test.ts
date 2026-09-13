import {
  evaluateDoubleProgression,
  parseRepRange,
} from '../doubleProgression';

describe('parseRepRange', () => {
  it('reads 8-10 and en-dash ranges', () => {
    expect(parseRepRange('8-10')).toEqual({ low: 8, high: 10 });
    expect(parseRepRange('12–15')).toEqual({ low: 12, high: 15 });
    expect(parseRepRange('10')).toEqual({ low: 10, high: 10 });
  });
});

describe('evaluateDoubleProgression', () => {
  it('10/10/10 on 8–10 increases load', () => {
    const r = evaluateDoubleProgression({
      sets: [{ reps: 10, weight: 50 }, { reps: 10, weight: 50 }, { reps: 10, weight: 50 }],
      repsLow: 8,
      repsHigh: 10,
      increment: 2.5,
    });
    expect(r.action).toBe('increase');
    expect(r.nextWeight).toBeGreaterThan(50);
  });

  it('10/9/8 on 8–10 holds the same weight', () => {
    const r = evaluateDoubleProgression({
      sets: [{ reps: 10, weight: 50 }, { reps: 9, weight: 50 }, { reps: 8, weight: 50 }],
      repsLow: 8,
      repsHigh: 10,
      increment: 2.5,
    });
    expect(r.action).toBe('hold');
    expect(r.nextWeight).toBe(50);
  });

  it('two sessions below the floor trigger a mini-deload', () => {
    const r = evaluateDoubleProgression({
      sets: [{ reps: 6, weight: 50 }, { reps: 6, weight: 50 }, { reps: 5, weight: 50 }],
      repsLow: 8,
      repsHigh: 10,
      increment: 2.5,
      priorBelowMinSessions: 1,
    });
    expect(r.action).toBe('minideload');
    expect(r.nextWeight).toBeLessThan(50);
    expect(r.nextWeight).toBeGreaterThanOrEqual(50 * 0.88);
  });

  it('a single failure only holds', () => {
    const r = evaluateDoubleProgression({
      sets: [{ reps: 6, weight: 50 }, { reps: 7, weight: 50 }, { reps: 7, weight: 50 }],
      repsLow: 8,
      repsHigh: 10,
      increment: 2.5,
      priorBelowMinSessions: 0,
    });
    expect(r.action).toBe('hold');
    expect(r.nextWeight).toBe(50);
    expect(r.nextBelowMinSessions).toBe(1);
  });
});
