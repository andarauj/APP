import {
  buildMesocycleWeeks,
  completedDayIndexesInWindow,
  mesocycleFromWeekRows,
  missingPhasesInCycle,
  nextWeekOpenStrategy,
  parsePlannedDays,
  prescriptionValid,
  mesocyclePhaseSchedule,
  snapshotWorkoutsForPhase,
  weekForDate,
  workoutCompletionStates,
  type TemplateExercise,
} from '../mesocycleMaterialize';
import { PHASE_ORDER } from '../adaptivePlan';

const template: TemplateExercise[] = [
  {
    exercise_id: 1, exercise_name: 'Supino', primary_muscle: 'chest', equipment: 'barbell',
    day_index: 0, day_label: 'Push', order_index: 0, sets: 3, reps_target: '8-12',
    weight_target: 50, rest_seconds: 90, base_sets: 3,
  },
  {
    exercise_id: 11, exercise_name: 'Elevações laterais', primary_muscle: 'shoulders', equipment: 'dumbbell',
    day_index: 0, day_label: 'Push', order_index: 1, sets: 3, reps_target: '10-15',
    weight_target: 10, rest_seconds: 60, base_sets: 3,
  },
  {
    exercise_id: 2, exercise_name: 'Remada', primary_muscle: 'back', equipment: 'barbell',
    day_index: 1, day_label: 'Pull', order_index: 0, sets: 3, reps_target: '8-12',
    weight_target: 40, rest_seconds: 90, base_sets: 3,
  },
  {
    exercise_id: 3, exercise_name: 'Agachamento', primary_muscle: 'quads', equipment: 'barbell',
    day_index: 2, day_label: 'Legs', order_index: 0, sets: 4, reps_target: '6-10',
    weight_target: 80, rest_seconds: 120, base_sets: 4,
  },
];

function assertMesocycleComplete(weeks: ReturnType<typeof buildMesocycleWeeks>) {
  expect(weeks.length).toBeGreaterThanOrEqual(4);
  for (const week of weeks) {
    expect(week.workouts.length).toBeGreaterThan(0);
    for (const workout of week.workouts) {
      expect(workout.exercises.length).toBeGreaterThan(0);
      expect(workout.dayLabel.length).toBeGreaterThan(0);
      for (const ex of workout.exercises) {
        expect(prescriptionValid(ex)).toBe(true);
      }
    }
  }
}

describe('buildMesocycleWeeks — create → generate → read', () => {
  it('materializes a full 4-week cycle with named days and valid prescriptions', () => {
    const weeks = buildMesocycleWeeks(template, 'general', 'intermediate');
    expect(weeks.map(w => w.phase)).toEqual(PHASE_ORDER);
    expect(weeks[0].status).toBe('active');
    expect(weeks.slice(1).every(w => w.status === 'planned')).toBe(true);
    expect(weeks.every(w => w.workouts.map(d => d.dayLabel).join(',') === 'Push,Pull,Legs')).toBe(true);
    assertMesocycleComplete(weeks);
  });

  it('is deterministic — opening the same plan 20 times yields the same mesocycle', () => {
    const first = JSON.stringify(buildMesocycleWeeks(template, 'bulking', 'intermediate'));
    for (let i = 0; i < 20; i++) {
      expect(JSON.stringify(buildMesocycleWeeks(template, 'bulking', 'intermediate'))).toBe(first);
    }
  });

  it('second accumulation week in a 5-week schedule has more sets than the first', () => {
    const schedule = mesocyclePhaseSchedule(5);
    const firstAcc = schedule.find(s => s.phase === 'accumulation' && s.weekInPhase === 0)!;
    const secondAcc = schedule.find(s => s.phase === 'accumulation' && s.weekInPhase === 1)!;
    const a = snapshotWorkoutsForPhase(template, firstAcc.phase, 'general', 'intermediate', firstAcc.weekInPhase);
    const b = snapshotWorkoutsForPhase(template, secondAcc.phase, 'general', 'intermediate', secondAcc.weekInPhase);
    const setsA = a[0].exercises.reduce((s, e) => s + e.sets, 0);
    const setsB = b[0].exercises.reduce((s, e) => s + e.sets, 0);
    expect(setsB).toBeGreaterThan(setsA);
    expect(b[0].exercises[0].reps).toBe(a[0].exercises[0].reps);
  });

  it('lets phase change the prescription, not just the label', () => {
    const onRamp = snapshotWorkoutsForPhase(template, 'on_ramp', 'general', 'intermediate');
    const intens = snapshotWorkoutsForPhase(template, 'intensification', 'general', 'intermediate');
    const benchOnRamp = onRamp[0].exercises[0];
    const benchIntens = intens[0].exercises[0];
    expect(benchOnRamp.exerciseId).toBe(benchIntens.exerciseId);
    expect(benchOnRamp.reps).not.toBe(benchIntens.reps);
    expect(benchIntens.weight).toBeGreaterThanOrEqual(benchOnRamp.weight);
  });
});

