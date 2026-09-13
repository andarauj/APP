import { useColorScheme } from 'react-native';
import { Colors, type Theme } from '@/constants/colors';
import { useEffect, useState } from 'react';
import { getSetting } from '@/db/settingsDao';

export type AppTheme = 'dark' | 'light' | 'system' | 'oled';

let currentThemeOverride: AppTheme | null = null;
const themeListeners = new Set<() => void>();

function notifyThemeListeners() {
  themeListeners.forEach(listener => listener());
}

export function setThemeOverride(theme: AppTheme | null) {
  currentThemeOverride = theme;
  notifyThemeListeners();
}

function resolvePalette(override: AppTheme | null, systemScheme: string | null | undefined): {
  colors: Theme;
  isDark: boolean;
  isOled: boolean;
} {
  if (override === 'oled') {
    return { colors: Colors.oled, isDark: true, isOled: true };
  }
  if (override === 'light') {
    return { colors: Colors.light, isDark: false, isOled: false };
  }
  if (override === 'dark') {
    return { colors: Colors.dark, isDark: true, isOled: false };
  }
  // system or unset
  const systemDark = systemScheme === 'dark';
  return {
    colors: systemDark ? Colors.dark : Colors.light,
    isDark: systemDark,
    isOled: false,
  };
}

export function useTheme(): { colors: Theme; isDark: boolean; isOled: boolean } {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<AppTheme | null>(currentThemeOverride);

  useEffect(() => {
    const sync = () => setOverride(currentThemeOverride);
    themeListeners.add(sync);

    getSetting('theme').then(v => {
      if (v === 'dark' || v === 'light' || v === 'system' || v === 'oled') {
        currentThemeOverride = v;
        setOverride(v);
        notifyThemeListeners();
      }
    }).catch(err => {
      // useTheme() runs on every single screen — an unhandled rejection here
      // would surface on every mount. Falling back to the system scheme is
      // harmless, so just log and move on.
      console.error('Failed to load theme setting:', err);
    });

    return () => {
      themeListeners.delete(sync);
    };
  }, []);

  return resolvePalette(override, systemScheme);
}
