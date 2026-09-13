/**
 * Pure helpers for the active-workout set row / rest bar UI.
 * Kept free of React so unit tests can lock JEFIT-style interactions.
 */
import type { SetType } from '@/types';

export const SET_TYPE_CYCLE: readonly SetType[] = [
  'normal',
  'warmup',
  'dropset',
  'failure',
  'amrap',
] as const;

export const REST_PRESETS_SECONDS = [60, 90, 120] as const;

export function nextSetType(current: SetType): SetType {
  const i = SET_TYPE_CYCLE.indexOf(current);
  const idx = i < 0 ? 0 : (i + 1) % SET_TYPE_CYCLE.length;
  return SET_TYPE_CYCLE[idx];
}

/** Compact badge: set number for normal, letter for classified sets. */
export function setTypeBadgeLabel(type: SetType, setIndex: number): string {
  switch (type) {
    case 'warmup':
      return 'W';
    case 'dropset':
      return 'D';
    case 'failure':
      return 'F';
    case 'amrap':
      return 'A';
    default:
      return String(setIndex + 1);
  }
}

/** Clamp rest remaining after +/- adjustment. */
export function adjustRestRemaining(remaining: number, deltaSeconds: number): number {
  return Math.max(0, remaining + deltaSeconds);
}

/** Plan `reps_target` as shown in the REPS field — keeps ranges like "12-15". */
export function normalizeRepsTarget(raw: string | number | null | undefined): string {
  const s = String(raw ?? '').trim();
  return s || '8-12';
}

/**
 * Integer logged to SQLite from a REPS field that may hold a range.
 * "12-15" → 12 (low end of the prescription); "10" → 10.
 */
export function parseLoggedReps(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const match = String(value ?? '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Persistable set_type from a plan_exercises row (invalid → working/normal). */
export function plannedSetType(planType: string | null | undefined): SetType {
  return SET_TYPE_CYCLE.includes(planType as SetType) ? (planType as SetType) : 'normal';
}
