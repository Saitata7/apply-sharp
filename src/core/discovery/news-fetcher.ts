/**
 * Fetch hiring-trigger news stories from HN Algolia.
 *
 * V1 source choice rationale: hn.algolia.com is already in optional
 * host_permissions for the Workstream 9 hn-whos-hiring fetcher, so v1
 * ships with no new permission ask. The signal is good enough, since most
 * Series A+ AI funding rounds and major product launches appear on the
 * HN front page within 24 hours.
 *
 * V2 sources to add later (each costs another optional host permission):
 *   - news.google.com/rss/search (Google News RSS)
 *   - techcrunch.com/feed (TechCrunch RSS)
 *
 * Returns RawNewsItems for `extractNewsSignals`. The fetcher does not
 * try to extract company names or trigger kinds itself, that lives in
 * the pure parser so it stays testable without network mocks.
 */

import type { RawNewsItem } from './news-signal';
import { fetchWithTimeout, readBoundedText } from '@/core/outreach/recruiter-research';

const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';
const FETCH_BODY_BYTE_LIMIT = 1024 * 1024; // 1 MB

/**
 * Default queries that yield a good signal-to-noise mix for AI-engineer
 * candidate's lead list. Ordered roughly by signal density. Each query
 * runs against `search_by_date` (newest first) with a small hits cap so
 * the total Algolia call cost is one fetch per query, all parallelizable.
 */
const DEFAULT_QUERIES: string[] = [
  'raises Series AI',
  'launches AI agent',
  'open sources LLM',
  'funding round AI',
];

interface AlgoliaSearchResponse {
  hits?: AlgoliaHit[];
}

interface AlgoliaHit {
  objectID: string;
  title?: string;
  url?: string;
  story_url?: string;
  created_at?: string;
}

/**
 * Run all queries in parallel, flatten the hits, return as RawNewsItems.
 * Any individual query failure is silently dropped so one bad call does
 * not nuke the whole lead-list refresh.
 */
export async function fetchNewsSignals(
  queries: string[] = DEFAULT_QUERIES
): Promise<RawNewsItem[]> {
  const results = await Promise.allSettled(queries.map((q) => runOneQuery(q)));
  const items: RawNewsItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }
  return items;
}

async function runOneQuery(query: string): Promise<RawNewsItem[]> {
  const url = `${ALGOLIA_BASE}/search_by_date?query=${encodeURIComponent(
    query
  )}&tags=story&hitsPerPage=30`;
  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, { method: 'GET' });
  } catch {
    return [];
  }
  if (!resp.ok) return [];

  let body: AlgoliaSearchResponse | null = null;
  try {
    const text = await readBoundedText(resp, FETCH_BODY_BYTE_LIMIT);
    if (!text) return [];
    body = JSON.parse(text) as AlgoliaSearchResponse;
  } catch {
    return [];
  }

  if (!body?.hits?.length) return [];

  return body.hits
    .filter((h) => h && typeof h.title === 'string' && h.title.length > 0)
    .map((h) => ({
      title: h.title!,
      url: h.story_url ?? h.url,
      publishedAt: h.created_at,
      source: 'HN',
    }));
}
