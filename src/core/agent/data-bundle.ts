/**
 * Bundled data accessor for scraped intel that ships with the extension.
 *
 * Files live in /public/data/ which Vite copies into dist/data/. Service
 * worker and pages alike fetch via chrome.runtime.getURL.
 *
 * Currently bundled:
 *   - hn-hiring.json — HackerNews "Who is Hiring?" scrape with stack/visa
 *     scoring (produced by tools/job-search/hn-hiring.mjs)
 *   - sponsors-index.json — DOL H-1B LCA disclosure index
 *     (produced by tools/job-search/dol-process.py — optional, tool gracefully
 *     reports "not loaded" if absent)
 */

export interface HnHiringRecord {
  threadDate: string;
  commentId: string;
  company: string;
  location: string;
  visa: 'friendly' | 'unfriendly' | 'unknown' | string;
  stackScore: number;
  monthsActive: number;
  matched: string;
  hnLink: string;
  allLinks: string;
  excerpt: string;
}

export interface HnHiringBundle {
  source: string;
  scrapedAt: string;
  totalRecords: number;
  records: HnHiringRecord[];
}

export interface SponsorRecord {
  displayName: string;
  filings: number;
  avgWage: number | null;
  topJobTitles: string[];
  topLocations: string[];
  certifiedCount: number;
  deniedCount: number;
  withdrawnCount: number;
}

export type SponsorIndex = Record<string, SponsorRecord>;

let hnCache: HnHiringBundle | null = null;
let sponsorsCache: SponsorIndex | null | undefined;

function bundleUrl(path: string): string {
  // chrome.runtime.getURL works in both options-page React and service worker.
  // In Node test envs it may be absent — fall back to a relative path.
  if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return `/${path}`;
}

export async function loadHnHiring(): Promise<HnHiringBundle | null> {
  if (hnCache) return hnCache;
  try {
    const res = await fetch(bundleUrl('data/hn-hiring.json'));
    if (!res.ok) return null;
    const json = (await res.json()) as HnHiringBundle;
    hnCache = json;
    return json;
  } catch {
    return null;
  }
}

export async function loadSponsorsIndex(): Promise<SponsorIndex | null> {
  if (sponsorsCache !== undefined) return sponsorsCache;
  try {
    const res = await fetch(bundleUrl('data/sponsors-index.json'));
    if (!res.ok) {
      sponsorsCache = null;
      return null;
    }
    const json = (await res.json()) as SponsorIndex;
    sponsorsCache = json;
    return json;
  } catch {
    sponsorsCache = null;
    return null;
  }
}

/**
 * Normalize a company name for sponsor lookup. Mirrors the logic in
 * tools/job-search/dol-process.py so keys match.
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(
    /\b(inc|incorporated|llc|l\.l\.c\.|corp|corporation|co|company|ltd|limited|plc|n\.a\.|na|lp|l\.p\.|services|usa|us|holdings|group)\b\.?/g,
    ''
  );
  s = s.replace(/[^\w\s]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}
