import { buildRollingNextDays, buildRollingThreeWeeks, startOfWeekMonday, weekSectionLabel } from '../rollingCalendar';

describe('rollingCalendar', () => {
  it('builds exactly 21 days starting Monday of current week', () => {
    // Wednesday 2026-09-16
    const from = new Date(2026, 8, 16);
    const days = buildRollingThreeWeeks(from);
    expect(days).toHaveLength(21);
    expect(days[0].weekday).toBe(1); // Monday
    expect(days[0].date.getDate()).toBe(14);
    expect(days[20].weekday).toBe(0); // Sunday of week+2
    expect(days.filter(d => d.isToday)).toHaveLength(1);
    expect(days.find(d => d.isToday)?.dayOfMonth).toBe(16);
  });

  it('labels week sections in PT', () => {
    expect(weekSectionLabel(0)).toBe('Esta semana');
    expect(weekSectionLabel(1)).toBe('Próxima semana');
    expect(weekSectionLabel(2)).toBe('Daqui a 2 semanas');
  });

  it('builds the next 5 calendar days from today', () => {
    const from = new Date(2026, 8, 16);
    const days = buildRollingNextDays(5, from);
    expect(days).toHaveLength(5);
    expect(days[0].isToday).toBe(true);
    expect(days[0].dayOfMonth).toBe(16);
    expect(days[4].dayOfMonth).toBe(20);
    expect(days.every(d => d.offsetFromToday >= 0)).toBe(true);
  });

  it('startOfWeekMonday handles Sunday', () => {
    const sun = new Date(2026, 8, 13); // Sunday
    const mon = startOfWeekMonday(sun);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(7);
  });
});
