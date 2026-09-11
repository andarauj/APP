/**
 * Adaptive plan — phase model (see NSPI_ENGINE.md §3, §5).
 *
 * A cycle is four phases of ~1 week each. Each phase applies multipliers to
 * the plan's base targets (sets × reps × %e1RM). The next cycle starts from
 * a higher baseline. Pure functions here; the DB orchestration lives in the
 * adaptive service (N4).
 */

import type { AdaptiveGoal, AdaptivePhase, AdaptiveExperience } from './nspi';

export const PHASE_ORDER: AdaptivePhase[] = ['on_ramp', 'accumulation', 'intensification', 'deload'];

export const PHASE_LABEL_PT: Record<AdaptivePhase, string> = {
  on_ramp: 'Adaptação',
  accumulation: 'Acumulação',
  intensification: 'Intensificação',
  deload: 'Descarga',
};

export const PHASE_COLOR: Record<AdaptivePhase, string> = {
  on_ramp: '#37C871',
  accumulation: '#F5A623',
  intensification: '#FF6B3C',
  deload: '#3EC8E0',
};

interface PhaseSpec {
  /** multiplier on the plan's base number of working sets */
  volumeMult: number;
  repLow: number;
  repHigh: number;
  /** target working weight as a fraction of estimated 1RM */
  intensityPct: number;
  /** short PT sentence for the Weekly Recap "what to expect" line */
  expect: string;
}

const BASE_PHASES: Record<AdaptivePhase, PhaseSpec> = {
  on_ramp:         { volumeMult: 0.85, repLow: 12, repHigh: 15, intensityPct: 0.65, expect: 'Semana de adaptação: reps altas, RPE 6–7, reencontrar as cargas.' },
  accumulation:    { volumeMult: 1.15, repLow: 8,  repHigh: 12, intensityPct: 0.72, expect: 'Semana de acumulação: mais séries, RPE 7–8, é aqui que se cresce.' },
  intensification: { volumeMult: 0.90, repLow: 4,  repHigh: 6,  intensityPct: 0.85, expect: 'Semana de intensificação: pesado, reps baixas, RPE 8–9.' },
  deload:          { volumeMult: 0.50, repLow: 6,  repHigh: 8,  intensityPct: 0.60, expect: 'Semana de descarga: metade do volume, cargas leves, recuperar.' },
};

/** Small per-goal nudges layered on the base phase spec. */
const GOAL_TILT: Record<AdaptiveGoal, Partial<Record<AdaptivePhase, Partial<PhaseSpec>>>> = {
  strength: {
    accumulation:    { repLow: 6, repHigh: 10, intensityPct: 0.75 },
    intensification: { repLow: 3, repHigh: 5,  intensityPct: 0.88, volumeMult: 0.85 },
  },
  bulking: {
    accumulation:    { volumeMult: 1.25, repLow: 8, repHigh: 14 },
    intensification: { volumeMult: 0.95, repLow: 6, repHigh: 8, intensityPct: 0.80 },
  },
  cutting: {
    accumulation:    { volumeMult: 1.05, repLow: 10, repHigh: 15 },
    deload:          { volumeMult: 0.55 },
  },
  general: {},
};

/**
 * Small relative nudges layered on TOP of the goal-tilted spec (not
 * replacement values like GOAL_TILT — a beginner should get "a bit lighter
 * than whatever this goal already prescribes", not a fixed number that
 * might sit oddly against a goal's own tilt). `intermediate` is empty on
 * purpose: it is the untouched baseline every existing caller already
 * exercises, so leaving `experience` off phaseSpec()/phaseTargets() keeps
 * today's exact behaviour.
 */
const EXPERIENCE_ADJUST: Record<AdaptiveExperience, Partial<Record<AdaptivePhase, {
  intensityDelta?: number;   // added to intensityPct
  repHighDelta?: number;     // added to repHigh (more room in the rep window)
  volumeMultFactor?: number; // multiplies volumeMult
}>>> = {
  beginner: {
    // Less to gain from grinding near-max singles, more to lose from a
    // technical breakdown under a heavy bar — trade a little intensity for
    // a wider, more forgiving rep window.
    intensification: { intensityDelta: -0.05, repHighDelta: 1 },
    accumulation: { volumeMultFactor: 0.9 },
  },
  intermediate: {},
  advanced: {
    // Can handle (and needs) working closer to a genuine near-max effort to
    // keep progressing, but accumulates fatigue faster at that intensity —
    // the deload that follows has to be deeper, not just the same relief.
    intensification: { intensityDelta: 0.03 },
    deload: { volumeMultFactor: 0.85 },
  },
};

