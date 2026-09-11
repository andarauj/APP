/**
 * Live coaching tips — generated during a workout based on RPE, reps, weight, and exercise history.
 * These are real-time suggestions a coach might give mid-set.
 */

import { getDatabase } from '@/db/database';

export interface CoachingTip {
  type: 'positive' | 'warning' | 'info' | 'tip';
  icon: 'fire' | 'alert' | 'target' | 'lightbulb' | 'arrow-up' | 'pulse';
  title: string;
  message: string;
  priority: number; // 1-10, higher = show first
}

interface SetContext {
  exerciseId: number;
  exerciseName: string;
  reps: number;
  weight: number;
  rpe: number | null;
  lastSetRpe?: number | null;
  lastSetReps?: number;
  lastSetWeight?: number;
}

/**
 * Generate live coaching tips for current set being logged
 */
export async function generateLiveCoachingTips(context: SetContext): Promise<CoachingTip[]> {
  const tips: CoachingTip[] = [];
  const db = await getDatabase();

  try {
    // 1) RPE analysis — is the user pushing hard enough?
    if (context.rpe !== null) {
      if (context.rpe <= 5) {
        tips.push({
          type: 'info',
          icon: 'lightbulb',
          title: 'Fácil demais?',
          message: `RPE ${context.rpe} é muito confortável. Aumenta o peso ou faz mais reps para mais estímulo.`,
          priority: 5,
        });
      } else if (context.rpe >= 9 && context.reps < 3) {
        tips.push({
          type: 'warning',
          icon: 'alert',
          title: 'Muito perto do limite',
          message: `RPE ${context.rpe} com poucos reps (${context.reps}). Risco de injury. Reduz peso no próximo set.`,
          priority: 8,
        });
      } else if (context.rpe >= 8 && context.rpe <= 8.5 && context.reps >= 4) {
        tips.push({
          type: 'positive',
          icon: 'fire',
          title: 'Zona ótima de hipertrofia!',
          message: `RPE ${context.rpe} com ${context.reps} reps = estímulo excelente para crescimento.`,
          priority: 9,
        });
      }
    }

    // 2) Rep progression check
    if (context.lastSetReps !== undefined && context.lastSetWeight === context.weight) {
      if (context.reps > context.lastSetReps) {
        const delta = context.reps - context.lastSetReps;
        tips.push({
          type: 'positive',
          icon: 'arrow-up',
          title: 'Progresso +' + delta + ' reps!',
          message: `Na última vez fizeste ${context.lastSetReps}, agora fizeste ${context.reps}. Continua assim!`,
          priority: 7,
        });
      } else if (context.reps < context.lastSetReps - 2) {
        tips.push({
          type: 'warning',
          icon: 'alert',
          title: 'Menos reps que a última vez',
          message: `Última sessão: ${context.lastSetReps} reps. Hoje: ${context.reps}. Podes estar cansado — descansa bem.`,
          priority: 6,
        });
      }
    }

    // 3) Weight progression opportunity
    if (context.lastSetWeight !== undefined && context.rpe !== null) {
      const weightIncrease = context.weight - (context.lastSetWeight || 0);
      if (weightIncrease > 0 && context.rpe <= 7) {
        tips.push({
          type: 'positive',
          icon: 'arrow-up',
          title: 'Subiste +' + weightIncrease.toFixed(1) + 'kg e ainda confortável!',
          message: `RPE ${context.rpe} com mais peso. Excelente progressão!`,
          priority: 6,
        });
      } else if (weightIncrease > 2.5 && context.rpe >= 8.5 && context.reps < 4) {
        tips.push({
          type: 'warning',
          icon: 'alert',
          title: 'Salto grande de peso',
          message: `+${weightIncrease.toFixed(1)}kg é um aumento grande. Pensa em aumentos mais graduais.`,
          priority: 5,
        });
      }
    }

    // 4) Historical trend — is this exercise stalling?
    const lastFiveForExercise = await db.getAllAsync<{ weight: number; reps: number; rpe: number | null }>(
      `SELECT weight, reps, rpe FROM workout_sets 
       WHERE exercise_id = ? AND set_type != 'warmup'
       ORDER BY completed_at DESC LIMIT 5`,
      [context.exerciseId]
    );

    if (lastFiveForExercise.length >= 3) {
      const recentVolumes = lastFiveForExercise.slice(0, 3).map(s => s.weight * s.reps);
      const isStalling = recentVolumes.every((v, i) => i === 0 || v <= recentVolumes[i - 1] + 0.1); // allow tiny variance
      if (isStalling && recentVolumes[0] > 0) {
        tips.push({
          type: 'info',
          icon: 'target',
          title: 'Volume estagnado nas últimas 3 sessões',
          message: `${context.exerciseName} não progrediu. Tenta um novo ângulo ou técnica diferente.`,
          priority: 4,
        });
      }
    }

    // 5) Recovery cue — RPE trend
    if (context.lastSetRpe !== undefined && context.lastSetRpe !== null && context.rpe !== null && context.lastSetRpe < context.rpe) {
      const rpeDelta = context.rpe - context.lastSetRpe;
      if (rpeDelta >= 1.5) {
        tips.push({
          type: 'warning',
          icon: 'pulse',
          title: `RPE subiu +${rpeDelta.toFixed(1)}`,
          message: `Set passado: RPE ${context.lastSetRpe}, agora: RPE ${context.rpe}. Sinal de fadiga acumulada.`,
          priority: 5,
        });
      }
    }

    // 6) All-time PR check
    const allTimeMax = await db.getFirstAsync<{ maxWeight: number; maxReps: number }>(
      `SELECT MAX(weight) as maxWeight, MAX(reps) as maxReps FROM workout_sets WHERE exercise_id = ? AND set_type != 'warmup'`,
      [context.exerciseId]
    );

    if (allTimeMax && allTimeMax.maxWeight > 0) {
      const isNewMaxWeight = context.weight > allTimeMax.maxWeight;
      const isNewMaxReps = context.reps > allTimeMax.maxReps;
      if (isNewMaxWeight || isNewMaxReps) {
        tips.push({
          type: 'positive',
          icon: 'fire',
          title: 'NOVO RECORDE! 🎉',
          message: `${isNewMaxWeight ? '+' + (context.weight - allTimeMax.maxWeight).toFixed(1) + 'kg' : ''}${isNewMaxWeight && isNewMaxReps ? ' e ' : ''}${isNewMaxReps ? '+' + (context.reps - allTimeMax.maxReps) + ' reps' : ''}`,
          priority: 10,
        });
      }
    }

    // 7) Form/technique tip based on high RPE with low reps
    if (context.rpe !== null && context.rpe >= 8.5 && context.reps < 2) {
      tips.push({
        type: 'tip',
        icon: 'lightbulb',
        title: 'Presta atenção à forma',
        message: `Com RPE tão alto e poucos reps, qualidade de forma é crítica. Não cumpra reps — qualidade acima de quantidade.`,
        priority: 6,
      });
    }

  } catch (err) {
    console.error('Error generating coaching tips:', err);
  }

  // Sort by priority (highest first)
  return tips.sort((a, b) => b.priority - a.priority);
}

/**
 * Icon mapping for UI rendering
 */
export const COACHING_ICON_MAP = {
  fire: 'flame',
  alert: 'alert-circle',
  target: 'target',
  lightbulb: 'lightbulb',
  'arrow-up': 'trending-up',
  pulse: 'activity',
} as const;

/**
 * Color mapping for tip types
 */
export const COACHING_TIP_COLOR = {
  positive: '#10b981', // green
  warning: '#f59e0b', // amber
  info: '#3b82f6', // blue
  tip: '#8b5cf6', // purple
} as const;
