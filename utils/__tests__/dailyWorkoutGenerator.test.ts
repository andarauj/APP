import { selectTodaysMuscles, muscleGroupCountForMinutes, ROTATION_MUSCLES, pickMuscleNeedingMoreVolume, type MuscleRecency } from '../dailyWorkoutGenerator';
import type { MuscleGroup } from '@/types';

describe('muscleGroupCountForMinutes', () => {
  it('targets fewer muscle groups for shorter sessions', () => {
    expect(muscleGroupCountForMinutes(30)).toBe(2);
    expect(muscleGroupCountForMinutes(45)).toBe(2);
  });

  it('targets more muscle groups as time increases', () => {
    expect(muscleGroupCountForMinutes(60)).toBe(3);
    expect(muscleGroupCountForMinutes(90)).toBe(4);
  });

  it('never decreases as minutes increase (monotonic)', () => {
    const durations = [30, 45, 60, 75, 90];
    let prev = 0;
    for (const d of durations) {
      const count = muscleGroupCountForMinutes(d);
      expect(count).toBeGreaterThanOrEqual(prev);
      prev = count;
    }
  });
});

describe('selectTodaysMuscles', () => {
  function recency(overrides: Partial<Record<string, number | null>>): MuscleRecency[] {
    return ROTATION_MUSCLES.map(muscle => ({
      muscle,
      // BUGFIX (caught in this test file, not the implementation): `??`
      // treats an explicit `null` override the same as "not provided" and
      // falls back to the default — which silently broke the "never
      // trained" test case below, since it never actually got a null
      // through. `in` correctly distinguishes the two.
      daysSinceLastTrained: muscle in overrides ? overrides[muscle]! : 3,
    }));
  }

  it('picks the muscles trained longest ago first', () => {
    const r = recency({ chest: 10, back: 1, quads: 5 });
    const picked = selectTodaysMuscles(r, 2);
    expect(picked[0]).toBe('chest'); // 10 days — most overdue
    expect(picked).not.toContain('back'); // trained yesterday — least overdue
  });

  it('treats "never trained" as the most overdue of all', () => {
    const r = recency({ chest: null, back: 2, shoulders: 20 });
    const picked = selectTodaysMuscles(r, 1);
    expect(picked).toEqual(['chest']);
  });

  it('gives focus-area muscles a boost that breaks a close tie', () => {
    const r = recency({ chest: 3, back: 3 }); // exactly tied on recency
    const withoutFocus = selectTodaysMuscles(r, 1);
    const withFocus = selectTodaysMuscles(r, 1, ['back']);
    expect(withFocus).toEqual(['back']); // focus bonus breaks the tie
    // Without a focus area, the tie breaks by input order (chest listed first).
    expect(withoutFocus).toEqual(['chest']);
  });

  it('never lets a focus-area boost override a genuinely stale gap elsewhere', () => {
    // "back" is the focus area but was trained yesterday; "legs" isn't a
    // focus area but hasn't been trained in three weeks — legs should win.
    const r = recency({ back: 1, quads: 21 });
    const picked = selectTodaysMuscles(r, 1, ['back']);
    expect(picked).toEqual(['quads']);
  });

  it('returns exactly muscleCount muscles when enough are available', () => {
    const r = recency({});
    expect(selectTodaysMuscles(r, 3)).toHaveLength(3);
    expect(selectTodaysMuscles(r, 4)).toHaveLength(4);
  });

  it('never returns duplicate muscles', () => {
    const r = recency({});
    const picked = selectTodaysMuscles(r, 5);
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('naturally rotates away from whatever was just trained (the core "always different" behavior)', () => {
    // Simulates three consecutive days: after training a muscle, its
    // recency resets to 0, so tomorrow's selection should favor others.
    let state: Record<string, number> = Object.fromEntries(ROTATION_MUSCLES.map(m => [m, 5]));
    const trainedDayByDay: MuscleGroup[][] = [];

    for (let day = 0; day < 3; day++) {
      const r: MuscleRecency[] = ROTATION_MUSCLES.map(m => ({ muscle: m, daysSinceLastTrained: state[m] }));
      const picked = selectTodaysMuscles(r, 2);
      trainedDayByDay.push(picked);
      // Advance: everyone gets a day older, then whatever was picked today resets to 0.
      state = Object.fromEntries(ROTATION_MUSCLES.map(m => [m, picked.includes(m) ? 0 : state[m] + 1]));
    }

    // Day 2 should not repeat day 1's exact muscles (day 1's picks just got
    // reset to 0, making them the LEAST overdue, not the most).
    const day1 = new Set(trainedDayByDay[0]);
    const day2 = new Set(trainedDayByDay[1]);
    const overlap = [...day1].filter(m => day2.has(m));
    expect(overlap).toEqual([]);
  });

  it('pushes a fatigued muscle down the ranking even if it would otherwise be picked', () => {
    // "chest" is the most overdue by far, but has an active fatigue signal
    // — it should lose its spot to a less-overdue, non-fatigued muscle.
    const r = recency({ chest: 10, back: 4 });
    const withoutFatigue = selectTodaysMuscles(r, 1);
    const withFatigue = selectTodaysMuscles(r, 1, [], ['chest']);
    expect(withoutFatigue).toEqual(['chest']);
    expect(withFatigue).toEqual(['back']);
  });

  it('lets a fatigue penalty override a focus-area bonus for the same muscle', () => {
    // "chest" is both a focus area AND fatigued — the fatigue penalty
    // (3) outweighs the focus bonus (2), so it should still be deprioritized.
    const r = recency({ chest: 3, back: 3 }); // tied on recency
    const picked = selectTodaysMuscles(r, 1, ['chest'], ['chest']);
    expect(picked).toEqual(['back']);
  });

  it('still fills the day from remaining fresh muscles when some are fatigued', () => {
    const r = recency({ chest: 10, back: 9, shoulders: 8, biceps: 7 });
    const picked = selectTodaysMuscles(r, 2, [], ['chest', 'back']);
    expect(picked).toEqual(['shoulders', 'biceps']);
  });

  it('prefers a shorter session over forcing in a fatigued muscle when there are not enough fresh ones', () => {
    // Every muscle except "shoulders" is fatigued — only one truly fresh
    // option for a 2-muscle day. A focused 1-muscle session is safer than
    // padding it out with a fatigued one.
    const r = recency({});
    const allButShoulders = ROTATION_MUSCLES.filter(m => m !== 'shoulders');
    const picked = selectTodaysMuscles(r, 2, [], allButShoulders);
    expect(picked).toEqual(['shoulders']);
  });

  it('falls back to fatigued muscles only in the extreme case where every rotation muscle is flagged', () => {
    const allFatigued = ROTATION_MUSCLES;
    const r = recency({});
    const picked = selectTodaysMuscles(r, 2, [], allFatigued);
    // An empty workout would be worse than training something, even
    // fatigued — this is the one case where falling back is correct.
    expect(picked).toHaveLength(2);
  });

  it('supports excluding muscles already in today\'s workout (for the mid-session "add one more exercise" flow), not just fatigued ones', () => {
    // Chest/back/legs were already picked for today's session; asking for
    // one more should surface the next most-overdue muscle NOT already
    // present, exactly like excluding fatigued muscles works.
    const r = recency({ chest: 3, back: 3, quads: 3, shoulders: 8, biceps: 2 });
    const alreadyInWorkout: MuscleGroup[] = ['chest', 'back', 'quads'];
    const picked = selectTodaysMuscles(r, 1, [], alreadyInWorkout);
    expect(picked).toEqual(['shoulders']); // most overdue among what's left
    expect(picked).not.toEqual(expect.arrayContaining(alreadyInWorkout));
  });
});

describe('pickMuscleNeedingMoreVolume', () => {
  it('returns null for an empty workout', () => {
    expect(pickMuscleNeedingMoreVolume([])).toBeNull();
  });

  it('picks the muscle with the fewest exercises so far', () => {
    const muscles: MuscleGroup[] = ['chest', 'chest', 'chest', 'back'];
    expect(pickMuscleNeedingMoreVolume(muscles)).toBe('back');
  });

  it('breaks a tie by whichever muscle appeared first in the session', () => {
    const muscles: MuscleGroup[] = ['chest', 'back', 'shoulders'];
    // All tied at 1 exercise each — chest was first.
    expect(pickMuscleNeedingMoreVolume(muscles)).toBe('chest');
  });

  it('handles a single-exercise, single-muscle session', () => {
    expect(pickMuscleNeedingMoreVolume(['chest'])).toBe('chest');
  });

  it('correctly picks the least-covered muscle even with uneven distribution', () => {
    const muscles: MuscleGroup[] = ['chest', 'chest', 'back', 'shoulders', 'shoulders', 'shoulders'];
    expect(pickMuscleNeedingMoreVolume(muscles)).toBe('back');
  });
});
