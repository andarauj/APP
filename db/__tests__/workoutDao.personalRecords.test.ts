/**
 * Pure volume/PR helpers covered elsewhere; this file locks the SQL shape
 * expectations for getPersonalRecords via a lightweight mock — date must
 * come from the max-weight set, and bodyweight rows are included.
 */

const mockGetAllAsync = jest.fn();
const mockGetFirstAsync = jest.fn();
const mockRunAsync = jest.fn();

jest.mock('../database', () => ({
  getDatabase: async () => ({
    getAllAsync: mockGetAllAsync,
    getFirstAsync: mockGetFirstAsync,
    runAsync: mockRunAsync,
  }),
}));

// eslint-disable-next-line import/first
import { getPersonalRecords } from '../workoutDao';

beforeEach(() => {
  mockGetAllAsync.mockReset();
  mockGetFirstAsync.mockReset();
  mockRunAsync.mockReset();
});

describe('getPersonalRecords', () => {
  it('maps weight PRs with date_achieved from the query and estimated 1RM', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        exercise_id: 1,
        exercise_name: 'Supino',
        equipment: 'barbell',
        max_weight: 100,
        max_reps: 5,
        max_volume: 500,
        date_achieved: 1_700_000_000,
      },
    ]);
    const prs = await getPersonalRecords();
    expect(prs).toHaveLength(1);
    expect(prs[0].date_achieved).toBe(1_700_000_000);
    expect(prs[0].is_bodyweight).toBe(0);
    expect(prs[0].estimated_1rm).toBeGreaterThan(100);
    const sql = mockGetAllAsync.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY ws2.weight DESC');
    expect(sql).toContain("e.equipment = 'bodyweight'");
  });

  it('marks bodyweight PRs without fabricating a 1RM', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        exercise_id: 2,
        exercise_name: 'Flexões',
        equipment: 'bodyweight',
        max_weight: 0,
        max_reps: 30,
        max_volume: 0,
        date_achieved: 1_700_000_100,
      },
    ]);
    const prs = await getPersonalRecords();
    expect(prs[0].is_bodyweight).toBe(1);
    expect(prs[0].estimated_1rm).toBe(0);
    expect(prs[0].max_reps).toBe(30);
  });
});
