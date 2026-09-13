import { idsOverSubcategoryCap } from '../planDedup';

describe('idsOverSubcategoryCap', () => {
  it('keeps the first chest isolation and drops later flies / crossovers', () => {
    const extra = idsOverSubcategoryCap([
      { id: 1, name: 'Supino com Barra', primary_muscle: 'chest' },
      { id: 2, name: 'Crossover no Cabo', primary_muscle: 'chest' },
      { id: 3, name: 'Cable Crossover', primary_muscle: 'chest' },
      { id: 4, name: 'Crucifixo com Halteres', primary_muscle: 'chest' },
    ]);
    expect(extra).toEqual([3, 4]);
  });

  it('allows two chest compounds and no more', () => {
    const extra = idsOverSubcategoryCap([
      { id: 1, name: 'Supino com Barra', primary_muscle: 'chest' },
      { id: 2, name: 'Supino Inclinado com Barra', primary_muscle: 'chest' },
      { id: 3, name: 'Supino Declinado com Barra', primary_muscle: 'chest' },
    ]);
    expect(extra).toEqual([3]);
  });

  it('is a no-op when a Push A day is already clean', () => {
    const extra = idsOverSubcategoryCap([
      { id: 1, name: 'Supino Inclinado com Barra', primary_muscle: 'chest' },
      { id: 2, name: 'Crossover no Cabo', primary_muscle: 'chest' },
      { id: 3, name: 'Press de Ombros em Pé', primary_muscle: 'shoulders' },
      { id: 4, name: 'Extensão de Tríceps na Polia', primary_muscle: 'triceps' },
    ]);
    expect(extra).toEqual([]);
  });
});
