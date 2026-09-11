import { idealSetSeconds, rateSetPace, summarizeWorkoutPace } from '../setPace';

describe('idealSetSeconds', () => {
  it('is reps * seconds-per-rep', () => {
    expect(idealSetSeconds(10, 3)) .toBe(30);
  });
  it('never goes negative for negative reps', () => {
    expect(idealSetSeconds(-5, 3)).toBe(0);
  });
});

describe('rateSetPace', () => {
  it('is unmeasured when there is no recorded duration', () => {
    expect(rateSetPace(10, 0)).toBe('unmeasured');
  });
  it('is unmeasured when reps is 0 (no ideal to compare against)', () => {
    expect(rateSetPace(0, 20)).toBe('unmeasured');
  });
  it('flags a set finished much faster than the ideal as fast', () => {
    // 10 reps @ 3s/rep = 30s ideal; done in 15s (50%) -> rushed
    expect(rateSetPace(10, 15)).toBe('fast');
  });
  it('flags a set that dragged on much longer than ideal as slow', () => {
    // 30s ideal, took 60s (200%) -> dragged out
    expect(rateSetPace(10, 60)).toBe('slow');
  });
  it('rates a set within a reasonable band of the ideal as good', () => {
    expect(rateSetPace(10, 30)).toBe('good'); // exactly on pace
    expect(rateSetPace(10, 25)).toBe('good'); // a bit quick, still fine
    expect(rateSetPace(10, 40)).toBe('good'); // a bit slow, still fine
  });
});

describe('summarizeWorkoutPace', () => {
  it('is unmeasured when no set has a recorded duration', () => {
    const result = summarizeWorkoutPace([{ reps: 10, actualSeconds: 0 }, { reps: 8, actualSeconds: 0 }]);
    expect(result.verdict).toBe('unmeasured');
    expect(result.measuredSets).toBe(0);
    expect(result.totalSets).toBe(2);
  });

  it('reaches a "fast" verdict when most measured sets are rushed', () => {
    const sets = [
      { reps: 10, actualSeconds: 15 }, // fast
      { reps: 10, actualSeconds: 15 }, // fast
      { reps: 10, actualSeconds: 30 }, // good
    ];
    const result = summarizeWorkoutPace(sets);
    expect(result.verdict).toBe('fast');
    expect(result.fastCount).toBe(2);
    expect(result.measuredSets).toBe(3);
  });

  it('reaches a "slow" verdict when most measured sets drag on', () => {
    const sets = [
      { reps: 10, actualSeconds: 60 }, // slow
      { reps: 10, actualSeconds: 60 }, // slow
      { reps: 10, actualSeconds: 30 }, // good
    ];
    expect(summarizeWorkoutPace(sets).verdict).toBe('slow');
  });

  it('falls back to "mixed" when no single rating has a majority', () => {
    const sets = [
      { reps: 10, actualSeconds: 15 }, // fast
      { reps: 10, actualSeconds: 60 }, // slow
    ];
    expect(summarizeWorkoutPace(sets).verdict).toBe('mixed');
  });

  it('ignores unmeasured sets when computing the verdict, but counts them in totalSets', () => {
    const sets = [
      { reps: 10, actualSeconds: 30 }, // good
      { reps: 10, actualSeconds: 0 },  // unmeasured, excluded
    ];
    const result = summarizeWorkoutPace(sets);
    expect(result.verdict).toBe('good');
    expect(result.measuredSets).toBe(1);
    expect(result.totalSets).toBe(2);
  });

  it('computes average actual and ideal seconds across measured sets only', () => {
    const sets = [
      { reps: 10, actualSeconds: 20 },
      { reps: 10, actualSeconds: 40 },
    ];
    const result = summarizeWorkoutPace(sets);
    expect(result.avgActualSeconds).toBe(30);
    expect(result.avgIdealSeconds).toBe(30);
  });
});
