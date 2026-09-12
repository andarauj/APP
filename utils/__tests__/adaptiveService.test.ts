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
  clearPlannerForPlan: jest.fn().mockResolvedValue(undefined),
  getWeeklyPlanner: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/db/workoutDao', () => ({
  getCompletedSessionCountForPlan: jest.fn().mockResolvedValue(0),
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

import { closeWeekIfDue, goalFromOnboarding, distributeDaysAcrossWeek, computeRollingSchedule, getRollingScheduleForPlan, pastWeekdaysWithoutTracking } from '../adaptiveService';
import * as dao from '@/db/adaptiveDao';
import { getWeeklyPlanner } from '@/db/plannerDao';
import { getCompletedSessionCountForPlan } from '@/db/workoutDao';
import { getPlanDays } from '@/db/planDao';

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
  it('spreads a 3-day plan onto today/+2/+4 when today is Monday', () => {
    expect(distributeDaysAcrossWeek(3, 1)).toEqual([1, 3, 5]);
  });

  it('spreads a 2-day plan onto today/+3 when today is Monday', () => {
    expect(distributeDaysAcrossWeek(2, 1)).toEqual([1, 4]);
  });

  it('fills 6 days consecutively starting today, leaving one rest day', () => {
    expect(distributeDaysAcrossWeek(6, 1)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a single day lands exactly on today', () => {
    expect(distributeDaysAcrossWeek(1, 3)).toEqual([3]);
  });

  it('wraps weekday indices past Saturday back to Sunday', () => {
    // Today is Friday (5); a 3-day spread would naively go 5, 7, 9 — must
    // wrap to the 0=Sun..6=Sat range the rest of the app uses.
    expect(distributeDaysAcrossWeek(3, 5)).toEqual([5, 0, 2]);
  });

  it('returns nothing for a plan with no days', () => {
    expect(distributeDaysAcrossWeek(0, 1)).toEqual([]);
  });

  // BUGFIX regression: this used to anchor on weekStartDow (the NSPI cycle's
  // own week-boundary answer) instead of today, so generating a plan any day
  // other than that exact weekday could leave the first reachable session
  // days away — e.g. a Monday-anchored 3-day split (Mon/Wed/Fri) generated
  // on a Thursday had already missed two of the week's three active days.
  it('always includes today as the first active day, whatever today is', () => {
    for (let today = 0; today <= 6; today++) {
      for (const daysCount of [1, 2, 3, 4, 5, 6]) {
        const result = distributeDaysAcrossWeek(daysCount, today);
        expect(result[0]).toBe(today);
      }
    }
  });

  it('never schedules a day that has already passed this week (mid/end-of-week generation)', () => {
    // "Already passed this week" here means an offset that would wrap
    // BACKWARDS past today — every offset must be reachable by moving
    // forward 0-6 days from today, never by moving backward first.
    for (let today = 0; today <= 6; today++) {
      for (const daysCount of [1, 2, 3, 4, 5, 6]) {
        const result = distributeDaysAcrossWeek(daysCount, today);
        const forwardOffsets = result.map(wd => (wd - today + 7) % 7);
        expect(forwardOffsets).toEqual([...forwardOffsets].sort((a, b) => a - b));
      }
    }
  });
});

// Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6 — matches WEEKDAY_LABELS.
describe('computeRollingSchedule', () => {
  const PPL = [0, 1, 2]; // Push, Pull, Pernas day_index

  it('the exact reported scenario: Wednesday missed, Thursday must show Wednesday\'s session', () => {
    // Mon/Wed/Fri split, week starts Monday. Monday's Push was done
    // (completedCount=1), Wednesday's Pull was not. Checking on Thursday.
    const result = computeRollingSchedule([1, 3, 5], PPL, 1, 4, 1);
    const thursday = result.find(e => e.weekday === 4);
    expect(thursday).toEqual({ weekday: 4, dayIndex: 1, isBacklog: true, isSkipped: false }); // Pull, forced, labelled late
  });

  it('same backlog, checking on Friday instead: still shows the missed Wednesday session, not Friday\'s own', () => {
    const result = computeRollingSchedule([1, 3, 5], PPL, 1, 5, 1);
    const friday = result.find(e => e.weekday === 5);
    expect(friday).toEqual({ weekday: 5, dayIndex: 1, isBacklog: true, isSkipped: false });
  });

  it('cascades every later native day by the backlog amount ("efeito dominó")', () => {
    // Still Thursday, same backlog of 1. Friday (native) must absorb what
    // was going to be Thursday's slot conceptually — i.e. keep going in
    // sequence AFTER the forced catch-up, not repeat or skip a day.
    const result = computeRollingSchedule([1, 3, 5], PPL, 1, 4, 1);
    const friday = result.find(e => e.weekday === 5);
    expect(friday).toEqual({ weekday: 5, dayIndex: 2, isBacklog: false, isSkipped: false }); // Pernas
  });

  it('leaves days before today showing their native assignment, untouched', () => {
    const result = computeRollingSchedule([1, 3, 5], PPL, 1, 4, 1);
    const monday = result.find(e => e.weekday === 1);
    expect(monday).toEqual({ weekday: 1, dayIndex: 0, isBacklog: false, isSkipped: false }); // Push, native, past — done, not skipped
  });

  it('caught up exactly: today shows its own native day, nothing marked late', () => {
    // Wednesday, having done Monday's session — right on schedule.
    const result = computeRollingSchedule([1, 3, 5], PPL, 1, 3, 1);
    const wednesday = result.find(e => e.weekday === 3);
    expect(wednesday).toEqual({ weekday: 3, dayIndex: 1, isBacklog: false, isSkipped: false });
  });

  it('BUGFIX: 0 sessions done all week — every past native day is marked skipped, not shown as done', () => {
    // Mon-Fri split (5 distinct days), week starts Monday, checking on
    // Saturday with completedCount=0. Reported bug: the weekly grid kept
    // showing Mon–Fri's native plan names as if those workouts had actually
    // happened, even though nothing was ever logged and the very first
    // session had rolled all the way to today (Saturday).
    const MTWTF = [0, 1, 2, 3, 4]; // 5 distinct plan days
    const result = computeRollingSchedule([1, 2, 3, 4, 5], MTWTF, 0, 6, 1);
    const pastDays = result.filter(e => e.weekday >= 1 && e.weekday <= 5);
    expect(pastDays).toHaveLength(5);
    expect(pastDays.every(e => e.isSkipped)).toBe(true);
    expect(pastDays.every(e => !e.isBacklog)).toBe(true); // isBacklog is only ever true for today

    const saturday = result.find(e => e.weekday === 6);
    expect(saturday).toEqual({ weekday: 6, dayIndex: 0, isBacklog: true, isSkipped: false }); // first day, forced onto today
  });

  it('BUGFIX: partial progress — only the past days beyond completedCount are marked skipped', () => {
    // Same Mon-Fri split, but two sessions were actually completed this
    // week (Monday and Tuesday) before checking on Saturday. Only
    // Wed/Thu/Fri — the ones genuinely never trained — should be skipped.
    const MTWTF = [0, 1, 2, 3, 4];
    const result = computeRollingSchedule([1, 2, 3, 4, 5], MTWTF, 2, 6, 1);
    const byWeekday = new Map(result.map(e => [e.weekday, e]));
    expect(byWeekday.get(1)?.isSkipped).toBe(false); // Monday — done
    expect(byWeekday.get(2)?.isSkipped).toBe(false); // Tuesday — done
    expect(byWeekday.get(3)?.isSkipped).toBe(true);  // Wednesday — never happened
    expect(byWeekday.get(4)?.isSkipped).toBe(true);  // Thursday — never happened
    expect(byWeekday.get(5)?.isSkipped).toBe(true);  // Friday — never happened
    expect(byWeekday.get(6)).toEqual({ weekday: 6, dayIndex: 2, isBacklog: true, isSkipped: false }); // 3rd day, forced onto Saturday
  });

  it('BUGFIX: strict sequence order — Sábado é a Sessão 0 e Domingo é a Sessão 1, exactly as reported', () => {
    // The exact reported scenario: Peito→Costas→Pernas→Ombros→... on a
    // Mon-Fri plan, 0 sessions completed all week, checking on Saturday.
    // Every past native day (Seg-Sex) must read as skipped — none may show
    // a later session in the sequence (Costas, Pernas...) as if it had
    // already happened while Peito (S0) is still pending. The forward
    // cascade must then continue in STRICT order starting from today, one
    // session per calendar day — including non-native days — until caught
    // up: Sábado = S0 (Peito), Domingo = S1 (Costas), not a jump ahead and
    // not a stall until next week's Monday.
    const PCPO = [0, 1, 2, 3]; // Peito, Costas, Pernas, Ombros day_index
    const result = computeRollingSchedule([1, 2, 3, 4, 5], PCPO, 0, 6, 1);

    const pastDays = result.filter(e => e.weekday >= 1 && e.weekday <= 5);
    expect(pastDays).toHaveLength(5);
    expect(pastDays.every(e => e.isSkipped)).toBe(true); // 100% skipped — Seg..Sex

    const saturday = result.find(e => e.weekday === 6);
    expect(saturday).toEqual({ weekday: 6, dayIndex: 0, isBacklog: true, isSkipped: false }); // Sábado = Sessão 0 (Peito)

    const sunday = result.find(e => e.weekday === 0);
    expect(sunday).toEqual({ weekday: 0, dayIndex: 1, isBacklog: false, isSkipped: false }); // Domingo = Sessão 1 (Costas)
  });

  it('a genuinely free rest day (no backlog) stays a rest day — no session is forced', () => {
    // Tuesday isn't native, and Monday's session is already done — no
    // reason to force anything onto Tuesday.
    const result = computeRollingSchedule([1, 3, 5], PPL, 1, 2, 1);
    expect(result.find(e => e.weekday === 2)).toBeUndefined();
  });

  it('ahead of schedule (an extra session already logged) pulls the whole rest of the week forward too', () => {
    // Monday done twice somehow, or an extra session logged — completedCount
    // outruns elapsedBeforeToday. Should not throw or go backwards; next
    // slots simply advance further in the sequence.
    const result = computeRollingSchedule([1, 3, 5], PPL, 2, 2, 1);
    const wednesday = result.find(e => e.weekday === 3);
    expect(wednesday).toEqual({ weekday: 3, dayIndex: 2, isBacklog: false, isSkipped: false }); // Pernas, not Pull
  });

  it('multiple missed days: today gets the oldest undone session, and the debt keeps consuming subsequent days — native or not — until paid off', () => {
    // Monday and Wednesday both missed; checking Friday with nothing done
    // at all this week. Today (Friday) is 2 sessions behind: it gets the
    // oldest undone one (Push), and since the debt isn't cleared by that
    // alone, Saturday — never natively scheduled — must ALSO get the next
    // session (Pull) rather than reverting to a rest day while still behind.
    const result = computeRollingSchedule([1, 3, 5], PPL, 0, 5, 1);
    const friday = result.find(e => e.weekday === 5);
    expect(friday).toEqual({ weekday: 5, dayIndex: 0, isBacklog: true, isSkipped: false }); // Push — the oldest undone
    const saturday = result.find(e => e.weekday === 6);
    expect(saturday).toEqual({ weekday: 6, dayIndex: 1, isBacklog: false, isSkipped: false }); // Pull — debt still open, not a rest day
  });

  it('wraps correctly through the plan\'s own day count once the backlog exceeds it', () => {
    // Nothing done all week, checking a 5-day plan (only 2 distinct days)
    // on the last scheduled day — confirms the modulo path cycles cleanly
    // instead of throwing or indexing out of bounds.
    const longResult = computeRollingSchedule([1, 2, 3, 4, 5], [0, 1], 0, 5, 1);
    expect(longResult.every(e => e.dayIndex === 0 || e.dayIndex === 1)).toBe(true);
  });

  it('a day scheduled on a weekday before weekStartDow still sorts correctly (week wraparound)', () => {
    // Week starts Friday; native days Fri/Sun/Tue. Checking on Sunday.
    const result = computeRollingSchedule([5, 0, 2], PPL, 1, 0, 5);
    const sunday = result.find(e => e.weekday === 0);
    expect(sunday).toEqual({ weekday: 0, dayIndex: 1, isBacklog: false, isSkipped: false }); // caught up, native Pull
  });

  it('returns nothing for a plan with no distinct days', () => {
    expect(computeRollingSchedule([1, 3, 5], [], 0, 1, 1)).toEqual([]);
  });
});

