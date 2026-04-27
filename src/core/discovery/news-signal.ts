/**
 * Hiring-trigger news signal extractor.
 *
 * Pure parser. Given a raw list of HN Algolia story hits (or any other
 * news-source items shaped the same way), returns one normalized
 * NewsSignal per company that just hit a hiring trigger (funding round,
 * product launch, acquisition, expansion).
 *
 * No IO, no chrome.*, no fetch. Orchestration (which Algolia query, when
 * to refresh, caching) lives in the background handler.
 *
 * Strategy:
 *   1. Run each story title through a small set of regex patterns that
 *      lift the COMPANY name and the TRIGGER kind in one pass.
 *   2. Normalize the company name (trim, strip suffixes, casefold) so two
 *      different stories about "Baseten" and "Baseten Inc." dedupe.
 *   3. Keep the freshest story per company. Discard duplicates and
 *      titles that don't match any trigger pattern.
 *
 * Why HN front page as the v1 source: hn.algolia.com is already in
 * optional_host_permissions for the Workstream 9 hn-whos-hiring fetcher,
 * so v1 ships with no new permission ask. TechCrunch / Google News RSS
 * are good v2 additions when we're ready to ask for another origin.
 */

export type TriggerKind =
  | 'funding' // raised Series A/B/C/D
  | 'launch' // launched a new product
  | 'acquisition' // acquired by, acquires
  | 'expansion' // opens office, expands to
  | 'unknown';

export interface NewsSignal {
  /** Normalized company name for joins (lowercase, suffix-stripped, hyphenated). */
  companyKey: string;
  /** Display-form company name lifted from the title. */
  companyDisplay: string;
  /** What just happened. */
  trigger: TriggerKind;
  /** One-line human reason rendered to the user. */
  triggerLabel: string;
  /** ISO date the source story was published. */
  publishedAt: string;
  /** Outbound URL of the source story. */
  sourceUrl: string;
  /** Source name ("HN", "TechCrunch", "Google News"). */
  sourceName: string;
}

/**
 * Shape we accept from the background fetcher. Keep it loose so the same
 * parser works against HN Algolia hits, RSS items, or any future source
 * that surfaces title + url + date.
 */
export interface RawNewsItem {
  title: string;
  url?: string;
  /** ISO date string. */
  publishedAt?: string;
  source?: string;
}

interface TriggerMatch {
  kind: TriggerKind;
  label: string;
  /** Captured company name from the regex. */
  company: string;
}

/**
 * Title-pattern catalogue. Order matters: more specific patterns first
 * so a "Series A funding round" headline is classified as "funding"
 * before the generic "raises" fallback.
 *
 * The captured group is always the company name. We avoid generic
 * sentence-start captures because HN titles often lead with media outlet
 * names ("TechCrunch: Baseten raises..."). The patterns below skip those
 * by anchoring on action verbs.
 */
