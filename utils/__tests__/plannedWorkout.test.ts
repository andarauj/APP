import {
  applySnapshotToPlanExercises,
  buildPlanOverview,
  generateMesocycle,
  plannedWorkoutId,
  scheduledDateForWeekday,
} from '../plannedWorkout';
import type { TemplateExercise } from '../mesocycleMaterialize';

const template: TemplateExercise[] = [
  {
    exercise_id: 1, exercise_name: 'Barbell Bench Press', primary_muscle: 'chest', equipment: 'barbell',
    day_index: 0, day_label: 'Push', order_index: 0, sets: 3, reps_target: '8-12',
    weight_target: 50, rest_seconds: 90, base_sets: 3,
  },
  {
    exercise_id: 2, exercise_name: 'Barbell Row', primary_muscle: 'back', equipment: 'barbell',
    day_index: 1, day_label: 'Pull', order_index: 0, sets: 3, reps_target: '8-12',
    weight_target: 40, rest_seconds: 90, base_sets: 3,
  },
];

const weekStart = Math.floor(Date.UTC(2026, 8, 14) / 1000);

describe('generateMesocycle', () => {
  it('builds 4/5/6 weeks each with phase, dated workouts and prescribed exercises', () => {
    for (const length of [4, 5, 6] as const) {
      const meso = generateMesocycle({
        template, goal: 'general', experience: 'intermediate', weekStart, length, planId: 10,
        weekdayByDayIndex: { 0: 1, 1: 3 },
      });
      expect(meso.weeks).toHaveLength(length);
      expect(meso.weeks[0].phase).toBe('on_ramp');
      expect(meso.weeks[meso.weeks.length - 1].phase).toBe('deload');
      for (const week of meso.weeks) {
        expect(week.workouts.length).toBeGreaterThan(0);
        expect(week.weekEnd).toBe(week.weekStart + 7 * 86400);
        for (const workout of week.workouts) {
          expect(workout.scheduledDate).toBeGreaterThanOrEqual(week.weekStart);
          expect(workout.scheduledDate).toBeLessThan(week.weekEnd);
          expect(workout.exercises.length).toBeGreaterThan(0);
          expect(workout.exercises.every(e => e.sets > 0 && e.reps.length > 0)).toBe(true);
          expect(workout.id).toBe(plannedWorkoutId(week.weekIndex, workout.dayIndex));
        }
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = generateMesocycle({ template, goal: 'bulking', experience: 'intermediate', weekStart, planId: 7 });
    const b = generateMesocycle({ template, goal: 'bulking', experience: 'intermediate', weekStart, planId: 7 });
    expect(a).toEqual(b);
  });

  it('defaults intermediate users to a 5-week cycle (second accumulation is a bridge)', () => {
    const meso = generateMesocycle({ template, goal: 'general', experience: 'intermediate', weekStart });
    expect(meso.length).toBe(5);
    expect(meso.weeks.map(w => w.phase)).toEqual([
      'on_ramp', 'accumulation', 'accumulation', 'intensification', 'deload',
    ]);
    expect(meso.weeks[2].isBridge).toBe(true);
  });

  it('still generates a prescription when there is no 1RM / history (weight 0)', () => {
    const bare: TemplateExercise[] = [{
      ...template[0], weight_target: 0, base_sets: 3,
    }];
    const meso = generateMesocycle({ template: bare, goal: 'general', experience: 'beginner', weekStart });
    expect(meso.weeks[0].workouts[0].exercises[0].sets).toBeGreaterThan(0);
    expect(meso.weeks[0].workouts[0].exercises[0].reps).toMatch(/\d/);
    expect(meso.weeks[0].workouts[0].exercises[0].weight).toBe(0);
  });
});

describe('persistence + completion selector', () => {
  it('round-trips generate → JSON → load with the same week/phase/day/exercise', () => {
    const created = generateMesocycle({
      template, goal: 'general', experience: 'beginner', weekStart, length: 4, planId: 10,
    });
    const stored = created.weeks.map(w => ({
      id: w.weekIndex,
      week_index: w.weekIndex,
      phase: w.phase,
      status: w.status,
      week_start: w.weekStart,
      week_end: w.weekEnd,
      planned_json: JSON.stringify({
        phase: w.phase,
        days: w.workouts.map(d => ({
          dayIndex: d.dayIndex,
          dayLabel: d.name,
          weekday: d.weekday,
          scheduledDate: d.scheduledDate,
          exercises: d.exercises,
        })),
      }),
    }));
    const overview = buildPlanOverview(stored, [], 10);
    expect(overview.weeks).toHaveLength(4);
    expect(overview.weeks.every(w => w.workouts.length > 0)).toBe(true);
    expect(overview.weeks.every(w => w.workouts.every(d => d.exercises.length > 0))).toBe(true);
    expect(overview.weeks[1].workouts[0].exercises[0].exerciseId).toBe(
      created.weeks[1].workouts[0].exercises[0].exerciseId,
    );
    expect(overview.weeks[1].workouts[0].exercises[0].sets).toBe(
      created.weeks[1].workouts[0].exercises[0].sets,
    );
  });

  it('CRITICAL: a new plan with 0 sessions still shows every future workout', () => {
    const created = generateMesocycle({
      template, goal: 'general', experience: 'intermediate', weekStart, planId: 10,
    });
    const stored = created.weeks.map(w => ({
      id: w.weekIndex,
      week_index: w.weekIndex,
      phase: w.phase,
      status: w.status,
      week_start: w.weekStart,
      week_end: w.weekEnd,
      planned_json: JSON.stringify({
        days: w.workouts.map(d => ({
          dayIndex: d.dayIndex, dayLabel: d.name, exercises: d.exercises,
        })),
      }),
    }));
    const overview = buildPlanOverview(stored, [], 10);
    expect(overview.weeks.length).toBeGreaterThanOrEqual(4);
    expect(overview.weeks.some(w => w.workouts.length === 0)).toBe(false);
    expect(overview.weeks.every(w => w.workouts.every(d => d.state === 'planned'))).toBe(true);
  });

  it('completing workout 1 does not drop the rest', () => {
    const created = generateMesocycle({
      template, goal: 'general', experience: 'beginner', weekStart, length: 4, planId: 10,
    });
    const stored = created.weeks.map(w => ({
      id: w.weekIndex,
      week_index: w.weekIndex,
      phase: w.phase,
      status: w.status,
      week_start: w.weekStart,
      week_end: w.weekEnd,
      planned_json: JSON.stringify({
        days: w.workouts.map(d => ({
          dayIndex: d.dayIndex, dayLabel: d.name, exercises: d.exercises,
        })),
      }),
    }));
    const sessions = [{
      plan_id: 10,
      day_index: 0,
      ended_at: weekStart + 100,
      started_at: weekStart + 100,
    }];
    const overview = buildPlanOverview(stored, sessions, 10);
    expect(overview.weeks[0].workouts[0].state).toBe('completed');
    expect(overview.weeks[0].workouts[1].state).toBe('planned');
    expect(overview.weeks.slice(1).every(w => w.workouts.every(d => d.state === 'planned'))).toBe(true);
    expect(overview.weeks.reduce((n, w) => n + w.workouts.length, 0)).toBe(
      created.weeks.reduce((n, w) => n + w.workouts.length, 0),
    );
  });
});

describe('buildPlanOverview dates from planner', () => {
  it('derives weekday/date from weeklyPlanner instead of a stale snapshot stamp', () => {
    const stored = [{
      id: 1, week_index: 1, phase: 'on_ramp' as const, status: 'active',
      week_start: weekStart, week_end: weekStart + 7 * 86400,
      planned_json: JSON.stringify({
        days: [{
          dayIndex: 0, dayLabel: 'Push', weekday: 1, scheduledDate: weekStart,
          exercises: [{ exerciseId: 1, name: 'Bench', muscle: 'chest', order: 0, sets: 3, reps: '8-12', weight: 50, rest: 90 }],
        }],
      }),
    }];
    const overview = buildPlanOverview(stored, [], 10, { 0: 3 });
    expect(overview.weeks[0].workouts[0].weekday).toBe(3);
    expect(overview.weeks[0].workouts[0].scheduledDate).toBe(scheduledDateForWeekday(weekStart, 3));
  });
});

describe('applySnapshotToPlanExercises', () => {
  it('overlays the planned week prescription onto the template rows', () => {
    const planExs = [
      { exercise_id: 1, sets: 3, reps_target: '12-15', weight_target: 40, rest_seconds: 60 },
    ];
    const applied = applySnapshotToPlanExercises(planExs, {
      dayIndex: 0,
      dayLabel: 'Push',
      exercises: [{
        exerciseId: 1, name: 'Bench', muscle: 'chest', order: 0,
        sets: 4, reps: '4-6', weight: 70, rest: 150,
      }],
    });
    expect(applied[0]).toMatchObject({ sets: 4, reps_target: '4-6', weight_target: 70, rest_seconds: 150 });
  });

  it('leaves the template alone when the snapshot day is empty (does not invent a workout)', () => {
    const planExs = [{ exercise_id: 1, sets: 3, reps_target: '8-10', weight_target: 50, rest_seconds: 90 }];
    expect(applySnapshotToPlanExercises(planExs, { dayIndex: 0, dayLabel: 'Push', exercises: [] })).toEqual(planExs);
  });
});
