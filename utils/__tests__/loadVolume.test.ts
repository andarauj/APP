import { effectiveLoad, setVolume, shouldPreferRepsKpi, loadModeForEquipment } from '../loadVolume';

describe('loadModeForEquipment', () => {
  it('marks bodyweight equipment', () => {
    expect(loadModeForEquipment('bodyweight')).toBe('bodyweight');
    expect(loadModeForEquipment('dumbbell')).toBe('external');
  });
});

describe('effectiveLoad', () => {
  it('uses logged weight when present', () => {
    expect(effectiveLoad(60, 'bodyweight', 75)).toBe(60);
    expect(effectiveLoad(80, 'barbell', 75)).toBe(80);
  });

  it('falls back to user bodyweight for BW @ 0 kg', () => {
    expect(effectiveLoad(0, 'bodyweight', 75)).toBe(75);
  });

  it('stays 0 for external load at 0 kg', () => {
    expect(effectiveLoad(0, 'barbell', 75)).toBe(0);
  });

  it('stays 0 for BW when no bodyweight is known', () => {
    expect(effectiveLoad(0, 'bodyweight', null)).toBe(0);
  });
});

describe('setVolume', () => {
  it('computes flexões 15+15+12 at 75 kg as 3150', () => {
    const sets = [15, 15, 12];
    const total = sets.reduce((sum, reps) => sum + setVolume(reps, 0, 'bodyweight', 75), 0);
    expect(total).toBe(3150);
  });
});

describe('shouldPreferRepsKpi', () => {
  it('prefers reps when half or more sets are bodyweight', () => {
    expect(shouldPreferRepsKpi(3, 5)).toBe(true);
    expect(shouldPreferRepsKpi(2, 5)).toBe(false);
    expect(shouldPreferRepsKpi(0, 0)).toBe(false);
  });
});
