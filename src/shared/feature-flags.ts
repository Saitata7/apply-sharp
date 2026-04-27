/**
 * Feature flags for Workstreams 7-9 (and any future flagged work).
 *
 * Flags live in chrome.storage.local under the prefix `feature-flag:` so
 * they survive service worker restarts and can be flipped from the options
 * page or from a chrome://extensions storage inspector for debugging.
 *
 * Per-feature sub-flags (not workstream-level) per the WS7-9 plan: we want
 * to be able to kill ONE feature without reverting the side panel shell or
 * the other discovery subfeatures.
 *
 * Defaults are baked at module load. The first read for an unknown key
 * returns the bundled default; the side panel and handlers can call
 * isFeatureEnabled() before mounting expensive paths.
 */

export type FeatureFlagKey =
  | 'sidepanel.v1'
  | 'discovery.ghostJob'
  | 'discovery.portalRecommender'
  | 'discovery.hnWhosHiring'
  | 'discovery.ycDirectLinks'
  | 'discovery.leadList'
  | 'contacts.passiveExtraction'
  | 'contacts.aiAssist'
  | 'linkedin.injectFloatingButton'
  | 'linkedin.autoExtractJobs'
  | 'linkedin.jobsFeedSignals'
  | 'pages.jobFeed'
  | 'pages.sponsorLookup'
  | 'pages.outreachComposer'
  | 'pages.contactsCrm';

export const DEFAULT_FLAGS: Record<FeatureFlagKey, boolean> = {
  'sidepanel.v1': true,
  'discovery.ghostJob': true,
  'discovery.portalRecommender': true,
  'discovery.hnWhosHiring': true,
  'discovery.ycDirectLinks': true,
  // Sponsor-filtered lead list. Pulls hiring-trigger news from HN
  // Algolia, joins against the bundled DOL H-1B sponsor index, surfaces
  // 5-10 visa-friendly companies that just hit a hiring trigger. Default
  // OFF because it requests the optional hn.algolia.com host permission
  // and runs a daily background refresh alarm.
  'discovery.leadList': false,
  // Contact extraction is OFF by default. The user must explicitly enable
  // via Options -> Contacts -> consent dialog (Workstream 10 privacy posture).
  'contacts.passiveExtraction': false,
  // AI assist (Gemini Nano tiebreaker) is enabled by default; takes effect
  // only when passiveExtraction is also on AND a provider is available.
  'contacts.aiAssist': true,
  // LinkedIn floating button is OFF by default. Enabling it injects a
  // fixed-position div on linkedin.com pages, which LinkedIn's BrowserGate
  // fingerprinter can detect. This contributes to a documented ~23%
  // account-restriction rate within 90 days for users running automation
  // extensions on LinkedIn (per Apr 2026 commit 25d9ba2). Default-install
  // users have ZERO LinkedIn fingerprint surface unless they explicitly
  // enable this. Behind a warning dialog in Options -> Contacts.
  'linkedin.injectFloatingButton': false,
  // LinkedIn auto-extract jobs is OFF by default. When enabled, the
  // background tab.onUpdated listener runs a read-only query selector
  // pass on LinkedIn job pages via chrome.scripting.executeScript and
  // populates the per-tab job context store, which makes the side panel
  // automatically render Job Insights / Ghost Score / Discovery cards
  // for LinkedIn jobs as the user browses.
  //
  // Lower fingerprint risk than linkedin.injectFloatingButton because
  // there is no DOM mutation - just document.querySelector reads. But
  // not zero risk: chrome.scripting.executeScript still runs code in the
  // page's isolated world, which advanced fingerprinting MAY detect via
  // performance timing or similar side channels. Default OFF, opt-in
  // via Options -> Contacts -> Advanced section with a milder warning
  // than the floating button.
  'linkedin.autoExtractJobs': false,
  // LinkedIn jobs-feed signals (HIGH/MEDIUM/LOW + ghost flag) is OFF by
  // default. When enabled, the background injects assets/jobs-feed-iife.js
  // on /jobs/search and /jobs/collections/* navigations. The IIFE renders
  // a small badge on each card in the left rail with the per-card score
  // and a tooltip listing the ledger reasons.
  //
  // Risk profile sits between autoExtractJobs (read-only) and
  // injectFloatingButton (full UI). The feed badge is DOM-injected via
  // Shadow DOM with randomized class names per session, but it does
  // mutate the DOM and runs a MutationObserver which advanced
  // fingerprinters can detect. Same opt-in posture as the other
  // LinkedIn flags: default OFF, surfaced behind a warning dialog.
  'linkedin.jobsFeedSignals': false,
  // v1.1 pages hidden from the options nav by default. The code stays
  // compiled and the routes work if accessed directly, but the sidebar
  // does not surface them until the v1.1 launch.
  'pages.jobFeed': false,
  'pages.sponsorLookup': false,
  'pages.outreachComposer': false,
  'pages.contactsCrm': false,
};

const STORAGE_PREFIX = 'feature-flag:';

function storageKey(flag: FeatureFlagKey): string {
  return `${STORAGE_PREFIX}${flag}`;
}

/**
 * Check whether a feature is enabled. Returns the bundled default for
 * unknown keys and tolerates missing chrome.storage (test environment).
 *
 * Reads are intentionally async because chrome.storage is async; callers
 * that need synchronous defaults can use DEFAULT_FLAGS directly.
 */
export async function isFeatureEnabled(flag: FeatureFlagKey): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return DEFAULT_FLAGS[flag];
    }
    const key = storageKey(flag);
    const got = await chrome.storage.local.get(key);
    if (Object.prototype.hasOwnProperty.call(got, key)) {
      return Boolean(got[key]);
    }
    return DEFAULT_FLAGS[flag];
  } catch {
    return DEFAULT_FLAGS[flag];
  }
}

/**
 * Set a feature flag explicitly (debug / options page use).
 */
export async function setFeatureEnabled(flag: FeatureFlagKey, enabled: boolean): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [storageKey(flag)]: enabled });
  } catch {
    // best-effort
  }
}

/**
 * Reset a flag to its bundled default.
 */
export async function resetFeatureFlag(flag: FeatureFlagKey): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.remove(storageKey(flag));
  } catch {
    // best-effort
  }
}

/**
 * Bulk read all flags. Used by the side panel to gate UI cards on mount.
 */
export async function getAllFeatureFlags(): Promise<Record<FeatureFlagKey, boolean>> {
  const out: Record<string, boolean> = { ...DEFAULT_FLAGS };
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return out as Record<FeatureFlagKey, boolean>;
    }
    const keys = (Object.keys(DEFAULT_FLAGS) as FeatureFlagKey[]).map(storageKey);
    const got = await chrome.storage.local.get(keys);
    for (const k of Object.keys(DEFAULT_FLAGS) as FeatureFlagKey[]) {
      const sk = storageKey(k);
      if (Object.prototype.hasOwnProperty.call(got, sk)) {
        out[k] = Boolean(got[sk]);
      }
    }
  } catch {
    // best-effort
  }
  return out as Record<FeatureFlagKey, boolean>;
}