describe('pastWeekdaysWithoutTracking', () => {
  it('BUGFIX: flags a past weekday that belongs to a different plan, not this one\'s own schedule', () => {
    // The exact reported scenario: the active plan only natively covers
    // Terça and Sábado (a stale/manually-assigned different plan occupies
    // Segunda and Quarta in the raw weekly planner). Checking on Sábado —
    // Segunda and Quarta must be flagged so the weekly grid stops falling
    // back to that other plan's label on them.
    const result = pastWeekdaysWithoutTracking([2, 6], 6, 1); // native: Ter, Sáb — checking Sáb
    expect(result.sort()).toEqual([1, 3, 4, 5]); // Seg, Qua, Qui, Sex — everything past and untracked
  });

  it('returns nothing when every past weekday is part of this plan\'s own schedule', () => {
    const result = pastWeekdaysWithoutTracking([1, 2, 3], 4, 1); // Mon/Tue/Wed all native, checking Thursday
    expect(result).toEqual([]);
  });

  it('never flags today or a future weekday', () => {
    const result = pastWeekdaysWithoutTracking([], 3, 1); // nothing native at all, checking Wednesday
    expect(result.sort()).toEqual([1, 2]); // only Mon/Tue (strictly before Wed) — not Wed itself or anything after
  });

  it('handles week wraparound (weekStartDow after today in raw weekday numbers)', () => {
    // Week starts Friday; only Sunday is native. Checking on Tuesday —
    // Friday, Saturday and Monday are all "past" within this rolling week.
    const result = pastWeekdaysWithoutTracking([0], 2, 5);
    expect(result.sort()).toEqual([1, 5, 6]); // Mon, Fri, Sat
  });
});

