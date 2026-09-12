/**
 * Pure helpers for mutating an in-progress workout session's exercise
 * order. Kept out of app/workout/active.tsx on purpose — that file already
 * broke once from an untested refactor (see ESTADO.md's "Dívida
 * conhecida") — so the actual reordering logic lives here where it can be
 * exhaustively unit tested against plain arrays, and the screen only calls
 * it.
 */

/**
 * Swaps the exercise at `index` with its neighbor in `direction` (-1 up,
 * +1 down). Returns the same array reference, unmodified, if the move
 * would go out of bounds — callers can treat "no-op" and "moved" the same
 * way rather than checking bounds themselves.
 *
 * Deliberately generic and position-only: it never reads or rewrites
 * anything inside an exercise (its sets, dbId, done flags, set_index...),
 * so a session's already-logged sets stay exactly as they were — only
 * which position in the outer array holds which exercise object changes.
 * Every existing handler in active.tsx (completeSet, handleAddSet, etc.)
 * already looks up "the exercise currently at index N" fresh on each
 * render, so this needs no companion changes to session/timer logic.
 */
export function moveExerciseInSession<T>(exercises: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= exercises.length || target < 0 || target >= exercises.length) {
    return exercises;
  }
  const result = exercises.slice();
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
