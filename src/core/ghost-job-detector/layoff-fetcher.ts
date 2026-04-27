/**
 * Layoff news fetcher (Workstream 8).
 *
 * Wraps the existing Google News RSS plumbing in src/core/outreach/recruiter-research.ts
 * (the same fetcher the outreach feature uses for company news). We re-use
 * fetchRecentNews and post-filter for layoff-relevant headlines.
 *
 * Caching:
 *   - Per Plan agent: 7 days, keyed by (normalizedCompany, ISO calendar week).
 *   - Aligning to ISO weeks (not absolute timestamps) maximizes cross-session
 *     reuse - two users / sessions in the same week share one fetch.
 *   - Manual "refresh layoff news" affordance on the GhostScoreCard UI calls
 *     refreshLayoffNews() to bypass the cache for the paranoid case.
 *   - Cache lives in chrome.storage.local under the key prefix `layoff:`.
 *     Best-effort: cache misses fall through to a live fetch; cache write
 *     errors do not block the call.
 *
 * The fetcher is intentionally tolerant of every failure mode (network down,
 * malformed RSS, no chrome.storage in tests). Failures return an empty list
 * so the scorer treats the company as "no recent layoff news".
 */

import { fetchRecentNews } from '@/core/outreach/recruiter-research';
import {
  readCacheEntry,
  writeCacheEntry,
  clearCacheByPrefix,
} from '@/background/research/cache-helper';
import type { LayoffNewsItem } from './types';
import { normalizeCompany } from './reposting-normalizer';

const CACHE_KEY_PREFIX = 'layoff:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns the ISO 8601 week number (1..53) for a given date. Used as part
 * of the cache key so two cache hits in the same calendar week reuse one
 * fetch even across browser sessions.
 *
 * Implementation per the ISO 8601 reference: week 1 contains the first
 * Thursday of the year; weeks start on Monday.
 */
export function getISOWeek(date: Date): { year: number; week: number } {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day of week: 1 = Monday, 7 = Sunday
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week };
}

function cacheKeyFor(company: string, now: Date = new Date()): string {
  const slug = normalizeCompany(company).replace(/\s+/g, '-') || 'unknown';
  const { year, week } = getISOWeek(now);
  return `${CACHE_KEY_PREFIX}${slug}:${year}-W${String(week).padStart(2, '0')}`;
}

async function readCache(key: string): Promise<LayoffNewsItem[] | null> {
  return readCacheEntry<LayoffNewsItem[]>(key, CACHE_TTL_MS);
}

async function writeCache(key: string, items: LayoffNewsItem[]): Promise<void> {
  await writeCacheEntry(key, items);
}

/**
 * Strip HTML and decode common entities for safe rendering. The Google News
 * RSS items contain HTML in titles and snippets. We do NOT need DOMPurify
 * here because we strip ALL tags; the result is plain text and the side
 * panel only renders it via React text nodes.
 */
function stripHtml(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Internal: fetch fresh layoff news from Google News RSS for the given
 * company. Maps NewsItem -> LayoffNewsItem with sanitized text and a
 * source label parsed from the URL host.
 */
async function fetchFresh(company: string): Promise<LayoffNewsItem[]> {
  if (!company || typeof company !== 'string') return [];
  // Use a layoff-targeted query so the RSS feed comes back pre-filtered.
  // We still re-filter inside the layoff-news signal regex for defense in
  // depth, but a targeted query keeps the response small.
  const query = `${company} layoffs`;
  let news;
  try {
    news = await fetchRecentNews(query);
  } catch {
    return [];
  }
  if (!Array.isArray(news)) return [];

  return news
    .map((n): LayoffNewsItem | null => {
      const title = stripHtml(n.title).slice(0, 200);
      if (!title) return null;
      const url = typeof n.url === 'string' && /^https?:\/\//i.test(n.url) ? n.url : undefined;
      let source: string | undefined;
      try {
        if (url) source = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        source = undefined;
      }
      return {
        title,
        source,
        publishedAt: n.pubDate ? new Date(n.pubDate).toISOString() : new Date().toISOString(),
        snippet: undefined,
        url,
      };
    })
    .filter((x): x is LayoffNewsItem => x !== null)
    .slice(0, 10);
}

/**
 * Public: fetch layoff news for a company, returning cached results when
 * a valid weekly entry exists. Empty array on any failure.
 */
export async function fetchLayoffNews(company: string): Promise<LayoffNewsItem[]> {
  if (!company) return [];
  const key = cacheKeyFor(company);
  const cached = await readCache(key);
  if (cached) return cached;
  const fresh = await fetchFresh(company);
  await writeCache(key, fresh);
  return fresh;
}

/**
 * Public: bypass the cache and fetch fresh, used by the "refresh layoff
 * news" affordance on the GhostScoreCard.
 */
export async function refreshLayoffNews(company: string): Promise<LayoffNewsItem[]> {
  if (!company) return [];
  const fresh = await fetchFresh(company);
  await writeCache(cacheKeyFor(company), fresh);
  return fresh;
}

/** Test-only: clear all cached layoff entries via the shared cache helper. */
export async function _clearLayoffCache(): Promise<void> {
  await clearCacheByPrefix(CACHE_KEY_PREFIX);
}
