/**
 * Lead-list handler.
 *
 * Background-side endpoint for the side-panel "Today's leads" card.
 * Pulls hiring-trigger news from HN Algolia, joins against the bundled
 * DOL H-1B sponsor index, returns the top N ranked leads. Caches the
 * full result for 6 hours so repeated side-panel opens within one
 * working session do not re-hit Algolia.
 *
 * Permission posture mirrors handleFetchHNWhosHiring: hn.algolia.com
 * lives in optional_host_permissions, so the handler returns
 * permission_denied (does not throw) when the user has not granted.
 * The side panel surfaces a "Grant access" affordance.
 *
 * Daily refresh: a chrome.alarms entry fires once per day to pre-warm
 * the cache so the morning open is instant. The alarm is registered in
 * src/background/index.ts only when the discovery.leadList flag is on.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import type { Lead } from '@core/discovery/lead-list';
import { rankLeads } from '@core/discovery/lead-list';
import { extractNewsSignals } from '@core/discovery/news-signal';
import { fetchNewsSignals } from '@core/discovery/news-fetcher';
import { loadSponsorIndex, clearSponsorIndexCache } from '@core/discovery/sponsor-index-loader';
import { readCacheEntry, writeCacheEntry } from '@/background/research/cache-helper';

const HN_ORIGIN = 'https://hn.algolia.com/*';
const CACHE_KEY_PREFIX = 'lead-list:';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
export const LEAD_LIST_ALARM = 'applysharp-lead-list-refresh';

interface GetLeadListPayload {
  /** Role keywords used for the LinkedIn deep-link and sponsor title soft-match. */
  roleKeywords?: string[];
  /** Override default 10. Capped at 25. */
  topN?: number;
  /** Bypass the 6h cache. */
  refresh?: boolean;
  /** Ignore dismissed companies (default true). */
  hideDismissed?: boolean;
}

interface GetLeadListResponse {
  leads: Lead[];
  /** ISO when the list was generated. */
  generatedAt: string;
  /** True if we returned cached data without refetching. */
  fromCache: boolean;
  /** True if the sponsor index is loaded and non-empty. */
  sponsorIndexLoaded: boolean;
  /** Number of dismissed company keys filtered out. */
  dismissedFiltered: number;
  /** "granted" / "denied" / "unknown" - HN Algolia permission state. */
  permission: 'granted' | 'denied' | 'unknown';
}

const DISMISSED_KEY = 'lead-list:dismissed-companies';

async function checkHNPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  try {
    if (typeof chrome === 'undefined' || !chrome.permissions?.contains) return 'unknown';
    const has = await chrome.permissions.contains({ origins: [HN_ORIGIN] });
    return has ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

async function readDismissed(): Promise<Set<string>> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return new Set();
    const got = await chrome.storage.local.get(DISMISSED_KEY);
    const arr = got?.[DISMISSED_KEY];
    if (Array.isArray(arr)) return new Set(arr.filter((v) => typeof v === 'string'));
    return new Set();
  } catch {
    return new Set();
  }
}

async function writeDismissed(set: Set<string>): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [DISMISSED_KEY]: [...set] });
  } catch (err) {
    console.warn('[LeadListHandler] write dismissed failed:', err);
  }
}

function cacheKey(roleKeywords: string[], topN: number): string {
  const k = [...roleKeywords]
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join('|');
  return `${CACHE_KEY_PREFIX}${k}:${topN}`;
}

export async function handleGetLeadList(
  payload: GetLeadListPayload
): Promise<MessageResponse<GetLeadListResponse>> {
  try {
    const roleKeywords = (payload?.roleKeywords ?? []).filter(
      (s): s is string => typeof s === 'string' && s.length > 0
    );
    const topN = Math.min(25, Math.max(1, payload?.topN ?? 10));
    const hideDismissed = payload?.hideDismissed !== false;

    const permission = await checkHNPermission();
    if (permission === 'denied') {
      return {
        success: true,
        data: {
          leads: [],
          generatedAt: new Date().toISOString(),
          fromCache: false,
          sponsorIndexLoaded: false,
          dismissedFiltered: 0,
          permission: 'denied',
        },
      };
    }

    const dismissed = hideDismissed ? await readDismissed() : new Set<string>();
    const key = cacheKey(roleKeywords, topN);

    if (!payload?.refresh) {
      const cached = await readCacheEntry<GetLeadListResponse>(key, CACHE_TTL_MS);
      if (cached) {
        const filtered = cached.leads.filter((l) => !dismissed.has(l.companyKey));
        return {
          success: true,
          data: {
            ...cached,
            leads: filtered,
            fromCache: true,
            dismissedFiltered: cached.leads.length - filtered.length,
            permission,
          },
        };
      }
    }

    const [rawItems, sponsors] = await Promise.all([fetchNewsSignals(), loadSponsorIndex()]);
    const signals = extractNewsSignals(rawItems);
    // Pull a generous top-N from the ranker, then filter dismissed from
    // the result so a refresh after dismissing one company immediately
    // backfills with the next-best lead.
    const generous = rankLeads(signals, sponsors, {
      topN: topN + dismissed.size,
      roleKeywords,
    });
    const filtered = generous.filter((l) => !dismissed.has(l.companyKey)).slice(0, topN);

    const data: GetLeadListResponse = {
      leads: filtered,
      generatedAt: new Date().toISOString(),
      fromCache: false,
      sponsorIndexLoaded: Object.keys(sponsors).length > 0,
      dismissedFiltered: generous.length - filtered.length,
      permission,
    };

    await writeCacheEntry(key, data);
    return { success: true, data };
  } catch (err) {
    console.error('[LeadListHandler] failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

export interface DismissLeadPayload {
  companyKey: string;
}

export async function handleDismissLead(
  payload: DismissLeadPayload
): Promise<MessageResponse<{ dismissedCount: number }>> {
  try {
    if (!payload?.companyKey) {
      return { success: false, error: 'companyKey required' };
    }
    const set = await readDismissed();
    set.add(payload.companyKey);
    await writeDismissed(set);
    return { success: true, data: { dismissedCount: set.size } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function handleClearLeadListCache(): Promise<MessageResponse<{ cleared: boolean }>> {
  try {
    clearSponsorIndexCache();
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const all = await chrome.storage.local.get(null);
      const toRemove = Object.keys(all).filter((k) => k.startsWith(CACHE_KEY_PREFIX));
      if (toRemove.length > 0) await chrome.storage.local.remove(toRemove);
    }
    return { success: true, data: { cleared: true } };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Background-side daily refresh trigger. Called from src/background/index.ts
 * when the LEAD_LIST_ALARM fires. Pre-warms the default cache entry so
 * the morning side-panel open is instant.
 *
 * Default keyword set is intentionally AI Engineer focused since that is
 * the user's targeted role per project_job_search_situation.md.
 */
export async function refreshLeadListCache(): Promise<void> {
  try {
    await handleGetLeadList({
      roleKeywords: ['ai engineer', 'ml engineer', 'genai', 'llm engineer'],
      topN: 10,
      refresh: true,
    });
  } catch (err) {
    console.warn('[LeadListHandler] daily refresh failed:', err);
  }
}
