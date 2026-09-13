import { shouldShowPlansEmpty, filterPlanGroupsByTab } from '../plansUi';

describe('shouldShowPlansEmpty', () => {
  it('is empty only when there are no manual plans AND no adaptive plan', () => {
    expect(shouldShowPlansEmpty(0, false)).toBe(true);
  });

  it('is not empty when an adaptive plan is active even with zero manual plans', () => {
    expect(shouldShowPlansEmpty(0, true)).toBe(false);
  });

  it('is not empty when manual plans exist', () => {
    expect(shouldShowPlansEmpty(2, false)).toBe(false);
    expect(shouldShowPlansEmpty(1, true)).toBe(false);
  });
});

describe('filterPlanGroupsByTab', () => {
  const groups = [
    { name: 'A', plans: [{ is_auto_generated: 1 }] },
    { name: 'B', plans: [{ is_auto_generated: 0 }] },
    { name: 'C', plans: [{ is_auto_generated: 1 }, { is_auto_generated: 0 }] },
  ];

  it('todos returns all', () => {
    expect(filterPlanGroupsByTab(groups, 'todos')).toHaveLength(3);
  });

  it('gerados keeps groups with auto-generated plans', () => {
    expect(filterPlanGroupsByTab(groups, 'gerados').map(g => g.name)).toEqual(['A', 'C']);
  });

  it('manuais keeps groups with manual plans', () => {
    expect(filterPlanGroupsByTab(groups, 'manuais').map(g => g.name)).toEqual(['B', 'C']);
  });
});
