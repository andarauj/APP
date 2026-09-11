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
import { useCountdown } from '../useTimers';

type Countdown = ReturnType<typeof useCountdown>;
type Props = { duration: number; running: boolean; onComplete?: () => void };

/** Renders the hook and exposes its latest return value. */
function renderCountdown(initial: Props) {
  const state = { current: null as unknown as Countdown };
  let renderer: TestRenderer.ReactTestRenderer;

  function Probe(props: Props) {
    state.current = useCountdown(props.duration, props.running, props.onComplete);
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

  it('restarts when the duration changes', () => {
    const t = renderCountdown({ duration: 30, running: true });

    t.tick(10_000);
    expect(t.state.current.remaining).toBe(20);

    t.rerender({ duration: 90, running: true });

    expect(t.state.current.remaining).toBe(90);
    expect(t.state.current.isFinished).toBe(false);
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