function applyExperience(spec: PhaseSpec, phase: AdaptivePhase, experience: AdaptiveExperience): PhaseSpec {
  const adj = EXPERIENCE_ADJUST[experience]?.[phase];
  if (!adj) return spec;
  return {
    ...spec,
    intensityPct: Math.max(0.4, Math.min(1, spec.intensityPct + (adj.intensityDelta ?? 0))),
    repHigh: spec.repHigh + (adj.repHighDelta ?? 0),
    volumeMult: spec.volumeMult * (adj.volumeMultFactor ?? 1),
  };
}

export function phaseSpec(phase: AdaptivePhase, goal: AdaptiveGoal, experience: AdaptiveExperience = 'intermediate'): PhaseSpec {
  const base = { ...BASE_PHASES[phase], ...(GOAL_TILT[goal]?.[phase] ?? {}) };
  return applyExperience(base, phase, experience);
}

/** The phase that follows `current` within a cycle; wraps deload -> on_ramp
 *  (a new cycle). `wrapsCycle` says whether that wrap happened. */
export function nextPhase(current: AdaptivePhase): { phase: AdaptivePhase; wrapsCycle: boolean } {
  const i = PHASE_ORDER.indexOf(current);
  const next = PHASE_ORDER[(i + 1) % PHASE_ORDER.length];
  return { phase: next, wrapsCycle: next === 'on_ramp' };
}

/** Round a computed weight to something you can actually load. */
export function roundToIncrement(weight: number, increment = 2.5): number {
  if (increment <= 0) return Math.round(weight);
  return Math.round(weight / increment) * increment;
}

/**
 * Smallest sensible load step for an exercise's equipment (kg). Dumbbells
 * usually jump in pairs of ~1kg (2kg total), plate work in 1.25kg pairs
 * (2.5kg total), fixed machines vary but 2.5 is a safe default. Bodyweight
 * work has no external step -> 0 (roundToIncrement then rounds to whole kg
 * for any added load).
 */
export function loadIncrement(equipment: string): number {
  const e = (equipment || '').toLowerCase();
  if (e.includes('body') || e === 'none' || e.includes('band')) return 0;
  if (e.includes('dumbbell') || e.includes('kettlebell')) return 2;
  if (e.includes('machine') || e.includes('cable') || e.includes('smith')) return 2.5;
  return 2.5; // barbell, ez bar, trap bar, plate-loaded
}

export interface ExerciseTargets {
  targetWeight: number;   // 0 when e1RM unknown -> caller keeps last logged
  repLow: number;
  repHigh: number;
  targetSets: number;
}

/**
 * Targets for one exercise this phase.
 * @param baseSets    the plan's prescribed working sets for this exercise
 * @param e1rm        current estimated 1RM (0 if unknown)
 * @param stall       consecutive sessions without progressing (widens the rep
 *                    window slightly so a stuck lifter has room to grind)
 * @param increment   loadable step for this exercise's equipment (kg)
 * @param experience  beginner/intermediate/advanced — see EXPERIENCE_ADJUST
 */
export function phaseTargets(
  phase: AdaptivePhase,
  goal: AdaptiveGoal,
  baseSets: number,
  e1rm: number,
  stall = 0,
  increment = 2.5,
  experience: AdaptiveExperience = 'intermediate',
): ExerciseTargets {
  const spec = phaseSpec(phase, goal, experience);
  const targetSets = Math.max(1, Math.round(baseSets * spec.volumeMult));
  const repBump = Math.min(2, stall); // up to +2 reps of room when stalling
  const repLow = spec.repLow;
  const repHigh = spec.repHigh + repBump;
  const targetWeight = e1rm > 0 ? roundToIncrement(e1rm * spec.intensityPct, increment) : 0;
  return { targetWeight, repLow, repHigh, targetSets };
}

/** Estimated 1RM from a top set (Epley), shared with utils/calculators. */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
