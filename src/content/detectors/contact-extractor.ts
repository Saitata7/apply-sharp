/**
 * Content script contact extractor entry point (Workstream 10).
 *
 * Lazy-loaded by src/content/index.ts when the background sends an
 * EXTRACT_CONTACTS_FOR_JOB message after persisting a JOB_DETECTED.
 * Lives in its own file so non-job pages on supported platforms never
 * pay the cost of importing the email/phone/anchor-walker modules.
 *
 * Flow:
 *   1. Background fires EXTRACT_CONTACTS_FOR_JOB { jobId } at this tab
 *   2. We check noindex meta tag (early bailout for staging/internal pages)
 *   3. We call extractContactsFromDom(document.body, { hostname, url, ... })
 *   4. We send the resulting candidates to the background as SAVE_CONTACTS
 *
 * Critical: this file is only ever IMPORTED in response to the trigger
 * message; it does not auto-run on page load. The lazy-load happens via
 * dynamic `import()` inside src/content/index.ts.
 */

import { extractContactsFromDom } from '@core/contacts/extractor';
import { isSensitiveHost, getUserBlocklist, isUserBlockedHost } from '@core/contacts/blocklist';
import { isFeatureEnabled } from '@shared/feature-flags';
import type { SaveContactPayload } from '@shared/types/contact.types';

const NOINDEX_META = 'meta[name="robots" i]';

/**
 * Run contact extraction on the current page and send the results to
 * the background. Called by src/content/index.ts after the
 * EXTRACT_CONTACTS_FOR_JOB message arrives.
 *
 * Iter-2 defense in depth: this content-script entry point now also
 * checks the contacts.passiveExtraction feature flag AND the
 * isSensitiveHost blocklist before doing anything. The pure extractor
 * already enforces both, but a defense-in-depth check at the entry
 * point means a future code path that bypasses the background trigger
 * (test helper, dev console injection) cannot run extraction either.
 */
export async function runContactExtractionForJob(jobId: string): Promise<void> {
  if (!jobId) return;

  // Defense-in-depth gate #1: feature flag (background also checks).
  const enabled = await isFeatureEnabled('contacts.passiveExtraction');
  if (!enabled) {
    return;
  }

  const hostname = window.location.hostname;

  // Defense-in-depth gate #2: sensitive host blocklist (extractor.ts
  // also checks). Bails out at the entry point so a hostile page on
  // a sensitive TLD never even constructs the candidate set.
  if (isSensitiveHost(hostname)) {
    console.log('[ContactExtractor] sensitive host, skipping extraction');
    return;
  }

  // WS10.5 gate #3: user-curated per-domain blocklist. The user can add
  // domains in Options -> Contacts -> Blocked domains; we honor it here
  // before walking the DOM.
  const userBlocked = await getUserBlocklist();
  if (isUserBlockedHost(hostname, userBlocked)) {
    console.log('[ContactExtractor] user-blocked host, skipping extraction');
    return;
  }

  // Honor noindex: if the page declares <meta name="robots" content="noindex">
  // we skip extraction. Defends against staging / internal HR tools.
  const robots = document.querySelector(NOINDEX_META);
  if (robots) {
    const content = (robots.getAttribute('content') || '').toLowerCase();
    if (content.includes('noindex') || content.includes('none')) {
      console.log('[ContactExtractor] noindex meta tag, skipping extraction');
      return;
    }
  }

  const url = window.location.href;
  // Best-effort platform inference: prefer the existing platforms helper
  // when available, otherwise use the hostname.
  const platform = inferPlatform(hostname);
  const htmlLang = document.documentElement.lang || undefined;

  let candidates;
  try {
    candidates = extractContactsFromDom(document.body, {
      hostname,
      url,
      platform,
      htmlLang,
    });
  } catch (err) {
    console.warn('[ContactExtractor] extraction failed:', err);
    return;
  }

  if (candidates.length === 0) return;

  // Send to background. The background's SAVE_CONTACTS handler dedupes
  // and persists. We do NOT batch beyond what extractContactsFromDom
  // already returns (one candidate per anchor).
  const items: SaveContactPayload[] = candidates.map((c) => ({
    sighting: c.sighting,
    jobId,
  }));

  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_CONTACTS',
      payload: { items },
    });
  } catch (err) {
    // Background may have been reloaded; the next page load will retry.
    console.warn('[ContactExtractor] sendMessage failed:', err);
  }
}

/**
 * Map a hostname to a platform key. Lightweight; the full platform
 * detection lives in src/shared/constants/platforms.ts but we don't
 * need to import that whole module just for the contact extractor.
 */
function inferPlatform(hostname: string): string {
  const h = hostname.toLowerCase();
  if (h.includes('wellfound.com')) return 'wellfound';
  if (h.includes('workatastartup.com')) return 'yc-waas';
  if (h.includes('greenhouse.io')) return 'greenhouse';
  if (h.includes('lever.co')) return 'lever';
  if (h.includes('ashbyhq.com')) return 'ashby';
  if (h.includes('myworkdayjobs.com') || h.includes('workday.com')) return 'workday';
  if (h.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (h.includes('workable.com')) return 'workable';
  if (h.includes('indeed.com')) return 'indeed';
  if (h.includes('linkedin.com')) return 'linkedin';
  if (h.includes('himalayas.app')) return 'himalayas';
  return 'generic';
}
