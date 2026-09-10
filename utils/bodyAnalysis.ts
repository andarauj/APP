import type { BodyMetric, MuscleGroup } from '@/types';

export interface MuscleImbalance {
  muscle: MuscleGroup;
  label: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface BodyAnalysis {
  imbalances: MuscleImbalance[];
  /** Muscles to prioritize for growth — legitimate, since training volume
   *  genuinely does drive hypertrophy in a specific muscle. */
  focusAreas: MuscleGroup[];
  summary: string;
  hasData: boolean;
  bmi: number | null;
  /** Whether the plan should add general conditioning work. This is NOT
   *  "burn fat from the waist/wherever" — spot reduction (losing fat from a
   *  specific area by training it) isn't how fat loss works physiologically;
   *  fat comes off in a pattern your body decides, not the muscle you train.
   *  What training *can* do is add conditioning volume that supports an
   *  overall calorie deficit, alongside genuinely building the underdeveloped
   *  muscles — which also reshapes proportions even without fat changing. */
  suggestConditioning: boolean;
  conditioningNote: string;
  /** A sustained multi-measurement trend, not just the latest snapshot —
   *  null when there isn't enough history (or waist wasn't recorded
   *  consistently) to say anything meaningful. Purely factual: no framing
   *  of "increasing" as good or bad, since that depends entirely on the
   *  person's own goals, which this app doesn't know. */
  waistTrend: MeasurementTrend | null;
}

export interface MeasurementTrend {
  direction: 'increasing' | 'decreasing';
  totalChangeCm: number;
  measurementCount: number;
}

const MUSCLE_LABELS_PT: Record<string, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quadriceps',
  hamstrings: 'Isquiotibiais',
  glutes: 'Gluteos',
  calves: 'Panturrilhas',
  abs: 'Abdominais',
  forearms: 'Antebraços',
  traps: 'Trapezio',
};

/**
 * A sustained trend across several measurements, not a single-point
 * comparison — compares the average of the earlier half of the given
 * history against the average of the later half (same approach already
 * used and tested in utils/fatigueSignals.ts), which smooths out a single
 * noisy reading (water retention on one particular day) while still
 * catching a real, consistent direction. Needs at least 3 measurements;
 * fewer than that isn't enough to call it a trend rather than noise.
 */
export function detectMeasurementTrend(
  values: number[], // chronological order, oldest first
  minChangeCm = 2,
): MeasurementTrend | null {
  if (values.length < 3) return null;

  const mid = Math.floor(values.length / 2);
  const earlier = values.slice(0, mid);
  const later = values.slice(mid);
  const earlierAvg = earlier.reduce((s, v) => s + v, 0) / earlier.length;
  const laterAvg = later.reduce((s, v) => s + v, 0) / later.length;
  const change = laterAvg - earlierAvg;

  if (Math.abs(change) < minChangeCm) return null;
  return {
    direction: change > 0 ? 'increasing' : 'decreasing',
    totalChangeCm: Math.round(Math.abs(change) * 10) / 10,
    measurementCount: values.length,
  };
}