describe('persistence — create → serialize → reload', () => {
  it('keeps every week/workout/exercise after a JSON round-trip', () => {
    const created = buildMesocycleWeeks(template, 'general', 'intermediate');
    const stored = created.map(w => ({
      week_index: w.weekIndex,
      phase: w.phase,
      status: w.status,
      is_bridge: 0,
      planned_json: JSON.stringify({ phase: w.phase, days: w.workouts }),
    }));
    const reloaded = mesocycleFromWeekRows(stored);
    expect(reloaded).toEqual(created);
    assertMesocycleComplete(reloaded);
    expect(parsePlannedDays(stored[1].planned_json)[0].dayLabel).toBe('Push');
  });
});

describe('completion isolation', () => {
  it('marks only the completed day; remaining week-1 and future weeks stay planned', () => {
    const weeks = buildMesocycleWeeks(template, 'general', 'intermediate');
    const week1 = workoutCompletionStates(weeks[0].workouts, [0]);
    expect(week1).toEqual([
      { dayIndex: 0, dayLabel: 'Push', state: 'completed' },
      { dayIndex: 1, dayLabel: 'Pull', state: 'planned' },
      { dayIndex: 2, dayLabel: 'Legs', state: 'planned' },
    ]);
    for (const later of weeks.slice(1)) {
      expect(workoutCompletionStates(later.workouts, []).every(s => s.state === 'planned')).toBe(true);
      expect(later.workouts.length).toBe(3);
    }
  });

  it('only counts completed sessions inside that week window and plan', () => {
    const start = 1_000;
    const end = start + 7 * 86400;
    const done = completedDayIndexesInWindow(
      [
        { plan_id: 10, day_index: 0, ended_at: start + 10, started_at: start + 10 },
        { plan_id: 10, day_index: 1, ended_at: null, started_at: start + 20 },
        { plan_id: 10, day_index: 2, ended_at: end + 10, started_at: end + 10 },
        { plan_id: 99, day_index: 1, ended_at: start + 30, started_at: start + 30 },
      ],
      start,
      end,
      10,
    );
    expect(done).toEqual([0]);
  });
});

describe('nextWeekOpenStrategy', () => {
  it('promotes a matching planned week on advance', () => {
    expect(nextWeekOpenStrategy(
      { status: 'planned', phase: 'accumulation' },
      { nextPhase: 'accumulation', decision: 'advance', wrapsCycle: false },
    )).toBe('promote');
  });

  it('is a no-op when the next week is already active or done', () => {
    expect(nextWeekOpenStrategy(
      { status: 'active', phase: 'accumulation' },
      { nextPhase: 'accumulation', decision: 'advance', wrapsCycle: false },
    )).toBe('noop');
    expect(nextWeekOpenStrategy(
      { status: 'done', phase: 'accumulation' },
      { nextPhase: 'accumulation', decision: 'advance', wrapsCycle: false },
    )).toBe('noop');
  });

  it('inserts and shifts on hold/bridge so remaining planned weeks stay', () => {
    expect(nextWeekOpenStrategy(
      { status: 'planned', phase: 'accumulation' },
      { nextPhase: 'on_ramp', decision: 'hold', wrapsCycle: false },
    )).toBe('insert-shift');
    expect(nextWeekOpenStrategy(
      { status: 'planned', phase: 'accumulation' },
      { nextPhase: 'on_ramp', decision: 'bridge', wrapsCycle: false },
    )).toBe('insert-shift');
  });

  it('wraps into a new cycle after deload', () => {
    expect(nextWeekOpenStrategy(
      { status: 'planned', phase: 'on_ramp' },
      { nextPhase: 'on_ramp', decision: 'advance', wrapsCycle: true },
    )).toBe('wrap');
  });
});

describe('weekForDate / missingPhases', () => {
  it('picks the persisted week that contains the date', () => {
    const weeks = [
      { week_start: 100, week_end: 200, id: 1 },
      { week_start: 200, week_end: 300, id: 2 },
    ];
    expect(weekForDate(weeks, 199_000)?.id).toBe(1);
    expect(weekForDate(weeks, 200_000)?.id).toBe(2);
    expect(weekForDate(weeks, 50_000)).toBeNull();
  });

  it('returns only the phases the cycle is still missing', () => {
    expect(missingPhasesInCycle(['on_ramp'])).toEqual(['accumulation', 'intensification', 'deload']);
    expect(missingPhasesInCycle(PHASE_ORDER)).toEqual([]);
  });
});
