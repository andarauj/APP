export interface MetricSnapshot {
  weight: number | null;
  body_fat: number | null;
  chest: number | null;
  back: number | null;
  waist: number | null;
  hips: number | null;
  arm: number | null;
  thigh: number | null;
}

export interface MetricDelta {
  field: keyof MetricSnapshot;
  before: number;
  after: number;
  delta: number;
}

const FIELDS: (keyof MetricSnapshot)[] = ['weight', 'body_fat', 'chest', 'back', 'waist', 'hips', 'arm', 'thigh'];

/**
 * Per-field differences between two dated measurements — only for fields
 * present in BOTH snapshots. A field recorded in one but not the other
 * would produce a meaningless "delta" (comparing a real number against
 * nothing), so it's simply omitted rather than treated as a change from/to
 * zero.
 */
export function computeMetricDeltas(before: MetricSnapshot, after: MetricSnapshot): MetricDelta[] {
  const deltas: MetricDelta[] = [];
  for (const field of FIELDS) {
    const b = before[field];
    const a = after[field];
    if (b === null || a === null || b === undefined || a === undefined) continue;
    deltas.push({ field, before: b, after: a, delta: Math.round((a - b) * 10) / 10 });
  }
  return deltas;
}
