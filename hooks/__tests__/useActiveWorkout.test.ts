/**
 * Rest-deadline helpers shared by the mini-player and active workout screen.
 * Pure functions — no React — so expand/minimize sync can be unit-tested
 * without mounting the full workout tree.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  remainingRestSeconds,
  resumeRestSeed,
  ActiveWorkoutProvider,
  useActiveWorkout,
  type MinimizedWorkout,
} from '../useActiveWorkout';

describe('remainingRestSeconds', () => {
  it('returns null when there is no deadline', () => {
    expect(remainingRestSeconds(null)).toBeNull();
    expect(remainingRestSeconds(undefined)).toBeNull();
  });

  it('returns remaining whole seconds while rest is active', () => {
    const now = 1_000_000;
    expect(remainingRestSeconds(now + 42_500, now)).toBe(43);
    expect(remainingRestSeconds(now + 1000, now)).toBe(1);
  });

  it('returns null once the deadline has passed', () => {
    const now = 1_000_000;
    expect(remainingRestSeconds(now, now)).toBeNull();
    expect(remainingRestSeconds(now - 1, now)).toBeNull();
  });

  it('supports mid-rest expand: leftover seconds after time elapsed', () => {
    // Minimize with 90s rest → 30s later → expand should resume at 60s.
    const endsAt = 5_000_000 + 90_000;
    const expandAt = 5_000_000 + 30_000;
    expect(remainingRestSeconds(endsAt, expandAt)).toBe(60);
  });

  it('minimize→expand remaining matches original deadline, not defaultRest', () => {
    const minimizeAt = 8_000_000;
    const restEndsAtMs = minimizeAt + 90_000; // 90s rest started
    const expandAt = minimizeAt + 28_000; // 28s later
    // defaultRest would be 90 — must NOT be used as remaining.
    expect(remainingRestSeconds(restEndsAtMs, expandAt)).toBe(62);
    const seed = resumeRestSeed(restEndsAtMs, 90, expandAt);
    expect(seed).toEqual({ endsAt: restEndsAtMs, left: 62, ring: 90 });
  });
});

describe('resumeRestSeed', () => {
  it('returns null when rest already expired', () => {
    const now = 1_000_000;
    expect(resumeRestSeed(now - 1, 90, now)).toBeNull();
  });

  it('keeps original ring duration above remaining so fill is not 42/42', () => {
    const now = 1_000_000;
    const seed = resumeRestSeed(now + 42_000, 90, now);
    expect(seed).toEqual({ endsAt: now + 42_000, left: 42, ring: 90 });
  });

  it('falls back to left when ring hint is missing', () => {
    const now = 1_000_000;
    const seed = resumeRestSeed(now + 42_000, null, now);
    expect(seed?.ring).toBe(42);
  });
});

const baseSnapshot = (over: Partial<MinimizedWorkout> = {}): MinimizedWorkout => ({
  sessionId: 1,
  planId: 2,
  dayIndex: 0,
  name: 'Push',
  currentExerciseName: 'Bench',
  doneSets: 3,
  totalPlannedSets: 12,
  baseElapsedSeconds: 100,
  minimizedAtMs: Date.now(),
  restEndsAtMs: Date.now() + 60_000,
  restRingSeconds: 90,
  ...over,
});

type Ctx = ReturnType<typeof useActiveWorkout>;

function renderProvider() {
  const state = { current: null as unknown as Ctx };

  function Probe() {
    state.current = useActiveWorkout();
    return null;
  }

  act(() => {
    TestRenderer.create(
      React.createElement(ActiveWorkoutProvider, null, React.createElement(Probe)),
    );
  });

  return { state };
}

describe('adjustMinimizedRest', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(2_000_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips rest and clears ring', () => {
    const { state } = renderProvider();
    act(() => { state.current.minimize(baseSnapshot()); });
    act(() => { state.current.adjustMinimizedRest('skip'); });
    expect(state.current.minimized?.restEndsAtMs).toBeNull();
    expect(state.current.minimized?.restRingSeconds).toBeNull();
  });

  it('grows ring when adding +30 beyond original', () => {
    const { state } = renderProvider();
    act(() => {
      state.current.minimize(baseSnapshot({
        restEndsAtMs: Date.now() + 60_000,
        restRingSeconds: 90,
      }));
    });
    act(() => { state.current.adjustMinimizedRest(30); });
    expect(remainingRestSeconds(state.current.minimized!.restEndsAtMs!)).toBe(90);
    expect(state.current.minimized?.restRingSeconds).toBe(90);
  });

  it('grows ring when +30 exceeds previous ring', () => {
    const { state } = renderProvider();
    act(() => {
      state.current.minimize(baseSnapshot({
        restEndsAtMs: Date.now() + 80_000,
        restRingSeconds: 90,
      }));
    });
    act(() => { state.current.adjustMinimizedRest(30); });
    expect(remainingRestSeconds(state.current.minimized!.restEndsAtMs!)).toBe(110);
    expect(state.current.minimized?.restRingSeconds).toBe(110);
  });

  it('guards −10 when remaining ≤10', () => {
    const { state } = renderProvider();
    const ends = Date.now() + 8_000;
    act(() => {
      state.current.minimize(baseSnapshot({ restEndsAtMs: ends, restRingSeconds: 90 }));
    });
    act(() => { state.current.adjustMinimizedRest(-10); });
    expect(state.current.minimized?.restEndsAtMs).toBe(ends);
  });

  it('patchMinimizedProgress updates doneSets without touching rest', () => {
    const { state } = renderProvider();
    act(() => { state.current.minimize(baseSnapshot()); });
    const ends = state.current.minimized!.restEndsAtMs;
    act(() => {
      state.current.patchMinimizedProgress({
        doneSets: 5,
        currentExerciseName: 'Row',
        totalPlannedSets: 12,
      });
    });
    expect(state.current.minimized?.doneSets).toBe(5);
    expect(state.current.minimized?.currentExerciseName).toBe('Row');
    expect(state.current.minimized?.restEndsAtMs).toBe(ends);
  });
});
