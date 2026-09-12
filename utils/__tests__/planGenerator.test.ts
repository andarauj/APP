import { movementFamily, pickExercisesForDay, orderByMuscleGroup, getSplitDays, AVAILABLE_DAYS, shouldAddConditioningFinisher, suggestedDaysPerWeek, restSecondsFor } from '../planGenerator';
import type { Exercise, MuscleGroup } from '@/types';

function ex(id: number, name: string, primary_muscle: MuscleGroup, equipment: Exercise['equipment']): Exercise {
  return {
    id, name, primary_muscle, equipment,
    secondary_muscles: '', type: 'strength', instructions: '', is_custom: 0, created_at: 0,
  };
}

describe('movementFamily', () => {
  it('takes the first word as the movement family', () => {
    expect(movementFamily('Supino com Barra')).toBe('supino');
    expect(movementFamily('Supino Inclinado com Barra')).toBe('supino');
    expect(movementFamily('Crucifixo com Halteres')).toBe('crucifixo');
  });

  // BUGFIX regression test: found by reading a real generated plan where a
  // chest day ended up with three separate fly/crossover exercises (and no
  // real bench press in its working sets) because "Gymleco Crossover
  // Maquina" resolved to family "gymleco" instead of "crossover", so the
  // diversity check never recognized it as the same movement as "Crossover
  // no Cabo".
  it('skips a known equipment-brand prefix so the real movement is recognized', () => {
    expect(movementFamily('Gymleco Crossover Maquina (Pec Fly)')).toBe('crossover');
    expect(movementFamily('Gymleco Curl Biceps Maquina')).toBe('curl');
    expect(movementFamily('Crossover no Cabo')).toBe('crossover'); // matches the Gymleco version above
  });
});