describe('getRollingScheduleForPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orchestrates the exact reported scenario end-to-end through the DB layer', async () => {
    asMock(getWeeklyPlanner).mockResolvedValue({
      1: { planId: 42, dayIndex: 0 },
      3: { planId: 42, dayIndex: 1 },
      5: { planId: 42, dayIndex: 2 },
    });
    asMock(getCompletedSessionCountForPlan).mockResolvedValue(1); // only Monday done
    asMock(getPlanDays).mockResolvedValue([
      { day_index: 0, day_label: 'Push', exercise_count: 4 },
      { day_index: 1, day_label: 'Pull', exercise_count: 4 },
      { day_index: 2, day_label: 'Pernas', exercise_count: 4 },
    ]);

    // Thursday, week starts Monday. Built from local components (not
    // Date.UTC) specifically so .getDay() can't shift by a timezone offset
    // and land on the wrong weekday depending on where the test runs.
    const thursday = new Date(2026, 8, 10); // confirmed Thursday
    const result = await getRollingScheduleForPlan(42, 1, thursday);

    expect(result?.find(e => e.weekday === thursday.getDay())).toEqual({
      weekday: thursday.getDay(), dayIndex: 1, isBacklog: true, isSkipped: false,
    });
  });

  it('returns null when the plan has no days', async () => {
    asMock(getPlanDays).mockResolvedValue([]);
    expect(await getRollingScheduleForPlan(42, 1)).toBeNull();
  });

  it('returns null when the plan is not scheduled on any weekday', async () => {
    asMock(getWeeklyPlanner).mockResolvedValue({ 1: { planId: 99, dayIndex: 0 } });
    asMock(getPlanDays).mockResolvedValue([{ day_index: 0, day_label: 'Push', exercise_count: 4 }]);
    expect(await getRollingScheduleForPlan(42, 1)).toBeNull();
  });
});
