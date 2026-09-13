/**
 * Priority exercise keys for offline warm-cache (Phase 3/4).
 * No binary assets are bundled (keeps APK small) — these names are resolved
 * against the local DB's image_url/thumbnail_url and prefetched into
 * documentDirectory/exercise-media/ so they work offline after first open.
 *
 * Media source for curated staples: free-exercise-db (Unlicense), via
 * assets/data/exercise-media-matches.json + migrateEnrichExerciseMediaMatches.
 *
 * Keys are normalizeExerciseKey() values.
 */
export const OFFLINE_PRIORITY_EXERCISE_KEYS: readonly string[] = [
  // Push / chest
  'flexoes',
  'flexoes diamante',
  'flexoes inclinadas',
  'supino com barra',
  'supino com halteres',
  'supino inclinado com barra',
  // Pull / back
  'barra fixa pull up',
  'barra fixa pegada inversa chin up',
  'remada curvada com barra',
  'remada com halteres',
  'puxada frontal lat pulldown',
  'levantamento terra',
  'levantamento terra rumano',
  // Legs / glutes
  'agachamento com barra',
  'agachamento com halteres',
  'agachamento bulgariano',
  'afundadas com halteres',
  'afundadas em pe',
  'hip thrust com barra',
  'ponte de gluteos',
  'extensao de pernas leg extension',
  'cadeira flexora leg curl',
  'elevacao de gemeos em pe',
  // Shoulders / arms
  'press militar com barra',
  'elevacao lateral com halteres',
  'elevacao frontal com halteres',
  'curl com halteres',
  'curl martelo com halteres',
  'fundos de triceps',
  'extensao de triceps na polia',
  // Core / cardio staples
  'prancha',
  'prancha lateral',
  'crunch',
  'burpees',
  'mountain climbers',
] as const;

export const OFFLINE_PREFETCH_LIMIT = 40;
