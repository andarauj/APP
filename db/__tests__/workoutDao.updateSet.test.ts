/**
 * Covers updateWorkoutSet — persisting a correction to an already-logged
 * set (reps/weight/RPE), added so a completed set can be fixed without the
 * edit silently existing only in on-screen state (see the comment on
 * SetRow's RPE cell in app/workout/active.tsx for the bug this pattern was
 * already known to cause once, for RPE specifically).
 */

const mockRunAsync = jest.fn();

jest.mock('../database', () => ({
  getDatabase: async () => ({ runAsync: mockRunAsync }),
}));

import { updateWorkoutSet } from '../workoutDao';

function lastQuery(): { sql: string; params: unknown[] } {
  const call = mockRunAsync.mock.calls[mockRunAsync.mock.calls.length - 1];
  return { sql: call[0] as string, params: call[1] as unknown[] };
}

beforeEach(() => {
  mockRunAsync.mockReset().mockResolvedValue(undefined);
});

describe('updateWorkoutSet', () => {
  it('updates reps, weight, and rpe together', async () => {
    await updateWorkoutSet(42, { reps: 8, weight: 60, rpe: 7 });
    const { sql, params } = lastQuery();
    expect(sql).toContain('reps = ?');
    expect(sql).toContain('weight = ?');
    expect(sql).toContain('rpe = ?');
    expect(sql).toContain('WHERE id = ?');
    expect(params).toEqual([8, 60, 7, 42]);
  });

  it('only updates the fields actually provided', async () => {
    await updateWorkoutSet(42, { weight: 65 });
    const { sql, params } = lastQuery();
    expect(sql).not.toContain('reps = ?');
    expect(sql).not.toContain('rpe = ?');
    expect(sql).toContain('weight = ?');
    expect(params).toEqual([65, 42]);
  });

  it('allows explicitly clearing rpe back to null', async () => {
    await updateWorkoutSet(42, { rpe: null });
    const { params } = lastQuery();
    expect(params).toEqual([null, 42]);
  });

  it('does nothing when no fields are given', async () => {
    await updateWorkoutSet(42, {});
    expect(mockRunAsync).not.toHaveBeenCalled();
  });
});
