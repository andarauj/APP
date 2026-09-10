/**
 * Covers getWeightChange, which drives the weight card on the home screen.
 *
 * The bug this exists to prevent: the previous-reading lookup used to search
 * a single 24-hour window around the target day, so unless you happened to
 * weigh yourself on exactly that date the delta came back null and the card
 * silently showed nothing.
 *
 * The database is stubbed rather than real — the point is the query window
 * and the null handling, not SQLite itself.
 */

import { getWeightChange } from '../bodyMetricsDao';

const mockGetFirstAsync = jest.fn();

jest.mock('@/db/database', () => ({
  getDatabase: async () => ({ getFirstAsync: mockGetFirstAsync }),
}));

const DAY = 86400;

/** Captures the [since, oldestUseful] bounds the previous-reading query uses. */
function boundsFromLastCall(): { since: number; oldestUseful: number } {
  const call = mockGetFirstAsync.mock.calls[1];
  const [since, oldestUseful] = call[1] as number[];
  return { since, oldestUseful };
}

beforeEach(() => {
  mockGetFirstAsync.mockReset();
});

describe('getWeightChange', () => {
  it('returns the delta between the latest and the earlier reading', async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ weight: 80 })
      .mockResolvedValueOnce({ weight: 82.5 });

    const result = await getWeightChange(7);

    expect(result.current).toBe(80);
    expect(result.previous).toBe(82.5);
    expect(result.delta).toBeCloseTo(-2.5);
  });

  it('looks back a full extra window, not just one day', async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ weight: 80 })
      .mockResolvedValueOnce({ weight: 81 });

    await getWeightChange(7);

    const { since, oldestUseful } = boundsFromLastCall();
    // A one-day window was the bug; anything close to it fails here.
    expect(since - oldestUseful).toBe(7 * DAY);
  });

  it('scales the tolerance with the requested period', async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ weight: 80 })
      .mockResolvedValueOnce({ weight: 81 });

    await getWeightChange(30);

    const { since, oldestUseful } = boundsFromLastCall();
    expect(since - oldestUseful).toBe(30 * DAY);
  });

  it('reports no delta when there is no earlier reading', async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ weight: 80 })
      .mockResolvedValueOnce(null);

    const result = await getWeightChange(7);

    expect(result.current).toBe(80);
    expect(result.previous).toBeNull();
    expect(result.delta).toBeNull();
  });

  it('reports no delta when there is no reading at all', async () => {
    mockGetFirstAsync.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await getWeightChange(7);

    expect(result).toEqual({ current: null, previous: null, delta: null });
  });

  it('surfaces a stored zero instead of hiding it as a missing reading', async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ weight: 0 })
      .mockResolvedValueOnce({ weight: 80 });

    const result = await getWeightChange(7);

    // 0 kg is bad data, but the caller should see it rather than be told
    // there is no reading — that is how bad rows get noticed and fixed.
    expect(result.current).toBe(0);
    expect(result.delta).toBe(-80);
  });

  it('treats a null weight column as absent', async () => {
    mockGetFirstAsync
      .mockResolvedValueOnce({ weight: null })
      .mockResolvedValueOnce({ weight: 80 });

    const result = await getWeightChange(7);

    expect(result.current).toBeNull();
    expect(result.delta).toBeNull();
  });
});
