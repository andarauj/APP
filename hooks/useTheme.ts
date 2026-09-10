import { useColorScheme } from 'react-native';
import { Colors, type Theme } from '@/constants/colors';
import { useEffect, useState } from 'react';
import { getSetting } from '@/db/settingsDao';

export type AppTheme = 'dark' | 'light' | 'system';

let currentThemeOverride: AppTheme | null = null;

export function setThemeOverride(theme: AppTheme | null) {
  currentThemeOverride = theme;
}

export function useTheme(): { colors: Theme; isDark: boolean } {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<AppTheme | null>(currentThemeOverride);

  useEffect(() => {
    getSetting('theme').then(v => {
      if (v === 'dark' || v === 'light' || v === 'system') {
        currentThemeOverride = v;
        setOverride(v);
      }
    }).catch(err => {
      // useTheme() runs on every single screen — an unhandled rejection here
      // would surface on every mount. Falling back to the system scheme is
      // harmless, so just log and move on.
      console.error('Failed to load theme setting:', err);
    });
  }, []);

  const isDark = override === 'dark' || (override === 'system' && systemScheme === 'dark') ||
    (override === null && systemScheme === 'dark');

  return { colors: isDark ? Colors.dark : Colors.light, isDark };
}
