import { computeNspi, type NspiInput } from '../nspi';

function base(overrides: Partial<NspiInput> = {}): NspiInput {
  return {
    phase: 'accumulation',
    goal: 'general',
    load: [],
    effectiveSetsDone: 0,
    setsPlanned: 0,
    movement: [],
    previousScores: [],
    ...overrides,
  };
}

describe('computeNspi — overall shape', () => {
  it('stays within 0..100 for empty and extreme inputs', () => {
    const empty = computeNspi(base());
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);

    const huge = computeNspi(base({
      load: [{ pattern: 'squat', e1rmThisWeek: 200, e1rmBaseline: 100 }],
      effectiveSetsDone: 999,
      setsPlanned: 10,
      movement: [
        { bucket: 'horiz_push', sets: 6 }, { bucket: 'vert_push', sets: 6 },
        { bucket: 'horiz_pull', sets: 6 }, { bucket: 'vert_pull', sets: 6 },
        { bucket: 'quad', sets: 6 }, { bucket: 'hinge', sets: 6 },
      ],
    }));
    expect(huge.score).toBe(100);
    expect(huge.load).toBe(100);
    expect(huge.volume).toBe(100);
    expect(huge.balance).toBe(100);
  });

  it('components sum (weighted) to the score', () => {
    const r = computeNspi(base({
      goal: 'strength',
      load: [{ pattern: 'bench', e1rmThisWeek: 104, e1rmBaseline: 100 }],
      effectiveSetsDone: 8,
      setsPlanned: 10,
      movement: [{ bucket: 'horiz_push', sets: 4 }, { bucket: 'horiz_pull', sets: 4 }],
    }));
    const weighted = r.components.reduce((s, c) => s + c.score * c.weight, 0);
    expect(Math.abs(weighted - r.score)).toBeLessThanOrEqual(1); // rounding
  });
});

describe('load axis', () => {
  it('no history -> 50', () => {
    expect(computeNspi(base()).load).toBe(50);
  });

  it('+8% e1RM -> ~100, -8% -> ~0', () => {
    const up = computeNspi(base({ load: [{ pattern: 's', e1rmThisWeek: 108, e1rmBaseline: 100 }] }));
    expect(up.load).toBeGreaterThanOrEqual(97);
    const down = computeNspi(base({ load: [{ pattern: 's', e1rmThisWeek: 92, e1rmBaseline: 100 }] }));
    expect(down.load).toBeLessThanOrEqual(3);
  });

  it('deload never penalises a dip in load', () => {
    const dip = { load: [{ pattern: 's', e1rmThisWeek: 85, e1rmBaseline: 100 }] };
    expect(computeNspi(base({ ...dip, phase: 'accumulation' })).load).toBeLessThan(20);
    expect(computeNspi(base({ ...dip, phase: 'deload' })).load).toBe(50);
  });

  it('averages across movement patterns', () => {
    const r = computeNspi(base({
      load: [
        { pattern: 'squat', e1rmThisWeek: 110, e1rmBaseline: 100 }, // +10%
        { pattern: 'bench', e1rmThisWeek: 90, e1rmBaseline: 100 },  // -10%
      ],
    }));
    expect(r.load).toBeGreaterThan(45);
    expect(r.load).toBeLessThan(55); // net ~0
  });
});

describe('volume axis', () => {
  it('completion ratio, capped at 100%', () => {
    expect(computeNspi(base({ effectiveSetsDone: 5, setsPlanned: 10 })).volume).toBe(50);
    expect(computeNspi(base({ effectiveSetsDone: 20, setsPlanned: 10 })).volume).toBe(100);
  });
  it('no plan -> 100 if any work, else 0', () => {
    expect(computeNspi(base({ effectiveSetsDone: 3, setsPlanned: 0 })).volume).toBe(100);
    expect(computeNspi(base({ effectiveSetsDone: 0, setsPlanned: 0 })).volume).toBe(0);
  });
});

describe('balance axis', () => {
  it('all six buckets even -> 100', () => {
    const even = [
      { bucket: 'horiz_push', sets: 5 }, { bucket: 'vert_push', sets: 5 },
      { bucket: 'horiz_pull', sets: 5 }, { bucket: 'vert_pull', sets: 5 },
      { bucket: 'quad', sets: 5 }, { bucket: 'hinge', sets: 5 },
    ] as NspiInput['movement'];
    expect(computeNspi(base({ movement: even })).balance).toBe(100);
  });
  it('only push trained -> low', () => {
    const pushOnly = [
      { bucket: 'horiz_push', sets: 10 }, { bucket: 'vert_push', sets: 8 },
    ] as NspiInput['movement'];
    expect(computeNspi(base({ movement: pushOnly })).balance).toBeLessThanOrEqual(40);
  });
  it('no sets -> 0', () => {
    expect(computeNspi(base({ movement: [] })).balance).toBe(0);
  });
});

describe('goal weighting', () => {
  it('strength weights load heavily, bulking weights volume', () => {
    const input = base({
      load: [{ pattern: 's', e1rmThisWeek: 120, e1rmBaseline: 100 }], // load ~100
      effectiveSetsDone: 2, setsPlanned: 10,                          // volume 20
      movement: [{ bucket: 'quad', sets: 4 }],                        // balance low
    });
    const strength = computeNspi({ ...input, goal: 'strength' }).score;
    const bulking = computeNspi({ ...input, goal: 'bulking' }).score;
    expect(strength).toBeGreaterThan(bulking); // high load helps strength more
  });
});

describe('trend', () => {
  it('up / down / stable vs previous score', () => {
    const mk = (prev: number) => computeNspi(base({
      load: [{ pattern: 's', e1rmThisWeek: 104, e1rmBaseline: 100 }],
      effectiveSetsDone: 8, setsPlanned: 10,
      movement: [{ bucket: 'horiz_push', sets: 4 }, { bucket: 'quad', sets: 4 }],
      previousScores: [prev],
    }));
    const r = mk(0);
    expect(r.trend).toBe('up');
    expect(mk(r.score + 20).trend).toBe('down');
    expect(mk(r.score).trend).toBe('stable');
  });
  it('null when no previous score', () => {
    expect(computeNspi(base()).trend).toBeNull();
  });
});
