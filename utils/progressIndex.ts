export interface ProgressComponent {
  key: 'consistency' | 'volume' | 'balance' | 'progression';
  label: string;
  score: number; // 0-25
  maxScore: 25;
  explanation: string;
}

export interface ProgressIndexResult {
  score: number; // 0-100, sum of the four components
  components: ProgressComponent[];
  trend: 'up' | 'down' | 'stable' | null;
}

export interface ProgressIndexInput {
  sessionsThisWeek: number;
  /** Average sessions/week over recent history (excluding this week), for
   *  judging consistency against the person's own typical rhythm rather than
   *  an arbitrary "you should train N times" number. */
  avgSessionsPerWeek: number;
  volumeThisWeek: number;
  /** Average weekly volume over the last few weeks (excluding this week). */
  avgWeeklyVolume: number;
  /** Sets per muscle group in the last 14 days (a 2-week window is forgiving
   *  of normal push/pull/legs or upper/lower splits that don't hit every
   *  muscle every single week). */
  muscleSetsRecent: { muscle: string; sets: number }[];
  /** PRs achieved and distinct exercises trained in the last 30 days. */
  prCountRecent: number;
  exercisesTrainedRecent: number;
  /** Last week's score, if available, purely to show a trend arrow. */
  previousScore: number | null;
}

// Muscle groups counted for the balance component. Cardio/mobility/fullbody
// are excluded — they're not "a muscle to balance training across" the way
// the others are.
const BALANCE_MUSCLES = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs',
];
const MIN_SETS_TO_COUNT_AS_TRAINED = 4;

/**
 * A single weekly "how's my training going" number (0-100), computed
 * transparently from data already tracked in this app, with every point
 * explained rather than an opaque black-box score.
 *
 * Deliberately simple and honest about its limits: it reflects training
 * *pattern* (showed up, kept up volume, trained broadly, kept progressing),
 * not recovery, sleep, nutrition, or injury risk — things this app has no
 * way to know about.
 */
export function computeProgressIndex(input: ProgressIndexInput): ProgressIndexResult {
  const components: ProgressComponent[] = [];

  // 1) Consistency — this week's sessions against your OWN recent average,
  // not a prescribed target. New users (no average yet) get full marks for
  // any training at all, since there's no track record to compare against.
  let consistencyScore: number;
  let consistencyExplanation: string;
  if (input.avgSessionsPerWeek <= 0) {
    consistencyScore = input.sessionsThisWeek > 0 ? 25 : 0;
    consistencyExplanation = input.sessionsThisWeek > 0
      ? `${input.sessionsThisWeek} treino(s) esta semana — ainda a construir o teu histórico.`
      : 'Sem treinos esta semana ainda.';
  } else {
    const ratio = input.sessionsThisWeek / input.avgSessionsPerWeek;
    consistencyScore = Math.max(0, Math.min(25, Math.round(25 * ratio)));
    consistencyExplanation = `${input.sessionsThisWeek} de uma média de ${input.avgSessionsPerWeek.toFixed(1)} treinos/semana.`;
  }
  components.push({
    key: 'consistency', label: 'Consistência', score: consistencyScore, maxScore: 25,
    explanation: consistencyExplanation,
  });

  // 2) Volume — this week vs your own recent average. Meeting or exceeding
  // it earns full marks; only falling short costs points. Whether "doing
  // even more" is wise depends on recovery/nutrition this app can't see, so
  // the score doesn't penalize higher volume, only a drop-off.
  let volumeScore: number;
  let volumeExplanation: string;
  if (input.avgWeeklyVolume <= 0) {
    volumeScore = input.volumeThisWeek > 0 ? 25 : 0;
    volumeExplanation = input.volumeThisWeek > 0
      ? 'Primeiras semanas de treino registadas.'
      : 'Sem volume registado esta semana.';
  } else {
    const ratio = input.volumeThisWeek / input.avgWeeklyVolume;
    volumeScore = Math.max(0, Math.min(25, Math.round(25 * Math.min(ratio, 1))));
    const pct = Math.round(ratio * 100);
    volumeExplanation = `${pct}% do teu volume médio semanal (${Math.round(input.avgWeeklyVolume)}kg).`;
  }
  components.push({
    key: 'volume', label: 'Volume', score: volumeScore, maxScore: 25,
    explanation: volumeExplanation,
  });

  // 3) Balance — how many major muscle groups got meaningful work in the
  // last two weeks. A 2-week window (not 1) is forgiving of normal splits.
  const trainedMuscles = new Set(
    input.muscleSetsRecent
      .filter(m => BALANCE_MUSCLES.includes(m.muscle) && m.sets >= MIN_SETS_TO_COUNT_AS_TRAINED)
      .map(m => m.muscle)
  );
  const balanceRatio = trainedMuscles.size / BALANCE_MUSCLES.length;
  const balanceScore = Math.round(25 * balanceRatio);
  components.push({
    key: 'balance', label: 'Equilíbrio Muscular', score: balanceScore, maxScore: 25,
    explanation: `${trainedMuscles.size} de ${BALANCE_MUSCLES.length} grupos musculares principais trabalhados nas últimas 2 semanas.`,
  });

  // 4) Progression — PRs relative to how many different exercises you've
  // actually been training, over the last month. Scaled so hitting a PR on
  // roughly a third of your trained exercises earns full marks — expecting
  // a PR on literally everything, every month, isn't realistic.
  let progressionScore: number;
  let progressionExplanation: string;
  if (input.exercisesTrainedRecent <= 0) {
    progressionScore = 0;
    progressionExplanation = 'Sem exercícios treinados no último mês.';
  } else {
    const prRate = input.prCountRecent / input.exercisesTrainedRecent;
    progressionScore = Math.max(0, Math.min(25, Math.round(25 * prRate * 3)));
    progressionExplanation = `${input.prCountRecent} recorde(s) pessoal em ${input.exercisesTrainedRecent} exercícios treinados (últimos 30 dias).`;
  }
  components.push({
    key: 'progression', label: 'Progressão', score: progressionScore, maxScore: 25,
    explanation: progressionExplanation,
  });

  const score = components.reduce((sum, c) => sum + c.score, 0);

  let trend: ProgressIndexResult['trend'] = null;
  if (input.previousScore !== null) {
    const diff = score - input.previousScore;
    trend = diff > 3 ? 'up' : diff < -3 ? 'down' : 'stable';
  }

  return { score, components, trend };
}
