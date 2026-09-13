import {
  focusMusclesForDayLabel,
  mergeDaySlots,
  weekdayForSlot,
  dayStateFromSessions,
  formatWeekPhaseBadge,
  DEFAULT_DAY_WEEKDAYS,
} from '../workoutHub';
import { parseDaysJson } from '../../db/planDao';

describe('focusMusclesForDayLabel', () => {
  it('maps push / pull / legs without inventing a second split', () => {
    expect(focusMusclesForDayLabel('Push Day')).toEqual(['chest', 'shoulders', 'triceps']);
    expect(focusMusclesForDayLabel('Pull')).toEqual(['back', 'biceps', 'forearms']);
    expect(focusMusclesForDayLabel('Leg Day')).toEqual(['quads', 'hamstrings', 'glutes', 'calves']);
  });
});

describe('mergeDaySlots', () => {
  it('keeps empty slots so Overview can show a day with 0 exercises', () => {
    const merged = mergeDaySlots(
      [{ day_index: 0, day_label: 'Workout Day #1', weekday: 1 }],
      [],
    );
    expect(merged).toEqual([
      { day_index: 0, day_label: 'Workout Day #1', weekday: 1, exercise_count: 0 },
    ]);
  });

  it('unions slots with real plan_exercises days', () => {
    const merged = mergeDaySlots(
      [{ day_index: 0, day_label: 'Push', weekday: 1 }],
      [{ day_index: 1, day_label: 'Pull', exercise_count: 4 }],
    );
    expect(merged.map(d => d.day_index)).toEqual([0, 1]);
    expect(merged[1].exercise_count).toBe(4);
  });
});

describe('weekdayForSlot', () => {
  it('uses Mon/Wed/Fri for the first three days', () => {
    expect(weekdayForSlot({ day_index: 0, day_label: 'A', exercise_count: 0 }, 0)).toBe(DEFAULT_DAY_WEEKDAYS[0]);
    expect(weekdayForSlot({ day_index: 1, day_label: 'B', exercise_count: 0 }, 1)).toBe(DEFAULT_DAY_WEEKDAYS[1]);
    expect(weekdayForSlot({ day_index: 2, day_label: 'C', exercise_count: 0 }, 2)).toBe(DEFAULT_DAY_WEEKDAYS[2]);
  });
});

describe('dayStateFromSessions', () => {
  const weekStart = 1_000_000;
  const weekEnd = weekStart + 7 * 86400;

  it('marks a finished session in this week as completed — future days stay planned', () => {
    const sessions = [
      { day_index: 0, ended_at: weekStart + 100, started_at: weekStart + 10 },
    ];
    expect(dayStateFromSessions(0, sessions, weekStart, weekEnd, null)).toBe('completed');
    expect(dayStateFromSessions(1, sessions, weekStart, weekEnd, null)).toBe('planned');
    expect(dayStateFromSessions(2, sessions, weekStart, weekEnd, null)).toBe('planned');
  });

  it('does not treat last week\'s session as completed this week', () => {
    const sessions = [
      { day_index: 0, ended_at: weekStart - 100, started_at: weekStart - 200 },
    ];
    expect(dayStateFromSessions(0, sessions, weekStart, weekEnd, null)).toBe('planned');
  });

  it('surfaces an unfinished session as in_progress', () => {
    expect(dayStateFromSessions(0, [], weekStart, weekEnd, 0)).toBe('in_progress');
  });
});

describe('formatWeekPhaseBadge', () => {
  it('localises week index and phase keys', () => {
    expect(formatWeekPhaseBadge(1, 'on_ramp')).toBe('Semana 1 · Adaptação');
    expect(formatWeekPhaseBadge(2, 'accumulation')).toBe('Semana 2 · Acumulação');
    expect(formatWeekPhaseBadge(4, 'intensification')).toBe('Semana 4 · Intensificação');
    expect(formatWeekPhaseBadge(5, 'deload')).toBe('Semana 5 · Descarga');
  });
});

describe('parseDaysJson', () => {
  it('returns nothing for invalid or empty payloads', () => {
    expect(parseDaysJson(null)).toEqual([]);
    expect(parseDaysJson('not-json')).toEqual([]);
    expect(parseDaysJson('{}')).toEqual([]);
  });

  it('reads persisted day slots', () => {
    expect(parseDaysJson(JSON.stringify([
      { day_index: 0, day_label: 'Workout Day #1', weekday: 1 },
    ]))).toEqual([
      { day_index: 0, day_label: 'Workout Day #1', weekday: 1 },
    ]);
  });
});
