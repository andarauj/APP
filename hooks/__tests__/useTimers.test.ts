/**
 * Covers the rest timer used during an active workout.
 *
 * The bug this exists to prevent: the ticking effect captured `onComplete`
 * when it started and never refreshed it, so a parent passing an inline
 * arrow — which is what the workout screen does — had its *original* closure
 * fired at zero. Any state that callback read was whatever it was when the
 * rest period began, not when it ended.
 *
 * Uses react-test-renderer directly rather than a hook-testing library: the
 * harness below is a few lines and avoids a dependency that would not render
 * under this jest-expo setup.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useCountdown, secondsUntil } from '../useTimers';

type Countdown = ReturnType<typeof useCountdown>;
type Props = {
  duration: number;
  running: boolean;
  onComplete?: () => void;
  bindEndsAtMs?: number | null;
};

/** Renders the hook and exposes its latest return value. */
function renderCountdown(initial: Props) {
  const state = { current: null as unknown as Countdown };
  let renderer: TestRenderer.ReactTestRenderer;

  function Probe(props: Props) {
    state.current = useCountdown(props.duration, props.running, props.onComplete, props.bindEndsAtMs);
    return null;
  }

  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe, initial));
  });

  return {
    state,
    rerender(next: Props) {
      act(() => {
        renderer.update(React.createElement(Probe, next));
      });
    },
    tick(ms: number) {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('secondsUntil', () => {
  it('uses ceil so a fractional second still displays as 1', () => {
    expect(secondsUntil(1000, 1)).toBe(1);
    expect(secondsUntil(1000, 999)).toBe(1);
    expect(secondsUntil(1000, 1000)).toBe(0);
  });
});

describe('useCountdown', () => {
  it('counts down while running', () => {
    const t = renderCountdown({ duration: 30, running: true });

    expect(t.state.current.remaining).toBe(30);
    t.tick(5000);
    expect(t.state.current.remaining).toBe(25);
  });

  it('does not count down while paused', () => {
    const t = renderCountdown({ duration: 30, running: false });

    t.tick(5000);
    expect(t.state.current.remaining).toBe(30);
  });

  it('fires the latest onComplete, not the one from when it started', () => {
    const stale = jest.fn();
    const fresh = jest.fn();

    const t = renderCountdown({ duration: 2, running: true, onComplete: stale });
    // The parent re-renders mid-countdown with a different callback — an
    // inline arrow closing over newer state, in the real screen.
    t.rerender({ duration: 2, running: true, onComplete: fresh });
    t.tick(3000);

    expect(fresh).toHaveBeenCalled();
    expect(stale).not.toHaveBeenCalled();
  });

  it('keeps one interval across parent re-renders', () => {
    const onComplete = jest.fn();
    const t = renderCountdown({ duration: 3, running: true, onComplete });

    // A new callback identity on every render must not restart the interval,
    // or the countdown would never reach zero.
    for (let i = 0; i < 5; i++) {
      t.rerender({ duration: 3, running: true, onComplete: () => onComplete() });
    }
    t.tick(4000);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('marks itself finished at zero', () => {
    const t = renderCountdown({ duration: 2, running: true });

    t.tick(3000);

    expect(t.state.current.remaining).toBe(0);
    expect(t.state.current.isFinished).toBe(true);
  });

  it('does not lose the paused duration on resume', () => {
    const t = renderCountdown({ duration: 60, running: true });

    t.tick(10_000);
    expect(t.state.current.remaining).toBe(50);

    t.rerender({ duration: 60, running: false });
    t.tick(30_000);
    expect(t.state.current.remaining).toBe(50);

    // Resuming must continue from 50s, not from the original end time —
    // which would have made it finish instantly.
    t.rerender({ duration: 60, running: true });
    t.tick(5000);
    expect(t.state.current.remaining).toBe(45);
  });

  it('extends the countdown with addTime', () => {
    const t = renderCountdown({ duration: 30, running: true });

    t.tick(10_000);
    expect(t.state.current.remaining).toBe(20);

    act(() => {
      t.state.current.addTime(15);
    });
    t.tick(1000);

    expect(t.state.current.remaining).toBe(34);
  });

  it('supports −10s and +30s rest adjustments and clamps at zero', () => {
    const t = renderCountdown({ duration: 60, running: true });
    t.tick(50_000);
    expect(t.state.current.remaining).toBe(10);

    act(() => { t.state.current.addTime(-10); });
    expect(t.state.current.remaining).toBe(0);

    act(() => { t.state.current.reset(60); });
    act(() => { t.state.current.addTime(30); });
    expect(t.state.current.remaining).toBe(90);
  });

  it('reset(90) applies the 90s rest preset while running', () => {
    const t = renderCountdown({ duration: 60, running: true });
    t.tick(20_000);
    act(() => { t.state.current.reset(90); });
    expect(t.state.current.remaining).toBe(90);
    expect(t.state.current.isFinished).toBe(false);
    t.tick(5000);
    expect(t.state.current.remaining).toBe(85);
  });

  it('intentional restart uses reset(), not a duration prop change', () => {
    const t = renderCountdown({ duration: 30, running: true });

    t.tick(10_000);
    expect(t.state.current.remaining).toBe(20);

    act(() => { t.state.current.reset(90); });
    t.rerender({ duration: 90, running: true });

    expect(t.state.current.remaining).toBe(90);
    t.tick(5000);
    expect(t.state.current.remaining).toBe(85);
  });

  /**
   * PRIMARY REGRESSION (minimize→expand / init defaultRest clobber):
   * 1. start REST
   * 2. countdown running
   * 3. duration prop changes while running (settings default loaded)
   * 4. endTimeRef stays valid (getEndsAt non-null)
   * 5. countdown keeps decrementing from the ORIGINAL deadline
   * 6. display does not freeze and does not jump to the new duration
   */
  it('keeps ticking from the original deadline when duration changes while running', () => {
    const now = 10_000_000;
    jest.setSystemTime(now);
    const t = renderCountdown({ duration: 90, running: true });

    const endsAtBefore = t.state.current.getEndsAt();
    expect(endsAtBefore).not.toBeNull();

    t.tick(30_000);
    expect(t.state.current.remaining).toBe(60);
    expect(t.state.current.getEndsAt()).toBe(endsAtBefore);

    // Simulate init() overwriting restDuration with defaultRest (e.g. 90→60
    // or leftover→default). Must NOT destroy endTimeRef or freeze remaining.
    t.rerender({ duration: 60, running: true });

    expect(t.state.current.getEndsAt()).toBe(endsAtBefore);
    expect(t.state.current.remaining).toBe(60);

    t.tick(5000);
    expect(t.state.current.remaining).toBe(55);
    expect(t.state.current.getEndsAt()).toBe(endsAtBefore);
    expect(t.state.current.isFinished).toBe(false);
  });

  it('setEndsAt binds the countdown to a wall-clock deadline', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    const t = renderCountdown({ duration: 90, running: true });

    act(() => {
      t.state.current.setEndsAt(now + 42_000);
    });
    expect(t.state.current.remaining).toBe(42);
    expect(t.state.current.getEndsAt()).toBe(now + 42_000);

    t.tick(2000);
    expect(t.state.current.remaining).toBe(40);
  });

  it('bindEndsAtMs seeds the deadline on first render (expand path)', () => {
    const now = 20_000_000;
    jest.setSystemTime(now);
    const endsAt = now + 42_000;
    const t = renderCountdown({ duration: 90, running: true, bindEndsAtMs: endsAt });

    expect(t.state.current.remaining).toBe(42);
    expect(t.state.current.getEndsAt()).toBe(endsAt);

    // Duration prop noise must not replace the bound deadline.
    t.rerender({ duration: 90, running: true, bindEndsAtMs: endsAt });
    t.tick(2000);
    expect(t.state.current.remaining).toBe(40);
    expect(t.state.current.getEndsAt()).toBe(endsAt);
  });

  /**
   * Minimize → advance clock → expand: remaining matches original deadline,
   * not defaultRest.
   */
  it('minimize/expand: remaining follows the saved restEndsAtMs', () => {
    const now = 30_000_000;
    jest.setSystemTime(now);
    const restEndsAtMs = now + 90_000;

    // Minimize after 0s into a 90s rest.
    const t = renderCountdown({ duration: 90, running: true, bindEndsAtMs: restEndsAtMs });
    expect(t.state.current.remaining).toBe(90);

    // User browses other tabs for 30s (wall clock advances).
    jest.setSystemTime(now + 30_000);
    // Remount as expand would — new hook instance with same deadline.
    const expanded = renderCountdown({
      duration: 90, // defaultRest must NOT win
      running: true,
      bindEndsAtMs: restEndsAtMs,
    });

    expect(expanded.state.current.remaining).toBe(60);
    expect(expanded.state.current.getEndsAt()).toBe(restEndsAtMs);

    expanded.tick(10_000);
    expect(expanded.state.current.remaining).toBe(50);
  });

  /**
   * Regression for "rest doesn't fire on every set" — the real trigger is
   * completing a set WHILE the previous rest is still actively counting
   * down (very common: nobody waits out the full timer every time).
   *
   * completeSet() in app/workout/active.tsx calls reset() then
   * setRestActive(true) to start each new rest — but if the previous rest
   * was still running, `running` never transitions false->true, so a
   * naive implementation that only (re)creates its interval on a
   * `running` transition never starts a fresh interval: reset() correctly
   * sets `remaining` to the new duration for one render, then the display
   * just freezes there forever, and this and every later rest silently
   * stops working for the rest of the workout.
   */
  it('reset() while still running restarts ticking, not just the displayed number', () => {
    const onComplete = jest.fn();
    const t = renderCountdown({ duration: 30, running: true, onComplete });

    t.tick(10_000);
    expect(t.state.current.remaining).toBe(20);

    // Completing another set mid-rest: `running` stays true throughout.
    act(() => {
      t.state.current.reset(15);
    });
    expect(t.state.current.remaining).toBe(15);

    t.tick(5000);
    expect(t.state.current.remaining).toBe(10); // frozen at 15 if the bug is present

    t.tick(10_000);
    expect(t.state.current.remaining).toBe(0);
    expect(t.state.current.isFinished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
