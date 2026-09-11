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

/**
 * Standing explainer for why the 4-phase order is what it is — not tied to
 * any one week's transition (that's `WeeklyRecap.why`), just the stable
 * rationale behind the cycle shape itself. Grounded in what BASE_PHASES
 * actually does below: Adaptação is the lightest, widest-rep phase (builds
 * work capacity safely); Acumulação raises volume the most (the phase that
 * does the most hypertrophy/stimulus work); Intensificação trades volume for
 * the highest %e1RM (tests real strength limits, which only makes sense once
 * capacity and technique are already there); Descarga cuts volume to half
 * (the recovery the next, harder cycle depends on).
 */
export const CYCLE_RATIONALE_PT =
  'Cada fase controla uma variável de treino diferente, por esta ordem: ' +
  'a Adaptação constrói capacidade de trabalho com cargas leves antes de ' +
  'mais nada; a Acumulação sobe o volume, que é o que mais gera estímulo; ' +
  'a Intensificação troca volume por carga para testar os teus limites de ' +
  'força; e a Descarga reduz tudo a metade para recuperar antes do próximo ' +
  'ciclo, que arranca de um patamar mais alto que este.';

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

/**
 * Sourced against PERIODIZATION_RESEARCH.md (compiled 2026-09-11) — see that
 * file for full citations and confidence ratings. Summary per phase:
 *
 * - on_ramp: no literature gives a precise multiplier; "moderate volume,
 *   high reps, low intensity before loading climbs" matches Bompa's
 *   anatomical-adaptation phase. Heuristic, directionally sound.
 * - accumulation: >1.0x volume matches the well-established idea that
 *   volume should rise as a mesocycle progresses (Schoenfeld et al. 2017
 *   dose-response meta-analysis; Israetel et al. 2020 MEV->MAV ramp).
 * - intensification: was 0.90x. Revised down to 0.80x — a mere 10% set-count
 *   cut is small relative to what the literature associates with a drop to
 *   4-6 reps at ~85% e1RM: Baz-Valle et al.'s validation of "total sets" as
 *   a volume proxy is scoped to 6-20+ reps (4-6 sits at/below that range),
 *   and periodization sources (Bompa; Lorenz & Morrison 2015) describe
 *   volume dropping "systematically", not by ~10%, as intensity climbs.
 *   No source gives an exact correct number here — 0.80x is the
 *   conservative end of the research's suggested 0.70-0.80x test range.
 * - deload: 0.50x sits at the midpoint of Bell et al. (2025)'s "moderate
 *   recovery needs" tier (40-60% cut) and is well inside what one controlled
 *   study (Vann et al. 2021, an 85% cut) found caused no measurable harm.
 *   This is the best-grounded multiplier of the four — keep as is.
 */
const BASE_PHASES: Record<AdaptivePhase, PhaseSpec> = {
  on_ramp:         { volumeMult: 0.85, repLow: 12, repHigh: 15, intensityPct: 0.65, expect: 'Semana de adaptação: reps altas, RPE 6–7, reencontrar as cargas.' },
  accumulation:    { volumeMult: 1.15, repLow: 8,  repHigh: 12, intensityPct: 0.72, expect: 'Semana de acumulação: mais séries, RPE 7–8, é aqui que se cresce.' },
  intensification: { volumeMult: 0.80, repLow: 4,  repHigh: 6,  intensityPct: 0.85, expect: 'Semana de intensificação: pesado, reps baixas, RPE 8–9.' },
  deload:          { volumeMult: 0.50, repLow: 6,  repHigh: 8,  intensityPct: 0.60, expect: 'Semana de descarga: metade do volume, cargas leves, recuperar.' },
};

/**
 * Small per-goal nudges layered on the base phase spec. Note:
 * strength.intensification.volumeMult (0.85) was set equal to the old base
 * intensification multiplier and was intentionally left untouched when the
 * base was revised down to 0.80x (see BASE_PHASES comment) — a strength
 * goal reasonably keeping relatively more volume at heavy loads than the
 * general case isn't itself wrong, but this wasn't a deliberate per-goal
 * decision, just unreviewed drift. Worth a deliberate look, not a silent fix.
 */
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
