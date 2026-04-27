/**
 * Hard blocklists for contact extraction (Workstream 10).
 *
 * Three categories:
 *
 *   1. PERSONAL_WEBMAIL_DOMAINS: never extract emails whose domain is
 *      a personal webmail provider. Defends against accidentally
 *      scraping the user's own inbox if they enable "all sites" mode
 *      and visit gmail.com.
 *
 *   2. ANALYTICS_DOMAINS: never extract emails from analytics / vendor
 *      tracking domains. These appear in inline JS tags constantly
 *      ("error@sentry.io", "support@mixpanel.com") and are not real
 *      hiring contacts.
 *
 *   3. SENSITIVE_HOST_PATTERNS: never run extraction at all on banking,
 *      health, or government pages. Defensive posture against the
 *      worst-case privacy outcome.
 *
 * The blocklists are CONSTS, intentionally. Adding domains to a runtime
 * blocklist is the user-curated per-domain feature in the Options page.
 * The hard blocklists here are non-negotiable.
 */

/**
 * Domains where the user is the data subject, not the recruiter.
 * Hard-blocked from email extraction regardless of any feature flag.
 */
export const PERSONAL_WEBMAIL_DOMAINS = new Set<string>([
  // Google
  'gmail.com',
  'googlemail.com',
  'mail.google.com',
  // Microsoft
  'outlook.com',
  'outlook.live.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  // Yahoo
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'rocketmail.com',
  'ymail.com',
  // Proton
  'proton.me',
  'protonmail.com',
  'pm.me',
  // Apple
  'icloud.com',
  'me.com',
  'mac.com',
  // Other personal providers
  'fastmail.com',
  'fastmail.fm',
  'aol.com',
  'tutanota.com',
  'tutanota.de',
  'tuta.io',
  'zoho.com',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'duck.com',
  'mailfence.com',
  'hushmail.com',
  'superhuman.com',
  'mailbox.org',
  'posteo.de',
]);

/**
 * Analytics, error tracking, and observability vendors. These show up
 * in inline JavaScript tags as "error reporting" addresses and are
 * never real hiring contacts. Extracting them produces noise.
 */
export const ANALYTICS_DOMAINS = new Set<string>([
  'sentry.io',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'datadoghq.com',
  'newrelic.com',
  'amplitude.com',
  'heap.io',
  'fullstory.com',
  'logrocket.com',
  'pendo.io',
  'hotjar.com',
  'crazyegg.com',
  'optimizely.com',
  'launchdarkly.com',
  'split.io',
  'statsig.com',
  'posthog.com',
  'rollbar.com',
  'bugsnag.com',
  'honeybadger.io',
  'pagerduty.com',
  'opsgenie.com',
  'getstream.io',
]);

/**
 * Hostname patterns where contact extraction NEVER runs (entire page
 * skipped before any regex). Defensive posture against the worst-case
 * privacy outcome (scraping a user's bank statement for "support
 * email"). The patterns are conservative on purpose.
 *
 * Matched as suffixes (host.endsWith pattern) for second-level domains
 * like "*.bank" and as exact-match for full hostnames.
 */
export const SENSITIVE_TLD_SUFFIXES = [
  '.bank',
  '.health',
  '.gov',
  '.gov.uk',
  '.gov.au',
  '.edu', // student records, FERPA territory
];

export const SENSITIVE_HOSTNAMES = new Set<string>([
  'healthcare.gov',
  'medicare.gov',
  'irs.gov',
  'hhs.gov',
  // Common personal-finance services
  'mint.com',
  'personalcapital.com',
  'creditkarma.com',
  'plaid.com',
]);

export function isPersonalWebmailDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;
  return PERSONAL_WEBMAIL_DOMAINS.has(domain.toLowerCase());
}

export function isAnalyticsDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;
  return ANALYTICS_DOMAINS.has(domain.toLowerCase());
}

/**
 * True if the given hostname is on a sensitive blocklist and contact
 * extraction should NOT run at all on this page.
 */
