import { findSupersetPartner, type SupersetCheckExercise } from '../supersets';

function ex(supersetGroup: number | null, doneFlags: boolean[]): SupersetCheckExercise {
  return { supersetGroup, sets: doneFlags.map(done => ({ done })) };
}

describe('findSupersetPartner', () => {
  it('returns null when the exercise is not part of any superset', () => {
    const exercises = [ex(null, [false, false]), ex(null, [false, false])];
    expect(findSupersetPartner(exercises, 0, 0)).toBeNull();
  });

  it('finds the paired exercise in the same group with an undone set at the same round', () => {
    const exercises = [ex(1, [true, false]), ex(1, [false, false])];
    // Exercise 0 just finished set index 0 — exercise 1's set 0 is still undone.
    expect(findSupersetPartner(exercises, 0, 0)).toBe(1);
  });

  it('returns null once the partner has already done this round (time to actually rest)', () => {
    const exercises = [ex(1, [true, true]), ex(1, [true, false])];
    // Both exercises' set index 0 are done — nothing left to pair for this round.
    expect(findSupersetPartner(exercises, 0, 0)).toBeNull();
  });

  it('never matches an exercise from a different superset group', () => {
    const exercises = [ex(1, [true, false]), ex(2, [false, false])];
    expect(findSupersetPartner(exercises, 0, 0)).toBeNull();
  });

  it('ignores an exercise with no set at that index (fewer sets than its partner)', () => {
    const exercises = [ex(1, [true, true, false]), ex(1, [false])]; // partner only has 1 set
    // Completed round index 2 on exercise 0 — exercise 1 has no set[2] at all.
    expect(findSupersetPartner(exercises, 0, 2)).toBeNull();
  });

  it('supports a 3-exercise giant set, finding whichever partner is still pending', () => {
    const exercises = [ex(1, [true]), ex(1, [true]), ex(1, [false])];
    expect(findSupersetPartner(exercises, 0, 0)).toBe(2);
  });

  it('never returns the completed exercise itself as its own partner', () => {
    const exercises = [ex(1, [false])];
    expect(findSupersetPartner(exercises, 0, 0)).toBeNull();
  });
});
