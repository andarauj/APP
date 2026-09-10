import {
  ACHIEVEMENTS,
  getUnlockedAchievementIds,
  getNewlyUnlocked,
  getProgressToward,
  type AchievementStats,
} from '../achievements';

function stats(overrides: Partial<AchievementStats> = {}): AchievementStats {
  return { totalWorkouts: 0, longestStreak: 0, prCount: 0, totalVolume: 0, ...overrides };
}

describe('achievement catalog integrity', () => {
  it('has no duplicate ids', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every achievement has a non-empty title and description', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.trim().length).toBeGreaterThan(0);
      expect(a.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('thresholds within each category are strictly increasing (no redundant tiers)', () => {
    const categories = [...new Set(ACHIEVEMENTS.map(a => a.category))];
    for (const cat of categories) {
      const thresholds = ACHIEVEMENTS.filter(a => a.category === cat).map(a => a.threshold);
      const sorted = [...thresholds].sort((a, b) => a - b);
      expect(thresholds).toEqual(sorted);
      expect(new Set(thresholds).size).toBe(thresholds.length);
    }
  });
});

describe('getUnlockedAchievementIds', () => {
  it('unlocks nothing for a brand new user', () => {
    expect(getUnlockedAchievementIds(stats())).toEqual([]);
  });

  it('unlocks exactly the tiers at or below the current stat, nothing above', () => {
    const result = getUnlockedAchievementIds(stats({ totalWorkouts: 12 }));
    expect(result).toContain('workouts_1');
    expect(result).toContain('workouts_10');
    expect(result).not.toContain('workouts_25');
  });

  it('unlocks a tier exactly AT its threshold, not just above it', () => {
    const result = getUnlockedAchievementIds(stats({ totalWorkouts: 10 }));
    expect(result).toContain('workouts_10');
  });

  it('tracks each category independently', () => {
    const result = getUnlockedAchievementIds(stats({ totalWorkouts: 100, longestStreak: 2, prCount: 3, totalVolume: 5000 }));
    expect(result).toContain('workouts_100');
    expect(result).not.toContain('streak_3');
    expect(result).toContain('prs_1');
    expect(result).not.toContain('volume_10000');
  });
});

describe('getNewlyUnlocked', () => {
  it('returns nothing when nothing new was unlocked since last check', () => {
    const previous = ['workouts_1', 'workouts_10'];
    const result = getNewlyUnlocked(previous, stats({ totalWorkouts: 10 }));
    expect(result).toEqual([]);
  });

  it('returns only the newly crossed tiers, not ones already seen', () => {
    const previous = ['workouts_1'];
    const result = getNewlyUnlocked(previous, stats({ totalWorkouts: 25 }));
    const ids = result.map(a => a.id);
    expect(ids).toContain('workouts_10');
    expect(ids).toContain('workouts_25');
    expect(ids).not.toContain('workouts_1'); // already seen before
  });

  it('returns an empty array (not a crash) for a user with no history yet', () => {
    expect(getNewlyUnlocked([], stats())).toEqual([]);
  });

  it('never re-returns an achievement once it has been marked seen, even across multiple calls', () => {
    let seen: string[] = [];
    const firstBatch = getNewlyUnlocked(seen, stats({ totalWorkouts: 10 }));
    seen = [...seen, ...firstBatch.map(a => a.id)];
    const secondBatch = getNewlyUnlocked(seen, stats({ totalWorkouts: 10 })); // same stats again
    expect(secondBatch).toEqual([]);
  });
});

describe('getProgressToward', () => {
  it('is 0 for a stat of zero', () => {
    const a = ACHIEVEMENTS.find(a => a.id === 'workouts_10')!;
    expect(getProgressToward(a, stats())).toBe(0);
  });

  it('is a fraction between 0 and 1 while approaching the threshold', () => {
    const a = ACHIEVEMENTS.find(a => a.id === 'workouts_10')!;
    expect(getProgressToward(a, stats({ totalWorkouts: 5 }))).toBeCloseTo(0.5);
  });

  it('caps at 1 even if the stat has far exceeded the threshold', () => {
    const a = ACHIEVEMENTS.find(a => a.id === 'workouts_10')!;
    expect(getProgressToward(a, stats({ totalWorkouts: 9999 }))).toBe(1);
  });
});
