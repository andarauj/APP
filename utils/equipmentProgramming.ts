/**
 * Mixed free-weight + machine slot rules for generated plans.
 * Numbers and confidence ratings: EQUIPMENT_PROGRAMMING.md.
 */

import type { PlanType } from '@/types';
import { isCompoundMovement } from './movementClassify';
import type { AdaptiveExperience } from './nspi';

export type EquipmentClass = 'free' | 'machine' | 'body' | 'other';

const FREE_TAGS = new Set(['barbell', 'dumbbell', 'ez_bar', 'trap_bar', 'kettlebell']);
const MACHINE_TAGS = new Set(['gymleco', 'machine', 'cable', 'smith']);
const BODY_TAGS = new Set(['bodyweight', 'band']);

export function equipmentClass(equipment: string): EquipmentClass {
  const e = (equipment || '').toLowerCase();
  if (FREE_TAGS.has(e)) return 'free';
  if (MACHINE_TAGS.has(e)) return 'machine';
  if (BODY_TAGS.has(e)) return 'body';
  return 'other';
}

/** True when the pool can run complementary slots (livre + máquina). */
export function poolHasMixedClasses(items: { equipment: string }[]): boolean {
  let free = false;
  let machine = false;
  for (const item of items) {
    const cls = equipmentClass(item.equipment);
    if (cls === 'free') free = true;
    else if (cls === 'machine') machine = true;
    if (free && machine) return true;
  }
  return false;
}

/** Hypertrophy/endurance beginners start on a guided compound when one exists. */
export function prefersMachinePrimary(
  planType: PlanType,
  experience: AdaptiveExperience,
): boolean {
  return planType !== 'strength' && experience === 'beginner';
}

export function complementaryClass(primary: EquipmentClass): EquipmentClass | null {
  if (primary === 'free') return 'machine';
  if (primary === 'machine') return 'free';
  return null;
}

function classRankForPrimary(cls: EquipmentClass, machineFirst: boolean): number {
  if (machineFirst) {
    if (cls === 'machine') return 0;
    if (cls === 'free') return 1;
    if (cls === 'body') return 2;
    return 3;
  }
  if (cls === 'free') return 0;
  if (cls === 'machine') return 1;
  if (cls === 'body') return 2;
  return 3;
}

function tieBreakName(a: string, b: string): number {
  const wordDiff = a.split(/\s+/).length - b.split(/\s+/).length;
  if (wordDiff !== 0) return wordDiff;
  return a.localeCompare(b);
}

export interface SlotCandidate {
  name: string;
  equipment: string;
}

/**
 * Primary slot: compound first, then free (strength / non-beginner) or
 * machine (hypertrophy/endurance beginner). Shorter name wins ties.
 */
export function compareForPrimary(
  a: SlotCandidate,
  b: SlotCandidate,
  planType: PlanType,
  experience: AdaptiveExperience,
): number {
  const aCompound = isCompoundMovement(a.name);
  const bCompound = isCompoundMovement(b.name);
  if (aCompound !== bCompound) return aCompound ? -1 : 1;

  const machineFirst = prefersMachinePrimary(planType, experience);
  const classDiff =
    classRankForPrimary(equipmentClass(a.equipment), machineFirst)
    - classRankForPrimary(equipmentClass(b.equipment), machineFirst);
  if (classDiff !== 0) return classDiff;

  return tieBreakName(a.name, b.name);
}

/**
 * Complementary slot: opposite class (livre ↔ máquina), isolation before
 * a second compound, then the foundational-name tie-break.
 */
export function compareForAccessory(
  a: SlotCandidate,
  b: SlotCandidate,
  primaryClass: EquipmentClass,
): number {
  const want = complementaryClass(primaryClass);
  if (want) {
    const aMatch = equipmentClass(a.equipment) === want ? 0 : 1;
    const bMatch = equipmentClass(b.equipment) === want ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
  }

  const aCompound = isCompoundMovement(a.name);
  const bCompound = isCompoundMovement(b.name);
  if (aCompound !== bCompound) return aCompound ? 1 : -1;

  return tieBreakName(a.name, b.name);
}

export function pickNextSlotted<T extends SlotCandidate>(
  remaining: T[],
  primaryClass: EquipmentClass | null,
  planType: PlanType,
  experience: AdaptiveExperience,
): T | undefined {
  if (remaining.length === 0) return undefined;
  const ranked = [...remaining].sort((a, b) => (
    primaryClass == null
      ? compareForPrimary(a, b, planType, experience)
      : compareForAccessory(a, b, primaryClass)
  ));
  return ranked[0];
}
