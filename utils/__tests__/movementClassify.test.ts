import { mainPattern, movementBucket, tallyMovementBuckets } from '../movementClassify';

describe('mainPattern — the five compounds', () => {
  it('recognises the barbell lifts by name', () => {
    expect(mainPattern('Barbell Bench Press', 'chest')).toBe('bench');
    expect(mainPattern('Barbell Back Squat', 'quads')).toBe('squat');
    expect(mainPattern('Conventional Deadlift', 'hamstrings')).toBe('deadlift');
    expect(mainPattern('Bent Over Barbell Row', 'back')).toBe('row');
    expect(mainPattern('Standing Overhead Press', 'shoulders')).toBe('ohp');
  });

  it('romanian deadlift and good morning fold into the deadlift pattern', () => {
    expect(mainPattern('Romanian Deadlift', 'hamstrings')).toBe('deadlift');
    expect(mainPattern('Good Morning', 'hamstrings')).toBe('deadlift');
  });

  it('row wins over bench for a "seal row" done on a bench', () => {
    expect(mainPattern('Seal Row', 'back')).toBe('row');
  });

  it('variants still map', () => {
    expect(mainPattern('Front Squat', 'quads')).toBe('squat');
    expect(mainPattern('Hack Squat', 'quads')).toBe('squat');
    expect(mainPattern('Dumbbell Shoulder Press', 'shoulders')).toBe('ohp');
    expect(mainPattern('Push Press', 'shoulders')).toBe('ohp');
  });

  it('upright row is NOT a horizontal-pull compound', () => {
    expect(mainPattern('Upright Row', 'shoulders')).not.toBe('row');
  });

  it('isolation / accessory work is null', () => {
    expect(mainPattern('Dumbbell Bicep Curl', 'biceps')).toBeNull();
    expect(mainPattern('Cable Tricep Pushdown', 'triceps')).toBeNull();
    expect(mainPattern('Leg Extension', 'quads')).toBeNull();
    expect(mainPattern('Lateral Raise', 'shoulders')).toBeNull();
  });
});

describe('movementBucket — six balance buckets', () => {
  it('horizontal push', () => {
    expect(movementBucket('Barbell Bench Press', 'chest')).toBe('horiz_push');
    expect(movementBucket('Push-up', 'chest')).toBe('horiz_push');
    expect(movementBucket('Chest Dip', 'chest')).toBe('horiz_push');
    expect(movementBucket('Incline Dumbbell Press', 'chest')).toBe('horiz_push');
  });

  it('vertical push', () => {
    expect(movementBucket('Overhead Press', 'shoulders')).toBe('vert_push');
    expect(movementBucket('Arnold Press', 'shoulders')).toBe('vert_push');
    expect(movementBucket('Lateral Raise', 'shoulders')).toBe('vert_push');
    expect(movementBucket('Upright Row', 'shoulders')).toBe('vert_push');
  });

  it('horizontal pull', () => {
    expect(movementBucket('Bent Over Row', 'back')).toBe('horiz_pull');
    expect(movementBucket('Seated Cable Row', 'back')).toBe('horiz_pull');
    expect(movementBucket('Face Pull', 'shoulders')).toBe('horiz_pull');
    expect(movementBucket('Reverse Pec Deck', 'shoulders')).toBe('horiz_pull');
  });

  it('vertical pull', () => {
    expect(movementBucket('Pull-up', 'back')).toBe('vert_pull');
    expect(movementBucket('Lat Pulldown', 'back')).toBe('vert_pull');
    expect(movementBucket('Chin-up', 'back')).toBe('vert_pull');
  });

  it('quad', () => {
    expect(movementBucket('Back Squat', 'quads')).toBe('quad');
    expect(movementBucket('Leg Press', 'quads')).toBe('quad');
    expect(movementBucket('Walking Lunge', 'quads')).toBe('quad');
    expect(movementBucket('Leg Extension', 'quads')).toBe('quad');
    expect(movementBucket('Bulgarian Split Squat', 'glutes')).toBe('quad');
  });

  it('hinge', () => {
    expect(movementBucket('Deadlift', 'hamstrings')).toBe('hinge');
    expect(movementBucket('Romanian Deadlift', 'hamstrings')).toBe('hinge');
    expect(movementBucket('Hip Thrust', 'glutes')).toBe('hinge');
    expect(movementBucket('Lying Leg Curl', 'hamstrings')).toBe('hinge');
    expect(movementBucket('Back Extension', 'hamstrings')).toBe('hinge');
  });

  it('arms / abs / calves / cardio are not bucketed', () => {
    expect(movementBucket('Bicep Curl', 'biceps')).toBeNull();
    expect(movementBucket('Tricep Pushdown', 'triceps')).toBeNull();
    expect(movementBucket('Plank', 'abs')).toBeNull();
    expect(movementBucket('Standing Calf Raise', 'calves')).toBeNull();
    expect(movementBucket('Treadmill Run', 'cardio')).toBeNull();
  });

  it('falls back to the primary muscle when the name is unusual', () => {
    expect(movementBucket('Machine Chest Thing', 'chest')).toBe('horiz_push');
    expect(movementBucket('Some Delt Machine', 'shoulders')).toBe('vert_push');
    expect(movementBucket('Posterior Chain Machine', 'glutes')).toBe('hinge');
  });
});

describe('tallyMovementBuckets', () => {
  it('counts sets per bucket, dropping the unclassifiable ones', () => {
    const out = tallyMovementBuckets([
      { name: 'Bench Press', primaryMuscle: 'chest' },
      { name: 'Bench Press', primaryMuscle: 'chest' },
      { name: 'Back Squat', primaryMuscle: 'quads' },
      { name: 'Bicep Curl', primaryMuscle: 'biceps' }, // dropped
    ]);
    const map = Object.fromEntries(out.map(b => [b.bucket, b.sets]));
    expect(map.horiz_push).toBe(2);
    expect(map.quad).toBe(1);
    expect(map.hinge).toBeUndefined();
    expect(out.reduce((s, b) => s + b.sets, 0)).toBe(3);
  });
});
