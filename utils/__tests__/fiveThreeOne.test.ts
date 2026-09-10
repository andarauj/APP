import {
  getFiveThreeOneSets,
  nextTrainingMax,
  trainingMaxFromEstimated1RM,
  roundToPlate,
  FIVE31_TM_INCREMENT,
} from '../fiveThreeOne';

describe('roundToPlate', () => {
  it('rounds to the nearest 2.5kg by default', () => {
    expect(roundToPlate(101)).toBe(100);
    expect(roundToPlate(102.5)).toBe(102.5);
    expect(roundToPlate(103.8)).toBe(105);
  });
});

describe('getFiveThreeOneSets — week 1 ("5s")', () => {
  const sets = getFiveThreeOneSets(100, 1);

  it('uses 65/75/85% of the training max', () => {
    expect(sets.map(s => s.percent)).toEqual([65, 75, 85]);
    expect(sets.map(s => s.weight)).toEqual([65, 75, 85]);
  });

  it('every set is 5 reps, with the last marked AMRAP ("5+")', () => {
    expect(sets[0].reps).toBe('5');
    expect(sets[1].reps).toBe('5');
    expect(sets[2].reps).toBe('5+');
    expect(sets[0].isAmrap).toBe(false);
    expect(sets[2].isAmrap).toBe(true);
  });
});

describe('getFiveThreeOneSets — week 2 ("3s")', () => {
  it('uses 70/80/90% at 3 reps, last set AMRAP ("3+")', () => {
    const sets = getFiveThreeOneSets(100, 2);
    expect(sets.map(s => s.percent)).toEqual([70, 80, 90]);
    expect(sets.map(s => s.reps)).toEqual(['3', '3', '3+']);
    expect(sets[2].isAmrap).toBe(true);
  });
});

describe('getFiveThreeOneSets — week 3 ("5/3/1")', () => {
  it('uses 75/85/95% at 5/3/1 reps, last set AMRAP ("1+")', () => {
    const sets = getFiveThreeOneSets(100, 3);
    expect(sets.map(s => s.percent)).toEqual([75, 85, 95]);
    expect(sets.map(s => s.reps)).toEqual(['5', '3', '1+']);
    expect(sets[2].isAmrap).toBe(true);
  });
});

describe('getFiveThreeOneSets — week 4 (deload)', () => {
  it('uses 40/50/60% at 5 reps, and — critically — is NEVER AMRAP', () => {
    const sets = getFiveThreeOneSets(100, 4);
    expect(sets.map(s => s.percent)).toEqual([40, 50, 60]);
    expect(sets.every(s => !s.isAmrap)).toBe(true);
    expect(sets.every(s => s.reps === '5')).toBe(true);
  });
});

describe('getFiveThreeOneSets — weight rounding', () => {
  it('rounds every prescribed weight to a loadable 2.5kg increment', () => {
    // A training max that produces awkward, non-round percentages.
    const sets = getFiveThreeOneSets(137, 3); // 75%=102.75, 85%=116.45, 95%=130.15
    for (const s of sets) {
      expect(s.weight % 2.5).toBe(0);
    }
  });
});

describe('getFiveThreeOneSets — out-of-range week is clamped, not thrown', () => {
  it('clamps below 1 to week 1 and above 4 to week 4 (deload)', () => {
    expect(getFiveThreeOneSets(100, 0)).toEqual(getFiveThreeOneSets(100, 1));
    expect(getFiveThreeOneSets(100, 5)).toEqual(getFiveThreeOneSets(100, 4));
    expect(getFiveThreeOneSets(100, -3)).toEqual(getFiveThreeOneSets(100, 1));
  });
});

describe('nextTrainingMax', () => {
  it('adds +5kg for lower-body lifts (squat, deadlift)', () => {
    expect(nextTrainingMax(100, 'squat')).toBe(105);
    expect(nextTrainingMax(100, 'deadlift')).toBe(105);
  });

  it('adds +2.5kg for upper-body lifts (bench, press)', () => {
    expect(nextTrainingMax(100, 'bench')).toBe(102.5);
    expect(nextTrainingMax(100, 'press')).toBe(102.5);
  });

  it('matches the exported increment table exactly (regression guard)', () => {
    for (const lift of ['squat', 'bench', 'deadlift', 'press'] as const) {
      expect(nextTrainingMax(100, lift)).toBe(100 + FIVE31_TM_INCREMENT[lift]);
    }
  });
});

describe('trainingMaxFromEstimated1RM', () => {
  it('uses ~90% of the estimated 1RM, rounded to a loadable weight', () => {
    expect(trainingMaxFromEstimated1RM(100)).toBe(90);
    expect(trainingMaxFromEstimated1RM(91)).toBe(82.5); // 81.9 -> nearest 2.5
  });

  it('never prescribes a training max above the estimated 1RM itself', () => {
    for (const orm of [60, 91, 137, 200]) {
      expect(trainingMaxFromEstimated1RM(orm)).toBeLessThan(orm);
    }
  });
});
