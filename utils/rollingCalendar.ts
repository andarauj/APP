/**
 * Rolling calendar helpers for the Hoje / Ver Plano agenda:
 * current week (Mon–Sun) plus the next two weeks = 21 day cells.
 */

export type DayStatus = 'completed' | 'scheduled' | 'rest' | 'today' | 'skipped' | 'backlog';

export interface CalendarDay {
  /** Local calendar date at midnight. */
  date: Date;
  /** 0=Sun..6=Sat — matches planner keys. */
  weekday: number;
  /** Offset from today in whole days (negative = past). */
  offsetFromToday: number;
  isToday: boolean;
  /** Week index within the 3-week strip: 0 = current, 1–2 = future. */
  weekIndex: number;
  dayOfMonth: number;
  shortLabel: string;
}

const SHORT_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Monday of the week containing `d` (local time). */
export function startOfWeekMonday(d: Date = new Date()): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + mondayOffset);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function startOfDay(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 21 days: Mon of current week → Sun of week+2. */
export function buildRollingThreeWeeks(from: Date = new Date()): CalendarDay[] {
  const today = startOfDay(from);
  const week0 = startOfWeekMonday(from);
  const days: CalendarDay[] = [];
  for (let i = 0; i < 21; i++) {
    const date = new Date(week0);
    date.setDate(week0.getDate() + i);
    const weekday = date.getDay();
    const offsetFromToday = Math.round((date.getTime() - today.getTime()) / 86400000);
    days.push({
      date,
      weekday,
      offsetFromToday,
      isToday: offsetFromToday === 0,
      weekIndex: Math.floor(i / 7),
      dayOfMonth: date.getDate(),
      shortLabel: SHORT_PT[weekday],
    });
  }
  return days;
}

export function weekSectionLabel(weekIndex: number): string {
  if (weekIndex === 0) return 'Esta semana';
  if (weekIndex === 1) return 'Próxima semana';
  return 'Daqui a 2 semanas';
}

/** Today plus the next `count - 1` calendar days (default 5). */
export function buildRollingNextDays(count = 5, from: Date = new Date()): CalendarDay[] {
  const today = startOfDay(from);
  const days: CalendarDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const weekday = date.getDay();
    days.push({
      date,
      weekday,
      offsetFromToday: i,
      isToday: i === 0,
      weekIndex: Math.floor(i / 7),
      dayOfMonth: date.getDate(),
      shortLabel: SHORT_PT[weekday],
    });
  }
  return days;
}
