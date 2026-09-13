/**
 * Pure media-matching helpers for Phase 4 (testable without SQLite/network).
 */

import { normalizeExerciseKey } from '@/utils/exerciseNormalize';

export const MEDIA_AUTO_THRESHOLD = 75;
export const MEDIA_REVIEW_THRESHOLD = 60;

export type MediaMatchAction = 'ADD' | 'REVIEW' | 'REJECT' | 'NONE';

export function actionForConfidence(score: number): MediaMatchAction {
  if (score >= MEDIA_AUTO_THRESHOLD) return 'ADD';
  if (score >= MEDIA_REVIEW_THRESHOLD) return 'REVIEW';
  if (score > 0) return 'REJECT';
  return 'NONE';
}

/** HTTPS-only media URLs — never accept http or non-URL placeholders. */
export function isAllowedMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (!/^https:\/\//i.test(u)) return false;
  if (/example\.com|placeholder|localhost|127\.0\.0\.1/i.test(u)) return false;
  return true;
}

export function isLikelyImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url) || /raw\.githubusercontent\.com/i.test(url);
}

/**
 * Detect biomechanical conflict between two normalized keys
 * (incline vs decline, etc.).
 */
export function hasVariantConflict(keyA: string, keyB: string): boolean {
  const incline = /inclin/;
  const decline = /declin/;
  if ((incline.test(keyA) && decline.test(keyB)) || (decline.test(keyA) && incline.test(keyB))) {
    return true;
  }
  const diamond = /diamante|diamond/;
  const plainPush = /^(flexoes|push ?up|pushups)$/;
  // diamond vs plain push-up base names
  if (diamond.test(keyA) && plainPush.test(keyB)) return true;
  if (diamond.test(keyB) && plainPush.test(keyA)) return true;
  return false;
}

/** Strip tempo/intensity suffixes to recover a base exercise name. */
export function baseExerciseName(name: string): string | null {
  const re =
    /\s+(Unilateral|Isométrico|Isometrico|Pausa no Ponto de Contração|Tempo Controlado \(3s descida\)|Excêntrico Acentuado|Eccentrico Acentuado|\s*com 1\.5 Reps)$/i;
  const m = name.match(re);
  if (!m || m.index == null) return null;
  return name.slice(0, m.index).trim();
}

export function sameCanonicalMediaTarget(a: string, b: string): boolean {
  return normalizeExerciseKey(a) === normalizeExerciseKey(b);
}
