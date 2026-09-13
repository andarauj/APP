import {
  exercisesForDay,
  isDateInActiveWeek,
  phaseForDate,
  projectPrescription,
  resolveAgendaDay,
  type AgendaExerciseRow,
} from '../mesocycleAgenda';
import { PHASE_ORDER } from '../adaptivePlan';
import type { WeeklyPlanner } from '@/db/plannerDao';

const weekStart = Math.floor(Date.UTC(2026, 8, 14) / 1000); // Mon 14 Sep 2026
const weekEnd = weekStart + 7 * 86400;

describe('phaseForDate', () => {
  it('keeps the current phase inside the active week window', () => {
    expect(phaseForDate((weekStart + 2 * 86400) * 1000, weekStart, weekEnd, 'on_ramp')).toBe('on_ramp');
    expect(phaseForDate((weekEnd - 1) * 1000, weekStart, weekEnd, 'accumulation')).toBe('accumulation');
  });

  it('walks PHASE_ORDER for each week after the active window', () => {
    const nextWeek = (weekEnd + 86400) * 1000;
    const twoWeeks = (weekEnd + 8 * 86400) * 1000;
    expect(phaseForDate(nextWeek, weekStart, weekEnd, 'on_ramp')).toBe('accumulation');
    expect(phaseForDate(twoWeeks, weekStart, weekEnd, 'on_ramp')).toBe('intensification');
    expect(phaseForDate(nextWeek, weekStart, weekEnd, 'deload')).toBe(PHASE_ORDER[0]);
  });
});

describe('isDateInActiveWeek', () => {
  it('is true only for [weekStart, weekEnd)', () => {
    expect(isDateInActiveWeek(weekStart * 1000, weekStart, weekEnd)).toBe(true);
    expect(isDateInActiveWeek((weekEnd - 1) * 1000, weekStart, weekEnd)).toBe(true);
    expect(isDateInActiveWeek(weekEnd * 1000, weekStart, weekEnd)).toBe(false);
    expect(isDateInActiveWeek((weekStart - 1) * 1000, weekStart, weekEnd)).toBe(false);
  });
});

describe('resolveAgendaDay', () => {
  const planner: WeeklyPlanner = {
    1: { planId: 10, dayIndex: 0 },
    3: { planId: 10, dayIndex: 1 },
  };

  it('uses the repeating planner outside the rolling window', () => {
    expect(resolveAgendaDay(1, planner, null, false, 10).entry).toEqual({ planId: 10, dayIndex: 0 });
    expect(resolveAgendaDay(2, planner, null, false, 10).entry).toBeNull();
  });

  it('prefers rolling dayIndex for the active week (future catch-up)', () => {
    const rolling = [
      { weekday: 1, dayIndex: 2, isBacklog: false, isSkipped: false },
    ];
    const resolved = resolveAgendaDay(1, planner, rolling, true, 10);
    expect(resolved.entry).toEqual({ planId: 10, dayIndex: 2 });
    expect(resolved.isSkipped).toBe(false);
  });

  it('marks skipped past rolling slots without inventing a rest day', () => {
    const rolling = [
      { weekday: 1, dayIndex: 0, isBacklog: false, isSkipped: true },
    ];
    const resolved = resolveAgendaDay(1, planner, rolling, true, 10);
    expect(resolved.entry?.dayIndex).toBe(0);
    expect(resolved.isSkipped).toBe(true);
  });

  it('treats a rolling weekday with no hit as rest', () => {
    expect(resolveAgendaDay(2, planner, [], true, 10).entry).toBeNull();
  });

  it('falls back to the planner when rolling is active but has no row for that weekday', () => {
    const rolling = [{ weekday: 1, dayIndex: 2, isBacklog: false, isSkipped: false }];
    expect(resolveAgendaDay(3, planner, rolling, true, 10).entry).toEqual({ planId: 10, dayIndex: 1 });
  });
});

describe('exercisesForDay', () => {
  const rows: AgendaExerciseRow[] = [
    {
      exercise_id: 1,
      exercise_name: 'Supino',
      primary_muscle: 'chest',
      equipment: 'barbell',
      day_index: 0,
      day_label: 'Peito',
      sets: 3,
      reps_target: '12-15',
      weight_target: 60,
      base_sets: 4,
    },
    {
      exercise_id: 2,
      exercise_name: 'Remada',
      primary_muscle: 'back',
      equipment: 'barbell',
      day_index: 1,
      day_label: 'Costas',
      sets: 3,
      reps_target: '8-12',
      weight_target: 50,
      base_sets: 4,
    },
  ];

  it('filters by day_index and keeps current-phase numbers', () => {
    const listed = exercisesForDay(rows, 0, { keepCurrentNumbers: true });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ name: 'Supino', sets: 3, reps: '12-15', weight: 60 });
  });

  it('coerces string day_index so SQLite/JSON mismatches still match', () => {
    const mixed = [{ ...rows[0], day_index: 0 as unknown as number }];
    expect(exercisesForDay(mixed, 0, { keepCurrentNumbers: true })).toHaveLength(1);
  });

  it('projects future-phase sets/reps from base_sets, not already-applied current sets', () => {
    const listed = exercisesForDay(rows, 0, {
      keepCurrentNumbers: false,
      projectPhase: 'accumulation',
      goal: 'general',
      experience: 'intermediate',
    });
    expect(listed).toHaveLength(1);
    const expected = projectPrescription(4, 60, 'barbell', 'accumulation', 'general', 'intermediate');
    expect(listed[0].sets).toBe(expected.sets);
    expect(listed[0].reps).toBe(expected.reps);
    expect(listed[0].weight).toBe(expected.weight);
    expect(listed[0].sets).not.toBe(3);
  });

  it('returns empty when the day has no exercises (Case B)', () => {
    expect(exercisesForDay(rows, 9, { keepCurrentNumbers: true })).toEqual([]);
  });
});
