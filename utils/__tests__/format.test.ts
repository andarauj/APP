import {
  formatTime,
  formatVolume,
  formatDate,
  toUnixSeconds,
  getDaysInMonth,
  getFirstDayOfMonth,
  monthName,
} from '../format';

describe('formatTime', () => {
  it('formats seconds as m:ss (minutes unpadded, seconds always 2 digits)', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('switches to h:mm:ss once past an hour', () => {
    expect(formatTime(3661)).toBe('1:01:01');
  });
});

describe('toUnixSeconds', () => {
  it('leaves second-scale timestamps untouched', () => {
    expect(toUnixSeconds(1_700_000_000)).toBe(1_700_000_000);
  });

  it('normalises millisecond timestamps so callers that *1000 do not paint year ~58668', () => {
    expect(toUnixSeconds(1_700_000_000_000)).toBe(1_700_000_000);
  });

  it('returns 0 for invalid input', () => {
    expect(toUnixSeconds(0)).toBe(0);
    expect(toUnixSeconds(-5)).toBe(0);
    expect(toUnixSeconds(Number.NaN)).toBe(0);
  });
});

describe('formatDate', () => {
  it('formats a Unix-seconds timestamp into a pt-PT date with a sane year', () => {
    // 2023-11-14 ≈ 1700000000
    const label = formatDate(1_700_000_000);
    expect(label).toMatch(/2023/);
    expect(label).not.toMatch(/58\s?000|58668/);
  });

  it('does not produce an absurd year when given milliseconds by mistake', () => {
    const label = formatDate(1_700_000_000_000);
    expect(label).toMatch(/2023/);
    expect(label).not.toMatch(/58\d{3}/);
  });
});

describe('formatVolume', () => {
  it('renders a plain kg value below 1000', () => {
    expect(formatVolume(850)).toContain('850');
  });

  it('does not crash or misrepresent very large volumes', () => {
    expect(formatVolume(125000)).toBeTruthy();
  });

  it('handles zero', () => {
    expect(formatVolume(0)).toBeTruthy();
  });
});

describe('getDaysInMonth', () => {
  it('knows February in a leap year has 29 days', () => {
    expect(getDaysInMonth(2024, 1)).toBe(29); // month is 0-indexed: 1 = February
  });

  it('knows February in a non-leap year has 28 days', () => {
    expect(getDaysInMonth(2025, 1)).toBe(28);
  });

  it('gets 30/31-day months right', () => {
    expect(getDaysInMonth(2026, 0)).toBe(31); // January
    expect(getDaysInMonth(2026, 3)).toBe(30); // April
  });
});

describe('getFirstDayOfMonth', () => {
  it('returns a value in the valid weekday range', () => {
    const day = getFirstDayOfMonth(2026, 7); // August 2026
    expect(day).toBeGreaterThanOrEqual(0);
    expect(day).toBeLessThanOrEqual(6);
  });
});

describe('monthName', () => {
  it('returns a distinct, non-empty label for every month', () => {
    const names = new Set<string>();
    for (let m = 0; m < 12; m++) {
      const name = monthName(m);
      expect(name.length).toBeGreaterThan(0);
      names.add(name);
    }
    expect(names.size).toBe(12);
  });
});
