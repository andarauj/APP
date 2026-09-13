import { computeJeffAssessment } from '../jeffAssessment';

describe('computeJeffAssessment', () => {
  it('scores healthy balance and normal volume as ok', () => {
    const result = computeJeffAssessment({
      balanceScore: 80,
      thisWeekVolume: 10000,
      avgWeeklyVolume: 10000,
    });
    expect(result.level).toBe('none');
    expect(result.score).toBeGreaterThan(50);
    expect(result.summary).toMatch(/padrão recente/i);
  });

  it('flags a volume spike as watch', () => {
    const result = computeJeffAssessment({
      balanceScore: 70,
      thisWeekVolume: 16000,
      avgWeeklyVolume: 10000,
    });
    expect(result.level).toBe('watch');
    expect(result.strain).toBeGreaterThan(50);
  });
});
