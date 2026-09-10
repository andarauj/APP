/**
 * Guards the vendored exercise dataset against silent corruption: a bad
 * regeneration that drops rows, loses images, or emits a muscle/equipment
 * value the app's types don't know about would otherwise only show up as
 * empty screens on a device.
 */

import EXERCISE_DB from '../../assets/data/exercise-db.json';

interface Row {
  name: string;
  primary_muscle: string;
  secondary_muscles: string;
  equipment: string;
  type: string;
  instructions: string;
  image_url: string;
  api_id: string;
}

const rows = EXERCISE_DB as Row[];

// Mirrors the unions in types/index.ts. Kept literal rather than imported
// so a change to the type is a deliberate two-file edit, not a silent pass.
const MUSCLES = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
  'quads', 'hamstrings', 'glutes', 'calves', 'traps', 'lats', 'cardio',
  'fullbody', 'mobility',
];
const EQUIPMENT = [
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell',
  'band', 'plate', 'ez_bar', 'smith', 'trap_bar', 'medicine_ball',
  'foam_roller', 'gymleco', 'other',
];
const TYPES = ['strength', 'cardio', 'mobility'];

describe('vendored exercise dataset', () => {
  it('has the full set of rows', () => {
    expect(rows.length).toBe(876);
  });

  it('gives every row a name and a stable id', () => {
    for (const r of rows) {
      expect(r.name.trim().length).toBeGreaterThan(0);
      expect(r.api_id.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps api_id unique so re-importing cannot duplicate rows', () => {
    const ids = new Set(rows.map(r => r.api_id));
    expect(ids.size).toBe(rows.length);
  });

  it('only uses muscle values the app understands', () => {
    const bad = rows.filter(r => !MUSCLES.includes(r.primary_muscle));
    expect(bad.map(r => `${r.name}: ${r.primary_muscle}`)).toEqual([]);
  });

  it('only uses secondary muscle values the app understands', () => {
    const bad = rows.flatMap(r =>
      r.secondary_muscles
        ? r.secondary_muscles.split(',').filter(m => !MUSCLES.includes(m))
        : []
    );
    expect([...new Set(bad)]).toEqual([]);
  });

  it('only uses equipment and type values the app understands', () => {
    expect(rows.filter(r => !EQUIPMENT.includes(r.equipment))).toEqual([]);
    expect(rows.filter(r => !TYPES.includes(r.type))).toEqual([]);
  });

  it('carries real instructions rather than a shared template', () => {
    const withText = rows.filter(r => r.instructions.length > 40);
    expect(withText.length).toBeGreaterThan(800);
    // The old generator emitted the same sentence for hundreds of rows;
    // a healthy dataset is almost entirely distinct.
    const distinct = new Set(rows.map(r => r.instructions));
    expect(distinct.size).toBeGreaterThan(rows.length * 0.95);
  });

  it('points nearly every row at an illustration', () => {
    const withImage = rows.filter(r => r.image_url.startsWith('https://'));
    expect(withImage.length).toBeGreaterThanOrEqual(870);
  });

  it('does not smuggle in YouTube search links as media', () => {
    expect(rows.filter(r => r.image_url.includes('youtube.com'))).toEqual([]);
  });
});
