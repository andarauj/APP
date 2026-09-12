import { computeWeeklyCommitment } from '../weeklyCommitment';

const labels = { 1: 'Peito', 2: 'Costas', 3: 'Pernas' };

describe('computeWeeklyCommitment', () => {
  it('returns null adherence when nothing was ever planned this week', () => {
    const result = computeWeeklyCommitment({}, labels, new Set(), 3);
    expect(result.adherencePercent).toBeNull();
    expect(result.plannedCount).toBe(0);
  });

  it('computes 100% adherence when every relevant planned day was completed', () => {
    // Planned Mon(1) and Wed(3), today is Wed(3), both completed.
    const planner = { 1: { planId: 1, dayIndex: 0 }, 3: { planId: 3, dayIndex: 0 } };
    const result = computeWeeklyCommitment(planner, labels, new Set([1, 3]), 3);
    expect(result.adherencePercent).toBe(100);
  });

  it('computes partial adherence when only some planned days were completed', () => {
    const planner = { 1: { planId: 1, dayIndex: 0 }, 2: { planId: 2, dayIndex: 0 }, 3: { planId: 3, dayIndex: 0 } };
    // Mon completed, Tue missed, today is Wed (Wed itself not yet done).
    const result = computeWeeklyCommitment(planner, labels, new Set([1]), 3);
    // Relevant planned days up to today: Mon, Tue, Wed (all <= today) = 3, completed = 1.
    expect(result.adherencePercent).toBe(33);
  });

  it('never counts a future planned day against adherence yet', () => {
    // Planned Mon(1, past, done) and Fri(5, future, not done). Today is Tue(2).
    const planner = { 1: { planId: 1, dayIndex: 0 }, 5: { planId: 1, dayIndex: 0 } };
    const result = computeWeeklyCommitment(planner, labels, new Set([1]), 2);
    // Only Monday is relevant (past/today) and it was completed -> 100%, not penalized for Friday.
    expect(result.adherencePercent).toBe(100);
  });

  it('counts a completed day with nothing planned as "extra", not toward adherence', () => {
    const planner = { 1: { planId: 1, dayIndex: 0 } };
    // Trained Monday (planned) AND Thursday (not planned).
    const result = computeWeeklyCommitment(planner, labels, new Set([1, 4]), 4);
    expect(result.extraCompletedCount).toBe(1);
    expect(result.completedOfPlanned).toBe(1);
  });

  it('marks each day correctly as past, today, or future', () => {
    const result = computeWeeklyCommitment({}, labels, new Set(), 3); // today = Wednesday
    expect(result.days[0].isPast).toBe(true);  // Sunday
    expect(result.days[3].isToday).toBe(true); // Wednesday
    expect(result.days[3].isPast).toBe(false);
    expect(result.days[5].isPast).toBe(false); // Friday, future
    expect(result.days[5].isToday).toBe(false);
  });

  it('resolves the plan label for a planned day, falling back to a generic label for an unknown plan id', () => {
    const planner = { 1: { planId: 1, dayIndex: 0 }, 2: { planId: 999, dayIndex: 0 } };
    const result = computeWeeklyCommitment(planner, labels, new Set(), 3);
    expect(result.days[1].planLabel).toBe('Peito');
    expect(result.days[2].planLabel).toBe('Treino'); // unknown id, generic fallback
  });

  it('never crashes with a fully empty week', () => {
    expect(() => computeWeeklyCommitment({}, {}, new Set(), 0)).not.toThrow();
  });

  it('marks isSkipped only for a planned, past, uncompleted day', () => {
    // Mon(1) planned+done, Tue(2) planned+missed, Wed(3, today) planned+not-yet-done, Thu(4) unplanned.
    const planner = { 1: { planId: 1, dayIndex: 0 }, 2: { planId: 2, dayIndex: 0 }, 3: { planId: 3, dayIndex: 0 } };
    const result = computeWeeklyCommitment(planner, labels, new Set([1]), 3);
    expect(result.days[1].isSkipped).toBe(false); // Mon: completed
    expect(result.days[2].isSkipped).toBe(true);  // Tue: planned, past, not completed
    expect(result.days[3].isSkipped).toBe(false); // Wed: today, not past
    expect(result.days[4].isSkipped).toBe(false); // Thu: not planned at all
  });
});
