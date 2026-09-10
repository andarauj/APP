/**
 * In-session auto-regulation: compares the RPE of a set you just completed
 * against what THAT SAME weight has historically cost you (see
 * utils/fatigueSignals.ts's detectRpeCreep for the same "similar weight"
 * matching idea, applied here to a single moment instead of a multi-week
 * trend) — and suggests a small adjustment for your NEXT set, right now,
 * instead of only surfacing the pattern days later in the Fatigue Radar.
 */

export interface AutoRegulationSuggestion {
  direction: 'decrease' | 'increase';
  suggestedWeightDeltaPercent: number;
  historicalAvgRpe: number;
}

const MIN_SAMPLE_SIZE = 3;
const MEANINGFUL_RPE_DIFF = 1.5;

/**
 * `historicalRpeAtWeight` should already be filtered to sets at a similar
 * weight to the one just completed — this function doesn't do that
 * filtering itself, matching how detectRpeCreep separates "find similar-
 * weight sets" from "judge the RPE difference" into distinct steps.
 */
export function suggestSetAdjustment(
  currentRpe: number,
  historicalRpeAtWeight: number[],
): AutoRegulationSuggestion | null {
  if (historicalRpeAtWeight.length < MIN_SAMPLE_SIZE) return null;

  const avg = historicalRpeAtWeight.reduce((sum, v) => sum + v, 0) / historicalRpeAtWeight.length;
  const diff = currentRpe - avg;

  if (diff >= MEANINGFUL_RPE_DIFF) {
    return {
      direction: 'decrease',
      suggestedWeightDeltaPercent: -5,
      historicalAvgRpe: Math.round(avg * 10) / 10,
    };
  }

  // Only worth suggesting MORE weight when today's set was genuinely easy
  // in absolute terms too (RPE <= 7) — a set that's merely "a bit easier
  // than usual" but still hard (say RPE 8.5 vs a typical 9.5) isn't really
  // an invitation to add load, just normal day-to-day variation.
  if (diff <= -MEANINGFUL_RPE_DIFF && currentRpe <= 7) {
    return {
      direction: 'increase',
      suggestedWeightDeltaPercent: 2.5,
      historicalAvgRpe: Math.round(avg * 10) / 10,
    };
  }

  return null;
}
