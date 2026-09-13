/**
 * Session-to-session load rules used by the planned-workout engine.
 *
 * Accessories and main lifts share the same double-progression contract:
 *   hit the top of the rep range on every working set → add increment
 *   stay inside the range (e.g. 10/9/8 on 8–10) → hold
 *   finish below the floor two sessions in a row → mini-deload (−7.5%)
 *
 * Pure: no DB, no Date.now. Past snapshots are never rewritten here.
 */

import { roundToIncrement } from './adaptivePlan';

export type ProgressionAction = 'increase' | 'hold' | 'minideload';

export interface ProgressionSet {
  reps: number;
  weight: number;
}

export interface DoubleProgressionInput {
  sets: ProgressionSet[];
  repsLow: number;
  repsHigh: number;
  increment: number;
  /** Consecutive finished sessions that landed below repsLow. */
  priorBelowMinSessions?: number;
}

export interface DoubleProgressionResult {
  action: ProgressionAction;
  nextWeight: number;
  nextBelowMinSessions: number;
  reason: string;
}

export function parseRepRange(repsTarget: string): { low: number; high: number } {
  const parts = String(repsTarget || '')
    .split(/[-–—]/)
    .map(p => parseInt(p.replace(/\D/g, ''), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  if (parts.length === 0) return { low: 0, high: 0 };
  if (parts.length === 1) return { low: parts[0], high: parts[0] };
  return { low: parts[0], high: parts[parts.length - 1] };
}

export function loadStepForWeight(weight: number): number {
  if (weight >= 100) return 5;
  if (weight >= 40) return 2.5;
  if (weight >= 20) return 2;
  return 1;
}

export function evaluateDoubleProgression(input: DoubleProgressionInput): DoubleProgressionResult {
  const working = input.sets.filter(s => s.reps >= 0);
  const increment = input.increment > 0 ? input.increment : 2.5;
  const prior = Math.max(0, input.priorBelowMinSessions ?? 0);
  if (working.length === 0) {
    return { action: 'hold', nextWeight: 0, nextBelowMinSessions: prior, reason: '' };
  }

  const weight = Math.max(...working.map(s => s.weight));
  const allHitHigh = input.repsHigh > 0 && working.every(s => s.reps >= input.repsHigh);
  const anyBelowLow = input.repsLow > 0 && working.some(s => s.reps < input.repsLow);

  if (allHitHigh && weight > 0) {
    return {
      action: 'increase',
      nextWeight: Math.round((weight + increment) * 100) / 100,
      nextBelowMinSessions: 0,
      reason: `Todas as séries em ${input.repsHigh}+ reps @ ${weight}kg`,
    };
  }

  if (anyBelowLow) {
    const streak = prior + 1;
    if (streak >= 2 && weight > 0) {
      const cut = roundToIncrement(weight * 0.925, increment);
      return {
        action: 'minideload',
        nextWeight: Math.max(increment, cut),
        nextBelowMinSessions: 0,
        reason: 'Abaixo do mínimo em duas sessões — mini-descarga (−7.5%)',
      };
    }
    return {
      action: 'hold',
      nextWeight: weight,
      nextBelowMinSessions: streak,
      reason: '',
    };
  }

  return {
    action: 'hold',
    nextWeight: weight,
    nextBelowMinSessions: 0,
    reason: '',
  };
}
