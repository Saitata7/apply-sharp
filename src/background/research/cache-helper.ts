/**
 * Shared cache helper for background research modules (Workstream 8 + 9).
 *
 * Extracted in iter-2 of the WS7-9 review loop so that:
 *   - src/background/research/company-research.ts (Workstream 1 / autofill)
 *   - src/core/ghost-job-detector/layoff-fetcher.ts (Workstream 8)
 *
 * both use one cache primitive instead of duplicating chrome.storage.local
 * read/write/TTL boilerplate. Any future fetcher (HN comments, recruiter
 * news, layoff news for a different signal) imports from here instead of
 * inventing its own.
 *
 * Implementation: chrome.storage.local with a typed entry envelope. No IDB
 * because the storage requirements are small (~200 entries x ~5KB) and the
 * 10MB extension quota is comfortably within budget.
 *
 * Tolerates missing chrome.storage (test environment) by silently no-oping.
 */

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

/**
 * Read a cached entry by key. Returns null if missing, expired, or
 * malformed. The TTL is enforced HERE so callers do not have to track
 * cachedAt themselves.
 */
export async function readCacheEntry<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const got = await chrome.storage.local.get(key);
    const entry = got?.[key] as CacheEntry<T> | undefined;
    if (!entry || typeof entry.cachedAt !== 'number') return null;
    if (Date.now() - entry.cachedAt > ttlMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

/**
 * Write a cached entry under a key. Best-effort: cache write failures
 * (quota exceeded, storage unavailable) are non-fatal - the next read
 * will simply miss and refetch.
 */
export async function writeCacheEntry<T>(key: string, value: T): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
    await chrome.storage.local.set({ [key]: entry });
  } catch (err) {
    console.warn('[CacheHelper] write failed:', key, err);
  }
}

/**
 * Bulk-clear cached entries by key prefix. Used by manual "clear cache"
 * affordances and by tests.
 */
export async function clearCacheByPrefix(prefix: string): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const all = await chrome.storage.local.get(null);
    const toRemove = Object.keys(all).filter((k) => k.startsWith(prefix));
    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove);
    }
  } catch (err) {
    console.warn('[CacheHelper] clear failed:', prefix, err);
  }
}
