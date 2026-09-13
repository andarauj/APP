import {
  buildEffectivePlanner,
  resolveTodaySlot,
  resolveDaySlot,
  weekdayByDayIndexFromPlanner,
} from '../scheduleResolve';
import type { WeeklyPlanner } from '@/db/plannerDao';

const planner: WeeklyPlanner = {
  1: { planId: 10, dayIndex: 0 },
  3: { planId: 10, dayIndex: 1 },
  5: { planId: 10, dayIndex: 2 },
};

describe('buildEffectivePlanner', () => {
  it('returns the raw planner when there is no adaptive overlay', () => {
    expect(buildEffectivePlanner(planner, null, null, 4, 1)).toEqual(planner);
    expect(buildEffectivePlanner(planner, [], 10, 4, 1)).toEqual(planner);
  });

  it('overlays rolling dayIndex onto the adaptive plan and drops untracked past days', () => {
    const rolling = [
      { weekday: 1, dayIndex: 0, isBacklog: false, isSkipped: false },
      { weekday: 4, dayIndex: 1, isBacklog: true, isSkipped: false },
    ];
    const effective = buildEffectivePlanner(planner, rolling, 10, 4, 1);
    expect(effective[1]).toEqual({ planId: 10, dayIndex: 0 });
    expect(effective[4]).toEqual({ planId: 10, dayIndex: 1 });
    expect(effective[5]).toEqual({ planId: 10, dayIndex: 2 });
  });

  it('CRITICAL: the same inputs produce the same today slot for Hoje and the hero', () => {
    const rolling = [
      { weekday: 1, dayIndex: 0, isSkipped: true },
      { weekday: 3, dayIndex: 1, isSkipped: true },
      { weekday: 4, dayIndex: 0, isBacklog: true },
    ];
    const a = resolveTodaySlot(planner, rolling, 10, 4, 1);
    const b = resolveTodaySlot(planner, rolling, 10, 4, 1);
    expect(a).toEqual(b);
    expect(a.entry).toEqual({ planId: 10, dayIndex: 0 });
    expect(a.isBacklog).toBe(true);
  });
});

describe('resolveDaySlot', () => {
  it('reads backlog/skipped flags from rolling without inventing an entry', () => {
    const rolling = [{ weekday: 2, dayIndex: 0, isBacklog: false, isSkipped: true }];
    expect(resolveDaySlot(2, {}, rolling)).toEqual({
      entry: null, isBacklog: false, isSkipped: true,
    });
  });
});

describe('weekdayByDayIndexFromPlanner', () => {
  it('maps this plan\'s dayIndex back to the weekday the user assigned', () => {
    expect(weekdayByDayIndexFromPlanner(planner, 10)).toEqual({ 0: 1, 1: 3, 2: 5 });
    expect(weekdayByDayIndexFromPlanner(planner, 99)).toEqual({});
  });
});
