import { nudgeAccessoryVolume, pushPullSetCounts } from '../movementBalance';
import type { MesocycleWorkout } from '../mesocycleMaterialize';

const week = (exercises: MesocycleWorkout['exercises']): MesocycleWorkout[] => ([
  { dayIndex: 0, dayLabel: 'A', exercises },
]);

describe('nudgeAccessoryVolume', () => {
  it('adds one set to a pull accessory when push volume is clearly higher', () => {
    const workouts = week([
      { exerciseId: 1, name: 'Barbell Bench Press', muscle: 'chest', order: 0, sets: 5, reps: '8-10', weight: 60, rest: 120 },
      { exerciseId: 2, name: 'Incline Dumbbell Press', muscle: 'chest', order: 1, sets: 4, reps: '10-12', weight: 20, rest: 90 },
      { exerciseId: 3, name: 'Barbell Row', muscle: 'back', order: 2, sets: 3, reps: '8-10', weight: 50, rest: 120 },
      { exerciseId: 4, name: 'Face Pull', muscle: 'back', order: 3, sets: 2, reps: '12-15', weight: 10, rest: 60 },
    ]);
    const before = pushPullSetCounts(workouts);
    expect(before.push).toBeGreaterThan(before.pull * 1.25);
    const after = nudgeAccessoryVolume(workouts);
    expect(after[0].exercises.find(e => e.name === 'Barbell Bench Press')?.sets).toBe(5);
    expect(after[0].exercises.find(e => e.name === 'Face Pull')?.sets).toBe(3);
  });

  it('is a no-op when push and pull are already close', () => {
    const workouts = week([
      { exerciseId: 1, name: 'Barbell Bench Press', muscle: 'chest', order: 0, sets: 4, reps: '8-10', weight: 60, rest: 120 },
      { exerciseId: 2, name: 'Barbell Row', muscle: 'back', order: 1, sets: 4, reps: '8-10', weight: 50, rest: 120 },
    ]);
    expect(nudgeAccessoryVolume(workouts)).toEqual(workouts);
  });
});
