export function calculate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  // Epley formula
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export interface PlateResult {
  plates: { weight: number; count: number }[];
  totalWeight: number;
  perSide: number;
}

const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const BAR_KG = 20;
const BAR_LB = 45;

export function calculatePlates(targetWeight: number, unit: 'kg' | 'lb' = 'kg'): PlateResult {
  const bar = unit === 'kg' ? BAR_KG : BAR_LB;
  const plates = unit === 'kg' ? STANDARD_PLATES_KG : STANDARD_PLATES_LB;
  const perSide = (targetWeight - bar) / 2;

  if (perSide <= 0) {
    return { plates: [], totalWeight: bar, perSide: 0 };
  }

  let remaining = perSide;
  const result: { weight: number; count: number }[] = [];

  for (const p of plates) {
    let count = 0;
    while (remaining >= p - 0.01) {
      count++;
      remaining -= p;
      remaining = Math.round(remaining * 100) / 100;
    }
    if (count > 0) {
      result.push({ weight: p, count });
    }
  }

  const totalWeight = bar + perSide * 2;
  return { plates: result, totalWeight, perSide };
}

export interface WarmupSet {
  percent: number;
  weight: number;
  reps: number;
}

/**
 * Standard ramp-up to a working weight. Rounded to 2.5kg so the result is
 * actually loadable with normal plates, and skipped entirely for light work
 * where warmup sets would be pointless.
 */
export function calculateWarmupSets(workingWeight: number, barWeight = 20): WarmupSet[] {
  if (workingWeight <= barWeight * 1.5) return [];
  const scheme = [
    { percent: 40, reps: 10 },
    { percent: 60, reps: 6 },
    { percent: 80, reps: 3 },
  ];
  return scheme
    .map(s => ({
      percent: s.percent,
      reps: s.reps,
      weight: Math.max(barWeight, Math.round((workingWeight * s.percent) / 100 / 2.5) * 2.5),
    }))
    .filter((s, i, arr) => i === 0 || s.weight > arr[i - 1].weight);
}

export interface Tempo {
  eccentric: number;
  pauseBottom: number;
  concentric: number;
  pauseTop: number;
}

/** Parses a cadence string like "3-1-2-0" (down-pause-up-pause, in seconds). */
export function parseTempo(tempo: string): Tempo | null {
  const parts = tempo.trim().split(/[-:\s]+/).filter(Boolean);
  if (parts.length !== 4) return null;
  const nums = parts.map(p => (p.toUpperCase() === 'X' ? 0 : parseInt(p)));
  if (nums.some(n => isNaN(n) || n < 0 || n > 10)) return null;
  const [eccentric, pauseBottom, concentric, pauseTop] = nums;
  return { eccentric, pauseBottom, concentric, pauseTop };
}

export function tempoSecondsPerRep(tempo: Tempo): number {
  return tempo.eccentric + tempo.pauseBottom + tempo.concentric + tempo.pauseTop;
}

export function formatTempo(tempo: Tempo): string {
  return `${tempo.eccentric}-${tempo.pauseBottom}-${tempo.concentric}-${tempo.pauseTop}`;
}

export interface OneRmPercentage {
  percent: number;
  weight: number;
}

/**
 * The percentages people actually use when programming off a 1RM (e.g. "work
 * up to 3 sets at 80%") — a single estimated max on its own doesn't tell you
 * much to train with day to day.
 */
export function calculate1RMPercentages(oneRepMax: number): OneRmPercentage[] {
  if (oneRepMax <= 0) return [];
  return [100, 95, 90, 85, 80, 75, 70, 65, 60].map(percent => ({
    percent,
    weight: Math.round(oneRepMax * (percent / 100) * 2) / 2, // nearest 0.5kg
  }));
}
