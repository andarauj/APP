/**
 * Thin read hook around utils/adaptiveService.getAdaptiveStatus — the phase
 * badge, the NSPI card, and the recap banner all need the same snapshot, so
 * they share this instead of each rolling their own DB call.
 *
 * Refreshes on screen focus (not just mount) so returning from the workout
 * screen or from closing a week picks up the new phase without a full app
 * restart. Before reading, it also gives the engine (N4, N6) a chance to
 * close a week that has finished — closeWeekIfDue is idempotent and a no-op
 * on every call except the one right after a week's window elapses, so
 * calling it from every screen that shows adaptive status is cheap and
 * means the transition is picked up wherever the user happens to be,
 * without a dedicated background task.
 */

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDatabase } from './useDatabase';
import { getAdaptiveStatus, closeWeekIfDue, type AdaptiveStatus } from '@/utils/adaptiveService';

export function useAdaptiveStatus() {
  const { isReady } = useDatabase();
  const [status, setStatus] = useState<AdaptiveStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!isReady) return;
    try {
      await closeWeekIfDue().catch(() => null); // closeWeekIfDue already never throws; belt & suspenders
      const s = await getAdaptiveStatus();
      setStatus(s);
    } catch (err) {
      console.error('[useAdaptiveStatus] failed:', err);
      setStatus(null);
    } finally {
      setLoaded(true);
    }
  }, [isReady]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { status, loaded, refresh };
}
