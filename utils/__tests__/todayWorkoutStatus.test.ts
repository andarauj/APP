import { greetingForHour, resolveTodayWorkoutPriority } from '../todayWorkoutStatus';

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

  it('completed outranks overdue and today when a session finished today', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: false,
      isTodayBacklog: true,
      hasTodayEntry: true,
      hasTodayCompleted: true,
    })).toBe('completed');
  });

  it('picks completed for a free workout even without a scheduled entry', () => {
    expect(resolveTodayWorkoutPriority({
      hasUnfinishedSession: false,
      isTodayBacklog: false,
      hasTodayEntry: false,
      hasTodayCompleted: true,
    })).toBe('completed');
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

describe('greetingForHour', () => {
  it('returns Bom dia before noon', () => {
    expect(greetingForHour(8)).toBe('Bom dia');
    expect(greetingForHour(11)).toBe('Bom dia');
  });

  it('returns Boa tarde in the afternoon', () => {
    expect(greetingForHour(12)).toBe('Boa tarde');
    expect(greetingForHour(18)).toBe('Boa tarde');
  });

  it('returns Boa noite in the evening', () => {
    expect(greetingForHour(19)).toBe('Boa noite');
    expect(greetingForHour(23)).toBe('Boa noite');
  });
});
