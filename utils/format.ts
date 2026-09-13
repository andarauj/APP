export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * App convention: store and pass Unix timestamps in **seconds**.
 * Values that look like milliseconds (> 1e12 ≈ Sept 2001 in ms) are
 * normalised so a mistaken `* 1000` at a call site cannot paint year ~58668.
 */
export function toUnixSeconds(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  if (timestamp > 1e12) return Math.floor(timestamp / 1000);
  return Math.floor(timestamp);
}

export function formatDate(timestamp: number): string {
  const d = new Date(toUnixSeconds(timestamp) * 1000);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(timestamp: number): string {
  const d = new Date(toUnixSeconds(timestamp) * 1000);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

export function formatDateTime(timestamp: number): string {
  const d = new Date(toUnixSeconds(timestamp) * 1000);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatVolume(volume: number): string {
  if (volume >= 10000) {
    return `${(volume / 1000).toFixed(1)}k kg`;
  }
  return `${Math.round(volume)} kg`;
}

export function todayTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function dayName(date: Date): string {
  return date.toLocaleDateString('pt-PT', { weekday: 'short' });
}

export function monthName(month: number): string {
  const d = new Date(2000, month, 1);
  return d.toLocaleDateString('pt-PT', { month: 'long' });
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}
