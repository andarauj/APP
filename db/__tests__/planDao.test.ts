/**
 * Covers filterUserSelectablePlans — the fix for the "duplicação" bug
 * reported against the adaptive wizard's plan picker and the weekly
 * planner's day-assignment picker. Every "Criar plano novo" run through the
 * adaptive wizard inserts a fresh workout_plans row literally named "Plano
 * Adaptativo" (autoincrement id, so each row is a distinct, valid SQLite
 * record — never an actual duplicate primary key); repeating that path left
 * every earlier, now-obsolete run's row still showing in pickers that read
 * getAllPlans() unfiltered, indistinguishable from the current one.
 */

import { filterUserSelectablePlans } from '../planDao';
import type { WorkoutPlan } from '@/types';

function plan(overrides: Partial<WorkoutPlan> & { id: number }): WorkoutPlan {
  return {
    name: 'Plano',
    description: '',
    plan_type: 'hypertrophy',
    split_type: 'custom',
    is_auto_generated: 0,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe('filterUserSelectablePlans', () => {
  it('drops every obsolete auto-generated "Plano Adaptativo" row, however many exist', () => {
    // Three separate wizard runs, as would sit in workout_plans after
    // "Criar plano novo" was used three times — same name, distinct ids.
    const plans = [
      plan({ id: 1, name: 'Plano Adaptativo', is_auto_generated: 1 }),
      plan({ id: 2, name: 'Plano Adaptativo', is_auto_generated: 1 }),
      plan({ id: 3, name: 'Plano Adaptativo', is_auto_generated: 1 }),
    ];

    expect(filterUserSelectablePlans(plans)).toEqual([]);
  });

  it('keeps manually-created plans untouched, including ones sharing a name', () => {
    const manual1 = plan({ id: 10, name: 'Treino A' });
    const manual2 = plan({ id: 11, name: 'Treino A' }); // e.g. a duplicated plan — a real, distinct plan, not a stale row
    const autoGen = plan({ id: 12, name: 'Plano Adaptativo', is_auto_generated: 1 });

    const result = filterUserSelectablePlans([manual1, manual2, autoGen]);

    expect(result).toEqual([manual1, manual2]);
  });

  it('excludes every kind of auto-generated output, not just the adaptive wizard', () => {
    const manual = plan({ id: 20, name: 'Push/Pull/Legs' });
    const smart = plan({ id: 21, name: 'Treino Inteligente', is_auto_generated: 1 });
    const fiveThreeOne = plan({ id: 22, name: '5/3/1 — Semana 1', is_auto_generated: 1 });

    expect(filterUserSelectablePlans([manual, smart, fiveThreeOne])).toEqual([manual]);
  });

  it('returns each surviving plan exactly once, never merging same-name rows', () => {
    const plans = [
      plan({ id: 30, name: 'Full Body' }),
      plan({ id: 31, name: 'Full Body' }),
      plan({ id: 32, name: 'Full Body' }),
    ];

    const result = filterUserSelectablePlans(plans);

    expect(result).toHaveLength(3);
    expect(new Set(result.map(p => p.id))).toEqual(new Set([30, 31, 32]));
  });

  it('preserves input order and empty input', () => {
    expect(filterUserSelectablePlans([])).toEqual([]);

    const plans = [plan({ id: 1 }), plan({ id: 2 }), plan({ id: 3 })];
    expect(filterUserSelectablePlans(plans).map(p => p.id)).toEqual([1, 2, 3]);
  });
});
