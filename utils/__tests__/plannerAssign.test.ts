import {
  assignPlannerDay,
  ensurePlannerForPlan,
  movePlannerEntry,
  previewMovePlanner,
  relocatePlannerEntry,
  previewRelocatePlanner,
} from '../plannerAssign';
import type { PlannerEntry, WeeklyPlanner } from '@/db/plannerDao';

jest.mock('@/db/plannerDao', () => ({
  setPlannerDay: jest.fn(async () => {}),
  getWeeklyPlanner: jest.fn(async () => ({})),
}));
jest.mock('@/db/planDao', () => ({
  getPlanDays: jest.fn(async () => []),
}));
jest.mock('@/utils/adaptiveService', () => ({
  distributeDaysAcrossWeek: jest.fn((n: number, today: number) =>
    Array.from({ length: n }, (_, i) => (today + i) % 7),
  ),
}));

const { setPlannerDay, getWeeklyPlanner } = jest.requireMock('@/db/plannerDao') as {
  setPlannerDay: jest.Mock;
  getWeeklyPlanner: jest.Mock;
};
const { getPlanDays } = jest.requireMock('@/db/planDao') as { getPlanDays: jest.Mock };

const entry: PlannerEntry = { planId: 7, dayIndex: 1 };

beforeEach(() => {
  setPlannerDay.mockClear();
  getWeeklyPlanner.mockReset();
  getWeeklyPlanner.mockResolvedValue({});
  getPlanDays.mockReset();
  getPlanDays.mockResolvedValue([]);
});

describe('plannerAssign', () => {
  it('assignPlannerDay forwards to setPlannerDay', async () => {
    await assignPlannerDay(3, entry);
    expect(setPlannerDay).toHaveBeenCalledWith(3, entry);
    await assignPlannerDay(3, null);
    expect(setPlannerDay).toHaveBeenCalledWith(3, null);
  });

  it('movePlannerEntry writes target then clears source', async () => {
    await movePlannerEntry(1, 3, entry);
    expect(setPlannerDay).toHaveBeenNthCalledWith(1, 3, entry);
    expect(setPlannerDay).toHaveBeenNthCalledWith(2, 1, null);
  });

  it('movePlannerEntry is a no-op when weekdays match', async () => {
    await movePlannerEntry(2, 2, entry);
    expect(setPlannerDay).not.toHaveBeenCalled();
  });

  it('previewMovePlanner updates local planner map', () => {
    const planner: WeeklyPlanner = { 1: entry, 5: { planId: 2, dayIndex: 0 } };
    expect(previewMovePlanner(planner, 1, 4, entry)).toEqual({
      4: entry,
      5: { planId: 2, dayIndex: 0 },
    });
  });

  it('relocatePlannerEntry moves onto an empty slot', async () => {
    await relocatePlannerEntry(1, 3, entry, null);
    expect(setPlannerDay).toHaveBeenNthCalledWith(1, 3, entry);
    expect(setPlannerDay).toHaveBeenNthCalledWith(2, 1, null);
  });

  it('relocatePlannerEntry swaps when the target is occupied', async () => {
    const other: PlannerEntry = { planId: 9, dayIndex: 0 };
    await relocatePlannerEntry(1, 3, entry, other);
    expect(setPlannerDay).toHaveBeenNthCalledWith(1, 3, entry);
    expect(setPlannerDay).toHaveBeenNthCalledWith(2, 1, other);
  });

  it('previewRelocatePlanner swaps occupied weekdays', () => {
    const other: PlannerEntry = { planId: 9, dayIndex: 0 };
    const planner: WeeklyPlanner = { 1: entry, 3: other };
    expect(previewRelocatePlanner(planner, 1, 3, entry)).toEqual({
      1: other,
      3: entry,
    });
  });

  it('ensurePlannerForPlan is a no-op when the plan already has weekday slots', async () => {
    getWeeklyPlanner.mockResolvedValue({ 1: { planId: 7, dayIndex: 0 } });
    await ensurePlannerForPlan(7, new Date(2026, 8, 16));
    expect(setPlannerDay).not.toHaveBeenCalled();
    expect(getPlanDays).not.toHaveBeenCalled();
  });

  it('ensurePlannerForPlan assigns missing slots from plan days (Case A heal)', async () => {
    getWeeklyPlanner
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ 3: { planId: 7, dayIndex: 0 }, 4: { planId: 7, dayIndex: 1 } });
    getPlanDays.mockResolvedValue([
      { day_index: 0, day_label: 'A', exercise_count: 4 },
      { day_index: 1, day_label: 'B', exercise_count: 4 },
    ]);
    const wed = new Date(2026, 8, 16); // Wednesday
    await ensurePlannerForPlan(7, wed);
    expect(setPlannerDay).toHaveBeenCalledTimes(2);
    expect(setPlannerDay).toHaveBeenNthCalledWith(1, wed.getDay(), { planId: 7, dayIndex: 0 });
    expect(setPlannerDay).toHaveBeenNthCalledWith(2, (wed.getDay() + 1) % 7, { planId: 7, dayIndex: 1 });
  });

  it('ensurePlannerForPlan does not invent slots when the plan has no exercises (Case B)', async () => {
    getWeeklyPlanner.mockResolvedValue({});
    getPlanDays.mockResolvedValue([]);
    await ensurePlannerForPlan(7, new Date(2026, 8, 16));
    expect(setPlannerDay).not.toHaveBeenCalled();
  });
});
