/**
 * Response Caching — Cache AI responses by input checksum
 *
 * Benefits:
 * - Context engine: if call 3/5 fails, calls 1-2 are cached → restart from 3
 * - Same JD scored multiple times: instant after first score
 * - Invalidate on profile update
 *
 * Storage: chrome.storage.local with TTL (24h default)
 */

const CACHE_KEY = 'aiResponseCache';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  checksum: string;
}

/**
 * Generate a simple checksum from input string for cache keys.
 */
export function generateChecksum(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Cached AI call — returns cached result if available, otherwise calls AI and caches.
 *
 * @param cacheKey - Unique key for this call (use generateChecksum on inputs)
 * @param aiCall - The actual AI call to make if cache misses
 * @param ttl - Time-to-live in milliseconds (default: 24h)
 */
export async function cachedAICall<T>(
  cacheKey: string,
  aiCall: () => Promise<T>,
  ttl: number = DEFAULT_TTL_MS
): Promise<T> {
  // Try cache first
  const cached = await getCachedResponse<T>(cacheKey);
  if (cached && Date.now() - cached.timestamp < ttl) {
    console.log(`[AICache] Cache hit: ${cacheKey}`);
    return cached.data;
  }

  // Cache miss — call AI
  console.log(`[AICache] Cache miss: ${cacheKey}`);
  const result = await aiCall();

  // Store in cache
  await setCachedResponse(cacheKey, result);

  return result;
}

/**
 * Get a cached response by key.
 */
async function getCachedResponse<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cache: Record<string, CacheEntry> = result[CACHE_KEY] || {};
    const entry = cache[key];
    if (!entry) return null;
    return entry as CacheEntry<T>;
  } catch (error) {
    console.debug('[AICache] Get failed:', error);
    return null;
  }
}

/**
 * Store a response in the cache.
 */
async function setCachedResponse<T>(key: string, data: T): Promise<void> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cache: Record<string, CacheEntry> = result[CACHE_KEY] || {};

    cache[key] = {
      data,
      timestamp: Date.now(),
      checksum: key,
    };

    // Prune old entries if over limit
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entries.length - MAX_CACHE_ENTRIES)
        .forEach(([k]) => delete cache[k]);
    }

    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch (error) {
    console.debug('[AICache] Set failed:', error);
  }
}

/**
 * Invalidate cache entries matching a prefix.
 * Call this when profile is updated to clear stale results.
 */
export async function invalidateCache(prefix?: string): Promise<void> {
  try {
    if (!prefix) {
      await chrome.storage.local.remove(CACHE_KEY);
      console.log('[AICache] Cleared all cache');
      return;
    }

    const result = await chrome.storage.local.get(CACHE_KEY);
    const cache: Record<string, CacheEntry> = result[CACHE_KEY] || {};

    for (const key of Object.keys(cache)) {
      if (key.startsWith(prefix)) {
        delete cache[key];
      }
    }

    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    console.log(`[AICache] Invalidated entries with prefix: ${prefix}`);
  } catch (error) {
    console.debug('[AICache] Invalidate failed:', error);
  }
}
