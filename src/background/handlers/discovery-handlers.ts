/**
 * Discovery handlers (Workstream 9).
 *
 * Three message handlers for the side panel's Discovery card:
 *   - GET_PORTAL_RECOMMENDATIONS: synchronous, pure scoring
 *   - FETCH_HN_WHOS_HIRING: network call (Algolia), gated by optional permission
 *   - GET_YC_ATS_LINKS: synchronous, static data
 *
 * The HN handler enforces the optional host permission lifecycle: it checks
 * chrome.permissions.contains first, returns a permission_denied error
 * (NOT throws) if the user has not granted, and the side panel UI handles
 * the permission_request flow with a button.
 *
 * All handlers are tolerant of every failure mode and never throw to the
 * router.
 */

import type { MessageResponse } from '@shared/utils/messaging';
import type {
  DiscoveryProfile,
  HNFetchResult,
  PortalRecommendation,
  YCATSLink,
} from '@core/discovery/types';
import { recommendPortals } from '@core/discovery/portal-recommender';
import { fetchHNWhosHiring } from '@core/discovery/hn-whos-hiring';
import { filterBySector, roleToSector, VALIDATED_YC_ATS_LINKS } from '@core/discovery/yc-ats-links';
import { getSkipList } from '@core/discovery/source-quality';

const HN_ORIGIN = 'https://hn.algolia.com/*';

interface PortalRecommendationsResponse {
  recommendations: PortalRecommendation[];
  skipList: ReturnType<typeof getSkipList>;
}

export async function handleGetPortalRecommendations(payload: {
  profile: DiscoveryProfile;
}): Promise<MessageResponse<PortalRecommendationsResponse>> {
  try {
    if (!payload?.profile) {
      return { success: false, error: 'Discovery profile is required' };
    }
    const recommendations = recommendPortals(payload.profile);
    return {
      success: true,
      data: {
        recommendations,
        skipList: getSkipList(),
      },
    };
  } catch (err) {
    console.error('[DiscoveryHandler] portal recommendations failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

interface FetchHNPayload {
  keywords: string[];
  /** If true, request the optional permission first when missing. */
  requestPermission?: boolean;
}

interface FetchHNResponse {
  result: HNFetchResult | null;
  permission: 'granted' | 'denied' | 'unknown';
}

export async function handleFetchHNWhosHiring(
  payload: FetchHNPayload
): Promise<MessageResponse<FetchHNResponse>> {
  try {
    if (!payload?.keywords || !Array.isArray(payload.keywords)) {
      return { success: false, error: 'keywords array required' };
    }

    // Permission lifecycle (iter-2 + iter-3):
    //
    // chrome.permissions.request MUST run from a user-gesture context, and
    // by the time this background handler runs the gesture from the side
    // panel button click has already been lost. So the side panel calls
    // chrome.permissions.request itself BEFORE sending the message and
    // always passes requestPermission=false. This handler only verifies
    // via chrome.permissions.contains.
    //
    // The requestPermission=true branch is preserved as a defensive
    // fallback for any future caller (e.g. a background-initiated
    // refresh) but it is NOT exercised by the current side panel flow.
    // If you find yourself wiring a new caller that hits this branch,
    // know that the prompt will silently fail because Chrome MV3 only
    // shows the prompt when there is a live user gesture.
    const permission = await checkHNPermission();

    if (permission === 'denied') {
      if (payload.requestPermission) {
        // Defensive fallback path. See note above - this is unlikely to
        // succeed from a background context.
        const granted = await requestHNPermission();
        if (!granted) {
          return { success: true, data: { result: null, permission: 'denied' } };
        }
      } else {
        return { success: true, data: { result: null, permission: 'denied' } };
      }
    }

    // Actually fetch.
    const result = await fetchHNWhosHiring(payload.keywords);
    return {
      success: true,
      data: { result, permission: 'granted' },
    };
  } catch (err) {
    console.error('[DiscoveryHandler] HN fetch failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

interface GetYCLinksPayload {
  role?: string;
  /** Direct sector override (e.g. "ai"). Takes precedence over role mapping. */
  sector?: string;
}

interface GetYCLinksResponse {
  links: YCATSLink[];
  /** The sector filter that was applied, or null for "all sectors". */
  appliedSector: string | null;
}

export async function handleGetYCATSLinks(
  payload: GetYCLinksPayload
): Promise<MessageResponse<GetYCLinksResponse>> {
  try {
    const sector = payload?.sector ?? (payload?.role ? roleToSector(payload.role) : null);
    const links = sector ? filterBySector(sector) : VALIDATED_YC_ATS_LINKS.slice(0, 12);
    return {
      success: true,
      data: { links, appliedSector: sector },
    };
  } catch (err) {
    console.error('[DiscoveryHandler] YC links failed:', err);
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Check whether the user has granted the optional hn.algolia.com permission.
 * Returns 'unknown' in test environments where chrome.permissions is missing.
 */
async function checkHNPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  try {
    if (typeof chrome === 'undefined' || !chrome.permissions?.contains) {
      return 'unknown';
    }
    const has = await chrome.permissions.contains({ origins: [HN_ORIGIN] });
    return has ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

async function requestHNPermission(): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.permissions?.request) return false;
    return await chrome.permissions.request({ origins: [HN_ORIGIN] });
  } catch {
    return false;
  }
}
