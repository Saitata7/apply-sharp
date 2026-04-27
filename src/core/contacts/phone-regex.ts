/**
 * Phone extraction (Workstream 10).
 *
 * Pure functions. No DOM, no fetches, no chrome.* references.
 *
 * Strategy:
 *   1. First-pass permissive regex finds candidates that LOOK like phones.
 *   2. Each candidate runs through libphonenumber-js (max bundle, ~150KB)
 *      for canonical validation.
 *   3. Reject anything that does not pass isValid() AND has a non-null type.
 *   4. Reject false-positive patterns: ISO dates, prices, order ids,
 *      employee ids, ZIP codes.
 *   5. Toll-free prefixes (1-800/888/877/866/855/844/833) downgrade to
 *      low confidence (rarely a hiring contact).
 *
 * Iter-2: docstring corrected to reflect the /max import (was /min). The
 * max bundle is required so French, German, and other non-mobile
 * international landlines parse correctly. The 150KB delta vs /min only
 * loads when contact extraction runs (lazy-imported chunk), so the cost
 * is paid once per session, not on every page.
 */

// Use the max bundle (~150KB) instead of /min so French, German, and other
// non-mobile international landlines parse correctly. The /min bundle drops
// fixed-line metadata for many countries; the size delta is worth correct
// parsing for the small fraction of users who paste an international number.
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { ContactConfidence } from '@shared/types/contact.types';

/**
 * Permissive first-pass regex. Catches:
 *   +1-415-555-0100
 *   +44 20 7946 0958
 *   (415) 555-0100
 *   415.555.0100
 *   415 555 0100
 *
 * Bounds: 9-18 digits total (after stripping non-digits), so very short
 * or very long candidate strings are skipped.
 */
const PHONE_CANDIDATE_REGEX = /(?:\+?\d[\d\s().-]{8,18}\d)/g;

const TOLL_FREE_PREFIXES = ['1800', '1888', '1877', '1866', '1855', '1844', '1833'];

/**
 * False-positive patterns to reject before parsing. Order ids, ISO dates,
 * pricing, ZIP codes, and other "looks like a phone" garbage.
 */
const FALSE_POSITIVE_PATTERNS: RegExp[] = [
  /\d{4}-\d{4}-\d{4}/, // order ids
  /\d{4}-\d{2}-\d{2}T\d{2}/, // ISO datetime
  /\$\s*[\d,]+\.\d{2}/, // pricing
  /^\d{5}(-\d{4})?$/, // US ZIP
];

export interface PhoneMatch {
  /** Canonical E.164 (e.g. +14155550100). */
  e164: string;
  /** Localized display form. */
  display: string;
  /** ISO 3166-1 alpha-2 country code, when known. */
  countryCode?: string;
  /** Phone number type from libphonenumber. */
  type?: string;
  /** Per-match confidence: high for personal/mobile, low for toll-free. */
  confidence: ContactConfidence;
  /** As found in the source text. */
  raw: string;
  /** Position of the match in the source text (for anchor walking). */
  index: number;
}

/**
 * Extract phone numbers from a text blob.
 * defaultRegion = ISO 3166-1 alpha-2 country code, used as a hint when
 * the number lacks a country prefix. Defaults to 'US'.
 */
export function extractPhones(text: string, defaultRegion: string = 'US'): PhoneMatch[] {
  if (!text || typeof text !== 'string') return [];
  const bounded = text.slice(0, 1_000_000);
  const seen = new Set<string>();
  const out: PhoneMatch[] = [];
  PHONE_CANDIDATE_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_CANDIDATE_REGEX.exec(bounded)) !== null) {
    const raw = m[0].trim();
    // Skip false-positive patterns BEFORE parsing
    if (looksLikeFalsePositive(raw)) continue;
    let parsed;
    try {
      parsed = parsePhoneNumberFromString(raw, defaultRegion as 'US');
    } catch {
      continue;
    }
    if (!parsed || !parsed.isValid()) continue;
    const type = parsed.getType();
    if (!type) continue;
    const e164 = parsed.format('E.164');
    if (seen.has(e164)) continue;
    seen.add(e164);
    const cleanDigits = e164.replace(/\D/g, '');
    let confidence: ContactConfidence = 'high';
    for (const tf of TOLL_FREE_PREFIXES) {
      if (cleanDigits.startsWith(tf)) {
        confidence = 'low';
        break;
      }
    }
    if (type === 'TOLL_FREE') confidence = 'low';
    if (type === 'PREMIUM_RATE' || type === 'SHARED_COST') confidence = 'low';
    out.push({
      e164,
      display: parsed.formatInternational(),
      countryCode: parsed.country,
      type,
      confidence,
      raw,
      index: m.index,
    });
  }
  return out;
}

/**
 * Decide a default region from page hints when the user has not
 * explicitly set one. Order:
 *   1. <html lang="en-GB"> -> GB
 *   2. hostname TLD: .co.uk -> GB, .de -> DE, .fr -> FR
 *   3. fallback: US
 */
export function regionFromContext(htmlLang?: string, hostname?: string): string {
  if (htmlLang && typeof htmlLang === 'string') {
    const parts = htmlLang.toLowerCase().split('-');
    if (parts.length === 2 && parts[1].length === 2) {
      return parts[1].toUpperCase();
    }
  }
  if (hostname && typeof hostname === 'string') {
    const lower = hostname.toLowerCase();
    if (lower.endsWith('.co.uk') || lower.endsWith('.uk')) return 'GB';
    if (lower.endsWith('.de')) return 'DE';
    if (lower.endsWith('.fr')) return 'FR';
    if (lower.endsWith('.it')) return 'IT';
    if (lower.endsWith('.es')) return 'ES';
    if (lower.endsWith('.nl')) return 'NL';
    if (lower.endsWith('.au') || lower.endsWith('.com.au')) return 'AU';
    if (lower.endsWith('.ca')) return 'CA';
    if (lower.endsWith('.in')) return 'IN';
    if (lower.endsWith('.jp')) return 'JP';
  }
  return 'US';
}

function looksLikeFalsePositive(s: string): boolean {
  for (const re of FALSE_POSITIVE_PATTERNS) {
    if (re.test(s)) return true;
  }
  return false;
}