export function analyzeBody(latest: BodyMetric | null, heightCm?: string | number | null, history?: BodyMetric[]): BodyAnalysis {
  if (!latest) {
    return {
      imbalances: [],
      focusAreas: [],
      summary: 'Sem medidas corporais registadas. Regista as tuas medidas para uma analise personalizada.',
      hasData: false,
      bmi: null,
      suggestConditioning: false,
      conditioningNote: '',
      waistTrend: null,
    };
  }

  const imbalances: MuscleImbalance[] = [];

  const arm = latest.arm || 0;
  const thigh = latest.thigh || 0;
  const chest = latest.chest || 0;
  const waist = latest.waist || 0;
  const hips = latest.hips || 0;

  // --- Muscle-growth priorities: legitimate, training volume drives this ---
  if (arm > 0 && thigh > 0) {
    const armToThigh = arm / thigh;
    if (armToThigh < 0.45) {
      imbalances.push({
        muscle: 'biceps',
        label: MUSCLE_LABELS_PT.biceps,
        severity: armToThigh < 0.38 ? 'high' : 'medium',
        description: 'Braços relativamente pequenos comparados com as pernas. Vale a pena dar mais volume a bíceps e tríceps.',
      });
    } else if (armToThigh > 0.62) {
      imbalances.push({
        muscle: 'quads',
        label: MUSCLE_LABELS_PT.quads,
        severity: armToThigh > 0.70 ? 'high' : 'medium',
        description: 'Pernas relativamente pequenas comparadas com os braços. Vale a pena dar mais volume a quadríceps e isquiotibiais.',
      });
    }
  }

  if (chest > 0 && waist > 0) {
    const chestToWaist = chest / waist;
    if (chestToWaist < 1.1) {
      imbalances.push({
        muscle: 'chest',
        label: MUSCLE_LABELS_PT.chest,
        severity: chestToWaist < 1.0 ? 'high' : 'low',
        description: 'Peito pouco desenvolvido em relação à cintura. Prioriza treino de peitoral para melhorar as proporções.',
      });
    }
  }

  if (thigh > 0 && chest > 0) {
    const thighToChest = thigh / chest;
    if (thighToChest < 0.55) {
      imbalances.push({
        muscle: 'quads',
        label: MUSCLE_LABELS_PT.quads,
        severity: thighToChest < 0.48 ? 'high' : 'medium',
        description: 'Pernas pequenas em relação ao tronco. Prioriza treino de pernas.',
      });
    } else if (thighToChest > 0.75) {
      imbalances.push({
        muscle: 'chest',
        label: MUSCLE_LABELS_PT.chest,
        severity: thighToChest > 0.82 ? 'high' : 'low',
        description: 'Tronco pequeno em relação às pernas. Prioriza peito, costas e ombros.',
      });
    }
  }

  if (chest > 0 && arm > 0) {
    const chestToArm = chest / arm;
    if (chestToArm > 4.5) {
      imbalances.push({
        muscle: 'biceps',
        label: MUSCLE_LABELS_PT.biceps,
        severity: 'low',
        description: 'Braços finos em relação ao peito. Adiciona mais volume de bíceps e tríceps.',
      });
    }
  }

  // --- Waist/hip: a body-composition signal, NOT a muscle to "target". ---
  // BUGFIX: this used to say training abs/cardio would "reduzir gordura
  // abdominal" (reduce belly fat) — that's the spot-reduction myth. Fat loss
  // location isn't something exercise choice controls; only overall energy
  // balance is. Kept as a signal that nudges general conditioning volume,
  // worded so it doesn't promise something training can't deliver.
  let suggestConditioning = false;
  let conditioningNote = '';
  if (waist > 0 && hips > 0) {
    const waistToHip = waist / hips;
    if (waistToHip > 0.9) {
      suggestConditioning = true;
      conditioningNote = 'A relação cintura/anca sugere que pode valer a pena somar mais condicionamento geral ao treino. Isto não "queima gordura da barriga" especificamente — a perda de gordura localizada não existe fisiologicamente — mas mais volume de condicionamento ajuda a apoiar um défice calórico geral, e construir os músculos em atraso muda a proporção visual mesmo sem a gordura mudar.';
    }
  }

  if (imbalances.length === 0) {
    imbalances.push(
      { muscle: 'back', label: MUSCLE_LABELS_PT.back, severity: 'low', description: 'Proporções equilibradas. Mantém um treino completo e equilibrado.' },
    );
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  imbalances.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const focusAreas = imbalances
    .filter(i => i.severity !== 'low' || imbalances.length <= 2)
    .slice(0, 4)
    .map(i => i.muscle);

  // BMI is only ever shown as loose context (it doesn't distinguish muscle
  // from fat), never used to drive the imbalance/focus logic above.
  let bmi: number | null = null;
  const h = typeof heightCm === 'string' ? parseFloat(heightCm) : heightCm;
  if (h && h > 0 && latest.weight) {
    const meters = h / 100;
    bmi = latest.weight / (meters * meters);
  }

  const highCount = imbalances.filter(i => i.severity === 'high').length;
  const summary = highCount > 0
    ? `Detectámos ${highCount} área(s) com prioridade alta para crescimento muscular. O plano vai focar em: ${focusAreas.map(m => MUSCLE_LABELS_PT[m]).join(', ')}.`
    : 'Proporções razoáveis. O plano vai dar atenção extra às áreas com maior potencial de melhoria.';

  // `history` is expected chronological (oldest first) and to already
  // include `latest` as its last element — a factual, separate signal from
  // the instantaneous waist/hip ratio above (that one needs BOTH waist and
  // hips together; this one is just "has waist itself been moving in one
  // direction lately", which can be worth knowing on its own).
  const waistValues = (history ?? [])
    .map(m => m.waist)
    .filter((w): w is number => w !== null && w !== undefined);
  const waistTrend = detectMeasurementTrend(waistValues);

  return { imbalances, focusAreas, summary, hasData: true, bmi, suggestConditioning, conditioningNote, waistTrend };
}

export function getMuscleLabel(muscle: MuscleGroup): string {
  return MUSCLE_LABELS_PT[muscle] || muscle;
}
