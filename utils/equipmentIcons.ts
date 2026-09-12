import { Dumbbell, CircleDot, Waves, PersonStanding, Weight, Cog, Zap, type LucideIcon } from 'lucide-react-native';
import type { Equipment } from '@/types';

/** One glyph per equipment type — shared by ExerciseTile (the colored
 *  thumbnail) and ExerciseListItem (the small inline equipment icon), so
 *  the same equipment always reads as the same icon everywhere it appears. */
export const EQUIPMENT_ICON: Record<Equipment, LucideIcon> = {
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
