/**
 * Offline cache helpers for exercise demo media.
 * Uses expo-file-system under documentDirectory/exercise-media/.
 */

import { documentDirectory, getInfoAsync, makeDirectoryAsync, downloadAsync } from 'expo-file-system/legacy';

const CACHE_DIR = `${documentDirectory}exercise-media/`;

async function ensureCacheDir(): Promise<void> {
  const info = await getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function cacheKey(apiIdOrUrl: string): string {
  const safe = apiIdOrUrl.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return safe || `u_${Date.now()}`;
}

/** Returns a local file URI if already cached, otherwise downloads then returns it. */
export async function cacheRemoteMedia(
  remoteUrl: string,
  keyHint?: string
): Promise<string | null> {
  if (!remoteUrl || remoteUrl.startsWith('file:')) return remoteUrl || null;
  try {
    await ensureCacheDir();
    const ext = remoteUrl.split('.').pop()?.split('?')[0]?.slice(0, 5) || 'bin';
    const dest = `${CACHE_DIR}${cacheKey(keyHint || remoteUrl)}.${ext}`;
    const existing = await getInfoAsync(dest);
    if (existing.exists) return dest;
    const result = await downloadAsync(remoteUrl, dest);
    return result.uri;
  } catch (e) {
    console.warn('[exerciseMediaCache] download failed:', e);
    return null;
  }
}

/** Prefetch a list of remote URLs (e.g. this week's plan thumbnails). */
export async function prefetchExerciseMedia(
  items: { url: string; key?: string }[]
): Promise<void> {
  const unique = new Map<string, string | undefined>();
  for (const item of items) {
    if (item.url) unique.set(item.url, item.key);
  }
  await Promise.all(
    Array.from(unique.entries()).map(([url, key]) =>
      cacheRemoteMedia(url, key).catch(() => null)
    )
  );
}

export function exerciseMediaCacheDir(): string {
  return CACHE_DIR;
}