export function isSensitiveHost(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') return false;
  const lower = hostname.toLowerCase();
  if (SENSITIVE_HOSTNAMES.has(lower)) return true;
  for (const suffix of SENSITIVE_TLD_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Per-user blocklist (read at runtime from chrome.storage.local).
 * Not part of the const lists above; the user-curated list is layered
 * on top via the content-script extractor entry point.
 *
 * WS10.5: wired up. The Contacts CRM page exposes a UI to add/remove
 * domains; the content script reads the list before extracting and bails
 * out when the current hostname matches.
 */
export interface UserBlocklist {
  domains: string[];
}

const USER_BLOCKLIST_KEY = 'contacts.userBlocklist';

/**
 * Normalize a host-ish string to a bare hostname:
 *   "https://www.acme.com/contact" -> "acme.com"
 *   "ACME.COM"                     -> "acme.com"
 *   "  acme.com/  "                -> "acme.com"
 * Returns null for empty/invalid input.
 */
export function normalizeBlocklistDomain(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  let v = input.trim().toLowerCase();
  if (!v) return null;
  // Strip protocol if the user pasted a URL
  v = v.replace(/^[a-z]+:\/\//i, '');
  // Strip path / query / fragment
  v = v.split(/[/?#]/, 1)[0];
  // Strip leading "www."
  v = v.replace(/^www\./, '');
  // Reject obviously non-host strings
  if (!v.includes('.') || v.includes(' ')) return null;
  // Reject anything with characters outside the safe DNS set
  if (!/^[a-z0-9.-]+$/.test(v)) return null;
  return v;
}

/**
 * Read the user-curated domain blocklist from chrome.storage.local.
 * Returns an empty array if no blocklist exists or storage is unavailable.
 */
export async function getUserBlocklist(): Promise<string[]> {
  try {
    const got = await chrome.storage.local.get(USER_BLOCKLIST_KEY);
    const raw = got?.[USER_BLOCKLIST_KEY] as UserBlocklist | undefined;
    if (!raw || !Array.isArray(raw.domains)) return [];
    return raw.domains.filter((d): d is string => typeof d === 'string');
  } catch {
    return [];
  }
}

/**
 * Add a domain to the user blocklist. Idempotent: re-adding an existing
 * domain is a no-op. Returns the new full list (sorted).
 */
export async function addUserBlocklistDomain(rawDomain: string): Promise<string[]> {
  const normalized = normalizeBlocklistDomain(rawDomain);
  if (!normalized) return getUserBlocklist();
  const current = await getUserBlocklist();
  if (current.includes(normalized)) return current;
  const next = [...current, normalized].sort();
  try {
    await chrome.storage.local.set({ [USER_BLOCKLIST_KEY]: { domains: next } });
  } catch {
    // best-effort
  }
  return next;
}

/**
 * Remove a domain from the user blocklist. Returns the new full list.
 */
export async function removeUserBlocklistDomain(domain: string): Promise<string[]> {
  const normalized = normalizeBlocklistDomain(domain) ?? domain;
  const current = await getUserBlocklist();
  const next = current.filter((d) => d !== normalized);
  if (next.length === current.length) return current;
  try {
    await chrome.storage.local.set({ [USER_BLOCKLIST_KEY]: { domains: next } });
  } catch {
    // best-effort
  }
  return next;
}

/**
 * True if the given hostname matches any user-blocked domain. Match is
 * exact-or-suffix so blocking "acme.com" also blocks "careers.acme.com".
 */
export function isUserBlockedHost(hostname: string, blockedDomains: string[]): boolean {
  if (!hostname || !Array.isArray(blockedDomains) || blockedDomains.length === 0) return false;
  const lower = hostname.toLowerCase().replace(/^www\./, '');
  for (const d of blockedDomains) {
    if (!d) continue;
    if (lower === d || lower.endsWith('.' + d)) return true;
  }
  return false;
}
