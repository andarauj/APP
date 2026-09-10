export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'traps'
  | 'lats'
  | 'cardio'
  | 'fullbody'
  | 'mobility';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'plate'
  | 'ez_bar'
  | 'smith'
  | 'trap_bar'
  | 'medicine_ball'
  | 'foam_roller'
  | 'gymleco'
  | 'other';

export type ExerciseType = 'strength' | 'cardio' | 'mobility';

export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure' | 'amrap';

export type PlanType = 'strength' | 'hypertrophy' | 'endurance' | 'cardio' | 'mobility';

export type SplitType = 'abc' | 'ppl' | 'fullbody' | 'upper_lower' | 'bro' | 'custom';

export interface Exercise {
  id: number;
  name: string;
  primary_muscle: MuscleGroup;
  secondary_muscles: string; // comma-separated
  equipment: Equipment;
  type: ExerciseType;
  instructions: string;
  is_custom: number; // 0 or 1
  created_at: number;
  image_url?: string; // imagem da ExerciseDB (se disponível)
  api_id?: string; // ID da ExerciseDB (para sincronização)
  api_source?: string; // fonte da API (ex: "exercisedb")
  user_notes?: string; // notas do utilizador
  media_uri?: string; // URI de media do utilizador
  alt_names?: string; // nomes alternativos para pesquisa
  video_url?: string; // URL de vídeo do ExerciseDB ou gerado
  video_cached_path?: string; // caminho local de vídeo em cache
}

export interface WorkoutPlan {
  id: number;
  name: string;
  description: string;
  plan_type: PlanType;
  split_type: SplitType;
  is_auto_generated: number; // 0 or 1
  created_at: number;
  updated_at: number;
}

export interface PlanExercise {
  id: number;
  plan_id: number;
  exercise_id: number;
  order_index: number;
  sets: number;
  reps_target: string;
  weight_target: number;
  rest_seconds: number;
  set_type: SetType;
  superset_group: number | null;
  /** Name of the training day this exercise belongs to (e.g. "Push", "Pernas"). */
  day_label: string;
  /** Order of the training day within the plan (0-based). */
  day_index: number;
  /** Rep cadence like "3-1-2-0" (down-pause-up-pause, seconds). */
  tempo: string;
  notes: string;
}

export interface PlanDay {
  day_index: number;
  day_label: string;
  exercise_count: number;
}

export interface WorkoutSession {
  id: number;
  plan_id: number | null;
  name: string;
  started_at: number;
  ended_at: number | null;
  total_duration: number;
  total_volume: number;
  total_sets: number;
  notes: string;
}

export interface WorkoutSet {
  id: number;
  session_id: number;
  exercise_id: number;
  set_index: number;
  reps: number;
  weight: number;
  rpe: number | null;
  rest_seconds: number;
  set_duration: number;
  set_type: SetType;
  completed_at: number;
  is_pr: number;
}

export interface BodyMetric {
  id: number;
  date: number;
  weight: number | null;
  body_fat: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  arm: number | null;
  thigh: number | null;
  back: number | null;
  /** URI of a progress photo taken/attached for this measurement entry. */
  photo_uri: string | null;
}

export interface PersonalRecord {
  exercise_id: number;
  exercise_name: string;
  max_weight: number;
  max_reps: number;
  max_volume: number;
  estimated_1rm: number;
  date_achieved: number;
}

export const MUSCLE_GROUPS_PT: Record<MuscleGroup, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebraços',
  abs: 'Abdominais',
  quads: 'Quadríceps',
  hamstrings: 'Isquiotibiais',
  glutes: 'Glúteos',
  calves: 'Panturrilhas',
  traps: 'Trapézio',
  lats: 'Dorsais',
  cardio: 'Cardio',
  fullbody: 'Corpo Inteiro',
  mobility: 'Mobilidade',
};

export const EQUIPMENT_PT: Record<Equipment, string> = {
  barbell: 'Barra',
  dumbbell: 'Halteres',
  machine: 'Máquina',
  cable: 'Cabo',
  bodyweight: 'Peso Corporpo',
  kettlebell: 'Kettlebell',
  band: 'Elastico',
  plate: 'Disco',
  ez_bar: 'Barra EZ',
  smith: 'Smith',
  trap_bar: 'Trap Bar',
  medicine_ball: 'Bola Medicinal',
  foam_roller: 'Foam Roller',
  gymleco: 'Gymleco',
  other: 'Outro',
};

export const SET_TYPE_PT: Record<SetType, string> = {
  normal: 'Normal',
  warmup: 'Aquecimento',
  dropset: 'Drop Set',
  failure: 'Falha',
  amrap: 'AMRAP',
};

export const PLAN_TYPE_PT: Record<PlanType, string> = {
  strength: 'Força',
  hypertrophy: 'Hipertrofia',
  endurance: 'Resistência',
  cardio: 'Cardio',
  mobility: 'Mobilidade',
};

export const SPLIT_TYPE_PT: Record<SplitType, string> = {
  abc: 'ABC',
  ppl: 'Push/Pull/Legs',
  fullbody: 'Full Body',
  upper_lower: 'Upper/Lower',
  bro: 'Bro Split',
  custom: 'Personalizado',
};
