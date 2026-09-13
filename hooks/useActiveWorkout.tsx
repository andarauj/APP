import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * A snapshot of the session app/workout/active.tsx was showing at the
 * moment it was minimized — enough for a mini-player rendered elsewhere in
 * the app (see components/workout/ActiveWorkoutMiniPlayer.tsx, mounted in
 * app/(tabs)/_layout.tsx so it survives switching tabs) to show something
 * live without that screen staying mounted. Elapsed time and rest countdown
 * are derived from wall-clock deadlines; rest can be adjusted from the
 * mini-player via adjustMinimizedRest.
 */
export interface MinimizedWorkout {
  sessionId: number;
  planId: number | null;
  dayIndex: number | null;
  name: string;
  currentExerciseName: string;
  doneSets: number;
  totalPlannedSets: number;
  baseElapsedSeconds: number;
  minimizedAtMs: number;
  /** Absolute ms when rest ends; null if no rest active at minimize time. */
  restEndsAtMs: number | null;
  /** Ring denominator (original rest length) so expand doesn't show a "full" ring at remaining/remaining. */
  restRingSeconds: number | null;
}

/**
 * Seconds left until a rest deadline. Returns null when there is no active
 * rest (missing deadline or already expired). Used by the mini-player and
 * by active.tsx when expanding so the FloatingRestBar resumes mid-countdown
 * instead of resetting to the full default.
 */
export function remainingRestSeconds(restEndsAtMs: number | null | undefined, nowMs: number = Date.now()): number | null {
  if (restEndsAtMs == null) return null;
  // ceil — same policy as useCountdown / secondsUntil so minimize↔expand
  // doesn't jump by a second from round vs ceil drift.
  const left = Math.ceil((restEndsAtMs - nowMs) / 1000);
  return left > 0 ? left : null;
}

/**
 * Seed used when expanding mid-rest: leftover seconds + ring denominator.
 * Pure helper for unit tests and active.tsx resume path.
 */
export function resumeRestSeed(
  endsAtMs: number | null | undefined,
  ringHint: number | null | undefined,
  nowMs: number = Date.now(),
): { endsAt: number; left: number; ring: number } | null {
  const left = remainingRestSeconds(endsAtMs, nowMs);
  if (endsAtMs == null || left == null) return null;
  return { endsAt: endsAtMs, left, ring: Math.max(ringHint ?? left, left) };
}

interface ActiveWorkoutContextType {
  minimized: MinimizedWorkout | null;
  minimize: (snapshot: MinimizedWorkout) => void;
  clearMinimized: () => void;
  /** Delta seconds (−10 / +30) or skip (clears rest). */
  adjustMinimizedRest: (deltaOrSkip: number | 'skip') => void;
  /** Patch progress fields while minimized (DB refresh). */
  patchMinimizedProgress: (patch: Pick<MinimizedWorkout, 'doneSets' | 'currentExerciseName' | 'totalPlannedSets'>) => void;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType>({
  minimized: null,
  minimize: () => {},
  clearMinimized: () => {},
  adjustMinimizedRest: () => {},
  patchMinimizedProgress: () => {},
});

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState<MinimizedWorkout | null>(null);
  const minimize = useCallback((snapshot: MinimizedWorkout) => setMinimized(snapshot), []);
  const clearMinimized = useCallback(() => setMinimized(null), []);
  const adjustMinimizedRest = useCallback((deltaOrSkip: number | 'skip') => {
    setMinimized(prev => {
      if (!prev) return prev;
      if (deltaOrSkip === 'skip') return { ...prev, restEndsAtMs: null, restRingSeconds: null };
      if (prev.restEndsAtMs == null) return prev;
      const remaining = remainingRestSeconds(prev.restEndsAtMs) ?? 0;
      if (deltaOrSkip < 0 && remaining <= 10) return prev;
      const next = Math.max(0, remaining + deltaOrSkip);
      if (next <= 0) return { ...prev, restEndsAtMs: null, restRingSeconds: null };
      const ring = Math.max(prev.restRingSeconds ?? next, next);
      return { ...prev, restEndsAtMs: Date.now() + next * 1000, restRingSeconds: ring };
    });
  }, []);
  const patchMinimizedProgress = useCallback((
    patch: Pick<MinimizedWorkout, 'doneSets' | 'currentExerciseName' | 'totalPlannedSets'>,
  ) => {
    setMinimized(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <ActiveWorkoutContext.Provider value={{ minimized, minimize, clearMinimized, adjustMinimizedRest, patchMinimizedProgress }}>
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(ActiveWorkoutContext);
}
