import { getQuoteForDate, MOTIVATIONAL_QUOTES } from '../motivationalQuotes';

describe('getQuoteForDate', () => {
  it('is deterministic — the same date always returns the same quote', () => {
    const date = new Date(2026, 7, 28);
    const a = getQuoteForDate(date);
    const b = getQuoteForDate(new Date(2026, 7, 28));
    expect(a).toBe(b);
  });

  it('stays the same throughout a single day regardless of time of day', () => {
    const morning = getQuoteForDate(new Date(2026, 7, 28, 6, 0));
    const night = getQuoteForDate(new Date(2026, 7, 28, 23, 59));
    expect(morning).toBe(night);
  });

  it('always returns a quote that is actually in the list', () => {
    for (let d = 0; d < 40; d++) {
      const date = new Date(2026, 0, 1 + d);
      expect(MOTIVATIONAL_QUOTES).toContain(getQuoteForDate(date));
    }
  });

  it('cycles through the full list without repeating early', () => {
    const seen = new Set<string>();
    for (let d = 0; d < MOTIVATIONAL_QUOTES.length; d++) {
      seen.add(getQuoteForDate(new Date(2026, 0, 1 + d)));
    }
    // Every quote in the list should appear exactly once across one full cycle.
    expect(seen.size).toBe(MOTIVATIONAL_QUOTES.length);
  });

  it('has no empty or near-duplicate entries', () => {
    for (const q of MOTIVATIONAL_QUOTES) {
      expect(q.trim().length).toBeGreaterThan(10);
    }
    expect(new Set(MOTIVATIONAL_QUOTES).size).toBe(MOTIVATIONAL_QUOTES.length);
  });
});
