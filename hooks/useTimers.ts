import { useEffect, useRef, useState, useCallback } from 'react';

export function useStopwatch(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const baseRef = useRef(0);

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed(baseRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      if (startTimeRef.current) {
        baseRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000);
        startTimeRef.current = null;
      }
    }
  }, [running]);

  const reset = useCallback(() => {
    baseRef.current = 0;
    startTimeRef.current = running ? Date.now() : null;
    setElapsed(0);
  }, [running]);

  // Resuming a session already loads its persisted total_duration
  // asynchronously (see app/workout/active.tsx's init()), well after this
  // hook's first render — a plain constructor argument can't express that.
  // setBase jumps the clock straight to that checkpointed value once it's
  // known, instead of recomputing elapsed from started_at, which would
  // count time the app was closed/backgrounded as if it were active workout
  // time.
  const setBase = useCallback((seconds: number) => {
    baseRef.current = seconds;
    startTimeRef.current = running ? Date.now() : null;
    setElapsed(seconds);
  }, [running]);

  return { elapsed, reset, setBase };
}

/**
 * Whole seconds left until a wall-clock deadline.
 * Shared policy with remainingRestSeconds / FloatingRestBar: Math.ceil so the
 * UI does not show 0 while any fraction of a second remains.
 */
export function secondsUntil(endsAtMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

/**
 * @param duration Display / arm length when idle or when intentionally reset.
 *   Changing this while a countdown is already bound to endTimeRef does NOT
 *   replace the deadline — callers that mean "start a new rest of N seconds"
 *   must call reset(N).
 * @param bindEndsAtMs Optional absolute deadline (minimize→expand). Seeds
 *   endTimeRef on first render so the first tick never uses Date.now()+duration.
 */
export function useCountdown(
  duration: number,
  running: boolean,
  onComplete?: () => void,
  bindEndsAtMs?: number | null,
) {
  const initialEndsAt =
    bindEndsAtMs != null && Number.isFinite(bindEndsAtMs) && bindEndsAtMs > Date.now()
      ? bindEndsAtMs
      : null;

  const [remaining, setRemaining] = useState(() =>
    initialEndsAt != null ? secondsUntil(initialEndsAt) : duration
  );
  const [isFinished, setIsFinished] = useState(() =>
    initialEndsAt != null ? secondsUntil(initialEndsAt) <= 0 : false
  );
  const endTimeRef = useRef<number | null>(initialEndsAt);
  // Bumped by reset() / setEndsAt() so the ticking effect below re-runs even when
  // `running` was already true (see that effect's comment for why a plain
  // `running` transition isn't enough).
  const [resetToken, setResetToken] = useState(0);

  // The ticking effect must not re-subscribe when these change.
  //
  // `remaining` is written by the interval itself, so listing it as a
  // dependency would tear down and recreate the interval every second.
  // `onComplete` is typically an inline arrow from the parent, so listing it
  // would do the same on every render. Holding both in refs keeps the
  // interval stable while still reading current values — in particular, the
  // completion callback fired at zero is the latest one the parent passed,
  // not whichever closure happened to exist when the timer started.
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;
  const runningRef = useRef(running);
  runningRef.current = running;
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Active wall-clock countdown: duration is NOT the source of truth.
    // Overwriting remaining/endTime from a prop change (e.g. init() loading
    // defaultRestSeconds mid-rest) used to freeze or reset the bar.
    if (runningRef.current && endTimeRef.current != null) {
      const left = secondsUntil(endTimeRef.current);
      remainingRef.current = left;
      setRemaining(left);
      setIsFinished(left <= 0);
      return;
    }

    setRemaining(duration);
    setIsFinished(false);
    if (runningRef.current && duration > 0) {
      // No deadline yet (first arm, or after pause cleared endTime) — seed from duration.
      endTimeRef.current = Date.now() + duration * 1000;
    } else {
      endTimeRef.current = null;
    }
  }, [duration]);

  useEffect(() => {
    if (!running) {
      // Clear the absolute end-time whenever the timer stops. If it stayed
      // set, a manual pause/resume (without an explicit reset) would resume
      // counting down from the *original* end time instead of from the
      // remaining seconds — the timer would "lose" the paused duration and
      // could finish early or instantly.
      endTimeRef.current = null;
      return;
    }
    if (remainingRef.current <= 0) return;

    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + remainingRef.current * 1000;
    }
    const interval = setInterval(() => {
      if (!endTimeRef.current) return;
      const r = secondsUntil(endTimeRef.current);
      setRemaining(r);
      if (r <= 0) {
        setIsFinished(true);
        onCompleteRef.current?.();
        clearInterval(interval);
      }
    }, 250);
    return () => clearInterval(interval);
    // BUGFIX (reported: "o descanso não dispara em todas as séries e
    // exercícios"): this effect only re-ran when `running` itself flipped
    // false->true. The workout screen starts a new rest by calling reset()
    // then setRestActive(true) — but if the PREVIOUS rest was still
    // actively counting down (very common: nobody waits out the full
    // timer every time), `running` was already true, so that call was a
    // no-op transition and this effect never re-ran. reset() had already
    // nulled endTimeRef and reset `remaining` for one render, but with no
    // interval left to pick either back up, the display just froze there
    // — and every later rest for the rest of the workout silently failed
    // the same way, since `running` could never transition again either.
    // resetToken exists purely so reset() has a way to force this effect
    // to run again even when `running` didn't change.
  }, [running, resetToken]);

  const addTime = useCallback((seconds: number) => {
    // Mutate the deadline before setState so callers (FloatingRestBar
    // onDeadlineChange) can read getEndsAt() synchronously after addTime().
    if (endTimeRef.current) {
      endTimeRef.current += seconds * 1000;
    }
    setRemaining(prev => {
      const newRemaining = Math.max(0, prev + seconds);
      if (!endTimeRef.current && runningRef.current && newRemaining > 0) {
        endTimeRef.current = Date.now() + newRemaining * 1000;
      }
      setIsFinished(newRemaining <= 0);
      return newRemaining;
    });
  }, []);

  const reset = useCallback((newDuration?: number) => {
    const d = newDuration ?? duration;
    setRemaining(d);
    remainingRef.current = d;
    setIsFinished(false);
    endTimeRef.current = null;
    setResetToken(t => t + 1);
  }, [duration]);

  /**
   * Bind the countdown to an absolute wall-clock deadline (mini-player expand).
   * Keeps one source of truth with remainingRestSeconds / restEndsAtMs.
   */
  const setEndsAt = useCallback((endsAtMs: number) => {
    const left = secondsUntil(endsAtMs);
    remainingRef.current = left;
    setRemaining(left);
    setIsFinished(left <= 0);
    endTimeRef.current = left > 0 ? endsAtMs : null;
    setResetToken(t => t + 1);
  }, []);

  /** Current absolute deadline, or null when idle / finished. */
  const getEndsAt = useCallback(() => endTimeRef.current, []);

  return { remaining, isFinished, addTime, reset, setEndsAt, getEndsAt };
}
