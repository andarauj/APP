import { resolveTodayWorkoutPriority } from '../todayWorkoutStatus';

describe('resolveTodayWorkoutPriority', () => {
  it('picks active when a session is already in progress', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: true, isTodayBacklog: false, hasTodayEntry: false,
    })).toBe('active');
  });

  it('active outranks everything else, even an overdue backlog day', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: true, isTodayBacklog: true, hasTodayEntry: true,
    })).toBe('active');
  });

  it('picks overdue when today is standing in for a missed day', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: false, isTodayBacklog: true, hasTodayEntry: true,
    })).toBe('overdue');
  });

  it('overdue outranks a plain scheduled-today entry', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: false, isTodayBacklog: true, hasTodayEntry: false,
    })).toBe('overdue');
  });

  it('picks today when something is scheduled and nothing is overdue', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: false, isTodayBacklog: false, hasTodayEntry: true,
    })).toBe('today');
  });

  it('falls back to rest when nothing else applies', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: false, isTodayBacklog: false, hasTodayEntry: false,
    })).toBe('rest');
  });
});
