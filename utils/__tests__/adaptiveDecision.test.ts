import { decideNextWeek, type DecisionInput, type WeekSignal } from '../adaptiveDecision';

function wk(o: Partial<WeekSignal> = {}): WeekSignal {
  return {
    phase: 'accumulation',
    nspiLoad: 55, nspiVolume: 90, nspiBalance: 70,
    avgRpe: 7.5, minBucketRatio: 1, isBridge: false,
    ...o,
  };
}
function inp(o: Partial<DecisionInput> = {}): DecisionInput {
  return { current: wk(), recent: [wk(), wk()], goal: 'general', stallCount: 0, ...o };
}

describe('advance — strong momentum', () => {
  it('all four questions pass -> advance to next phase', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'accumulation', nspiLoad: 70, nspiVolume: 95, nspiBalance: 80 }),
      recent: [wk({ nspiLoad: 55 }), wk({ nspiLoad: 52 })],
    }));
    expect(r.decision).toBe('advance');
    expect(r.nextPhase).toBe('intensification');
    expect(r.wrapsCycle).toBe(false);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe('deload always starts a new cycle', () => {
  it('deload -> advance -> on_ramp with wrapsCycle', () => {
    const r = decideNextWeek(inp({ current: wk({ phase: 'deload', nspiVolume: 60, nspiLoad: 40 }) }));
    expect(r.decision).toBe('advance');
    expect(r.nextPhase).toBe('on_ramp');
    expect(r.wrapsCycle).toBe(true);
  });
  it('a bad deload week does NOT trigger deload_early (already deloading)', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'deload', nspiVolume: 30, avgRpe: 9.5 }),
      recent: [wk({ nspiVolume: 40 })],
    }));
    expect(r.decision).toBe('advance');
  });
});

describe('deload_early — fatigue overrides', () => {
  it('explicit fatigue flag', () => {
    const r = decideNextWeek(inp({ fatigueFlag: true, current: wk({ nspiLoad: 80, nspiVolume: 100 }) }));
    expect(r.decision).toBe('deload_early');
    expect(r.nextPhase).toBe('deload');
  });
  it('avg RPE >= 9', () => {
    expect(decideNextWeek(inp({ current: wk({ avgRpe: 9.2 }) })).decision).toBe('deload_early');
  });
  it('volume under 70% two weeks running', () => {
    const r = decideNextWeek(inp({
      current: wk({ nspiVolume: 60 }),
      recent: [wk({ nspiVolume: 55 }), wk({ nspiVolume: 88 })],
    }));
    expect(r.decision).toBe('deload_early');
  });
  it('one bad week alone is not enough', () => {
    const r = decideNextWeek(inp({
      current: wk({ nspiVolume: 60, avgRpe: 8 }),
      recent: [wk({ nspiVolume: 90 })],
    }));
    expect(r.decision).not.toBe('deload_early');
  });
});

describe('bridge — weak momentum', () => {
  it('did not finish the volume -> bridge (repeat same phase)', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'accumulation', nspiVolume: 65, nspiLoad: 50, nspiBalance: 55 }),
      recent: [wk({ nspiLoad: 55 })],
    }));
    expect(r.decision).toBe('bridge');
    expect(r.nextPhase).toBe('accumulation');
  });
  it('stall of 2+ weeks -> bridge even if the week looked ok', () => {
    const r = decideNextWeek(inp({
      current: wk({ nspiVolume: 92, nspiLoad: 58, nspiBalance: 75 }),
      stallCount: 3,
    }));
    expect(r.decision).toBe('bridge');
  });
});

describe('bridge is a single half-step', () => {
  it('a bridge week always advances afterwards, even if still weak', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'accumulation', isBridge: true, nspiVolume: 60, nspiLoad: 45 }),
    }));
    expect(r.decision).toBe('advance');
    expect(r.nextPhase).toBe('intensification');
  });
  it('but fatigue on a bridge week still forces deload', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'accumulation', isBridge: true, avgRpe: 9.4 }),
    }));
    expect(r.decision).toBe('deload_early');
  });
});

describe('hold — middle ground', () => {
  it('did the work but no other signals -> hold, same phase', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'accumulation', nspiVolume: 88, nspiLoad: 50, nspiBalance: 55, minBucketRatio: 0.4 }),
      recent: [wk({ nspiLoad: 55 })], // load flat, balance off, phase aligned (didWork) -> score4 = 2
      stallCount: 1,
    }));
    expect(r.decision).toBe('hold');
    expect(r.nextPhase).toBe('accumulation');
  });
});

describe('experience adjusts the advance threshold', () => {
  // score4 = 2 (loadRising false, didWork true, balanceOk false, phaseAligned true),
  // stallCount 0 so the `strong` gate's stallCount===0 check doesn't itself block advance.
  const scenario = {
    current: wk({ phase: 'accumulation' as const, nspiVolume: 88, nspiLoad: 50, nspiBalance: 55, minBucketRatio: 0.4 }),
    recent: [wk({ nspiLoad: 55 })],
    stallCount: 0,
  };
  it('a beginner advances on score4=2 where intermediate would only hold', () => {
    const inter = decideNextWeek(inp(scenario));
    expect(inter.decision).toBe('hold');

    const beg = decideNextWeek(inp({ ...scenario, experience: 'beginner' }));
    expect(beg.decision).toBe('advance');
  });
  it('advanced keeps the same threshold as intermediate', () => {
    const adv = decideNextWeek(inp({ ...scenario, experience: 'advanced' }));
    expect(adv.decision).toBe('hold');
  });
});

describe('phase alignment', () => {
  it('intensification: load rising matters, volume dip is fine', () => {
    const r = decideNextWeek(inp({
      current: wk({ phase: 'intensification', nspiLoad: 72, nspiVolume: 70, nspiBalance: 75 }),
      recent: [wk({ nspiLoad: 60 }), wk({ nspiLoad: 58 })],
    }));
    // load rising + balance ok + phase aligned (load) = 3, volume<85 so didWork false
    expect(r.decision).toBe('advance');
    expect(r.nextPhase).toBe('deload');
  });
});
