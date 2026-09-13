import { normalizeExerciseKey } from '@/utils/exerciseNormalize';
import { cacheRemoteMedia, prefetchExerciseMedia } from '@/utils/exerciseMediaCache';
import { OFFLINE_PRIORITY_EXERCISE_KEYS, OFFLINE_PREFETCH_LIMIT } from '@/constants/exerciseMediaManifest';

export type ResolvedExerciseMedia = {
  /** Best URI to show right now (local file preferred). */
  uri: string | null;
  source: 'cache' | 'remote' | 'none';
};

/**
 * Resolve display media with priority:
 *   cached local → remote thumbnail/image → none (caller shows placeholder)
 * Bundled assets are intentionally not shipped (APK size); warm-cache covers
 * the priority subset after the first online session.
 */
export async function resolveExerciseMedia(opts: {
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  gifUrl?: string | null;
  apiId?: string | null;
  preferGif?: boolean;
}): Promise<ResolvedExerciseMedia> {
  const remote = opts.preferGif
    ? (opts.gifUrl || opts.imageUrl || opts.thumbnailUrl || '')
    : (opts.thumbnailUrl || opts.imageUrl || opts.gifUrl || '');
  if (!remote) return { uri: null, source: 'none' };

  const cached = await cacheRemoteMedia(remote, opts.apiId || remote);
  if (cached && cached !== remote && cached.startsWith('file')) {
    return { uri: cached, source: 'cache' };
  }
  // cacheRemoteMedia returns the remote URI when already file:, or the new
  // local path after download; if download failed it returns null.
  if (cached) {
    return {
      uri: cached,
      source: cached.startsWith('file') || cached.includes('exercise-media') ? 'cache' : 'remote',
    };
  }
  return { uri: remote, source: 'remote' };
}

/** Sync pick of the best remote URL without touching the filesystem. */
export function pickExerciseMediaUrl(opts: {
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  gifUrl?: string | null;
  compact?: boolean;
}): string | null {
  if (opts.compact) {
    return (opts.thumbnailUrl || opts.imageUrl || opts.gifUrl || '').trim() || null;
  }
  return (opts.gifUrl || opts.imageUrl || opts.thumbnailUrl || '').trim() || null;
}

export function isOfflinePriorityExercise(name: string): boolean {
  const key = normalizeExerciseKey(name);
  return OFFLINE_PRIORITY_EXERCISE_KEYS.some(
    (k) => key === k || key.startsWith(k + ' ') || k.startsWith(key)
  );
}

/**
 * Warm-cache priority + weekly plan media. Non-blocking; failures are soft.
 */
export async function warmOfflineExerciseMedia(
  items: { name: string; url: string; key?: string }[]
): Promise<void> {
  const prioritized = items
    .filter((i) => i.url)
    .sort((a, b) => {
      const ap = isOfflinePriorityExercise(a.name) ? 0 : 1;
      const bp = isOfflinePriorityExercise(b.name) ? 0 : 1;
      return ap - bp;
    })
    .slice(0, OFFLINE_PREFETCH_LIMIT)
    .map((i) => ({ url: i.url, key: i.key }));
  await prefetchExerciseMedia(prioritized);
}
