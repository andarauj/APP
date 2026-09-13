import {
  normalizeExerciseKey,
  resolveCanonicalKey,
  EXERCISE_DISPLAY_RENAMES,
  EXERCISE_MERGE_ALIASES,
  mediaDonorKeysFor,
} from '../exerciseNormalize';

describe('normalizeExerciseKey', () => {
  it('strips accents and lowercases', () => {
    expect(normalizeExerciseKey('Flexões Diamante')).toBe('flexoes diamante');
    expect(normalizeExerciseKey('Elevação Lateral')).toBe('elevacao lateral');
  });

  it('collapses punctuation and spaces', () => {
    expect(normalizeExerciseKey('  Pull-up  (Chin) ')).toBe('pull up chin');
  });
});

describe('EXERCISE_DISPLAY_RENAMES', () => {
  it('maps Flexoes → Flexões', () => {
    expect(EXERCISE_DISPLAY_RENAMES['Flexoes']).toBe('Flexões');
  });

  it('corrects Pull-up mislabeled as Flexoes de Bracos', () => {
    expect(EXERCISE_DISPLAY_RENAMES['Pull-up (Flexoes de Bracos)']).toBe('Barra Fixa (Pull-up)');
  });

  it('maps Elevacao Lateral com Halteres', () => {
    expect(EXERCISE_DISPLAY_RENAMES['Elevacao Lateral com Halteres']).toBe('Elevação Lateral com Halteres');
  });

  it('maps Phase 3 Extensao/Elevacao leftovers', () => {
    expect(EXERCISE_DISPLAY_RENAMES['Extensao de Triceps na Polia']).toBe('Extensão de Tríceps na Polia');
    expect(EXERCISE_DISPLAY_RENAMES['Elevacao de Panturrilhas em Pe']).toBe('Elevação de Gémeos em Pé');
    expect(EXERCISE_DISPLAY_RENAMES['Press de Ombros em Pe']).toBe('Press de Ombros em Pé');
  });
});

describe('resolveCanonicalKey / merges', () => {
  it('merges diamond push-up into flexões diamante', () => {
    expect(resolveCanonicalKey('Diamond Push-up')).toBe(normalizeExerciseKey('Flexões Diamante'));
  });

  it('merges pull-up into barra fixa', () => {
    expect(resolveCanonicalKey('Pull-up')).toBe(normalizeExerciseKey('Barra Fixa (Pull-up)'));
  });

  it('merges bench press into supino', () => {
    expect(resolveCanonicalKey('Barbell Bench Press')).toBe(normalizeExerciseKey('Supino com Barra'));
  });

  it('merges dumbbell lateral raise', () => {
    expect(resolveCanonicalKey('Dumbbell Lateral Raise')).toBe(
      normalizeExerciseKey('Elevação Lateral com Halteres')
    );
  });

  it('keeps unknown names as their own key', () => {
    expect(resolveCanonicalKey('Supino com Barra')).toBe(normalizeExerciseKey('Supino com Barra'));
  });

  it('has an expanded alias map', () => {
    expect(Object.keys(EXERCISE_MERGE_ALIASES).length).toBeGreaterThan(20);
  });
});

describe('mediaDonorKeysFor', () => {
  it('includes the canonical key and reverse aliases', () => {
    const key = normalizeExerciseKey('Flexões');
    const donors = mediaDonorKeysFor(key);
    expect(donors).toContain(key);
    expect(donors.some(d => d.includes('push'))).toBe(true);
  });
});
