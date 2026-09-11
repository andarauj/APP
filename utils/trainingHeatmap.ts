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

export interface WeeklyConsistency {
  weekStart: string; // YYYY-MM-DD, the Sunday this week starts on
  totalSets: number;
  daysTrained: number; // 0-7
  intensity: 0 | 1 | 2 | 3 | 4; // quartile bucket of totalSets across non-zero weeks
}

/**
 * Groups daily set counts into calendar weeks (Sunday-start, oldest first)
 * for the "Consistência" chart — reported that the old day-by-day square
 * grid ("aqueles quadrados não me dizem nada") didn't communicate anything
 * at a glance. A bar per week reads as an actual chart: height is the real
 * total (not a bucketed level), while `intensity` still buckets it into 5
 * levels — scaled to the person's OWN weeks, same idea as
 * computeHeatmapIntensities — for a quick color read.
 */
export function aggregateWeeklyConsistency(days: { date: string; sets: number }[]): WeeklyConsistency[] {
  if (days.length === 0) return [];

  const firstDate = new Date(days[0].date + 'T00:00:00');
  const leadingPad = firstDate.getDay(); // 0 = Sunday
  const padded: ({ date: string; sets: number } | null)[] = [...Array(leadingPad).fill(null), ...days];

  const weeks: WeeklyConsistency[] = [];
  for (let i = 0; i < padded.length; i += 7) {
    const chunk = padded.slice(i, i + 7);
    const real = chunk.filter((d): d is { date: string; sets: number } => d !== null);
    if (real.length === 0) continue;
    weeks.push({
      weekStart: real[0].date,
      totalSets: real.reduce((sum, d) => sum + d.sets, 0),
      daysTrained: real.filter(d => d.sets > 0).length,
      intensity: 0,
    });
  }

  const nonZero = weeks.map(w => w.totalSets).filter(s => s > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return weeks;

  const quartile = (p: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))];
  const q1 = quartile(0.25);
  const q2 = quartile(0.5);
  const q3 = quartile(0.75);

  return weeks.map(w => {
    let intensity: WeeklyConsistency['intensity'] = 0;
    if (w.totalSets > 0) {
      if (w.totalSets <= q1) intensity = 1;
      else if (w.totalSets <= q2) intensity = 2;
      else if (w.totalSets <= q3) intensity = 3;
      else intensity = 4;
    }
    return { ...w, intensity };
  });
}
