import type { Equipment } from '@/types';

export type LoadMode = 'external' | 'bodyweight' | 'assisted';

/** Derive load mode from equipment; assisted is reserved for future weighted-assist logging. */
export function loadModeForEquipment(equipment: Equipment | string | undefined | null): LoadMode {
  if (equipment === 'bodyweight') return 'bodyweight';
  return 'external';
}

/**
 * Effective external load for volume math.
 * Bodyweight sets logged at 0 kg use the athlete's scale weight so calisthenics
 * contribute to session/weekly tonnage instead of silently summing to 0.
 */
export function effectiveLoad(
  weight: number,
  equipment: Equipment | string | undefined | null,
  userBodyweightKg: number | null | undefined
): number {
  const w = Number(weight) || 0;
  if (w > 0) return w;
  if (loadModeForEquipment(equipment) === 'bodyweight') {
    const bw = Number(userBodyweightKg) || 0;
    return bw > 0 ? bw : 0;
  }
  return 0;
}

export function setVolume(
  reps: number,
  weight: number,
  equipment: Equipment | string | undefined | null,
  userBodyweightKg: number | null | undefined
): number {
  const r = Number(reps) || 0;
  return r * effectiveLoad(weight, equipment, userBodyweightKg);
}

/** Prefer séries/reps as the primary KPI when ≥50% of working sets are bodyweight. */
export function shouldPreferRepsKpi(bwSets: number, totalSets: number): boolean {
  if (totalSets <= 0) return false;
  return bwSets / totalSets >= 0.5;
}
