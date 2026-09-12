/**
 * Covers the search limit added to searchExercises.
 *
 * Two failure modes are being guarded, in opposite directions. Without a
 * limit, an empty query returned the whole ~1400-row library and three
 * separate exercise pickers rendered all of it. With a limit applied
 * carelessly, the library screen itself would silently show only the first
 * hundred exercises — a worse bug, because nothing looks broken.
 */

const mockGetAllAsync = jest.fn();

jest.mock('../database', () => ({
  getDatabase: async () => ({ getAllAsync: mockGetAllAsync }),
}));

// Must follow jest.mock('../database') above so the mock factory's
// reference to mockGetAllAsync is set up first.
// eslint-disable-next-line import/first
import { searchExercises } from '../exerciseDao';

/** The SQL and params from the most recent query. */
function lastQuery(): { sql: string; params: unknown[] } {
  const call = mockGetAllAsync.mock.calls[mockGetAllAsync.mock.calls.length - 1];
  return { sql: call[0] as string, params: call[1] as unknown[] };
}

beforeEach(() => {
  mockGetAllAsync.mockReset().mockResolvedValue([]);
});

describe('searchExercises', () => {
  it('bounds an unfiltered search by default', async () => {
    await searchExercises('');

    const { sql, params } = lastQuery();
    expect(sql).toContain('LIMIT ?');
    expect(params[params.length - 1]).toBe(100);
  });

  it('applies the limit last, after the search params', async () => {
    await searchExercises('agachamento');

    const { params } = lastQuery();
    // The two LIKE params come first; the limit must be the final binding or
    // the placeholders bind to the wrong values.
    expect(params.slice(0, 2)).toEqual(['%agachamento%', '%agachamento%']);
    expect(params[params.length - 1]).toBe(100);
  });

  it('honours an explicit limit', async () => {
    await searchExercises('', undefined, 25);

    expect(lastQuery().params.at(-1)).toBe(25);
  });

  it('omits the clause entirely for Infinity', async () => {
    await searchExercises('', undefined, Infinity);

    const { sql, params } = lastQuery();
    // The library screen relies on this: a LIMIT here would hide exercises
    // with no visible sign that anything was cut.
    expect(sql).not.toContain('LIMIT');
    expect(params).toEqual([]);
  });

  it('keeps filters working alongside the limit', async () => {
    await searchExercises('press', { muscle: 'chest', equipment: 'barbell', type: null }, 50);

    const { sql, params } = lastQuery();
    expect(sql).toContain('primary_muscle = ?');
    expect(sql).toContain('equipment = ?');
    expect(sql).toContain('LIMIT ?');
    expect(params.at(-1)).toBe(50);
  });

  it('still sorts by name before truncating', async () => {
    await searchExercises('');

    const { sql } = lastQuery();
    // ORDER BY must precede LIMIT, otherwise the hundred rows returned are
    // an arbitrary slice rather than the first hundred alphabetically.
    expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));
  });
});
