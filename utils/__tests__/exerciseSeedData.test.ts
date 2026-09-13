/**
 * Seed catalogue invariants — unique names, accents, PT-PT instructions.
 */
import { EXERCISE_SEED_DATA } from '../../db/exerciseSeedData';
import { normalizeExerciseKey } from '../exerciseNormalize';
import { movementSubcategory } from '../movementClassify';

/** Known unaccented PT tokens that should not appear in curated seed names. */
const RESIDUAL_ASCII_NAME = /\b(Flexoes|Elevacao|Extensao|Rotacao|Abducao|Aducao|Adducao|Triceps|Biceps|Maquina|Elastico|Isometrico|Panturrilhas)\b/;

/** Instruction tokens that should be accented in PT-PT seed copy. */
const RESIDUAL_ASCII_INSTR = /\b(mao|maos|posicao|facil|dificil|maquina|pescoco|maximo|tensao|contracao|extensao|elevacao|rotacao|triceps|biceps|confortavel|porcao|varias|em pe)\b/i;

describe('exerciseSeedData (Phase 3 PT-PT)', () => {
  it('has unique display names', () => {
    const names = EXERCISE_SEED_DATA.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('classifies every strength seed row with a real movement_type', () => {
    const unclassified = EXERCISE_SEED_DATA
      .filter((e) => e.type === 'strength')
      .filter((e) => movementSubcategory(e.name, e.primary_muscle, e.type) === 'other')
      .map((e) => e.name);
    expect(unclassified).toEqual([]);
  });

  it('has unique normalized keys (no accent/spacing collisions)', () => {
    const keys = EXERCISE_SEED_DATA.map((e) => normalizeExerciseKey(e.name));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it('uses accented Flexões / Elevação / Barra Fixa labels', () => {
    const names = EXERCISE_SEED_DATA.map((e) => e.name);
    expect(names).toContain('Flexões');
    expect(names).toContain('Elevação Lateral com Halteres');
    expect(names).toContain('Barra Fixa (Pull-up)');
    expect(names).not.toContain('Flexoes');
    expect(names).not.toContain('Pull-up (Flexoes de Bracos)');
  });

  it('keeps Flexões Diamante and Flexões Diamante (Tríceps) as distinct variants', () => {
    const names = EXERCISE_SEED_DATA.map((e) => e.name);
    expect(names).toContain('Flexões Diamante');
    expect(names).toContain('Flexões Diamante (Tríceps)');
  });

  it('does not keep obvious EN push-up / diamond duplicates alongside PT', () => {
    const keys = EXERCISE_SEED_DATA.map((e) => normalizeExerciseKey(e.name));
    expect(keys.filter((k) => k === 'diamond push up')).toHaveLength(0);
    expect(keys.filter((k) => k === 'flexoes diamante')).toHaveLength(1);
  });

  it('rejects residual ASCII Portuguese tokens in names', () => {
    // Ignore intentional English technical labels inside parentheses, e.g. (Triceps Pushdown).
    const offenders = EXERCISE_SEED_DATA
      .map((e) => e.name.replace(/\([^)]*\)/g, '').trim())
      .filter((n) => RESIDUAL_ASCII_NAME.test(n));
    expect(offenders).toEqual([]);
  });

  it('has non-empty instructions for every seed exercise', () => {
    const empty = EXERCISE_SEED_DATA.filter((e) => !e.instructions?.trim()).map((e) => e.name);
    expect(empty).toEqual([]);
  });

  it('rejects residual ASCII Portuguese tokens in instructions', () => {
    const offenders = EXERCISE_SEED_DATA
      .filter((e) => RESIDUAL_ASCII_INSTR.test(e.instructions || ''))
      .map((e) => e.name);
    expect(offenders).toEqual([]);
  });
});
