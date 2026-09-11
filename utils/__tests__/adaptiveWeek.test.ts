import {
  startOfAdaptiveWeek,
  weekWindow,
  weekIsOver,
  assembleWeekSignal,
  type WeekSetRow,
} from '../adaptiveWeek';

// 2026-09-10 is a Thursday (getDay() === 4).
const THURS = new Date(2026, 8, 10, 15, 30, 0);
const ymd = (epochS: number) => {
  const d = new Date(epochS * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('startOfAdaptiveWeek', () => {
  it('walks back to the chosen start weekday at local midnight', () => {
    expect(ymd(startOfAdaptiveWeek(THURS, 1).getTime() / 1000)).toBe('2026-09-07'); // Monday
    expect(ymd(startOfAdaptiveWeek(THURS, 4).getTime() / 1000)).toBe('2026-09-10'); // Thursday (today)
    expect(ymd(startOfAdaptiveWeek(THURS, 0).getTime() / 1000)).toBe('2026-09-06'); // Sunday
    expect(ymd(startOfAdaptiveWeek(THURS, 6).getTime() / 1000)).toBe('2026-09-05'); // Saturday
  });
  it('returns local midnight, not the time-of-day of `now`', () => {
    const d = startOfAdaptiveWeek(THURS, 1);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe('weekWindow', () => {
  it('weeksAgo 0 is the week in progress, 1 is the week just finished', () => {
    const cur = weekWindow(THURS, 1, 0);
    const prev = weekWindow(THURS, 1, 1);
    expect(ymd(cur.start)).toBe('2026-09-07');
    expect(cur.end - cur.start).toBe(7 * 86400);
    expect(prev.end).toBe(cur.start);
    expect(ymd(prev.start)).toBe('2026-08-31');
  });
});

describe('weekIsOver', () => {
  it('true once now has reached the window end', () => {
    const { end } = weekWindow(THURS, 1, 1); // last week
    expect(weekIsOver(end, THURS)).toBe(true);
    const cur = weekWindow(THURS, 1, 0); // this week, not finished
    expect(weekIsOver(cur.end, THURS)).toBe(false);
  });
});

function set(o: Partial<WeekSetRow> = {}): WeekSetRow {
  return {
    exerciseId: 1, name: 'Barbell Bench Press', primaryMuscle: 'chest', equipment: 'barbell',
    weight: 100, reps: 5, rpe: 8, setType: 'normal', ...o,
  };
}

describe('assembleWeekSignal', () => {
  it('counts only effective (non-warmup, >=1 rep) sets for volume', () => {
    const r = assembleWeekSignal({
      phase: 'accumulation', goal: 'general', isBridge: false,
      sets: [
        set(), set(), set(),
        set({ setType: 'warmup' }),
        set({ reps: 0 }),
      ],
      setsPlanned: 6,
      baseline: {},
    });
    expect(r.effectiveSets).toBe(3);
    expect(r.nspi.volume).toBe(50); // 3 / 6
  });

  it('tracks best e1RM per main pattern and scores load vs baseline', () => {
    const r = assembleWeekSignal({
      phase: 'accumulation', goal: 'strength', isBridge: false,
      sets: [
        set({ name: 'Barbell Bench Press', primaryMuscle: 'chest', weight: 100, reps: 5 }), // e1RM ~116.7
        set({ name: 'Barbell Back Squat', primaryMuscle: 'quads', weight: 140, reps: 5 }),   // e1RM ~163.3
      ],
      setsPlanned: 2,
      baseline: { bench: 116.7, squat: 150 }, // squat up ~9%, bench flat
    });
    expect(r.patternE1rm.bench).toBeCloseTo(116.7, 0);
    expect(r.patternE1rm.squat).toBeCloseTo(163.3, 0);
    expect(r.nspi.load).toBeGreaterThan(60); // net positive progression
    expect(r.weekSignal.nspiLoad).toBe(r.nspi.load);
  });

  it('averages RPE across effective sets only', () => {
    const r = assembleWeekSignal({
      phase: 'accumulation', goal: 'general', isBridge: false,
      sets: [
        set({ rpe: 7 }), set({ rpe: 9 }),
        set({ rpe: 10, setType: 'warmup' }), // ignored
        set({ rpe: null }),                   // ignored
      ],
      setsPlanned: 4,
      baseline: {},
    });
    expect(r.weekSignal.avgRpe).toBe(8);
  });

  it('minBucketRatio is the worst covered bucket vs its phase target', () => {
    const r = assembleWeekSignal({
      phase: 'accumulation', goal: 'general', isBridge: false,
      sets: [
        set({ name: 'Bench Press', primaryMuscle: 'chest' }),
        set({ name: 'Bench Press', primaryMuscle: 'chest' }),
        set({ name: 'Bench Press', primaryMuscle: 'chest' }),
        set({ name: 'Bench Press', primaryMuscle: 'chest' }),
        set({ name: 'Back Squat', primaryMuscle: 'quads' }),
      ],
      setsPlanned: 5,
      baseline: {},
      bucketTargets: { horiz_push: 4, quad: 4 }, // quad only 1/4 done
    });
    expect(r.weekSignal.minBucketRatio).toBeCloseTo(0.25, 5);
  });

  it('passes the bridge flag straight through', () => {
    const r = assembleWeekSignal({
      phase: 'intensification', goal: 'general', isBridge: true,
      sets: [set()], setsPlanned: 1, baseline: {},
    });
    expect(r.weekSignal.isBridge).toBe(true);
    expect(r.weekSignal.phase).toBe('intensification');
  });
});
