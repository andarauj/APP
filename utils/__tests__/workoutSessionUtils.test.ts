import { moveExerciseInSession } from '../workoutSessionUtils';

/** Shape mirrors app/workout/active.tsx's ActiveExercise closely enough to
 *  catch anything that touches set-level fields it shouldn't. */
function exercise(overrides: { exerciseId: number; name: string; sets?: any[] }) {
  return {
    exerciseId: overrides.exerciseId,
    name: overrides.name,
    primaryMuscle: 'chest',
    equipment: 'barbell',
    sets: overrides.sets ?? [
      { reps: '10', weight: '60', rpe: null, setType: 'normal', done: false, dbId: null },
    ],
    defaultSets: 3,
    defaultRepsTarget: '8-12',
    defaultWeight: 60,
    restSeconds: 90,
    expanded: false,
  };
}

describe('moveExerciseInSession', () => {
  it('swaps an exercise with the one below it', () => {
    const list = [exercise({ exerciseId: 1, name: 'A' }), exercise({ exerciseId: 2, name: 'B' }), exercise({ exerciseId: 3, name: 'C' })];

    const result = moveExerciseInSession(list, 0, 1);

    expect(result.map(e => e.name)).toEqual(['B', 'A', 'C']);
  });

  it('swaps an exercise with the one above it', () => {
    const list = [exercise({ exerciseId: 1, name: 'A' }), exercise({ exerciseId: 2, name: 'B' }), exercise({ exerciseId: 3, name: 'C' })];

    const result = moveExerciseInSession(list, 2, -1);

    expect(result.map(e => e.name)).toEqual(['A', 'C', 'B']);
  });

  it('is a no-op moving the first exercise up', () => {
    const list = [exercise({ exerciseId: 1, name: 'A' }), exercise({ exerciseId: 2, name: 'B' })];

    const result = moveExerciseInSession(list, 0, -1);

    expect(result).toBe(list); // same reference: callers can skip a bounds check
    expect(result.map(e => e.name)).toEqual(['A', 'B']);
  });

  it('is a no-op moving the last exercise down', () => {
    const list = [exercise({ exerciseId: 1, name: 'A' }), exercise({ exerciseId: 2, name: 'B' })];

    const result = moveExerciseInSession(list, 1, 1);

    expect(result).toBe(list);
    expect(result.map(e => e.name)).toEqual(['A', 'B']);
  });

  it('is a no-op on an out-of-range index in either direction', () => {
    const list = [exercise({ exerciseId: 1, name: 'A' })];

    expect(moveExerciseInSession(list, -1, 1)).toBe(list);
    expect(moveExerciseInSession(list, 5, -1)).toBe(list);
  });

  it('is a no-op on an empty or single-item list', () => {
    expect(moveExerciseInSession([], 0, 1)).toEqual([]);
    const single = [exercise({ exerciseId: 1, name: 'A' })];
    expect(moveExerciseInSession(single, 0, 1)).toBe(single);
    expect(moveExerciseInSession(single, 0, -1)).toBe(single);
  });

  it('never touches sets, dbId, done state, or any other field of the moved exercises', () => {
    const loggedSets = [
      { reps: '8', weight: '80', rpe: 8, setType: 'normal' as const, done: true, dbId: 501, previousReps: '8', previousWeight: '77.5' },
      { reps: '', weight: '', rpe: null, setType: 'normal' as const, done: false, dbId: null },
    ];
    const a = exercise({ exerciseId: 1, name: 'Supino', sets: loggedSets });
    const b = exercise({ exerciseId: 2, name: 'Remada' });

    const result = moveExerciseInSession([a, b], 0, 1);

    // Position changed...
    expect(result.map(e => e.exerciseId)).toEqual([2, 1]);
    // ...but the exercise objects themselves, and everything inside them
    // (crucially the already-logged set with its dbId and done:true), are
    // the exact same references — nothing was rebuilt or reset.
    expect(result[1]).toBe(a);
    expect(result[1].sets).toBe(loggedSets);
    expect(result[1].sets[0]).toEqual({ reps: '8', weight: '80', rpe: 8, setType: 'normal', done: true, dbId: 501, previousReps: '8', previousWeight: '77.5' });
  });

  it('does not mutate the input array', () => {
    const list = [exercise({ exerciseId: 1, name: 'A' }), exercise({ exerciseId: 2, name: 'B' })];
    const snapshot = [...list];

    moveExerciseInSession(list, 0, 1);

    expect(list).toEqual(snapshot);
  });

  it('reorders correctly across every adjacent pair in a longer list', () => {
    const list = [1, 2, 3, 4, 5].map(n => exercise({ exerciseId: n, name: String(n) }));

    let result = list;
    for (let i = 0; i < list.length - 1; i++) {
      result = moveExerciseInSession(result, i, 1);
    }

    // Each step bubbles the front item one step further right.
    expect(result.map(e => e.name)).toEqual(['2', '3', '4', '5', '1']);
  });
});