const PATTERNS: Array<{
  re: RegExp;
  kind: TriggerKind;
  label: (companyDisplay: string | undefined, captured?: string) => string;
}> = [
  // "Baseten raises $40M Series B" / "Baseten secures $25M in seed funding"
  {
    re: /^([A-Z][A-Za-z0-9.\-&'’ ]+?)\s+(?:raises|secures|closes|nabs|lands|announces)\s+\$?(\d+(?:\.\d+)?)\s*([MB])/i,
    kind: 'funding',
    label: (_c, captured) => `raised $${captured ?? ''}`,
  },
  // "Baseten raises Series B" / "Baseten closes Series A"
  {
    re: /^([A-Z][A-Za-z0-9.\-&'’ ]+?)\s+(?:raises|secures|closes|nabs|lands)\s+(?:Series\s+[A-F])/i,
    kind: 'funding',
    label: (_c, captured) => `raised ${captured ?? 'Series funding'}`,
  },
  // "Baseten launches X" / "Baseten unveils Y" / "Baseten releases Z"
  {
    re: /^([A-Z][A-Za-z0-9.\-&'’ ]+?)\s+(?:launches|unveils|releases|debuts|introduces|rolls\s+out)\s+/i,
    kind: 'launch',
    label: () => 'launched new product',
  },
  // "Baseten acquires Foo" / "Acquired by Baseten"
  {
    re: /^([A-Z][A-Za-z0-9.\-&'’ ]+?)\s+(?:acquires|buys|to\s+acquire)\s+/i,
    kind: 'acquisition',
    label: () => 'made an acquisition',
  },
  // "Baseten opens new office in NYC" / "Baseten expands to London"
  {
    re: /^([A-Z][A-Za-z0-9.\-&'’ ]+?)\s+(?:opens|expands|launches\s+(?:in|to))\s+/i,
    kind: 'expansion',
    label: () => 'expanding to a new location',
  },
];

/**
 * Strip common suffixes / punctuation and lowercase so two stories about
 * "Baseten" and "Baseten, Inc." land on the same bucket. Conservative:
 * we never strip more than the suffix, never collapse separate words.
 */
const SUFFIX_RE =
  /[\s,]+(?:inc\.?|llc\.?|ltd\.?|co\.?|corp\.?|corporation|gmbh|s\.a\.|p\.b\.c\.|the)$/i;

export function normalizeCompanyName(name: string): string {
  let s = name.trim();
  for (let i = 0; i < 3; i++) {
    const stripped = s.replace(SUFFIX_RE, '').trim();
    if (stripped === s) break;
    s = stripped;
  }
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Try every pattern. Returns the first match's company + trigger, or
 * null if no pattern matched. The captured group is the company; the
 * label includes any captured detail (dollar amount, Series letter).
 */
function matchTitle(title: string): TriggerMatch | null {
  // Strip a leading source prefix like "TechCrunch: " or "VentureBeat - "
  // so the company-name capture can anchor at the start of the headline.
  const stripped = title.replace(/^[A-Z][A-Za-z0-9 .]*[:\-–]\s+/, '');

  for (const { re, kind, label } of PATTERNS) {
    const m = stripped.match(re);
    if (!m) continue;
    const company = m[1].trim();
    if (!isPlausibleCompanyName(company)) continue;
    const captured = m[2] && m[3] ? `${m[2]}${m[3]}` : (m[2] ?? undefined);
    return { kind, label: label(company, captured), company };
  }
  return null;
}

/**
 * Reject obvious false positives so the lead-list does not surface
 * companies whose names are just sentence noise. Conservative: anything
 * that passes here may still be wrong, but the user can dismiss it from
 * the UI; anything that fails here is silently dropped.
 */
function isPlausibleCompanyName(name: string): boolean {
  if (name.length < 2 || name.length > 60) return false;
  if (!/^[A-Z]/.test(name)) return false;
  // Reject common headline-leading words that the regex sometimes catches.
  const nope = new Set([
    'The',
    'A',
    'An',
    'New',
    'How',
    'Why',
    'What',
    'When',
    'Show',
    'Ask',
    'Today',
    'Yesterday',
    'This',
    'That',
    'Report',
    'Study',
    'Source',
    'Update',
    'Breaking',
  ]);
  const first = name.split(/\s+/)[0];
  if (nope.has(first)) return false;
  return true;
}

/**
 * Extract one signal per company across all input items, keeping the
 * freshest story per company. Items with no detectable trigger are
 * silently skipped.
 */
export function extractNewsSignals(items: RawNewsItem[]): NewsSignal[] {
  const byCompany = new Map<string, NewsSignal>();

  for (const item of items) {
    if (!item?.title) continue;
    const matched = matchTitle(item.title);
    if (!matched) continue;

    const companyKey = normalizeCompanyName(matched.company);
    if (!companyKey) continue;

    const publishedAt = item.publishedAt ?? new Date(0).toISOString();
    const signal: NewsSignal = {
      companyKey,
      companyDisplay: matched.company,
      trigger: matched.kind,
      triggerLabel: matched.label,
      publishedAt,
      sourceUrl: item.url ?? '',
      sourceName: item.source ?? 'unknown',
    };

    const prior = byCompany.get(companyKey);
    if (!prior || isFresher(signal.publishedAt, prior.publishedAt)) {
      byCompany.set(companyKey, signal);
    }
  }

  // Newest first. Stable on tie via the natural Map iteration order.
  return [...byCompany.values()].sort((a, b) =>
    a.publishedAt > b.publishedAt ? -1 : a.publishedAt < b.publishedAt ? 1 : 0
  );
}

function isFresher(a: string, b: string): boolean {
  return a > b;
}
