/**
 * Small in-process helpers so an open endpoint survives being shared.
 *
 * Both the cache and the limiter live in the memory of a single instance, so
 * they do not coordinate across replicas. They are here to keep one popular
 * repository from consuming the GitHub rate limit, not to enforce a quota.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

const cache = new Map<string, CacheEntry<unknown>>();

export function readCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function writeCache<T>(key: string, value: T): void {
  if (cache.size >= MAX_ENTRIES) {
    // Map preserves insertion order, so the first key is the oldest write.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

/** Returns false when the caller has exceeded the window. */
export function takeRateLimitSlot(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Keep the map from growing without bound on a long-lived process.
  if (hits.size > 5000) {
    for (const [entry, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(entry);
    }
  }

  return true;
}

/** Best-effort caller identity from proxy headers. */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
