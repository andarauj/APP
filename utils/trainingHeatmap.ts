export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  sets: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

/**
 * Buckets each day's set count into an intensity level (0-4), like GitHub's
 * contribution graph — but scaled to the person's OWN training volume via
 * quartiles of their non-zero days, rather than a fixed "20 sets = max"
 * number that wouldn't fit someone doing high-rep bodyweight circuits any
 * better than someone doing low-rep heavy singles.
 */
export function computeHeatmapIntensities(dailySets: { date: string; sets: number }[]): HeatmapDay[] {
  const nonZero = dailySets.filter(d => d.sets > 0).map(d => d.sets).sort((a, b) => a - b);

  if (nonZero.length === 0) {
    return dailySets.map(d => ({ ...d, intensity: 0 as const }));
  }

  const quartile = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))];
  const q1 = quartile(0.25);
  const q2 = quartile(0.5);
  const q3 = quartile(0.75);

  return dailySets.map(d => {
    let intensity: HeatmapDay['intensity'] = 0;
    if (d.sets > 0) {
      if (d.sets <= q1) intensity = 1;
      else if (d.sets <= q2) intensity = 2;
      else if (d.sets <= q3) intensity = 3;
      else intensity = 4;
    }
    return { ...d, intensity };
  });
}
