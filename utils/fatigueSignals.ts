/**
 * Pattern-level fatigue signals — not a diagnosis, not a medical claim.
 * Every signal here is a factual observation about numbers already logged
 * (an estimated 1RM trend, a volume spike), framed as "worth noticing",
 * never as "you are overtrained" or "you will get injured". The wording
 * used alongside these (see app/fatigue-radar.tsx) matters as much as the
 * math — this stays a pattern to be aware of, not a verdict.
 */

export interface ExercisePerformancePoint {
  date: number;
  estimated1RM: number;
}

export interface RegressionSignal {
  peakOneRM: number;
  recentOneRM: number;
  percentDecline: number;
}

/**
 * Detects a genuine, sustained decline in estimated 1RM for one exercise —
 * not a single off day, which happens to everyone and means nothing on its
 * own. Compares the average of the most recent 3 sessions against the best
 * point from the sessions BEFORE those three (a recent peak, not a
 * possibly-stale all-time best from months ago under a different program).
 *
 * A consistent decline despite continued training is one of the
 * earliest-visible signs of accumulating fatigue outpacing recovery —
 * exactly the kind of thing that's easy to miss session-by-session but
 * obvious once laid out as a trend.
 */
export function detectPerformanceRegression(
  points: ExercisePerformancePoint[], // chronological order, oldest first
  minDeclinePercent = 10,
): RegressionSignal | null {
  // Fewer than 4 sessions isn't enough to distinguish a real trend from
  // ordinary day-to-day variation.
  if (points.length < 4) return null;

  const recentPoints = points.slice(-3);
  const historicalPoints = points.slice(0, -3);
  if (historicalPoints.length === 0) return null;

  const peak = Math.max(...historicalPoints.map(p => p.estimated1RM));
  if (peak <= 0) return null;
  const recentAvg = recentPoints.reduce((sum, p) => sum + p.estimated1RM, 0) / recentPoints.length;

  const percentDecline = ((peak - recentAvg) / peak) * 100;
  if (percentDecline >= minDeclinePercent) {
    return {
      peakOneRM: Math.round(peak * 10) / 10,
      recentOneRM: Math.round(recentAvg * 10) / 10,
      percentDecline: Math.round(percentDecline),
    };
  }
  return null;
}

export interface VolumeSpikeSignal {
  percentAboveAverage: number;
}

/**
 * Flags a sudden, large jump in this week's training volume relative to
 * the person's own recent average — a well-established risk factor in
 * sports science for overuse injury (the "too much, too soon" pattern),
 * regardless of what that average happens to be for any given person.
 */
export function detectVolumeSpike(
  thisWeekVolume: number,
  avgWeeklyVolume: number,
  thresholdRatio = 1.4,
): VolumeSpikeSignal | null {
  if (avgWeeklyVolume <= 0) return null;
  const ratio = thisWeekVolume / avgWeeklyVolume;
  if (ratio >= thresholdRatio) {
    return { percentAboveAverage: Math.round((ratio - 1) * 100) };
  }
  return null;
}

export interface RpeCreepSignal {
  weight: number;
  recentAvgRpe: number;
  historicalAvgRpe: number;
  rpeIncrease: number;
}

/**
 * Detects the SAME weight starting to feel genuinely harder over recent
 * sessions — a distinct, typically EARLIER warning sign than
 * detectPerformanceRegression: RPE creeping up at an unchanged weight is
 * often visible for several sessions before throughput (the weight/reps
 * actually being lifted) starts to drop. Catching this earlier gives more
 * room to back off before it becomes the later, more obvious signal.
 *
 * Only compares sets at a similar weight to each other (within
 * `weightTolerancePercent`) — comparing RPE across very different weights
 * wouldn't mean anything (of course a heavier set rates harder).
 */
export function detectRpeCreep(
  sets: { date: number; weight: number; rpe: number | null }[], // chronological order, oldest first
  weightTolerancePercent = 5,
  minRpeIncrease = 1,
): RpeCreepSignal | null {
  const withRpe = sets.filter((s): s is { date: number; weight: number; rpe: number } => s.rpe !== null);
  if (withRpe.length < 6) return null; // not enough RPE-logged sets to trust a trend

  // "The same weight" is defined relative to the most recent set — that's
  // what "this used to feel easier" actually means in practice.
  const referenceWeight = withRpe[withRpe.length - 1].weight;
  const tolerance = referenceWeight * (weightTolerancePercent / 100);
  const matching = withRpe.filter(s => Math.abs(s.weight - referenceWeight) <= tolerance);
  if (matching.length < 4) return null;

  const recent = matching.slice(-3);
  const historical = matching.slice(0, -3);
  if (historical.length === 0) return null;

  const recentAvg = recent.reduce((sum, s) => sum + s.rpe, 0) / recent.length;
  const historicalAvg = historical.reduce((sum, s) => sum + s.rpe, 0) / historical.length;
  const rpeIncrease = recentAvg - historicalAvg;

  if (rpeIncrease >= minRpeIncrease) {
    return {
      weight: referenceWeight,
      recentAvgRpe: Math.round(recentAvg * 10) / 10,
      historicalAvgRpe: Math.round(historicalAvg * 10) / 10,
      rpeIncrease: Math.round(rpeIncrease * 10) / 10,
    };
  }
  return null;
}

export type FatigueLevel = 'none' | 'watch' | 'stacking' | 'high';

/**
 * Any single signal above can be noise on its own — a hard session, an off
 * week. What sports science treats as the real warning is signals
 * STACKING: independent patterns (volume, strength trend, perceived
 * effort) all pointing the same way at once is a stronger indicator than
 * any one of them alone. This turns "how many distinct signal TYPES fired"
 * into one overall level, so the screen can lead with how seriously to
 * take it instead of showing every card with the same visual weight.
 */
export function overallFatigueLevel(activeSignalTypeCount: number): FatigueLevel {
  if (activeSignalTypeCount <= 0) return 'none';
  if (activeSignalTypeCount === 1) return 'watch';
  if (activeSignalTypeCount === 2) return 'stacking';
  return 'high';
}
