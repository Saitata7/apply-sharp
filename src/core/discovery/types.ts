/**
 * Types for the Job Discovery workstream (WS9).
 *
 * Three subfeatures share the same types where they overlap:
 *   - Portal recommender: profile → ranked job sources
 *   - HN Who's Hiring: matched comments from the latest thread
 *   - YC ATS direct links: bypass aggregators, hit company career pages
 *
 * The portal map is the SOURCE OF TRUTH for which Tier-1 sources we
 * recommend. Anything not in the map is either intentionally excluded
 * (see source-quality.ts DEAD_SOURCES and AFFILIATE_SPAM_SOURCES) or
 * simply not in scope yet.
 */

export type DiscoveryRole =
  | 'backend'
  | 'frontend'
  | 'fullstack'
  | 'mobile'
  | 'data-engineering'
  | 'data-science'
  | 'ml-engineering'
  | 'devops'
  | 'security'
  | 'design'
  | 'product'
  | 'pm'
  | 'qa'
  | 'engineering-manager';

export type DiscoverySeniority = 'entry' | 'mid' | 'senior' | 'staff';
export type DiscoveryGeo = 'us' | 'eu' | 'uk' | 'asia' | 'remote-global';
export type DiscoveryWorkType = 'remote' | 'hybrid' | 'onsite';

export interface DiscoveryProfile {
  role: DiscoveryRole;
  seniority: DiscoverySeniority;
  geo: DiscoveryGeo;
  workType: DiscoveryWorkType;
}

export interface PortalMapEntry {
  /** Role this entry applies to. '*' wildcard means all roles. */
  role: DiscoveryRole | '*';
  /** Seniority filter. '*' wildcard. */
  seniority: DiscoverySeniority | '*';
  /** Geo filter. '*' wildcard. */
  geo: DiscoveryGeo | '*';
  /** Work-type filter. '*' wildcard. */
  workType: DiscoveryWorkType | '*';
  /** Display name shown to the user. */
  sourceName: string;
  /** Outbound URL. Validated to https:// at build/load time. */
  sourceUrl: string;
  /** Lower rank = higher recommendation priority. */
  rank: number;
  /** Optional one-line note rendered as a hover tooltip. */
  notes?: string;
}

export interface PortalRecommendation {
  sourceName: string;
  sourceUrl: string;
  rank: number;
  notes?: string;
}

export interface DeadSource {
  name: string;
  /** ISO date the source died (e.g. "2022-03"). */
  deadSince: string;
  /** Why we excluded it; rendered to the user. */
  reason: string;
}

export interface AffiliateSpamSource {
  name: string;
  reason: string;
}

/**
 * HN Who's Hiring matched comment, post-filter and post-sanitization.
 * comment.htmlSafe is DOMPurify-sanitized text safe to render via
 * dangerouslySetInnerHTML inside the side panel. The plain field is the
 * stripped-text equivalent for screen readers.
 */
export interface HNMatch {
  commentId: number;
  author: string;
  /** ISO date when the comment was posted. */
  createdAt: string;
  /** DOMPurify-sanitized HTML, safe for dangerouslySetInnerHTML. */
  htmlSafe: string;
  /** Plain text equivalent (no HTML), for screen readers and tooltips. */
  plain: string;
  /** Higher = stronger match. 0..1. */
  score: number;
  /** Optional reasons the match scored highly (keywords matched). */
  matchedKeywords?: string[];
}

export interface HNFetchResult {
  threadTitle: string;
  threadId: number;
  threadUrl: string;
  totalComments: number;
  matches: HNMatch[];
  /** ISO date the thread was fetched. */
  fetchedAt: string;
  /** Whether the result came from cache. */
  fromCache: boolean;
}

export interface YCATSLink {
  batch: string; // "W23", "W24", "W25"
  company: string;
  sector: string; // "ai", "devtools", "fintech", etc.
  careerUrl: string; // https-validated
  ats: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'other';
}
