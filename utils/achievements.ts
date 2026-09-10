export type AchievementCategory = 'workouts' | 'streak' | 'prs' | 'volume';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  threshold: number;
}

export interface AchievementStats {
  totalWorkouts: number;
  longestStreak: number;
  prCount: number;
  totalVolume: number;
}

// Thresholds chosen to feel like real milestones, not arbitrary round
// numbers picked for their own sake — e.g. streaks follow the "it takes
// about 2 weeks to build a habit, a month to prove it" pattern; volume
// milestones are spaced so each one feels like a genuine jump, not a
// trickle of participation-trophy unlocks every session.
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'workouts_1', title: 'Primeiro Treino', description: 'Completaste o teu primeiro treino na app.', category: 'workouts', threshold: 1 },
  { id: 'workouts_10', title: 'A Criar Hábito', description: '10 treinos completos.', category: 'workouts', threshold: 10 },
  { id: 'workouts_25', title: 'Regularidade', description: '25 treinos completos.', category: 'workouts', threshold: 25 },
  { id: 'workouts_50', title: 'Meio Cento', description: '50 treinos completos.', category: 'workouts', threshold: 50 },
  { id: 'workouts_100', title: 'Três Dígitos', description: '100 treinos completos.', category: 'workouts', threshold: 100 },
  { id: 'workouts_250', title: 'Veterano', description: '250 treinos completos.', category: 'workouts', threshold: 250 },
  { id: 'workouts_500', title: 'Estilo de Vida', description: '500 treinos completos. Isto já não é uma fase.', category: 'workouts', threshold: 500 },

  { id: 'streak_3', title: 'A Aquecer', description: '3 dias seguidos de treino.', category: 'streak', threshold: 3 },
  { id: 'streak_7', title: 'Uma Semana Inteira', description: '7 dias seguidos de treino.', category: 'streak', threshold: 7 },
  { id: 'streak_14', title: 'Duas Semanas', description: '14 dias seguidos de treino.', category: 'streak', threshold: 14 },
  { id: 'streak_30', title: 'Um Mês Sem Falhar', description: '30 dias seguidos de treino.', category: 'streak', threshold: 30 },
  { id: 'streak_60', title: 'Dois Meses de Ferro', description: '60 dias seguidos de treino.', category: 'streak', threshold: 60 },
  { id: 'streak_100', title: 'Cem Dias', description: '100 dias seguidos de treino. A sério.', category: 'streak', threshold: 100 },

  { id: 'prs_1', title: 'Primeiro Recorde', description: 'O teu primeiro recorde pessoal.', category: 'prs', threshold: 1 },
  { id: 'prs_5', title: 'Em Progressão', description: '5 recordes pessoais batidos.', category: 'prs', threshold: 5 },
  { id: 'prs_10', title: 'Dez Recordes', description: '10 recordes pessoais batidos.', category: 'prs', threshold: 10 },
  { id: 'prs_25', title: 'Recordista', description: '25 recordes pessoais batidos.', category: 'prs', threshold: 25 },
  { id: 'prs_50', title: 'Sempre a Subir', description: '50 recordes pessoais batidos.', category: 'prs', threshold: 50 },

  { id: 'volume_10000', title: 'Dez Toneladas', description: '10.000kg levantados no total.', category: 'volume', threshold: 10000 },
  { id: 'volume_50000', title: 'Cinquenta Toneladas', description: '50.000kg levantados no total.', category: 'volume', threshold: 50000 },
  { id: 'volume_100000', title: 'Cem Toneladas', description: '100.000kg levantados no total.', category: 'volume', threshold: 100000 },
  { id: 'volume_500000', title: 'Meio Milhão', description: '500.000kg levantados no total.', category: 'volume', threshold: 500000 },
  { id: 'volume_1000000', title: 'Um Milhão de Quilos', description: '1.000.000kg levantados no total. Um Boeing 737 pesa menos que isto.', category: 'volume', threshold: 1000000 },
];

function statForCategory(stats: AchievementStats, category: AchievementCategory): number {
  switch (category) {
    case 'workouts': return stats.totalWorkouts;
    case 'streak': return stats.longestStreak;
    case 'prs': return stats.prCount;
    case 'volume': return stats.totalVolume;
  }
}

export function getUnlockedAchievementIds(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter(a => statForCategory(stats, a.category) >= a.threshold).map(a => a.id);
}

/** Achievements unlocked now that weren't in the previously-seen list — the
 *  ones worth celebrating with a notification, as opposed to ones already
 *  acknowledged in an earlier session. */
export function getNewlyUnlocked(previouslySeenIds: string[], stats: AchievementStats): Achievement[] {
  const currentIds = new Set(getUnlockedAchievementIds(stats));
  return ACHIEVEMENTS.filter(a => currentIds.has(a.id) && !previouslySeenIds.includes(a.id));
}

/** For a locked achievement, how close the person is (0 to 1) — used to
 *  show a progress bar rather than just a binary locked/unlocked state. */
export function getProgressToward(achievement: Achievement, stats: AchievementStats): number {
  const current = statForCategory(stats, achievement.category);
  return Math.min(1, current / achievement.threshold);
}
