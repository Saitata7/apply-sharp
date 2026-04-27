/**
 * Lead-list ranker.
 *
 * Pure function. Takes the deduped output of `extractNewsSignals` plus an
 * optional DOL H-1B sponsor index (from `tools/job-search/dol-process.py`),
 * and returns the top N leads ranked by:
 *
 *   1. Sponsor-strength bonus when the company is in the index (up to +30)
 *   2. Recency bonus (up to +20 in the last 7 days, decaying to 0 by 60d)
 *   3. Trigger-kind weight: funding > launch > expansion > acquisition
 *
 * The sponsor index is OPTIONAL. When the user has not yet run the python
 * processor (or the index is empty), every news signal still surfaces;
 * the leads just lack the visa-friendly badge. The lead-list never blocks
 * on missing sponsor data, it degrades to "all leads, no visa filter".
 *
 * Keyword filter: callers pass an optional list of role keywords
 * ("ai engineer", "ml engineer", "llm"). When supplied, leads whose
 * sponsor-index titles do NOT include any of those keywords get a soft
 * penalty rather than being excluded. Companies with strong recent
 * sponsorship history but in adjacent roles are still worth considering.
 */

import type { NewsSignal } from './news-signal';

export interface SponsorIndexEntry {
  /** Display-form name from the DOL filing. */
  displayName: string;
  /** Total filings in the most recent fiscal year of data. */
  filings: number;
  /** Average annual wage across those filings. */
  avgWage?: number;
  /** Top job titles sponsored, ordered by frequency. */
  topJobTitles?: string[];
  /** Most recent fiscal year present in the index ("FY2025"). */
  latestFy?: string;
}

/** key = normalized company name (matches NewsSignal.companyKey shape). */
export type SponsorIndex = Record<string, SponsorIndexEntry>;

export interface Lead {
  /** Inherited from the source signal. */
  companyKey: string;
  companyDisplay: string;
  trigger: NewsSignal['trigger'];
  triggerLabel: string;
  publishedAt: string;
  sourceUrl: string;
  sourceName: string;
  /** 0-100. Sum of components, clamped. */
  score: number;
  /** True when the company is in the DOL sponsor index. */
  sponsorMatch: boolean;
  /** Filings count from the index when sponsorMatch is true. */
  sponsorFilings?: number;
  /** Most recent FY present in the index when sponsorMatch is true. */
  sponsorLatestFy?: string;
  /** Top sponsored titles when sponsorMatch is true (capped at 3). */
  sponsorTopTitles?: string[];
  /**
   * One-line UI hint summarizing the strongest reasons this lead was
   * ranked where it was. Caller renders verbatim.
   */
  reason: string;
  /**
   * Pre-built LinkedIn deep-link to the company's job listings filtered
   * by the user's role keywords. Caller can render as a button.
   */
  linkedinJobsUrl: string;
}

export interface RankOptions {
  /** Top N to return. Defaults to 10. */
  topN?: number;
  /**
   * Role keywords used both for the LinkedIn deep-link and for a soft
   * penalty when the sponsor entry's top titles do not match any of them.
   */
  roleKeywords?: string[];
  /** Date used to compute recency. Defaults to current time. */
  now?: Date;
}

const TRIGGER_WEIGHT: Record<NewsSignal['trigger'], number> = {
  funding: 25,
  launch: 15,
  expansion: 10,
  acquisition: 8,
  unknown: 0,
};

const SPONSOR_WEIGHT_BASE = 25;
const SPONSOR_WEIGHT_BONUS_PER_50_FILINGS = 5;
const SPONSOR_KEYWORD_MISS_PENALTY = -8;
const RECENCY_MAX_BONUS = 20;
const RECENCY_DECAY_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Build a LinkedIn /jobs/search URL filtered by role keywords. The
 * `f_C=` company filter requires LinkedIn's internal numeric company ID
 * which we do not have, so we use a plain keyword search that includes
 * the company name. Imperfect but works on every account, no API.
 */
function buildLinkedinJobsUrl(companyDisplay: string, roleKeywords: string[]): string {
  const roleQuery = roleKeywords.length ? roleKeywords.join(' OR ') : 'engineer';
  const q = encodeURIComponent(`${companyDisplay} ${roleQuery}`);
  return `https://www.linkedin.com/jobs/search/?keywords=${q}&f_TPR=r604800`;
}

