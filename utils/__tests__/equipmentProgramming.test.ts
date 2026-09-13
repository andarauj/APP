import {
  complementaryClass,
  compareForAccessory,
  compareForPrimary,
  equipmentClass,
  pickNextSlotted,
  poolHasMixedClasses,
  prefersMachinePrimary,
} from '../equipmentProgramming';

describe('equipmentClass', () => {
  it('groups free-weight implements together', () => {
    expect(equipmentClass('barbell')).toBe('free');
    expect(equipmentClass('dumbbell')).toBe('free');
    expect(equipmentClass('ez_bar')).toBe('free');
    expect(equipmentClass('trap_bar')).toBe('free');
    expect(equipmentClass('kettlebell')).toBe('free');
  });

  it('treats Gymleco, generic machines, cables and Smith as the same guided class', () => {
    expect(equipmentClass('gymleco')).toBe('machine');
    expect(equipmentClass('machine')).toBe('machine');
    expect(equipmentClass('cable')).toBe('machine');
    expect(equipmentClass('smith')).toBe('machine');
  });

  it('keeps bodyweight and bands out of both training classes', () => {
    expect(equipmentClass('bodyweight')).toBe('body');
    expect(equipmentClass('band')).toBe('body');
    expect(equipmentClass('other')).toBe('other');
  });
});

describe('poolHasMixedClasses', () => {
  it('is true only when both a free implement and a machine/cable exist', () => {
    expect(poolHasMixedClasses([
      { equipment: 'barbell' },
      { equipment: 'machine' },
    ])).toBe(true);
    expect(poolHasMixedClasses([
      { equipment: 'barbell' },
      { equipment: 'dumbbell' },
    ])).toBe(false);
    expect(poolHasMixedClasses([
      { equipment: 'gymleco' },
      { equipment: 'cable' },
    ])).toBe(false);
  });
});

describe('prefersMachinePrimary', () => {
  it('is only for non-strength beginners', () => {
    expect(prefersMachinePrimary('hypertrophy', 'beginner')).toBe(true);
    expect(prefersMachinePrimary('endurance', 'beginner')).toBe(true);
    expect(prefersMachinePrimary('hypertrophy', 'intermediate')).toBe(false);
    expect(prefersMachinePrimary('strength', 'beginner')).toBe(false);
  });
});

describe('compareForPrimary / compareForAccessory', () => {
  const bench = { name: 'Supino com Barra', equipment: 'barbell' };
  const closeGrip = { name: 'Supino Apertado com Barra', equipment: 'barbell' };
  const machinePress = { name: 'Supino Maquina', equipment: 'machine' };
  const pecDeck = { name: 'Pec Deck', equipment: 'machine' };
  const cableFly = { name: 'Crossover no Cabo', equipment: 'cable' };

  it('hypertrophy intermediate prefers a free compound over a machine press', () => {
    expect(compareForPrimary(bench, machinePress, 'hypertrophy', 'intermediate')).toBeLessThan(0);
  });

  it('hypertrophy beginner prefers a machine compound over a free compound', () => {
    expect(compareForPrimary(machinePress, bench, 'hypertrophy', 'beginner')).toBeLessThan(0);
  });

  it('strength always prefers the free compound, even for beginners', () => {
    expect(compareForPrimary(bench, machinePress, 'strength', 'beginner')).toBeLessThan(0);
  });

  it('compounds beat isolation on the primary slot', () => {
    expect(compareForPrimary(machinePress, pecDeck, 'hypertrophy', 'beginner')).toBeLessThan(0);
  });

  it('prefers the shorter foundational name when class and compound match', () => {
    expect(compareForPrimary(bench, closeGrip, 'hypertrophy', 'intermediate')).toBeLessThan(0);
  });

  it('after a free primary, prefers machine isolation over another free lift', () => {
    expect(complementaryClass('free')).toBe('machine');
    expect(compareForAccessory(cableFly, closeGrip, 'free')).toBeLessThan(0);
    expect(compareForAccessory(pecDeck, machinePress, 'free')).toBeLessThan(0);
  });
});

describe('pickNextSlotted', () => {
  it('returns the primary free compound then the complementary machine isolation', () => {
    const pool = [
      { name: 'Supino Apertado com Barra', equipment: 'barbell' },
      { name: 'Supino com Barra', equipment: 'barbell' },
      { name: 'Crossover no Cabo', equipment: 'cable' },
      { name: 'Supino Maquina', equipment: 'machine' },
    ];
    const primary = pickNextSlotted(pool, null, 'hypertrophy', 'intermediate');
    expect(primary?.name).toBe('Supino com Barra');
    const rest = pool.filter(e => e.name !== primary?.name);
    const accessory = pickNextSlotted(rest, 'free', 'hypertrophy', 'intermediate');
    expect(accessory?.name).toBe('Crossover no Cabo');
  });
});
