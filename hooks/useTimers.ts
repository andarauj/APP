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

  return { elapsed, reset };
}

export function useCountdown(duration: number, running: boolean, onComplete?: () => void) {
  const [remaining, setRemaining] = useState(duration);
  const [isFinished, setIsFinished] = useState(false);
  const endTimeRef = useRef<number | null>(null);

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
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setRemaining(duration);
    setIsFinished(false);
    endTimeRef.current = null;
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
      const r = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0) {
        setIsFinished(true);
        onCompleteRef.current?.();
        clearInterval(interval);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [running]);

  const addTime = useCallback((seconds: number) => {
    setRemaining(prev => {
      const newRemaining = Math.max(0, prev + seconds);
      if (endTimeRef.current) {
        endTimeRef.current += seconds * 1000;
      }
      setIsFinished(false);
      return newRemaining;
    });
  }, []);

  const reset = useCallback((newDuration?: number) => {
    const d = newDuration ?? duration;
    setRemaining(d);
    setIsFinished(false);
    endTimeRef.current = null;
  }, [duration]);

  return { remaining, isFinished, addTime, reset };
}
