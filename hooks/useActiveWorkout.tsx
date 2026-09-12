import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * A snapshot of the session app/workout/active.tsx was showing at the
 * moment it was minimized — enough for a mini-player rendered elsewhere in
 * the app (see components/workout/ActiveWorkoutMiniPlayer.tsx, mounted in
 * app/(tabs)/_layout.tsx so it survives switching tabs) to show something
 * live without that screen staying mounted. It is NOT kept in sync while
 * minimized — active.tsx isn't running, so nothing updates it — only
 * elapsed time is still computable (baseElapsedSeconds + real time since
 * minimizedAtMs), the same base+startTime approach hooks/useTimers.ts's
 * useStopwatch itself uses.
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
}

interface ActiveWorkoutContextType {
  minimized: MinimizedWorkout | null;
  minimize: (snapshot: MinimizedWorkout) => void;
  clearMinimized: () => void;
}

const ActiveWorkoutContext = createContext<ActiveWorkoutContextType>({
  minimized: null,
  minimize: () => {},
  clearMinimized: () => {},
});

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState<MinimizedWorkout | null>(null);
  const minimize = useCallback((snapshot: MinimizedWorkout) => setMinimized(snapshot), []);
  const clearMinimized = useCallback(() => setMinimized(null), []);

  return (
    <ActiveWorkoutContext.Provider value={{ minimized, minimize, clearMinimized }}>
      {children}
    </ActiveWorkoutContext.Provider>
  );
}

export function useActiveWorkout() {
  return useContext(ActiveWorkoutContext);
}
