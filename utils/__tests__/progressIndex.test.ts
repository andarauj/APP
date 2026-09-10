import { computeProgressIndex, type ProgressIndexInput } from '../progressIndex';

function baseInput(overrides: Partial<ProgressIndexInput> = {}): ProgressIndexInput {
  return {
    sessionsThisWeek: 0,
    avgSessionsPerWeek: 0,
    volumeThisWeek: 0,
    avgWeeklyVolume: 0,
    muscleSetsRecent: [],
    prCountRecent: 0,
    exercisesTrainedRecent: 0,
    previousScore: null,
    ...overrides,
  };
}

describe('computeProgressIndex — overall shape', () => {
  it('never exceeds 100 or goes below 0', () => {
    const zero = computeProgressIndex(baseInput());
    expect(zero.score).toBeGreaterThanOrEqual(0);
    expect(zero.score).toBeLessThanOrEqual(100);

    const max = computeProgressIndex(baseInput({
      sessionsThisWeek: 10, avgSessionsPerWeek: 3,
      volumeThisWeek: 5000, avgWeeklyVolume: 2000,
      muscleSetsRecent: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'].map(m => ({ muscle: m, sets: 10 })),
      prCountRecent: 10, exercisesTrainedRecent: 5,
    }));
    expect(max.score).toBeLessThanOrEqual(100);
  });

  it('produces exactly 4 components summing to the total score', () => {
    const result = computeProgressIndex(baseInput({ sessionsThisWeek: 3, avgSessionsPerWeek: 3 }));
    expect(result.components.length).toBe(4);
    const sum = result.components.reduce((s, c) => s + c.score, 0);
    expect(sum).toBe(result.score);
  });

  it('gives a brand new user (no history) full consistency/volume marks for showing up', () => {
    const result = computeProgressIndex(baseInput({
      sessionsThisWeek: 1, avgSessionsPerWeek: 0,
      volumeThisWeek: 500, avgWeeklyVolume: 0,
    }));
    const consistency = result.components.find(c => c.key === 'consistency')!;
    const volume = result.components.find(c => c.key === 'volume')!;
    expect(consistency.score).toBe(25);
    expect(volume.score).toBe(25);
  });
});

describe('consistency component', () => {
  it('scores full marks for matching your own average', () => {
    const result = computeProgressIndex(baseInput({ sessionsThisWeek: 4, avgSessionsPerWeek: 4 }));
    expect(result.components.find(c => c.key === 'consistency')!.score).toBe(25);
  });

  it('scores half marks for training half as often as usual', () => {
    const result = computeProgressIndex(baseInput({ sessionsThisWeek: 2, avgSessionsPerWeek: 4 }));
    expect(result.components.find(c => c.key === 'consistency')!.score).toBe(13); // round(25*0.5)
  });

  it('caps at 25 even when training far more than usual', () => {
    const result = computeProgressIndex(baseInput({ sessionsThisWeek: 10, avgSessionsPerWeek: 3 }));
    expect(result.components.find(c => c.key === 'consistency')!.score).toBe(25);
  });
});

describe('volume component', () => {
  it('does not penalize exceeding your own average volume', () => {
    const atAvg = computeProgressIndex(baseInput({ volumeThisWeek: 2000, avgWeeklyVolume: 2000 }));
    const aboveAvg = computeProgressIndex(baseInput({ volumeThisWeek: 4000, avgWeeklyVolume: 2000 }));
    expect(atAvg.components.find(c => c.key === 'volume')!.score).toBe(25);
    expect(aboveAvg.components.find(c => c.key === 'volume')!.score).toBe(25);
  });

  it('scores proportionally below the average', () => {
    const result = computeProgressIndex(baseInput({ volumeThisWeek: 1000, avgWeeklyVolume: 2000 }));
    expect(result.components.find(c => c.key === 'volume')!.score).toBe(13); // round(25*0.5)
  });
});

describe('balance component', () => {
  it('rewards broad muscle coverage over a 2-week window', () => {
    const allTen = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs']
      .map(m => ({ muscle: m, sets: 8 }));
    const result = computeProgressIndex(baseInput({ muscleSetsRecent: allTen }));
    expect(result.components.find(c => c.key === 'balance')!.score).toBe(25);
  });

  it('does not count a muscle below the minimum-sets threshold', () => {
    const result = computeProgressIndex(baseInput({
      muscleSetsRecent: [{ muscle: 'chest', sets: 1 }], // below MIN_SETS_TO_COUNT_AS_TRAINED
    }));
    expect(result.components.find(c => c.key === 'balance')!.score).toBe(0);
  });

  it('ignores cardio/mobility/fullbody — they are not "a muscle to balance"', () => {
    const result = computeProgressIndex(baseInput({
      muscleSetsRecent: [{ muscle: 'cardio', sets: 20 }, { muscle: 'mobility', sets: 20 }],
    }));
    expect(result.components.find(c => c.key === 'balance')!.score).toBe(0);
  });

  it('gives partial credit for partial coverage', () => {
    const result = computeProgressIndex(baseInput({
      muscleSetsRecent: [{ muscle: 'chest', sets: 8 }, { muscle: 'back', sets: 8 }], // 2 of 10
    }));
    expect(result.components.find(c => c.key === 'balance')!.score).toBe(5); // round(25*0.2)
  });
});

describe('progression component', () => {
  it('gives full marks for PRs on roughly a third of trained exercises', () => {
    const result = computeProgressIndex(baseInput({ prCountRecent: 2, exercisesTrainedRecent: 6 }));
    expect(result.components.find(c => c.key === 'progression')!.score).toBe(25);
  });

  it('scores 0 with no PRs at all', () => {
    const result = computeProgressIndex(baseInput({ prCountRecent: 0, exercisesTrainedRecent: 6 }));
    expect(result.components.find(c => c.key === 'progression')!.score).toBe(0);
  });

  it('scores 0 (not a crash) with no exercises trained at all', () => {
    const result = computeProgressIndex(baseInput({ prCountRecent: 0, exercisesTrainedRecent: 0 }));
    expect(result.components.find(c => c.key === 'progression')!.score).toBe(0);
  });
});

describe('trend', () => {
  it('is null with no previous score to compare against', () => {
    const result = computeProgressIndex(baseInput({ previousScore: null }));
    expect(result.trend).toBeNull();
  });

  it('reports up/down/stable based on the score delta', () => {
    const input = baseInput({ sessionsThisWeek: 3, avgSessionsPerWeek: 3, volumeThisWeek: 1000, avgWeeklyVolume: 1000 });
    const currentScore = computeProgressIndex(input).score;

    expect(computeProgressIndex({ ...input, previousScore: currentScore - 10 }).trend).toBe('up');
    expect(computeProgressIndex({ ...input, previousScore: currentScore + 10 }).trend).toBe('down');
    expect(computeProgressIndex({ ...input, previousScore: currentScore }).trend).toBe('stable');
  });
});
