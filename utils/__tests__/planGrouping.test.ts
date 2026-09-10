import { groupPlansByName } from '../planGrouping';
import type { WorkoutPlan } from '@/types';

function plan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: 1,
    name: 'Peito',
    description: '',
    plan_type: 'hypertrophy',
    split_type: 'custom',
    is_auto_generated: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('groupPlansByName', () => {
  it('returns an empty array for no plans', () => {
    expect(groupPlansByName([])).toEqual([]);
  });

  it('keeps a single plan as its own group', () => {
    const result = groupPlansByName([plan({ id: 1, name: 'Peito' })]);
    expect(result).toEqual([{ name: 'Peito', plans: [plan({ id: 1, name: 'Peito' })] }]);
  });

  it('groups multiple plans sharing the exact same name', () => {
    const p1 = plan({ id: 1, name: 'Peito' });
    const p2 = plan({ id: 2, name: 'Peito' });
    const result = groupPlansByName([p1, p2]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Peito');
    expect(result[0].plans).toEqual([p1, p2]);
  });

  it('keeps differently-named plans as separate groups', () => {
    const p1 = plan({ id: 1, name: 'Peito' });
    const p2 = plan({ id: 2, name: 'Costas' });
    const result = groupPlansByName([p1, p2]);
    expect(result).toHaveLength(2);
    expect(result.map(g => g.name)).toEqual(['Peito', 'Costas']);
  });

  it('preserves the order names first appear in', () => {
    const p1 = plan({ id: 1, name: 'Costas' });
    const p2 = plan({ id: 2, name: 'Peito' });
    const p3 = plan({ id: 3, name: 'Costas' });
    const result = groupPlansByName([p1, p2, p3]);
    expect(result.map(g => g.name)).toEqual(['Costas', 'Peito']);
    expect(result[0].plans).toEqual([p1, p3]);
  });

  it('treats names differing only in case as distinct groups', () => {
    // Exact match only — deliberately not fuzzy, to avoid silently merging
    // two plans the person considers different.
    const p1 = plan({ id: 1, name: 'Peito' });
    const p2 = plan({ id: 2, name: 'peito' });
    const result = groupPlansByName([p1, p2]);
    expect(result).toHaveLength(2);
  });
});
