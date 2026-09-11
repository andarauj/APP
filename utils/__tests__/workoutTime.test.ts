import { estimateDaySeconds, estimateDayMinutes, formatMinutes } from '../workoutTime';

describe('estimateDaySeconds', () => {
  it('is 0 for an empty day', () => {
    expect(estimateDaySeconds([])).toBe(0);
  });
  it('counts exec time + rest between sets for a single exercise', () => {
    // 3 sets @ 35s each = 105, + 2 rests of 60s = 120 -> 225
    expect(estimateDaySeconds([{ sets: 3, restSeconds: 60 }])).toBe(225);
  });
  it('a single-set exercise has no internal rest', () => {
    expect(estimateDaySeconds([{ sets: 1, restSeconds: 90 }])).toBe(35);
  });
  it('adds a transition between exercises but not before the first or after the last', () => {
    const oneExercise = estimateDaySeconds([{ sets: 3, restSeconds: 60 }]);
    const twoExercises = estimateDaySeconds([{ sets: 3, restSeconds: 60 }, { sets: 3, restSeconds: 60 }]);
    expect(twoExercises).toBe(oneExercise * 2 + 45);
  });
  it('more sets or longer rest increases the estimate', () => {
    const base = estimateDaySeconds([{ sets: 3, restSeconds: 60 }]);
    expect(estimateDaySeconds([{ sets: 4, restSeconds: 60 }])).toBeGreaterThan(base);
    expect(estimateDaySeconds([{ sets: 3, restSeconds: 120 }])).toBeGreaterThan(base);
  });
  it('guards against negative sets/rest', () => {
    expect(estimateDaySeconds([{ sets: -1, restSeconds: -10 }])).toBe(0);
  });
});

describe('estimateDayMinutes', () => {
  it('rounds seconds to the nearest minute', () => {
    expect(estimateDayMinutes([{ sets: 3, restSeconds: 60 }])).toBe(4); // 225s -> 3.75 -> 4
  });
});

describe('formatMinutes', () => {
  it('shows minutes under an hour', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(0)).toBe('0 min');
  });
  it('shows hours (+minutes) at/over 60', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(90)).toBe('1h30');
    expect(formatMinutes(125)).toBe('2h05');
  });
});
