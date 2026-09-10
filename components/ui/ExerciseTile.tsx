import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Dumbbell, CircleDot, Waves, PersonStanding, Weight, Cog, Zap,
} from 'lucide-react-native';
import type { Equipment, MuscleGroup } from '@/types';

/**
 * Colored icon tile for an exercise, in the visual language used across
 * modern workout apps (a colored square with an equipment glyph per list
 * row) instead of a plain text row. Color is driven by muscle group so the
 * eye can scan a workout and immediately see the muscles it covers, and the
 * icon communicates the equipment at a glance.
 */

// One accent color per muscle group, tuned to stay legible on both the dark
// and light theme (mid-saturation, similar perceived lightness).
const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: '#3B82F6',
  back: '#8B5CF6',
  shoulders: '#F59E0B',
  biceps: '#10B981',
  triceps: '#14B8A6',
  forearms: '#84CC16',
  abs: '#EF4444',
  quads: '#EC4899',
  hamstrings: '#D946EF',
  glutes: '#F97316',
  calves: '#06B6D4',
  traps: '#6366F1',
  lats: '#8B5CF6',
  cardio: '#F43F5E',
  fullbody: '#0EA5E9',
  mobility: '#22C55E',
};

const EQUIPMENT_ICONS: Record<Equipment, any> = {
  barbell: Dumbbell,
  dumbbell: Dumbbell,
  machine: Cog,
  cable: Waves,
  bodyweight: PersonStanding,
  kettlebell: Weight,
  band: Zap,
  plate: CircleDot,
  ez_bar: Dumbbell,
  smith: Cog,
  trap_bar: Dumbbell,
  medicine_ball: CircleDot,
  foam_roller: CircleDot,
  gymleco: Cog,
  other: Dumbbell,
};

export function muscleColor(muscle: MuscleGroup): string {
  return MUSCLE_COLORS[muscle] || '#64748B';
}

interface ExerciseTileProps {
  muscle: MuscleGroup;
  equipment: Equipment;
  size?: number;
}

// PERF: rendered in every row of every exercise list across the app
// (Exercícios, Treino ativo, editor de planos...) — memoized so a row only
// re-renders when its own muscle/equipment/size actually change, not
// whenever the parent list re-renders for an unrelated reason.
export const ExerciseTile = memo(function ExerciseTile({ muscle, equipment, size = 44 }: ExerciseTileProps) {
  const color = muscleColor(muscle);
  const Icon = EQUIPMENT_ICONS[equipment] || Dumbbell;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: color + '26' }]}>
      <Icon size={size * 0.5} color={color} strokeWidth={2.2} />
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
