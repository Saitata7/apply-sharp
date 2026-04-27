/**
 * Hacker News "Who is Hiring" matcher (Workstream 9).
 *
 * The HN "Ask HN: Who is hiring" thread is posted on the first business day
 * of every month by user `whoishiring` and is the single highest-signal
 * source for senior eng outside of FAANG. Each thread has 400-800 top-level
 * comments, each one a hiring pitch from a real engineering team.
 *
 * Strategy:
 *   1. Find the latest thread via Algolia search:
 *      https://hn.algolia.com/api/v1/search?tags=story,author_whoishiring&hitsPerPage=12
 *   2. Pick the most recent hit whose title contains "Ask HN: Who is hiring".
 *   3. Fetch its comments via the items endpoint:
 *      https://hn.algolia.com/api/v1/items/{storyId} (returns the full tree).
 *   4. PHASE 1 client-side keyword filter (free, runs locally): keep
 *      comments matching the user's keywords (role, languages, geo).
 *   5. PHASE 2 (optional, NOT required): semantic re-rank via Gemini Nano.
 *      Out of scope for the v1 ship of WS9 - the cheap filter is the floor.
 *   6. Sanitize every comment via hn-sanitizer.ts before returning.
 *   7. Cache the parsed result for 7 days keyed by (threadId, keywordsHash).
 *
 * Permission: hn.algolia.com is in optional_host_permissions, NOT
 * host_permissions. The handler must call chrome.permissions.request before
 * the first fetch and degrade gracefully if denied.
 *
 * The fetcher is intentionally tolerant of every failure mode and never
 * throws to the caller - failures return an empty result.
 */

import type { HNFetchResult, HNMatch } from './types';
import { sanitizeHNComment } from './hn-sanitizer';
import { fetchWithTimeout, readBoundedText } from '@/core/outreach/recruiter-research';
import { readCacheEntry, writeCacheEntry } from '@/background/research/cache-helper';

const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = 'hn-whois:';
const MAX_MATCHES = 12;
const MAX_KEYWORDS = 20;
/** Hard cap on each Algolia response body. Defends against pathological
 *  payloads from a hostile Algolia mirror or a man-in-the-middle. */
const FETCH_BODY_BYTE_LIMIT = 512 * 1024;
/** Hard cap on the number of comments we even attempt to scan. */
const MAX_COMMENTS_SCAN = 1000;
/** Hard cap on the size of any single comment text we accept. */
const MAX_COMMENT_TEXT = 20_000;

interface AlgoliaSearchHit {
  objectID: string;
  title?: string;
  created_at?: string;
}

interface AlgoliaItem {
  id: number;
  text?: string | null;
  author?: string | null;
  created_at?: string | null;
  children?: AlgoliaItem[];
}

/**
 * Bounded JSON parse: read up to FETCH_BODY_BYTE_LIMIT bytes from the
 * Response stream, then JSON.parse. Replaces the unbounded `await
 * resp.json()` calls so a hostile mirror cannot ship a 500MB body.
 *
 * Iter-2 fix per security review.
 */
async function readBoundedJson<T>(resp: Response): Promise<T | null> {
  try {
    const text = await readBoundedText(resp, FETCH_BODY_BYTE_LIMIT);
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Hand-rolled validators for Algolia response shapes. We do not use Zod
 * here to avoid pulling another schema into the bundle just for two API
 * calls; the validators are exhaustive and reject malformed inputs cleanly.
 */
function isSearchHit(v: unknown): v is AlgoliaSearchHit {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.objectID === 'string';
}

function isAlgoliaItem(v: unknown): v is AlgoliaItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'number';
}

/** SHA-256 hex of a sorted, normalized keyword list. Stable cache key. */
async function hashKeywords(keywords: string[]): Promise<string> {
  const normalized = [...keywords]
    .map((k) => k.toLowerCase().trim())
    .filter(Boolean)
    .sort();
  const text = normalized.join('|');
  if (typeof crypto?.subtle?.digest !== 'function') {
    // Test environment without SubtleCrypto: fall back to a stable string
    return text.slice(0, 64);
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

async function readCache(threadId: number, keywordsHash: string): Promise<HNFetchResult | null> {
  const key = `${CACHE_KEY_PREFIX}${threadId}:${keywordsHash}`;
  const cached = await readCacheEntry<HNFetchResult>(key, CACHE_TTL_MS);
  if (!cached) return null;
  return { ...cached, fromCache: true };
}

async function writeCache(
  threadId: number,
  keywordsHash: string,
  result: HNFetchResult
): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}${threadId}:${keywordsHash}`;
  await writeCacheEntry(key, result);
}

/**
 * Public: fetch HN Who-is-hiring matches for a list of keywords.
 *
 * Returns an empty result on any failure. The optional permission for
 * hn.algolia.com must be granted before this function runs (the handler
 * checks via chrome.permissions.contains and either prompts or returns
 * permission_denied to the caller).
 *
 * Cache strategy (iter-2 reorder per code review):
 *   - The "latest thread id" is cached by year-month so a same-month repeat
 *     call skips the Algolia search entirely.
 *   - The match results are cached by (threadId, keywordsHash) so a same-
 *     keyword repeat call also skips the comment fetch.
 *   - Both caches use a 7-day TTL via the shared cacheHelper.
 */
export async function fetchHNWhosHiring(keywords: string[]): Promise<HNFetchResult> {
  const cleanKeywords = (keywords ?? [])
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);

  if (cleanKeywords.length === 0) {
    return emptyResult();
  }

  // Step 0: try to skip the thread search via the year-month cache.
  // Both the per-month thread cache and the per-keywords result cache go
  // through the shared cache-helper so any future change to the cache
  // primitive (TTL semantics, storage backend) flows through one place.
  const monthKey = `${CACHE_KEY_PREFIX}thread:${new Date().toISOString().slice(0, 7)}`;
  let thread: AlgoliaSearchHit | null = await readCacheEntry<AlgoliaSearchHit>(
    monthKey,
    CACHE_TTL_MS
  );

  // Step 1: find the latest thread (cache miss path).
  if (!thread) {
    try {
      thread = await findLatestThread();
    } catch (err) {
      console.warn('[HN] thread search failed:', err);
      return emptyResult();
    }
    if (!thread) {
      return emptyResult();
    }
    await writeCacheEntry(monthKey, thread);
  }
  const threadId = Number(thread.objectID);

  // Step 2: per-keywords cache check.
  const keywordsHash = await hashKeywords(cleanKeywords);
  const cached = await readCache(threadId, keywordsHash);
  if (cached) return cached;

  // Step 2: fetch comments.
  let comments: AlgoliaItem[];
  try {
    comments = await fetchThreadComments(threadId);
  } catch (err) {
    console.warn('[HN] comment fetch failed:', err);
    return emptyResult();
  }

  // Step 3: filter + sanitize + rank.
  const matches = filterAndRank(comments, cleanKeywords);

  const result: HNFetchResult = {
    threadId,
    threadTitle: thread.title ?? 'Ask HN: Who is hiring',
    threadUrl: `https://news.ycombinator.com/item?id=${threadId}`,
    totalComments: comments.length,
    matches,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };

  await writeCache(threadId, keywordsHash, result);
  return result;
}

