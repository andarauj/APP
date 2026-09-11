import {
  PHASE_ORDER, nextPhase, phaseSpec, phaseTargets, roundToIncrement, epley1RM, loadIncrement,
} from '../adaptivePlan';

describe('phase order + wrap', () => {
  it('cycles on_ramp -> accumulation -> intensification -> deload -> on_ramp', () => {
    let p = PHASE_ORDER[0];
    const seen = [p];
    for (let i = 0; i < 4; i++) { const n = nextPhase(p); p = n.phase; seen.push(p); }
    expect(seen).toEqual(['on_ramp', 'accumulation', 'intensification', 'deload', 'on_ramp']);
  });
  it('flags the cycle wrap only on deload -> on_ramp', () => {
    expect(nextPhase('deload').wrapsCycle).toBe(true);
    expect(nextPhase('accumulation').wrapsCycle).toBe(false);
  });
});

describe('phase spec by goal', () => {
  it('accumulation has more volume than intensification (general)', () => {
    expect(phaseSpec('accumulation', 'general').volumeMult)
      .toBeGreaterThan(phaseSpec('intensification', 'general').volumeMult);
  });
  it('intensification is heavier than accumulation', () => {
    expect(phaseSpec('intensification', 'general').intensityPct)
      .toBeGreaterThan(phaseSpec('accumulation', 'general').intensityPct);
  });
  it('bulking tilts accumulation to more volume than strength', () => {
    expect(phaseSpec('accumulation', 'bulking').volumeMult)
      .toBeGreaterThan(phaseSpec('accumulation', 'strength').volumeMult);
  });
  it('strength intensification is heavier + lower reps than bulking', () => {
    const s = phaseSpec('intensification', 'strength');
    const b = phaseSpec('intensification', 'bulking');
    expect(s.intensityPct).toBeGreaterThan(b.intensityPct);
    expect(s.repHigh).toBeLessThan(b.repHigh);
  });
  it('deload always halves-ish the volume', () => {
    for (const g of ['bulking', 'strength', 'cutting', 'general'] as const) {
      expect(phaseSpec('deload', g).volumeMult).toBeLessThanOrEqual(0.6);
    }
  });
  it('general intensification volume is grounded at 0.80x (PERIODIZATION_RESEARCH.md §"Judgment on the app\'s current hardcoded multipliers") — a deliberate change, not accidental drift', () => {
    expect(phaseSpec('intensification', 'general').volumeMult).toBeCloseTo(0.80);
  });
});

describe('phase spec by experience', () => {
  it('defaults to intermediate (untouched) when experience is omitted', () => {
    expect(phaseSpec('intensification', 'general')).toEqual(phaseSpec('intensification', 'general', 'intermediate'));
    expect(phaseSpec('accumulation', 'strength')).toEqual(phaseSpec('accumulation', 'strength', 'intermediate'));
  });
  it('beginner intensification trades a little intensity for a wider rep window', () => {
    const inter = phaseSpec('intensification', 'general', 'intermediate');
    const beg = phaseSpec('intensification', 'general', 'beginner');
    expect(beg.intensityPct).toBeLessThan(inter.intensityPct);
    expect(beg.repHigh).toBeGreaterThan(inter.repHigh);
  });
  it('beginner accumulation has less volume than intermediate', () => {
    const inter = phaseSpec('accumulation', 'general', 'intermediate');
    const beg = phaseSpec('accumulation', 'general', 'beginner');
    expect(beg.volumeMult).toBeLessThan(inter.volumeMult);
  });
  it('advanced intensification is heavier than intermediate', () => {
    const inter = phaseSpec('intensification', 'general', 'intermediate');
    const adv = phaseSpec('intensification', 'general', 'advanced');
    expect(adv.intensityPct).toBeGreaterThan(inter.intensityPct);
  });
  it('advanced deload is deeper (less volume) than intermediate', () => {
    const inter = phaseSpec('deload', 'general', 'intermediate');
    const adv = phaseSpec('deload', 'general', 'advanced');
    expect(adv.volumeMult).toBeLessThan(inter.volumeMult);
  });
  it('phases untouched by EXPERIENCE_ADJUST stay identical across experience levels', () => {
    expect(phaseSpec('on_ramp', 'general', 'beginner')).toEqual(phaseSpec('on_ramp', 'general', 'intermediate'));
    expect(phaseSpec('on_ramp', 'general', 'advanced')).toEqual(phaseSpec('on_ramp', 'general', 'intermediate'));
  });
  it('phaseTargets threads experience through to sets/weight', () => {
    const inter = phaseTargets('accumulation', 'general', 4, 100, 0, 2.5, 'intermediate');
    const beg = phaseTargets('accumulation', 'general', 4, 100, 0, 2.5, 'beginner');
    expect(beg.targetSets).toBeLessThanOrEqual(inter.targetSets);
  });
});

describe('roundToIncrement', () => {
  it('snaps to the loadable step', () => {
    expect(roundToIncrement(64, 2.5)).toBe(65);
    expect(roundToIncrement(61.2, 2.5)).toBe(60);
    expect(roundToIncrement(63.7, 2.5)).toBe(62.5);
    expect(roundToIncrement(47, 5)).toBe(45);
    expect(roundToIncrement(12.3, 0)).toBe(12);
  });
});

describe('phaseTargets', () => {
  it('scales sets by the phase volume multiplier', () => {
    const acc = phaseTargets('accumulation', 'general', 3, 100);
    const del = phaseTargets('deload', 'general', 3, 100);
    expect(acc.targetSets).toBeGreaterThanOrEqual(3);
    expect(del.targetSets).toBeLessThan(3);
    expect(del.targetSets).toBeGreaterThanOrEqual(1);
  });
  it('weight is e1RM * phase intensity, rounded', () => {
    const t = phaseTargets('intensification', 'general', 3, 100, 0, 2.5);
    // general intensification ~0.85 -> 85 kg
    expect(t.targetWeight).toBe(85);
  });
  it('returns 0 weight when e1RM unknown (caller keeps last logged)', () => {
    expect(phaseTargets('accumulation', 'general', 3, 0).targetWeight).toBe(0);
  });
  it('a stall widens the rep window up to +2', () => {
    const fresh = phaseTargets('accumulation', 'general', 3, 100, 0);
    const stalled = phaseTargets('accumulation', 'general', 3, 100, 5);
    expect(stalled.repHigh).toBe(fresh.repHigh + 2);
    expect(stalled.repLow).toBe(fresh.repLow);
  });
});

describe('loadIncrement', () => {
  it('bodyweight / band work has no external step', () => {
    expect(loadIncrement('body only')).toBe(0);
    expect(loadIncrement('bands')).toBe(0);
    expect(loadIncrement('none')).toBe(0);
  });
  it('dumbbell and kettlebell jump in 2kg', () => {
    expect(loadIncrement('dumbbell')).toBe(2);
    expect(loadIncrement('kettlebell')).toBe(2);
  });
  it('barbell / machine / cable default to 2.5kg', () => {
    expect(loadIncrement('barbell')).toBe(2.5);
    expect(loadIncrement('machine')).toBe(2.5);
    expect(loadIncrement('cable')).toBe(2.5);
    expect(loadIncrement('')).toBe(2.5);
  });
});

describe('epley1RM', () => {
  it('1 rep = the weight', () => expect(epley1RM(100, 1)).toBe(100));
  it('more reps -> higher estimate', () => {
    expect(epley1RM(100, 8)).toBeGreaterThan(epley1RM(100, 5));
  });
  it('guards zero/negatives', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
  });
});
