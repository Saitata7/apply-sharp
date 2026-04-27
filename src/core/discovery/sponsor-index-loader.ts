/**
 * Loader for the bundled DOL H-1B sponsor index.
 *
 * The python script `tools/job-search/dol-process.py` ingests the DOL LCA
 * disclosure XLSX and writes `tools/job-search/data/sponsors-index.json`.
 * The vite build step (scripts/copy-sponsors-index.mjs) copies that JSON
 * into `dist/data/sponsors-index.json` so the extension can fetch it via
 * chrome.runtime.getURL.
 *
 * The loader handles every "user has not generated the index yet" case
 * gracefully: missing file, malformed JSON, empty object. Each returns
 * an empty index and the lead-list still surfaces leads (they just lack
 * the visa-friendly badge).
 *
 * In-memory cache: the parsed index is small (~200KB to 2MB) and is held
 * for the service worker's lifetime so subsequent lead-list refreshes
 * skip the fetch + parse cost.
 */

import type { SponsorIndex, SponsorIndexEntry } from './lead-list';
import { normalizeCompanyName } from './news-signal';

const ASSET_PATH = 'data/sponsors-index.json';

let cached: SponsorIndex | null = null;

/**
 * Load the bundled sponsor index, normalizing the keys so they match
 * NewsSignal.companyKey. The python script may write keys in display
 * form ("Baseten Labs Inc.") or already-normalized; we re-normalize on
 * load so we never depend on the python output's exact convention.
 */
export async function loadSponsorIndex(): Promise<SponsorIndex> {
  if (cached) return cached;

  // chrome.runtime.getURL is unavailable in node test environments and
  // in any non-extension context. Treat as "no index available".
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    cached = {};
    return cached;
  }

  const url = chrome.runtime.getURL(ASSET_PATH);
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch {
    console.info(
      '[SponsorIndex] sponsors-index.json not bundled. Run tools/job-search/dol-process.py to enable visa-friendly filtering.'
    );
    cached = {};
    return cached;
  }
  if (!resp.ok) {
    console.info(
      `[SponsorIndex] sponsors-index.json fetch returned ${resp.status}. Falling back to empty index.`
    );
    cached = {};
    return cached;
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch (err) {
    console.warn('[SponsorIndex] sponsors-index.json malformed:', err);
    cached = {};
    return cached;
  }

  cached = normalizeIndex(raw);
  console.info(
    `[SponsorIndex] loaded ${Object.keys(cached).length} sponsor entries from sponsors-index.json`
  );
  return cached;
}

/**
 * Re-key an index whose keys may already be normalized OR may still be in
 * display form. Idempotent. Drops entries with malformed shape.
 */
function normalizeIndex(raw: unknown): SponsorIndex {
  if (!raw || typeof raw !== 'object') return {};
  const out: SponsorIndex = {};
  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<SponsorIndexEntry>;
    if (typeof v.filings !== 'number') continue;
    const display =
      typeof v.displayName === 'string' && v.displayName.length > 0 ? v.displayName : rawKey;
    const key = normalizeCompanyName(display);
    if (!key) continue;
    out[key] = {
      displayName: display,
      filings: v.filings,
      avgWage: typeof v.avgWage === 'number' ? v.avgWage : undefined,
      topJobTitles: Array.isArray(v.topJobTitles)
        ? v.topJobTitles.filter((t): t is string => typeof t === 'string').slice(0, 10)
        : undefined,
      latestFy: typeof v.latestFy === 'string' ? v.latestFy : undefined,
    };
  }
  return out;
}

/**
 * Force the next load to re-fetch. Used when the user re-runs the python
 * processor and refreshes the side panel.
 */
export function clearSponsorIndexCache(): void {
  cached = null;
}
