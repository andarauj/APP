import {
  actionForConfidence,
  baseExerciseName,
  hasVariantConflict,
  isAllowedMediaUrl,
  isLikelyImageUrl,
  MEDIA_AUTO_THRESHOLD,
} from '../exerciseMediaMatch';
import { normalizeExerciseKey } from '../exerciseNormalize';

describe('exerciseMediaMatch', () => {
  it('only auto-associates at/above the safe threshold', () => {
    expect(actionForConfidence(95)).toBe('ADD');
    expect(actionForConfidence(MEDIA_AUTO_THRESHOLD)).toBe('ADD');
    expect(actionForConfidence(70)).toBe('REVIEW');
    expect(actionForConfidence(40)).toBe('REJECT');
    expect(actionForConfidence(0)).toBe('NONE');
  });

  it('rejects non-https and placeholder URLs', () => {
    expect(isAllowedMediaUrl('https://raw.githubusercontent.com/x/y/0.jpg')).toBe(true);
    expect(isAllowedMediaUrl('http://raw.githubusercontent.com/x/y/0.jpg')).toBe(false);
    expect(isAllowedMediaUrl('https://example.com/fake.jpg')).toBe(false);
    expect(isAllowedMediaUrl('not-a-url')).toBe(false);
    expect(isAllowedMediaUrl('')).toBe(false);
  });

  it('recognises image-like URLs', () => {
    expect(isLikelyImageUrl('https://cdn.example.org/a.jpg')).toBe(true);
    expect(isLikelyImageUrl('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/0.jpg')).toBe(true);
    expect(isLikelyImageUrl('https://cdn.example.org/a.html')).toBe(false);
  });

  it('flags incline vs decline conflicts', () => {
    expect(hasVariantConflict(
      normalizeExerciseKey('Supino Inclinado'),
      normalizeExerciseKey('Supino Declinado')
    )).toBe(true);
    expect(hasVariantConflict(
      normalizeExerciseKey('Flexões Diamante'),
      normalizeExerciseKey('Flexões')
    )).toBe(true);
    expect(hasVariantConflict(
      normalizeExerciseKey('Supino com Barra'),
      normalizeExerciseKey('Barbell Bench Press')
    )).toBe(false);
  });

  it('strips tempo suffixes to recover the base name', () => {
    expect(baseExerciseName('Supino com Halteres Isométrico')).toBe('Supino com Halteres');
    expect(baseExerciseName('Flexões Unilateral')).toBe('Flexões');
    expect(baseExerciseName('Flexões Diamante')).toBeNull();
  });
});

describe('exercise-media-matches.json', () => {
  // Lazy require so Jest can load JSON without TS path issues.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const payload = require('../../assets/data/exercise-media-matches.json') as {
    matches: {
      seedName: string;
      imageUrl: string;
      confidence: number;
      urlValid?: boolean;
      source: string;
      license: string;
    }[];
    license: string;
  };

  it('contains only HTTPS free-exercise-db stills at ADD confidence', () => {
    expect(payload.matches.length).toBeGreaterThan(50);
    for (const m of payload.matches) {
      expect(isAllowedMediaUrl(m.imageUrl)).toBe(true);
      expect(m.imageUrl).toContain('raw.githubusercontent.com/yuhonas/free-exercise-db');
      expect(m.confidence).toBeGreaterThanOrEqual(MEDIA_AUTO_THRESHOLD);
      expect(m.urlValid).not.toBe(false);
      expect(m.source).toBe('free-exercise-db');
    }
  });

  it('records an identifiable license', () => {
    expect(payload.license.toLowerCase()).toContain('unlicense');
  });

  it('maps Flexões and Supino without collapsing diamond/incline variants', () => {
    const byName = new Map(payload.matches.map((m) => [m.seedName, m]));
    expect(byName.get('Flexões')?.imageUrl).toBeTruthy();
    expect(byName.get('Flexões Diamante')?.imageUrl).toBeTruthy();
    expect(byName.get('Flexões')?.imageUrl).not.toBe(byName.get('Flexões Diamante')?.imageUrl);
    expect(byName.get('Supino com Barra')?.imageUrl).not.toBe(
      byName.get('Supino Inclinado com Barra')?.imageUrl
    );
  });
});
