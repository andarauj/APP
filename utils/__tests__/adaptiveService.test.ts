/**
 * The DB-bound weekly close/decide/mutate flow is composed of pure pieces
 * that are covered elsewhere (nspi / adaptivePlan / adaptiveDecision /
 * adaptiveWeek — 70+ tests). What is worth pinning here is the orchestration
 * contract: closeWeekIfDue must be a safe no-op when there is nothing to do,
 * and must never close the same transition twice ("Idempotente" — NSPI_ENGINE
 * §9 N4). The adaptive DAO / plan DAO / database modules are mocked so no real
 * SQLite is touched.
 */

jest.mock('@/db/database', () => ({ getDatabase: jest.fn() }));
jest.mock('@/db/planDao', () => ({
  getPlanExercisesWithDetails: jest.fn().mockResolvedValue([]),
  updatePlanExercise: jest.fn().mockResolvedValue(undefined),
  getPlanDays: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/db/plannerDao', () => ({
  setPlannerDay: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/db/adaptiveDao', () => ({
  getActiveAdaptivePlan: jest.fn(),
  getOpenCycle: jest.fn(),
  getActiveWeek: jest.fn(),
  planWeekExistsForStart: jest.fn(),
  getRecentWeeksForPlan: jest.fn().mockResolvedValue([]),
  getExerciseStates: jest.fn().mockResolvedValue([]),
  parseBaseline: jest.fn().mockReturnValue({}),
  closeWeekRow: jest.fn().mockResolvedValue(undefined),
  insertWeek: jest.fn().mockResolvedValue(999),
  endCycle: jest.fn().mockResolvedValue(undefined),
  createCycle: jest.fn().mockResolvedValue(2),
}));

import { closeWeekIfDue, goalFromOnboarding, distributeDaysAcrossWeek } from '../adaptiveService';
import * as dao from '@/db/adaptiveDao';

const asMock = (fn: unknown) => fn as jest.Mock;

const plan = {
  id: 1, plan_id: 10, goal: 'general', experience: 'intermediate',
  days_per_week: 4, session_minutes: 45, equipment_pref: 'any',
  week_start_dow: 1, created_at: 0, active: 1,
};
const cycle = { id: 1, adaptive_plan_id: 1, cycle_index: 1, baseline_json: '{}', started_at: 0, ended_at: null };
const week = (o: Partial<any> = {}) => ({
  id: 5, cycle_id: 1, week_index: 2, phase: 'accumulation', is_bridge: 0,
  planned_json: '{}', nspi_load: null, nspi_volume: null, nspi_balance: null, nspi_score: null,
  decision: null, recap_json: null,
  week_start: Math.floor(Date.UTC(2026, 8, 1) / 1000),
  week_end: Math.floor(Date.UTC(2026, 8, 8) / 1000),
  status: 'active', ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
  asMock(dao.getRecentWeeksForPlan).mockResolvedValue([]);
  asMock(dao.getExerciseStates).mockResolvedValue([]);
  asMock(dao.parseBaseline).mockReturnValue({});
});

describe('closeWeekIfDue — guard clauses', () => {
  it('no active adaptive plan -> null, touches nothing', async () => {
    asMock(dao.getActiveAdaptivePlan).mockResolvedValue(null);
    expect(await closeWeekIfDue(new Date(2026, 8, 20))).toBeNull();
    expect(dao.getActiveWeek).not.toHaveBeenCalled();
    expect(dao.closeWeekRow).not.toHaveBeenCalled();
  });

  it('active week still in progress -> null', async () => {
    asMock(dao.getActiveAdaptivePlan).mockResolvedValue(plan);
    asMock(dao.getOpenCycle).mockResolvedValue(cycle);
    asMock(dao.getActiveWeek).mockResolvedValue(week());
    // now is before week_end
    const now = new Date((week().week_end - 86400) * 1000);
    expect(await closeWeekIfDue(now)).toBeNull();
    expect(dao.closeWeekRow).not.toHaveBeenCalled();
    expect(dao.insertWeek).not.toHaveBeenCalled();
  });

  it('transition already recorded -> null (idempotent)', async () => {
    asMock(dao.getActiveAdaptivePlan).mockResolvedValue(plan);
    asMock(dao.getOpenCycle).mockResolvedValue(cycle);
    asMock(dao.getActiveWeek).mockResolvedValue(week());
    asMock(dao.planWeekExistsForStart).mockResolvedValue(true);
    const now = new Date((week().week_end + 3 * 86400) * 1000);
    expect(await closeWeekIfDue(now)).toBeNull();
    expect(dao.planWeekExistsForStart).toHaveBeenCalledWith(1, week().week_end);
    expect(dao.closeWeekRow).not.toHaveBeenCalled();
    expect(dao.insertWeek).not.toHaveBeenCalled();
  });

  it('swallows errors from the DAO and returns null', async () => {
    asMock(dao.getActiveAdaptivePlan).mockRejectedValue(new Error('db locked'));
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await closeWeekIfDue(new Date(2026, 8, 20))).toBeNull();
    spy.mockRestore();
  });
});

describe('goalFromOnboarding', () => {
  it('maps the onboarding goal keys to the four adaptive goals', () => {
    expect(goalFromOnboarding('strength')).toBe('strength');
    expect(goalFromOnboarding('muscle')).toBe('bulking');
    expect(goalFromOnboarding('fatloss')).toBe('cutting');
    expect(goalFromOnboarding('maintain')).toBe('general');
    expect(goalFromOnboarding('whatever')).toBe('general');
  });
});

describe('distributeDaysAcrossWeek', () => {
  it('spreads a 3-day plan onto Mon/Wed/Fri from a Monday start', () => {
    expect(distributeDaysAcrossWeek(3, 1)).toEqual([1, 3, 5]);
  });

  it('spreads a 2-day plan onto Mon/Thu', () => {
    expect(distributeDaysAcrossWeek(2, 1)).toEqual([1, 4]);
  });

  it('fills 6 days consecutively, leaving one rest day', () => {
    expect(distributeDaysAcrossWeek(6, 1)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a single day lands exactly on weekStartDow', () => {
    expect(distributeDaysAcrossWeek(1, 3)).toEqual([3]);
  });

  it('wraps weekday indices past Saturday back to Sunday', () => {
    // Starting on Friday (5), a 3-day spread would naively go 5, 7, 9 —
    // must wrap to the 0=Sun..6=Sat range the rest of the app uses.
    expect(distributeDaysAcrossWeek(3, 5)).toEqual([5, 0, 2]);
  });

  it('returns nothing for a plan with no days', () => {
    expect(distributeDaysAcrossWeek(0, 1)).toEqual([]);
  });
});