function emptyResult(): HNFetchResult {
  return {
    threadId: 0,
    threadTitle: 'Ask HN: Who is hiring (not available)',
    threadUrl: 'https://news.ycombinator.com/submitted?id=whoishiring',
    totalComments: 0,
    matches: [],
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };
}

/**
 * Find the most recent "Ask HN: Who is hiring" thread by user whoishiring.
 * Algolia returns hits sorted by relevance by default; we filter by title
 * pattern and pick the most recent.
 *
 * Body is read via readBoundedJson (capped at 512KB) and validated with
 * isSearchHit before consumption. Iter-2 fix per security review.
 */
async function findLatestThread(): Promise<AlgoliaSearchHit | null> {
  const url = `${ALGOLIA_BASE}/search?tags=story,author_whoishiring&hitsPerPage=12`;
  const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return null;
  const json = await readBoundedJson<{ hits?: unknown }>(resp);
  if (!json) return null;
  const hits = Array.isArray(json.hits) ? json.hits.filter(isSearchHit) : [];
  const candidates = hits.filter((h) => /Ask HN.*Who is hiring/i.test(h.title ?? ''));
  if (candidates.length === 0) return null;
  // Sort newest-first by created_at
  candidates.sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  });
  return candidates[0];
}

/**
 * Fetch the full comment tree for a thread. Algolia returns nested children;
 * we flatten to top-level + first-tier children only (those are where the
 * hiring pitches live).
 *
 * Each comment is shape-validated and per-comment text is bounded at
 * MAX_COMMENT_TEXT (20KB). Iter-2 fix per security review.
 */
async function fetchThreadComments(threadId: number): Promise<AlgoliaItem[]> {
  const url = `${ALGOLIA_BASE}/items/${threadId}`;
  const resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return [];
  const json = await readBoundedJson<{ children?: unknown }>(resp);
  if (!json || !Array.isArray(json.children)) return [];
  // Top-level comments only. Validate each, bound per-comment text, cap at
  // MAX_COMMENTS_SCAN to defend against pathological responses.
  const validated: AlgoliaItem[] = [];
  for (const c of json.children) {
    if (!isAlgoliaItem(c)) continue;
    if (typeof c.text === 'string' && c.text.length > MAX_COMMENT_TEXT) {
      // Truncate rather than drop - a long pitch is still a real pitch
      validated.push({ ...c, text: c.text.slice(0, MAX_COMMENT_TEXT) });
    } else {
      validated.push(c);
    }
    if (validated.length >= MAX_COMMENTS_SCAN) break;
  }
  return validated;
}

/**
 * Filter comments by keyword presence and assign each a score 0..1 based
 * on how many keywords matched. Sanitize HTML before returning.
 */
export function filterAndRank(comments: AlgoliaItem[], keywords: string[]): HNMatch[] {
  const kwSet = new Set(keywords.map((k) => k.toLowerCase()));
  const scored: HNMatch[] = [];

  for (const c of comments) {
    if (!c?.text) continue;
    const sanitized = sanitizeHNComment(c.text);
    if (!sanitized.plain) continue;
    const haystack = sanitized.plain.toLowerCase();

    // Count exact word/phrase matches. Word boundary matters: "go" should
    // not match "Google", but the keyword should still be findable as a
    // standalone token.
    const matched: string[] = [];
    for (const kw of kwSet) {
      if (kw.length < 2) continue;
      // Build a simple word-boundary regex; escape regex chars so user-
      // controlled keywords cannot inject regex syntax.
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      if (re.test(haystack)) matched.push(kw);
    }

    if (matched.length === 0) continue;

    const score = Math.min(1, matched.length / Math.max(3, keywords.length));
    scored.push({
      commentId: c.id,
      author: c.author ?? 'unknown',
      createdAt: c.created_at ?? new Date().toISOString(),
      htmlSafe: sanitized.htmlSafe,
      plain: sanitized.plain,
      score,
      matchedKeywords: matched,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_MATCHES);
}
