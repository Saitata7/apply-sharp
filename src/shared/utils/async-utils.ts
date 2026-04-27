/**
 * Async Utility Functions
 * Shared async helpers used across the codebase
 */

/**
 * Sleep helper — returns a promise that resolves after the given delay.
 * Used for rate-limiting delays between API calls.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple synchronous hash (djb2 algorithm).
 * Fast, non-cryptographic hash suitable for cache keys and deduplication.
 * For cryptographic hashing, use generateChecksum() from text-utils.ts instead.
 */
export function djb2Hash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
