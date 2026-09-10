/**
 * Jim Wendler's 5/3/1 — one of the most respected strength programs, built
 * entirely around percentages of a "Training Max" (a deliberately
 * conservative ~90% of your true 1RM) and a weekly AMRAP set. This is why
 * it pairs so well with this app: we already had the 'amrap' set type built
 * for exactly this kind of program.
 *
 * The four weeks:
 *  1 ("5s"):    65/75/85% x 5 reps  (last set AMRAP, "5+")
 *  2 ("3s"):    70/80/90% x 3 reps  (last set AMRAP, "3+")
 *  3 ("5/3/1"): 75/85/95% x 5/3/1   (last set AMRAP, "1+")
 *  4 (deload):  40/50/60% x 5 reps  (no AMRAP — a genuine rest week)
 */

export const FIVE31_LIFTS = ['squat', 'bench', 'deadlift', 'press'] as const;
export type FiveThreeOneLift = typeof FIVE31_LIFTS[number];

export const FIVE31_LIFT_LABELS: Record<FiveThreeOneLift, string> = {
  squat: 'Agachamento',
  bench: 'Supino',
  deadlift: 'Levantamento Terra',
  press: 'Press Militar',
};

// +2.5kg/cycle for upper-body lifts, +5kg for lower-body — the standard
// metric convention (the classic program uses +5lb/+10lb, which doesn't
// map cleanly to kg plates).
export const FIVE31_TM_INCREMENT: Record<FiveThreeOneLift, number> = {
  squat: 5, deadlift: 5, bench: 2.5, press: 2.5,
};

export interface FiveThreeOneSet {
  percent: number;
  reps: string; // '5', '3', '1', or '5+' / '3+' / '1+' for the AMRAP set
  weight: number;
  isAmrap: boolean;
}

const WEEK_SCHEMES: { percents: number[]; reps: string[]; amrapLast: boolean }[] = [
  { percents: [65, 75, 85], reps: ['5', '5', '5'], amrapLast: true },   // week 1
  { percents: [70, 80, 90], reps: ['3', '3', '3'], amrapLast: true },   // week 2
  { percents: [75, 85, 95], reps: ['5', '3', '1'], amrapLast: true },   // week 3
  { percents: [40, 50, 60], reps: ['5', '5', '5'], amrapLast: false },  // week 4 (deload)
];

/** Rounds to the nearest 2.5kg — the smallest plate increment this app's
 *  plate calculator assumes, so a prescribed weight is always actually
 *  loadable. */
export function roundToPlate(weight: number, increment = 2.5): number {
  return Math.round(weight / increment) * increment;
}

/**
 * The three working sets for a given training max and week (1-4). Week is
 * clamped into range rather than throwing — a caller passing week 5 (e.g.
 * from an off-by-one in a UI counter) gets week 4's deload rather than a
 * crash mid-workout, which is the safer failure mode here.
 */
export function getFiveThreeOneSets(trainingMax: number, week: number): FiveThreeOneSet[] {
  const clampedWeek = Math.min(4, Math.max(1, Math.round(week)));
  const scheme = WEEK_SCHEMES[clampedWeek - 1];
  return scheme.percents.map((percent, i) => {
    const isLast = i === scheme.percents.length - 1;
    const isAmrap = isLast && scheme.amrapLast;
    return {
      percent,
      reps: isAmrap ? `${scheme.reps[i]}+` : scheme.reps[i],
      weight: roundToPlate(trainingMax * (percent / 100)),
      isAmrap,
    };
  });
}

/** The next cycle's Training Max after finishing all 4 weeks for a lift. */
export function nextTrainingMax(currentTM: number, lift: FiveThreeOneLift): number {
  return currentTM + FIVE31_TM_INCREMENT[lift];
}

/** A sane starting Training Max from an estimated 1RM — 5/3/1 is built
 *  around training at ~90% of true max, never grinding out singles. */
export function trainingMaxFromEstimated1RM(estimated1RM: number): number {
  return roundToPlate(estimated1RM * 0.9);
}
