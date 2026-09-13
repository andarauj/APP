/**
 * Offline / CI helper for exercise catalogue normalisation.
 *
 * Runtime merges happen in db/database.ts (migrateExerciseCatalogNormalize*).
 *
 *   node --experimental-strip-types scripts/normalize_exercises.ts
 *   # or: npx tsx scripts/normalize_exercises.ts
 */

import {
  normalizeExerciseKey,
  resolveCanonicalKey,
  EXERCISE_DISPLAY_RENAMES,
  EXERCISE_MERGE_ALIASES,
  mediaDonorKeysFor,
} from '../utils/exerciseNormalize';

function main() {
  console.log('Exercise catalogue normalisation rules\n');
  console.log(`Display renames: ${Object.keys(EXERCISE_DISPLAY_RENAMES).length}`);
  for (const [from, to] of Object.entries(EXERCISE_DISPLAY_RENAMES).slice(0, 20)) {
    console.log(`  ${from}  →  ${to}`);
  }
  if (Object.keys(EXERCISE_DISPLAY_RENAMES).length > 20) console.log('  …');
  console.log(`\nMerge aliases: ${Object.keys(EXERCISE_MERGE_ALIASES).length}`);
  console.log('\nExamples:');
  console.log('  normalize(Flexões Diamante) =', normalizeExerciseKey('Flexões Diamante'));
  console.log('  resolve(Diamond Push-up)    =', resolveCanonicalKey('Diamond Push-up'));
  console.log('  resolve(Pull-up)            =', resolveCanonicalKey('Pull-up'));
  console.log('  donors(Flexões)             =', mediaDonorKeysFor(normalizeExerciseKey('Flexões')).slice(0, 5));
}

main();
