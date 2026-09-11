/**
 * NSPI — North Star Progress Index (see NSPI_ENGINE.md §2).
 *
 * A phase-aware, goal-weighted training score (0-100) built from three axes:
 *   - load progression   : is your estimated 1RM moving vs the cycle baseline
 *   - volume completion   : did you do the work the week asked for
 *   - movement balance     : is training spread across movement patterns
 *
 * Fully offline and explainable — same spirit as computeProgressIndex, but
 * this one drives the adaptive engine's weekly decision rather than just
 * being displayed. Deliberately blind to recovery/sleep/nutrition/injury:
 * it scores training *pattern*, nothing the app can't measure.
 */

export type AdaptiveGoal = 'bulking' | 'strength' | 'cutting' | 'general';
export type AdaptivePhase = 'on_ramp' | 'accumulation' | 'intensification' | 'deload';
export type AdaptiveExperience = 'beginner' | 'intermediate' | 'advanced';

/** One main movement pattern's estimated-1RM this week vs the cycle baseline. */
export interface LoadPoint {
  pattern: string;              // 'squat' | 'bench' | 'row' | 'deadlift' | 'ohp' | ...
  e1rmThisWeek: number;         // best set of the week, Epley
  e1rmBaseline: number;         // e1RM for this pattern at the start of the cycle
}

/** Sets done in one of the six movement buckets this week. */
export interface MovementBucket {
  bucket: 'horiz_push' | 'vert_push' | 'horiz_pull' | 'vert_pull' | 'quad' | 'hinge';
  sets: number;
}

export interface NspiInput {
  phase: AdaptivePhase;
  goal: AdaptiveGoal;
  load: LoadPoint[];
  effectiveSetsDone: number;    // non-warmup sets, >=1 rep, this week
  setsPlanned: number;          // sets the week's plan prescribed
  movement: MovementBucket[];
  /** Previous 1-2 weekly scores, newest first, purely for the trend arrow. */
  previousScores?: number[];
}

export interface NspiComponent {
  key: 'load' | 'volume' | 'balance';
  label: string;
  score: number;   // 0-100
  weight: number;  // contribution weight for this goal
  explanation: string;
}

export interface NspiResult {
  score: number;              // 0-100
  load: number;               // 0-100
  volume: number;             // 0-100
  balance: number;            // 0-100
  components: NspiComponent[];
  trend: 'up' | 'down' | 'stable' | null;
}

const GOAL_WEIGHTS: Record<AdaptiveGoal, { load: number; volume: number; balance: number }> = {
  strength: { load: 0.55, volume: 0.25, balance: 0.20 },
  bulking:  { load: 0.30, volume: 0.50, balance: 0.20 },
  cutting:  { load: 0.35, volume: 0.35, balance: 0.30 },
  general:  { load: 0.40, volume: 0.35, balance: 0.25 },
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Load axis: mean relative e1RM change vs baseline, mapped so +8% -> 100,
 *  -8% -> 0, no history -> 50. Deload never penalises a dip. */
function loadAxis(load: LoadPoint[], phase: AdaptivePhase): { score: number; explanation: string } {
  const usable = load.filter(l => l.e1rmBaseline > 0 && l.e1rmThisWeek > 0);
  if (usable.length === 0) {
    return { score: 50, explanation: 'Sem dados de força suficientes neste ciclo ainda.' };
  }
  const deltas = usable.map(l => {
    let d = (l.e1rmThisWeek - l.e1rmBaseline) / l.e1rmBaseline;
    if (phase === 'deload') d = Math.max(d, 0);
    return d;
  });
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const score = clamp(50 + 600 * mean);
  const pct = Math.round(mean * 100);
  return {
    score,
    explanation: `Máximo estimado ${pct >= 0 ? '+' : ''}${pct}% vs. início do ciclo, em ${usable.length} padrão(ões) de movimento.`,
  };
}

/** Volume axis: effective sets done / planned, capped at 100%. */
function volumeAxis(done: number, planned: number): { score: number; explanation: string } {
  if (planned <= 0) {
    return { score: done > 0 ? 100 : 0, explanation: `${done} série(s) efetiva(s) — sem plano semanal definido.` };
  }
  const completion = Math.min(1, done / planned);
  return {
    score: clamp(100 * completion),
    explanation: `${done} de ${planned} séries planeadas (${Math.round(completion * 100)}%).`,
  };
}

/** Balance axis: how many of the six movement buckets got meaningful work,
 *  where "meaningful" is >=40% of the busiest bucket's sets. */
function balanceAxis(movement: MovementBucket[]): { score: number; explanation: string } {
  const ALL: MovementBucket['bucket'][] = ['horiz_push', 'vert_push', 'horiz_pull', 'vert_pull', 'quad', 'hinge'];
  const setsByBucket = new Map(movement.map(m => [m.bucket, m.sets]));
  const top = Math.max(0, ...ALL.map(b => setsByBucket.get(b) ?? 0));
  if (top === 0) {
    return { score: 0, explanation: 'Sem séries de trabalho registadas esta semana.' };
  }
  const threshold = top * 0.4;
  const covered = ALL.filter(b => (setsByBucket.get(b) ?? 0) >= threshold).length;
  return {
    score: clamp((covered / ALL.length) * 100),
    explanation: `${covered} de ${ALL.length} padrões de movimento com trabalho equilibrado.`,
  };
}

export function computeNspi(input: NspiInput): NspiResult {
  const w = GOAL_WEIGHTS[input.goal];

  const load = loadAxis(input.load, input.phase);
  const volume = volumeAxis(input.effectiveSetsDone, input.setsPlanned);
  const balance = balanceAxis(input.movement);

  const components: NspiComponent[] = [
    { key: 'load', label: 'Progressão de carga', score: round1(load.score), weight: w.load, explanation: load.explanation },
    { key: 'volume', label: 'Conclusão de volume', score: round1(volume.score), weight: w.volume, explanation: volume.explanation },
    { key: 'balance', label: 'Equilíbrio de movimento', score: round1(balance.score), weight: w.balance, explanation: balance.explanation },
  ];

  const score = Math.round(
    load.score * w.load + volume.score * w.volume + balance.score * w.balance,
  );

  let trend: NspiResult['trend'] = null;
  const prev = input.previousScores?.[0];
  if (prev !== undefined) {
    const diff = score - prev;
    trend = diff > 3 ? 'up' : diff < -3 ? 'down' : 'stable';
  }

  return {
    score,
    load: round1(load.score),
    volume: round1(volume.score),
    balance: round1(balance.score),
    components,
    trend,
  };
}
