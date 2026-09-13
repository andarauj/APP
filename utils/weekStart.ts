import { getSetting } from '@/db/settingsDao';

export const WEEK_START_SETTING_KEY = 'weekStartDow';

export async function resolveWeekStartDow(adaptiveWeekStart?: number | null): Promise<number> {
  if (adaptiveWeekStart != null && Number.isFinite(adaptiveWeekStart)) {
    return new Date(adaptiveWeekStart * 1000).getDay();
  }
  const raw = await getSetting(WEEK_START_SETTING_KEY);
  const n = raw != null ? Number(raw) : 1;
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : 1;
}
