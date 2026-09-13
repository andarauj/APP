import { detectVolumeSpike, overallFatigueLevel, type FatigueLevel } from '@/utils/fatigueSignals';

export interface JeffAssessmentInput {
  /** 0–100 muscle / movement balance. */
  balanceScore: number;
  thisWeekVolume: number;
  avgWeeklyVolume: number;
  extraSignalCount?: number;
}

export interface JeffAssessmentResult {
  score: number;
  balance: number;
  strain: number;
  level: FatigueLevel;
  summary: string;
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Score card for training balance vs strain. Uses the same volume-spike
 * and fatigue-stacking signals as the fatigue radar — not a diagnosis.
 */
export function computeJeffAssessment(input: JeffAssessmentInput): JeffAssessmentResult {
  const balance = clamp(Math.round(input.balanceScore));
  const spike = detectVolumeSpike(input.thisWeekVolume, input.avgWeeklyVolume);
  const extra = input.extraSignalCount ?? 0;
  const signalCount = (spike ? 1 : 0) + extra;
  const level = overallFatigueLevel(signalCount);

  let strain = 20;
  if (input.avgWeeklyVolume > 0) {
    const ratio = input.thisWeekVolume / input.avgWeeklyVolume;
    strain = clamp(Math.round(ratio * 50));
  }
  if (spike) strain = clamp(strain + 15);
  if (extra > 0) strain = clamp(strain + extra * 10);

  const score = clamp(Math.round((balance + (100 - strain)) / 2));

  let summary: string;
  if (level === 'high' || level === 'stacking') {
    summary = 'O volume está a acumular em relação à tua média — vale a pena olhar para o equilíbrio e para os sinais de fadiga.';
  } else if (balance < 40) {
    summary = 'Há grupos a receber pouco trabalho. O strain está controlado, mas o equilíbrio pode melhorar.';
  } else if (spike) {
    summary = 'Equilíbrio razoável, mas o volume desta semana está claramente acima do habitual.';
  } else {
    summary = 'Equilíbrio e strain dentro do teu padrão recente — sem sinais a empilhar.';
  }

  return { score, balance, strain, level, summary };
}
