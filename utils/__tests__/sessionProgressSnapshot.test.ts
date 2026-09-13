import { sessionProgressFromSets } from '../sessionProgressSnapshot';

describe('sessionProgressFromSets', () => {
  it('returns fallback when no sets', () => {
    expect(sessionProgressFromSets([], 'Squat')).toEqual({
      doneSets: 0,
      currentExerciseName: 'Squat',
    });
  });

  it('uses the most recently completed exercise name', () => {
    const result = sessionProgressFromSets(
      [
        { exercise_name: 'Bench', completed_at: 100 },
        { exercise_name: 'Row', completed_at: 200 },
        { exercise_name: 'Bench', completed_at: 150 },
      ],
      'Fallback',
    );
    expect(result).toEqual({ doneSets: 3, currentExerciseName: 'Row' });
  });
});
