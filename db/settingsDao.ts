import { getDatabase } from './database';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export const DEFAULT_SETTINGS = {
  defaultRestSeconds: '30',
  defaultRestSecondsIsometric: '60',
  defaultRestSecondsCardio: '30',
  soundEnabled: '1',
  vibrateEnabled: '1',
  keepScreenAwake: '1',
  defaultPlanType: 'hypertrophy',
  reminderEnabled: '0',
  onboardingComplete: '0',
  appMode: 'advanced',
  reminderDays: '1,3,5',
  reminderTime: '18:00',
  // Height doesn't change like a body measurement does, so it lives here
  // (set once, editable) rather than as a per-entry body_metrics column.
  heightCm: '',
};

export async function getSettingWithDefault(key: string, defaultVal: string): Promise<string> {
  const val = await getSetting(key);
  return val !== null ? val : defaultVal;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...DEFAULT_SETTINGS };
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