function recencyScore(publishedAt: string, now: Date): number {
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return 0;
  const ageDays = Math.max(0, (now.getTime() - t) / MS_PER_DAY);
  if (ageDays >= RECENCY_DECAY_DAYS) return 0;
  // Linear decay from RECENCY_MAX_BONUS at age=0 to 0 at age=DECAY_DAYS.
  return Math.round(RECENCY_MAX_BONUS * (1 - ageDays / RECENCY_DECAY_DAYS));
}

function sponsorScore(
  entry: SponsorIndexEntry | undefined,
  roleKeywords: string[]
): { score: number; matchedKeyword: boolean } {
  if (!entry) return { score: 0, matchedKeyword: false };
  let score = SPONSOR_WEIGHT_BASE;
  // Filings volume bonus: a company that filed 200+ times last year is a
  // much stronger sponsor signal than one that filed 5 times.
  score += Math.min(20, Math.floor(entry.filings / 50) * SPONSOR_WEIGHT_BONUS_PER_50_FILINGS);
  // Soft penalty when the role keywords don't appear in the company's
  // top-sponsored titles. They might still sponsor for adjacent roles.
  const matchedKeyword =
    roleKeywords.length === 0 ||
    !entry.topJobTitles?.length ||
    entry.topJobTitles.some((t) =>
      roleKeywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))
    );
  if (!matchedKeyword) score += SPONSOR_KEYWORD_MISS_PENALTY;
  return { score, matchedKeyword };
}

function buildReason(opts: {
  trigger: NewsSignal['trigger'];
  triggerLabel: string;
  recency: number;
  sponsorMatch: boolean;
  sponsorFilings?: number;
  sponsorLatestFy?: string;
  matchedKeyword: boolean;
}): string {
  const parts: string[] = [opts.triggerLabel];
  if (opts.sponsorMatch) {
    const filings = opts.sponsorFilings ?? 0;
    const fy = opts.sponsorLatestFy ?? 'recent FY';
    parts.push(`${filings} H-1B filings in ${fy}`);
    if (!opts.matchedKeyword) {
      parts.push('sponsored adjacent roles (verify fit)');
    }
  } else {
    parts.push('no DOL sponsor record');
  }
  if (opts.recency >= 15) parts.push('fresh');
  return parts.join(' · ');
}

export function rankLeads(
  signals: NewsSignal[],
  sponsors: SponsorIndex,
  options: RankOptions = {}
): Lead[] {
  const topN = options.topN ?? 10;
  const roleKeywords = options.roleKeywords ?? [];
  const now = options.now ?? new Date();

  const leads: Lead[] = signals.map((signal) => {
    const sponsorEntry = sponsors[signal.companyKey];
    const sponsor = sponsorScore(sponsorEntry, roleKeywords);
    const trigger = TRIGGER_WEIGHT[signal.trigger] ?? 0;
    const recency = recencyScore(signal.publishedAt, now);

    const score = Math.max(0, Math.min(100, trigger + sponsor.score + recency));

    return {
      companyKey: signal.companyKey,
      companyDisplay: signal.companyDisplay,
      trigger: signal.trigger,
      triggerLabel: signal.triggerLabel,
      publishedAt: signal.publishedAt,
      sourceUrl: signal.sourceUrl,
      sourceName: signal.sourceName,
      score,
      sponsorMatch: Boolean(sponsorEntry),
      sponsorFilings: sponsorEntry?.filings,
      sponsorLatestFy: sponsorEntry?.latestFy,
      sponsorTopTitles: sponsorEntry?.topJobTitles?.slice(0, 3),
      reason: buildReason({
        trigger: signal.trigger,
        triggerLabel: signal.triggerLabel,
        recency,
        sponsorMatch: Boolean(sponsorEntry),
        sponsorFilings: sponsorEntry?.filings,
        sponsorLatestFy: sponsorEntry?.latestFy,
        matchedKeyword: sponsor.matchedKeyword,
      }),
      linkedinJobsUrl: buildLinkedinJobsUrl(signal.companyDisplay, roleKeywords),
    };
  });

  // Score desc, then publishedAt desc as a stable tie-breaker.
  leads.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : b.publishedAt > a.publishedAt
        ? 1
        : b.publishedAt < a.publishedAt
          ? -1
          : 0
  );

  return leads.slice(0, topN);
}
