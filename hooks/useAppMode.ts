import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getSettingWithDefault, setSetting } from '@/db/settingsDao';

export type AppMode = 'simple' | 'advanced';

/**
 * Simples/Avançado — hides RPE, the tempo metronome, in-session
 * auto-regulation suggestions, and the Fatigue Radar entry point for
 * someone who finds them more clutter than help. Defaults to 'advanced':
 * this is a personal app whose owner already relies on all of these
 * day to day, so the default has to be "nothing changes" rather than
 * silently hiding features someone's actively using. Stored the same way
 * as every other setting (SQLite via settingsDao) — not AsyncStorage —
 * so it round-trips through backup/restore like everything else.
 *
 * Re-reads on every screen focus, not just on mount — expo-router keeps
 * tab screens mounted in memory when you switch tabs, so a plain
 * mount-only read would miss a mode change made on the Perfil tab until
 * the app was fully restarted.
 */
export function useAppMode() {
  const [mode, setMode] = useState<AppMode>('advanced');
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(useCallback(() => {
    getSettingWithDefault('appMode', 'advanced').then(v => {
      setMode(v === 'simple' ? 'simple' : 'advanced');
      setLoaded(true);
    });
  }, []));

  const setAppMode = useCallback(async (newMode: AppMode) => {
    setMode(newMode);
    await setSetting('appMode', newMode);
  }, []);

  return { mode, setAppMode, loaded, isSimple: mode === 'simple' };
}
