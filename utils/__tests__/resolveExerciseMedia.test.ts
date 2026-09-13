import {
  isOfflinePriorityExercise,
  pickExerciseMediaUrl,
} from '../resolveExerciseMedia';
import { OFFLINE_PRIORITY_EXERCISE_KEYS, OFFLINE_PREFETCH_LIMIT } from '@/constants/exerciseMediaManifest';

describe('pickExerciseMediaUrl', () => {
  it('prefers thumbnail in compact list mode', () => {
    expect(pickExerciseMediaUrl({
      compact: true,
      thumbnailUrl: 'https://example.com/thumb.jpg',
      imageUrl: 'https://example.com/still.jpg',
      gifUrl: 'https://example.com/demo.gif',
    })).toBe('https://example.com/thumb.jpg');
  });

  it('prefers gif for detail when not compact', () => {
    expect(pickExerciseMediaUrl({
      thumbnailUrl: 'https://example.com/thumb.jpg',
      imageUrl: 'https://example.com/still.jpg',
      gifUrl: 'https://example.com/demo.gif',
    })).toBe('https://example.com/demo.gif');
  });

  it('returns null when nothing is available', () => {
    expect(pickExerciseMediaUrl({})).toBeNull();
  });
});

describe('offline priority manifest', () => {
  it('lists a bounded priority subset', () => {
    expect(OFFLINE_PRIORITY_EXERCISE_KEYS.length).toBeGreaterThan(10);
    expect(OFFLINE_PREFETCH_LIMIT).toBeGreaterThanOrEqual(OFFLINE_PRIORITY_EXERCISE_KEYS.length);
  });

  it('recognises common staples as offline-priority', () => {
    expect(isOfflinePriorityExercise('Flexões')).toBe(true);
    expect(isOfflinePriorityExercise('Agachamento com Barra')).toBe(true);
    expect(isOfflinePriorityExercise('Prancha')).toBe(true);
  });

  it('does not flag obscure names as priority', () => {
    expect(isOfflinePriorityExercise('Gymleco Obscure Machine XYZ')).toBe(false);
  });
});
