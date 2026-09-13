/**
 * Adaptive engine — weekly decision (see NSPI_ENGINE.md §4).
 *
 * Runs on the week-start day. Looks at the week that just ended and decides
 * what the next week does: advance to the next phase, repeat the phase for a
 * consolidation "bridge" week, hold, or drop into an early deload.
 *
 * Guiding rule: never stack a harder phase on a week that went badly —
 * "progress is not a punishment system".
 */

import type { AdaptiveGoal, AdaptivePhase, AdaptiveExperience } from './nspi';
import { nextPhase, phaseSpec } from './adaptivePlan';

export type AdaptiveDecision = 'advance' | 'bridge' | 'hold' | 'deload_early';

export interface WeekSignal {
  phase: AdaptivePhase;
  nspiLoad: number;      // 0..100
  nspiVolume: number;    // 0..100
  nspiBalance: number;   // 0..100
  avgRpe: number | null; // mean RPE of working sets this week (null = not logged)
  /** smallest movement bucket's sets ÷ its phase target (1 when unknown) */
  minBucketRatio: number;
  isBridge: boolean;
}

export interface DecisionInput {
  current: WeekSignal;
  /** previous weeks, newest first (up to ~3 used) */
  recent: WeekSignal[];
  goal: AdaptiveGoal;
  /** consecutive weeks without a load PR on the main lifts */
  stallCount: number;
  /** from utils/fatigueSignals — an explicit "you look fried" flag */
  fatigueFlag?: boolean;
  /** Defaults to 'intermediate' (today's untouched thresholds) when absent.
   *  Beginners get a more lenient bar to advance — novice linear
   *  progression really is close to "every week you can add a bit more",
   *  unlike an intermediate/advanced lifter who has to earn it. */
  experience?: AdaptiveExperience;
  /** Muscles whose planned weekly hard sets sit below the dose floor. */
  musclesBelowFloor?: number;
  /** Muscles whose planned weekly hard sets sit above the planning cap. */
  musclesAboveCap?: number;
}

export interface DecisionResult {
  decision: AdaptiveDecision;
  nextPhase: AdaptivePhase;
  wrapsCycle: boolean;
  reasons: string[];
  expect: string;
}

const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : NaN);