describe('pickExercisesForDay diversifies by movement family', () => {
  // Regression test for the real bug found in this app: the generator used
  // to fill extra slots for a muscle by walking the equipment-priority-sorted
  // list from the top, which for a muscle with many same-movement variants
  // (flat/incline/decline bench press are all "barbell") picked several
  // near-identical exercises back to back.
  const chestPool: Exercise[] = [
    ex(1, 'Supino com Barra', 'chest', 'barbell'),
    ex(2, 'Supino Inclinado com Barra', 'chest', 'barbell'),
    ex(3, 'Supino Declinado com Barra', 'chest', 'barbell'),
    ex(4, 'Supino Apertado com Barra', 'chest', 'barbell'),
    ex(5, 'Crucifixo com Halteres', 'chest', 'dumbbell'),
    ex(6, 'Pullover com Halter', 'dumbbell' as MuscleGroup, 'dumbbell'), // unreachable via chest focus below on purpose
    ex(7, 'Crossover no Cabo', 'chest', 'cable'),
  ];

  it('does not pick 3+ variants of the same base movement when alternatives exist', () => {
    const picked = pickExercisesForDay(chestPool, ['chest'], 90, 'any', []);
    const families = picked.map(e => movementFamily(e.name));
    const supinoCount = families.filter(f => f === 'supino').length;
    // With 3 non-"supino" alternatives available (crucifixo, crossover, and
    // whichever others matched), the day should not be dominated by bench
    // press variants alone.
    expect(supinoCount).toBeLessThan(picked.length);
  });

  it('still fills the day even if it must eventually repeat a movement family', () => {
    // Only bench-press variants available — no alternative movement exists.
    const onlyBenchVariants: Exercise[] = [
      ex(1, 'Supino com Barra', 'chest', 'barbell'),
      ex(2, 'Supino Inclinado com Barra', 'chest', 'barbell'),
      ex(3, 'Supino Declinado com Barra', 'chest', 'barbell'),
      ex(4, 'Supino Apertado com Barra', 'chest', 'barbell'),
      ex(5, 'Supino Neutro com Halteres', 'chest', 'dumbbell'),
    ];
    const picked = pickExercisesForDay(onlyBenchVariants, ['chest'], 90, 'any', []);
    // Should still pick a reasonable number of exercises rather than
    // stopping early just because they all share a movement family.
    expect(picked.length).toBeGreaterThanOrEqual(4);
  });

  it('never returns duplicate exercise ids', () => {
    const picked = pickExercisesForDay(chestPool, ['chest'], 90, 'any', []);
    const ids = picked.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Regression test for a real generated plan reviewed with the user: the
  // plain "Supino com Barra" (flat bench) sorts AFTER "Supino Apertado com
  // Barra" (close-grip) alphabetically, so without a better tie-breaker the
  // close-grip specialty variant became the day's only barbell pick —
  // demoted to warmup — leaving zero actual bench press in the working
  // sets. Preferring the shorter (more foundational) name as a tie-breaker
  // fixes this.
  it('prefers the plain/foundational lift over a specialty variant when both share equipment priority', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino Apertado com Barra', 'chest', 'barbell'), // alphabetically first, but a specialty (close-grip) variant
      ex(2, 'Supino com Barra', 'chest', 'barbell'),          // the actual flat bench press
      ex(3, 'Crucifixo com Halteres', 'chest', 'dumbbell'),
      ex(4, 'Pullover com Halter', 'chest', 'dumbbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 90, 'any', []);
    expect(picked[0].name).toBe('Supino com Barra');
  });

  it('prefers an exercise the person has actually used, over the equipment-priority default', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino com Barra', 'chest', 'barbell'),   // top of the generic priority order, but never used
      ex(2, 'Crucifixo com Halteres', 'chest', 'dumbbell'), // lower priority, but a real personal staple
      ex(3, 'Pullover com Halter', 'chest', 'dumbbell'),
      ex(4, 'Crossover no Cabo', 'chest', 'cable'),
    ];
    const usageHistory = new Map([[2, 8]]); // 8 sessions of real use
    const picked = pickExercisesForDay(pool, ['chest'], 90, 'any', [], usageHistory);
    expect(picked[0].name).toBe('Crucifixo com Halteres');
  });

  it('breaks a tie between two used exercises by whichever has more sessions', () => {
    const pool: Exercise[] = [
      ex(1, 'Crucifixo com Halteres', 'chest', 'dumbbell'),
      ex(2, 'Pullover com Halter', 'chest', 'dumbbell'),
    ];
    const usageHistory = new Map([[1, 3], [2, 9]]);
    const picked = pickExercisesForDay(pool, ['chest'], 90, 'any', [], usageHistory);
    expect(picked[0].name).toBe('Pullover com Halter');
  });

  it('caps how much session count can dominate, so a long-time staple does not permanently block variety', () => {
    // Both exercises are used a lot — past the cap, the tie should fall
    // through to the next criterion instead of the raw (very different)
    // counts deciding it.
    const pool: Exercise[] = [
      ex(1, 'Supino Apertado com Barra', 'chest', 'barbell'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const usageHistory = new Map([[1, 200], [2, 15]]); // both well past the cap
    const picked = pickExercisesForDay(pool, ['chest'], 90, 'any', [], usageHistory);
    // Falls through to the existing foundational-lift tie-breaker, not the
    // wildly larger raw session count for the close-grip variant.
    expect(picked[0].name).toBe('Supino com Barra');
  });

  it('behaves exactly as before when no usage history is provided', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino Apertado com Barra', 'chest', 'barbell'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 90, 'any', []);
    expect(picked[0].name).toBe('Supino com Barra');
  });
});

// BUGFIX (found by generating a fresh leg day): the seed DB tags a lot of
// competitive Olympic weightlifting under ordinary muscle groups (Snatch →
// quads, Clean → hamstrings), and their one/two-word names made them win
// sortCandidates' prefer-the-shorter-name tie-break over legitimate anchor
// lifts like Barbell Squat — a generated "Pernas" day came back as
// Snatch/Clean/Kneeling Squat, none of them a sane 3x12-15 hypertrophy pick.
describe('pickExercisesForDay excludes Olympic-lift specialty movements', () => {
  it('never picks Snatch/Clean over an ordinary compound lift, even with no usage history to break the tie', () => {
    const pool: Exercise[] = [
      ex(1, 'Snatch', 'quads', 'barbell'),
      ex(2, 'Barbell Squat', 'quads', 'barbell'),
      ex(3, 'Clean', 'hamstrings', 'barbell'),
      ex(4, 'Romanian Deadlift', 'hamstrings', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['quads', 'hamstrings'], 45, 'any', []);
    const names = picked.map(e => e.name);
    expect(names).not.toContain('Snatch');
    expect(names).not.toContain('Clean');
    expect(names).toContain('Barbell Squat');
    expect(names).toContain('Romanian Deadlift');
  });

  it('still excludes them even if they have real usage history behind them', () => {
    const pool: Exercise[] = [
      ex(1, 'Snatch', 'quads', 'barbell'),
      ex(2, 'Barbell Squat', 'quads', 'barbell'),
    ];
    const usageHistory = new Map([[1, 10]]);
    const picked = pickExercisesForDay(pool, ['quads'], 45, 'any', [], usageHistory);
    expect(picked.map(e => e.name)).toEqual(['Barbell Squat']);
  });
});

describe('orderByMuscleGroup', () => {
  it('groups exercises by the focus muscle order given', () => {
    const mixed: Exercise[] = [
      ex(1, 'Rosca Direta', 'biceps', 'barbell'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
      ex(3, 'Elevacao Lateral', 'shoulders', 'dumbbell'),
      ex(4, 'Crucifixo', 'chest', 'dumbbell'),
    ];
    const ordered = orderByMuscleGroup(mixed, ['chest', 'shoulders', 'biceps']);
    const muscleOrder = ordered.map(e => e.primary_muscle);
    // All chest entries should come before all shoulders, which come before biceps.
    const lastChest = muscleOrder.lastIndexOf('chest');
    const firstShoulders = muscleOrder.indexOf('shoulders');
    const firstBiceps = muscleOrder.indexOf('biceps');
    expect(lastChest).toBeLessThan(firstShoulders);
    expect(firstShoulders).toBeLessThan(firstBiceps);
  });
});

describe('getSplitDays', () => {
  it('returns a day structure for every available days-per-week option', () => {
    for (const days of AVAILABLE_DAYS) {
      const split = getSplitDays(days);
      expect(split.length).toBeGreaterThan(0);
      for (const day of split) {
        expect(day.label.length).toBeGreaterThan(0);
        expect(day.focus.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('pickExercisesForDay with home_dumbbell equipment', () => {
  it('never picks gym-only equipment (barbell, machine, cable) even when a muscle has fewer than 2 home options', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino com Barra', 'chest', 'barbell'),
      ex(2, 'Supino Maquina', 'chest', 'machine'),
      ex(3, 'Crossover no Cabo', 'chest', 'cable'),
      ex(4, 'Flexoes', 'chest', 'bodyweight'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 30, 'home_dumbbell', []);
    // Only one true home option (bodyweight push-ups) exists for chest here
    // — home_dumbbell must still never leak the barbell/machine/cable ones in.
    expect(picked.every(p => p.equipment === 'dumbbell' || p.equipment === 'bodyweight')).toBe(true);
  });

  it('picks dumbbell and bodyweight exercises when both are available', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino com Halteres', 'chest', 'dumbbell'),
      ex(2, 'Crucifixo com Halteres', 'chest', 'dumbbell'),
      ex(3, 'Flexoes', 'chest', 'bodyweight'),
      ex(4, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 45, 'home_dumbbell', []);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.some(p => p.equipment === 'barbell')).toBe(false);
  });

  it('behaves the same as free_weights minus the gym-only fallback — an empty home pool returns nothing for that muscle rather than substituting gym equipment', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino com Barra', 'chest', 'barbell'),
      ex(2, 'Supino Maquina', 'chest', 'machine'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 30, 'home_dumbbell', []);
    expect(picked.filter(p => p.primary_muscle === 'chest')).toHaveLength(0);
  });
});

describe('pickExercisesForDay with allowedEquipment (fine-grained checklist)', () => {
  it('keeps only exercises whose equipment is in the list, ignoring equipmentPref entirely', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino com Barra', 'chest', 'barbell'),
      ex(2, 'Supino com Halteres', 'chest', 'dumbbell'),
      ex(3, 'Supino Maquina', 'chest', 'machine'),
    ];
    // equipmentPref is 'any' (would normally allow everything) but the
    // explicit checklist should still win.
    const picked = pickExercisesForDay(pool, ['chest'], 30, 'any', [], undefined, ['dumbbell']);
    expect(picked.every(p => p.equipment === 'dumbbell')).toBe(true);
  });

  it('does not fall back to a wider equipment set when the checklist has too few matches — an exact checklist is stricter than the coarse buckets', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino Maquina', 'chest', 'machine'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 30, 'any', [], undefined, ['band']);
    expect(picked).toHaveLength(0);
  });

  it('selecting only Gymleco still returns generic machine exercises — the seed database has none actually tagged gymleco', () => {
    const pool: Exercise[] = [
      ex(1, 'Supino Maquina', 'chest', 'machine'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 30, 'any', [], undefined, ['gymleco']);
    expect(picked.some(p => p.equipment === 'machine')).toBe(true);
    expect(picked.some(p => p.equipment === 'barbell')).toBe(false);
  });
});

describe('pickExercisesForDay with excludedMuscles (injuries)', () => {
  it('drops an excluded muscle from the day entirely, even if it was in focus', () => {
    const pool: Exercise[] = [
      ex(1, 'Desenvolvimento com Halteres', 'shoulders', 'dumbbell'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest', 'shoulders'], 45, 'any', [], undefined, undefined, ['shoulders']);
    expect(picked.some(p => p.primary_muscle === 'shoulders')).toBe(false);
    expect(picked.some(p => p.primary_muscle === 'chest')).toBe(true);
  });

  it('an excluded muscle is never added as a focus area either', () => {
    const pool: Exercise[] = [
      ex(1, 'Desenvolvimento com Halteres', 'shoulders', 'dumbbell'),
      ex(2, 'Supino com Barra', 'chest', 'barbell'),
    ];
    const picked = pickExercisesForDay(pool, ['chest'], 45, 'any', ['shoulders'], undefined, undefined, ['shoulders']);
    expect(picked.some(p => p.primary_muscle === 'shoulders')).toBe(false);
  });
});

describe('restSecondsFor', () => {
  it('gives compound movements more rest than isolation ones, for every goal', () => {
    for (const goal of ['strength', 'hypertrophy', 'endurance'] as const) {
      expect(restSecondsFor(goal, 'Barbell Back Squat')).toBeGreaterThan(restSecondsFor(goal, 'Leg Extension'));
    }
  });

  it('matches ACSM 2009\'s advanced-strength-phase split: 3-5min core lifts, 1-2min assistance work', () => {
    expect(restSecondsFor('strength', 'Deadlift')).toBeGreaterThanOrEqual(180);
    expect(restSecondsFor('strength', 'Deadlift')).toBeLessThanOrEqual(300);
    expect(restSecondsFor('strength', 'Bicep Curl')).toBeGreaterThanOrEqual(60);
    expect(restSecondsFor('strength', 'Bicep Curl')).toBeLessThanOrEqual(120);
  });

  it('hypertrophy rest is grounded above the old flat 30s default — ACSM\'s own floor is 60s', () => {
    expect(restSecondsFor('hypertrophy', 'Bench Press')).toBeGreaterThanOrEqual(60);
    expect(restSecondsFor('hypertrophy', 'Cable Crossover')).toBeGreaterThanOrEqual(60);
  });

  it('cardio and mobility are unaffected by the compound/isolation split', () => {
    expect(restSecondsFor('cardio', 'Treadmill Run')).toBe(restSecondsFor('cardio', 'Jumping Jacks'));
    expect(restSecondsFor('mobility', 'Hip Flexor Stretch')).toBe(restSecondsFor('mobility', 'World\'s Greatest Stretch'));
  });

  it('falls back to the hypertrophy table for an unrecognised goal', () => {
    expect(restSecondsFor('unknown' as any, 'Bench Press')).toBe(restSecondsFor('hypertrophy', 'Bench Press'));
  });
});

describe('suggestedDaysPerWeek', () => {
  it('suggests more days when a broad full-body split is too short to cover every muscle group', () => {
    // 2 days/week -> Full Body split, busiest day needs 5 muscle groups;
    // 30min/session only affords 4 exercises (the generator's own floor).
    expect(suggestedDaysPerWeek(2, 30)).toBe(3); // 3 days -> Push/Pull/Legs, busiest day needs only 4
  });

  it('suggests more days for a single full-body day too short for its own focus', () => {
    expect(suggestedDaysPerWeek(1, 30)).toBe(3);
  });

  it('returns null when the chosen days/week already covers every muscle group', () => {
    expect(suggestedDaysPerWeek(3, 30)).toBeNull(); // Push/Pull/Legs already fits a 30min session
    expect(suggestedDaysPerWeek(5, 30)).toBeNull(); // Bro split's busiest day (Pernas) already fits
  });

  it('returns null once minutes/session is long enough regardless of split breadth', () => {
    expect(suggestedDaysPerWeek(2, 75)).toBeNull(); // 75min affords 6 exercises, covers Full Body's 5
  });

  it('never suggests fewer days than what was chosen', () => {
    const result = suggestedDaysPerWeek(4, 30);
    if (result !== null) expect(result).toBeGreaterThan(4);
  });
});

describe('shouldAddConditioningFinisher', () => {
  it('never adds a finisher when the body analysis did not suggest conditioning', () => {
    expect(shouldAddConditioningFinisher(false, 90)).toBe(false);
  });

  it('never adds a finisher for a session of 60 minutes or less, even when suggested', () => {
    expect(shouldAddConditioningFinisher(true, 30)).toBe(false);
    expect(shouldAddConditioningFinisher(true, 45)).toBe(false);
    expect(shouldAddConditioningFinisher(true, 60)).toBe(false); // exactly 60 does NOT count as "superior a 60"
  });

  it('adds a finisher for a session longer than 60 minutes when suggested', () => {
    expect(shouldAddConditioningFinisher(true, 75)).toBe(true);
    expect(shouldAddConditioningFinisher(true, 90)).toBe(true);
  });

  it('requires both conditions — long session alone is not enough without the body-analysis signal', () => {
    expect(shouldAddConditioningFinisher(false, 90)).toBe(false);
  });
});
