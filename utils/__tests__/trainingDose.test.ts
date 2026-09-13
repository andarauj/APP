import type { MuscleGroup } from '@/types';
import {
  allocateWorkingSets,
  auditTrainingDose,
  countMuscleFrequency,
  countPlannedWeeklySets,
  doseMuscle,
  formatRirHint,
  previewDoseForSplit,
  rirToRpe,
  targetRirFor,
  usesDoseEngine,
  weeklySetLandmarks,
} from '../trainingDose';

describe('doseMuscle', () => {
  it('aliases lats onto back and drops non-programmable groups', () => {
    expect(doseMuscle('lats')).toBe('back');
    expect(doseMuscle('chest')).toBe('chest');
    expect(doseMuscle('cardio')).toBeNull();
    expect(doseMuscle('mobility')).toBeNull();
    expect(doseMuscle('fullbody')).toBeNull();
  });
});

describe('weeklySetLandmarks', () => {
  it('starts hypertrophy intermediate at 10 and caps at 18', () => {
    const marks = weeklySetLandmarks('hypertrophy', 'intermediate');
    expect(marks.chest).toEqual({ min: 8, start: 10, cap: 18 });
    expect(marks.back.start).toBe(10);
  });

  it('gives beginners a lower start than advanced', () => {
    const beg = weeklySetLandmarks('hypertrophy', 'beginner').quads;
    const adv = weeklySetLandmarks('hypertrophy', 'advanced').quads;
    expect(beg.start).toBeLessThan(adv.start);
    expect(beg.cap).toBeLessThan(adv.cap);
  });

  it('uses a lower strength band than hypertrophy', () => {
    expect(weeklySetLandmarks('strength', 'intermediate').chest.start)
      .toBeLessThan(weeklySetLandmarks('hypertrophy', 'intermediate').chest.start);
  });

  it('adds +2 start for a focus muscle without exceeding the cap', () => {
    const marks = weeklySetLandmarks('hypertrophy', 'intermediate', ['chest']);
    expect(marks.chest.start).toBe(12);
    expect(marks.chest.start).toBeLessThanOrEqual(marks.chest.cap);
    expect(marks.quads.start).toBe(10);
  });

  it('treats lats focus as back focus', () => {
    const marks = weeklySetLandmarks('hypertrophy', 'intermediate', ['lats']);
    expect(marks.back.start).toBe(12);
  });
});

describe('countPlannedWeeklySets / frequency', () => {
  const week = [
    { muscle: 'chest', sets: 4, dayIndex: 0, setType: 'normal' },
    { muscle: 'chest', sets: 3, dayIndex: 2, setType: 'normal' },
    { muscle: 'chest', sets: 3, dayIndex: 0, setType: 'warmup' },
    { muscle: 'lats', sets: 4, dayIndex: 1, setType: 'normal' },
    { muscle: 'cardio', sets: 1, dayIndex: 0, setType: 'normal' },
  ];

  it('counts hard sets on the primary / aliased muscle and ignores warmups', () => {
    expect(countPlannedWeeklySets(week)).toEqual({ chest: 7, back: 4 });
  });

  it('counts distinct days per muscle', () => {
    expect(countMuscleFrequency(week)).toEqual({ chest: 2, back: 1 });
  });
});

describe('RIR / RPE', () => {
  it('maps RIR to RPE as 10 minus RIR', () => {
    expect(rirToRpe(2)).toBe(8);
    expect(rirToRpe(0)).toBe(10);
    expect(formatRirHint(2)).toBe('RIR 2 (RPE ~8)');
  });

  it('hypertrophy intensification is closer to failure than on-ramp', () => {
    expect(targetRirFor('hypertrophy', { phase: 'intensification' }))
      .toBeLessThan(targetRirFor('hypertrophy', { phase: 'on_ramp' }));
  });

  it('strength compounds sit further from failure than hypertrophy accumulation', () => {
    expect(targetRirFor('strength', { phase: 'accumulation', compound: true }))
      .toBeGreaterThan(targetRirFor('hypertrophy', { phase: 'accumulation' }));
  });
});

describe('allocateWorkingSets', () => {
  it('splits a muscle budget across its exercises, 3–6 each', () => {
    const sets = allocateWorkingSets(
      [
        { key: 'a', muscle: 'chest', compound: true },
        { key: 'b', muscle: 'chest', compound: false },
      ],
      'hypertrophy',
      'intermediate',
    );
    const total = (sets.get('a') ?? 0) + (sets.get('b') ?? 0);
    expect(total).toBeGreaterThanOrEqual(10);
    expect(sets.get('a')).toBeGreaterThanOrEqual(sets.get('b')!);
    for (const n of sets.values()) {
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('does not run for cardio / mobility', () => {
    expect(usesDoseEngine('cardio')).toBe(false);
    expect(allocateWorkingSets(
      [{ key: 'a', muscle: 'chest', compound: true }],
      'cardio',
    ).size).toBe(0);
  });
});

describe('auditTrainingDose', () => {
  it('flags below-min as low and above-cap as high', () => {
    const low = auditTrainingDose(
      [{ muscle: 'chest', sets: 4, dayIndex: 0 }],
      'hypertrophy',
      'intermediate',
    );
    expect(low.find(r => r.muscle === 'chest')?.status).toBe('low');

    const high = auditTrainingDose(
      [
        { muscle: 'chest', sets: 6, dayIndex: 0 },
        { muscle: 'chest', sets: 6, dayIndex: 1 },
        { muscle: 'chest', sets: 6, dayIndex: 2 },
        { muscle: 'chest', sets: 6, dayIndex: 3 },
      ],
      'hypertrophy',
      'intermediate',
    );
    expect(high.find(r => r.muscle === 'chest')?.status).toBe('high');
  });
});

describe('5-day frequency-friendly split preview', () => {
  const ulPpl: { focus: MuscleGroup[] }[] = [
    { focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
    { focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { focus: ['chest', 'shoulders', 'triceps'] },
    { focus: ['back', 'biceps', 'forearms'] },
    { focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
  ];

  it('hits large muscles twice across the week', () => {
    const rows = previewDoseForSplit(ulPpl, 60, 'hypertrophy', 'intermediate');
    const chest = rows.find(r => r.muscle === 'chest');
    const quads = rows.find(r => r.muscle === 'quads');
    expect(chest?.frequency).toBeGreaterThanOrEqual(2);
    expect(quads?.frequency).toBeGreaterThanOrEqual(2);
  });
});