export function decideNextWeek(input: DecisionInput): DecisionResult {
  const { current, recent, goal, stallCount, fatigueFlag } = input;
  const experience = input.experience ?? 'intermediate';
  const prevLoads = recent.slice(0, 2).map(w => w.nspiLoad);
  const avgPrevLoad = prevLoads.length ? mean(prevLoads) : 50;

  // --- the four questions ---
  const loadRising = current.nspiLoad >= avgPrevLoad + 1;
  const didWork = current.nspiVolume >= 85;
  const balanceOk = current.nspiBalance >= 60 && current.minBucketRatio >= 0.5;

  let phaseAligned: boolean;
  switch (current.phase) {
    case 'on_ramp':         phaseAligned = current.nspiVolume >= 70; break;
    case 'accumulation':    phaseAligned = didWork; break;
    case 'intensification': phaseAligned = loadRising || current.nspiLoad >= 55; break;
    case 'deload':          phaseAligned = true; break;
  }

  const score4 = [loadRising, didWork, balanceOk, phaseAligned].filter(Boolean).length;

  // --- fatigue overrides everything (unless already deloading) ---
  const volumeSlidingTwoWeeks =
    recent.length >= 1 && current.nspiVolume < 70 && recent[0].nspiVolume < 70;
  const highFatigue =
    current.phase !== 'deload' &&
    (fatigueFlag === true ||
      (current.avgRpe != null && current.avgRpe >= 9) ||
      volumeSlidingTwoWeeks);

  const reasons: string[] = [];

  const musclesAboveCap = input.musclesAboveCap ?? 0;
  if (musclesAboveCap >= 2 && current.phase !== 'deload') {
    reasons.push(`${musclesAboveCap} grupos musculares acima do teto habitual de volume.`);
    return {
      decision: 'deload_early',
      nextPhase: 'deload',
      wrapsCycle: false,
      reasons,
      expect: phaseSpec('deload', goal, experience).expect,
    };
  }

  if (highFatigue) {
    if (fatigueFlag) reasons.push('Sinais de fadiga acumulada.');
    if (current.avgRpe != null && current.avgRpe >= 9) reasons.push(`RPE médio da semana em ${current.avgRpe.toFixed(1)} — muito alto.`);
    if (volumeSlidingTwoWeeks) reasons.push('Volume abaixo de 70% duas semanas seguidas.');
    return {
      decision: 'deload_early',
      nextPhase: 'deload',
      wrapsCycle: false,
      reasons,
      expect: phaseSpec('deload', goal, experience).expect,
    };
  }

  // --- deload always rolls into a fresh cycle ---
  if (current.phase === 'deload') {
    const np = nextPhase('deload'); // -> on_ramp, wrapsCycle
    reasons.push('Descarga concluída — novo ciclo a partir de um patamar mais alto.');
    return {
      decision: 'advance',
      nextPhase: np.phase,
      wrapsCycle: np.wrapsCycle,
      reasons,
      // Distinct from BASE_PHASES.on_ramp.expect's "reencontrar as cargas" —
      // that phrasing fits the very first on_ramp week ever (utils/
      // adaptiveService.ts's startAdaptivePlan), not this one: by the 2nd+
      // cycle the loads are already known, so this week is about locking in
      // technique at a lighter load before the new (higher) baseline ramps.
      expect: 'Novo ciclo, fase de Adaptação: esforço moderado para consolidar a técnica — o ponto de partida já é mais alto do que no ciclo anterior.',
    };
  }

  // --- a bridge week is a single half-step; after it, always move on ---
  if (current.isBridge) {
    const np = nextPhase(current.phase);
    reasons.push('Semana de consolidação feita — a avançar de fase.');
    return { decision: 'advance', nextPhase: np.phase, wrapsCycle: np.wrapsCycle, reasons, expect: phaseSpec(np.phase, goal, experience).expect };
  }

  // A beginner's near-linear progression earns a lower bar to advance —
  // see the DecisionInput.experience doc comment. Everything else
  // (intermediate and advanced) keeps today's threshold of 3.
  const musclesBelowFloor = input.musclesBelowFloor ?? 0;
  if (
    current.phase === 'accumulation'
    && !current.isBridge
    && musclesBelowFloor > 0
    && didWork
  ) {
    reasons.push(
      `${musclesBelowFloor} grupo${musclesBelowFloor > 1 ? 's' : ''} ainda abaixo do piso habitual de séries — mais uma semana de acumulação.`,
    );
    return {
      decision: 'bridge',
      nextPhase: current.phase,
      wrapsCycle: false,
      reasons,
      expect: `Semana de consolidação: repetimos a fase ${labelOf(current.phase)} e subimos um pouco o volume.`,
    };
  }

  const strongThreshold = experience === 'beginner' ? 2 : 3;
  const strong = score4 >= strongThreshold && stallCount === 0;
  const weak = score4 <= 1 || stallCount >= 2 || !didWork;

  if (strong) {
    const np = nextPhase(current.phase);
    if (loadRising) reasons.push(`Progressão de carga forte (NSPI carga ${Math.round(current.nspiLoad)}).`);
    if (didWork) reasons.push(`Concluíste ${Math.round(current.nspiVolume)}% do volume planeado.`);
    if (balanceOk) reasons.push('Treino equilibrado pelos padrões de movimento.');
    return { decision: 'advance', nextPhase: np.phase, wrapsCycle: np.wrapsCycle, reasons, expect: phaseSpec(np.phase, goal, experience).expect };
  }

  if (weak) {
    if (stallCount >= 2) reasons.push(`Sem novo recorde de força há ${stallCount} semanas.`);
    if (!didWork) reasons.push(`Só ${Math.round(current.nspiVolume)}% do volume planeado — falta consolidar.`);
    if (!balanceOk) reasons.push('Distribuição de trabalho desequilibrada.');
    return {
      decision: 'bridge',
      nextPhase: current.phase,
      wrapsCycle: false,
      reasons,
      expect: `Semana de consolidação: repetimos a fase ${labelOf(current.phase)} para assentar antes de forçar.`,
    };
  }

  // middle ground: keep going, same targets
  reasons.push('Progresso dentro do esperado, sem folga para subir ainda.');
  return {
    decision: 'hold',
    nextPhase: current.phase,
    wrapsCycle: false,
    reasons,
    expect: `Mantém a fase ${labelOf(current.phase)} e os mesmos alvos esta semana.`,
  };
}

function labelOf(phase: AdaptivePhase): string {
  return { on_ramp: 'de adaptação', accumulation: 'de acumulação', intensification: 'de intensificação', deload: 'de descarga' }[phase];
}
