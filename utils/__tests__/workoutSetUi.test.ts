import {
  SET_TYPE_CYCLE,
  REST_PRESETS_SECONDS,
  nextSetType,
  setTypeBadgeLabel,
  adjustRestRemaining,
  normalizeRepsTarget,
  parseLoggedReps,
  plannedSetType,
} from '../workoutSetUi';
import { estimate1RM } from '../calculators';

describe('workoutSetUi', () => {
  it('cycles set types in JEFIT order', () => {
    expect(nextSetType('normal')).toBe('warmup');
    expect(nextSetType('warmup')).toBe('dropset');
    expect(nextSetType('dropset')).toBe('failure');
    expect(nextSetType('failure')).toBe('amrap');
    expect(nextSetType('amrap')).toBe('normal');
  });

  it('exposes the full cycle list', () => {
    expect(SET_TYPE_CYCLE).toEqual(['normal', 'warmup', 'dropset', 'failure', 'amrap']);
  });

  it('uses letters for classified sets and the index for normal', () => {
    expect(setTypeBadgeLabel('normal', 2)).toBe('3');
    expect(setTypeBadgeLabel('warmup', 0)).toBe('W');
    expect(setTypeBadgeLabel('dropset', 0)).toBe('D');
    expect(setTypeBadgeLabel('failure', 0)).toBe('F');
    expect(setTypeBadgeLabel('amrap', 0)).toBe('A');
  });

  it('offers 60/90/120 rest presets', () => {
    expect(REST_PRESETS_SECONDS).toEqual([60, 90, 120]);
  });

  it('clamps rest adjustments at zero', () => {
    expect(adjustRestRemaining(25, 30)).toBe(55);
    expect(adjustRestRemaining(8, -10)).toBe(0);
  });

  it('keeps prescribed rep ranges for the REPS field', () => {
    expect(normalizeRepsTarget('12-15')).toBe('12-15');
    expect(normalizeRepsTarget('  8-12  ')).toBe('8-12');
    expect(normalizeRepsTarget('')).toBe('8-12');
    expect(normalizeRepsTarget(null)).toBe('8-12');
  });

  it('logs the low end of a range so volume math stays numeric', () => {
    expect(parseLoggedReps('12-15')).toBe(12);
    expect(parseLoggedReps('10')).toBe(10);
    expect(parseLoggedReps('')).toBe(0);
    expect(parseLoggedReps(8)).toBe(8);
  });

  it('maps plan set_type to warmup vs working for SQLite', () => {
    expect(plannedSetType('warmup')).toBe('warmup');
    expect(plannedSetType('normal')).toBe('normal');
    expect(plannedSetType('dropset')).toBe('dropset');
    expect(plannedSetType('nope')).toBe('normal');
    expect(plannedSetType(null)).toBe('normal');
  });
});

describe('in-session e1RM readout', () => {
  it('estimates from live weight×reps (not warmup)', () => {
    expect(estimate1RM(100, 5)).toBeGreaterThan(100);
  });
});
