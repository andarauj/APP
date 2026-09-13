import {
  calculate1RM,
  calculate1RMBrzycki,
  estimate1RM,
  calculate1RMPercentages,
  calculatePlates,
  calculateWarmupSets,
  parseTempo,
  tempoSecondsPerRep,
  formatTempo,
} from '../calculators';

describe('calculate1RM (Epley formula)', () => {
  it('returns the weight itself for a single rep', () => {
    expect(calculate1RM(100, 1)).toBe(100);
  });

  it('estimates a higher 1RM for more reps at the same weight', () => {
    const fiveReps = calculate1RM(78, 5);
    const tenReps = calculate1RM(78, 10);
    expect(fiveReps).toBeGreaterThan(78);
    expect(tenReps).toBeGreaterThan(fiveReps);
  });

  it('matches the value shown during manual verification (78kg x 5)', () => {
    // 78 * (1 + 5/30) = 91
    expect(calculate1RM(78, 5)).toBe(91);
  });

  it('returns 0 for invalid input', () => {
    expect(calculate1RM(0, 5)).toBe(0);
    expect(calculate1RM(80, 0)).toBe(0);
    expect(calculate1RM(-10, 5)).toBe(0);
  });
});

describe('calculate1RMBrzycki / estimate1RM', () => {
  it('Brzycki is defined for mid-range reps', () => {
    expect(calculate1RMBrzycki(100, 5)).toBeGreaterThan(100);
  });

  it('estimate1RM averages Epley and Brzycki', () => {
    const e = calculate1RM(100, 5);
    const b = calculate1RMBrzycki(100, 5);
    expect(estimate1RM(100, 5)).toBe(Math.round(((e + b) / 2) * 10) / 10);
  });
});

describe('calculate1RMPercentages', () => {
  it('returns the 1RM itself at 100%', () => {
    const table = calculate1RMPercentages(91);
    const hundred = table.find(t => t.percent === 100);
    expect(hundred?.weight).toBe(91);
  });

  it('rounds to the nearest 0.5kg and decreases monotonically', () => {
    const table = calculate1RMPercentages(91);
    for (let i = 1; i < table.length; i++) {
      expect(table[i].weight).toBeLessThanOrEqual(table[i - 1].weight);
      expect((table[i].weight * 2) % 1).toBe(0); // multiple of 0.5
    }
  });

  it('returns an empty table for a non-positive 1RM', () => {
    expect(calculate1RMPercentages(0)).toEqual([]);
    expect(calculate1RMPercentages(-5)).toEqual([]);
  });
});

describe('calculateWarmupSets', () => {
  it('skips warmup entirely for light working weights', () => {
    expect(calculateWarmupSets(25)).toEqual([]);
  });

  it('produces an ascending, always-loadable (2.5kg) ramp below the working weight', () => {
    for (const w of [60, 78, 100, 140]) {
      const sets = calculateWarmupSets(w);
      expect(sets.length).toBeGreaterThan(0);
      for (let i = 0; i < sets.length; i++) {
        expect(sets[i].weight % 2.5).toBe(0);
        expect(sets[i].weight).toBeLessThan(w);
        if (i > 0) expect(sets[i].weight).toBeGreaterThan(sets[i - 1].weight);
      }
    }
  });

  it('respects a custom (or absent) bar weight as the floor', () => {
    const noBar = calculateWarmupSets(100, 0);
    const withBar = calculateWarmupSets(100, 20);
    expect(Math.min(...noBar.map(s => s.weight))).toBeLessThanOrEqual(Math.min(...withBar.map(s => s.weight)));
    expect(withBar.every(s => s.weight >= 20)).toBe(true);
  });
});

describe('parseTempo', () => {
  it('parses a standard 4-number cadence', () => {
    expect(parseTempo('3-1-2-0')).toEqual({ eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 });
  });

  it('treats "X" as explosive (0 seconds)', () => {
    expect(parseTempo('3-0-X-0')).toEqual({ eccentric: 3, pauseBottom: 0, concentric: 0, pauseTop: 0 });
  });

  it('rejects malformed input', () => {
    expect(parseTempo('3-1-2')).toBeNull(); // too few parts
    expect(parseTempo('abc')).toBeNull();
    expect(parseTempo('3-1-2-99')).toBeNull(); // out of 0-10 range
  });
});

describe('tempoSecondsPerRep / formatTempo', () => {
  it('sums all four phases', () => {
    const t = { eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 };
    expect(tempoSecondsPerRep(t)).toBe(6);
  });

  it('formats back to the canonical dash-separated string', () => {
    const t = { eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 };
    expect(formatTempo(t)).toBe('3-1-2-0');
  });
});

describe('calculatePlates', () => {
  it('returns just the bar when the target equals the bar weight', () => {
    const result = calculatePlates(20, 'kg');
    expect(result.plates).toEqual([]);
    expect(result.totalWeight).toBe(20);
  });

  it('finds a combination that reconstructs the target weight exactly', () => {
    const result = calculatePlates(100, 'kg');
    expect(result.totalWeight).toBe(100);
    const reconstructed = 20 + result.plates.reduce((sum, p) => sum + p.weight * p.count * 2, 0);
    expect(reconstructed).toBe(100);
  });
});
