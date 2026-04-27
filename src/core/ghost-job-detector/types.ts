/**
 * Types for the Ghost Job Detector (Workstream 8).
 *
 * This file is the contract that the pure scorer, the background handler,
 * and the side panel UI all share. The scorer is intentionally a PURE
 * function: all inputs are passed by value, no IDB calls, no fetches, no
 * chrome.* references. Orchestration lives in ghost-job-handlers.ts.
 *
 * Distinct from src/core/jobs/ghost-detector.ts (Workstream 4), which
 * detects ghosted *applications* (the user applied → no response → auto-
 * marked after 30d). This module detects ghost *job postings* - listings
 * that should not be applied to in the first place.
 */

import type { ExtractedJob } from '@shared/types/job.types';
import type { Application } from '@shared/types/application.types';

export type SignalKind =
  | 'posting_age'
  | 'salary_spread'
  | 'salary_missing'
  | 'reposting'
  | 'title_vagueness'
  | 'applicant_volume'
  | 'layoff_news'
  | 'jd_vagueness';

export type SignalConfidence = 'high' | 'medium' | 'low';

/**
 * One scored signal. Always emitted (triggered or not) so the UI can show
 * complete reasoning. Untriggered signals get weight: 0.
 */
export interface GhostSignal {
  kind: SignalKind;
  triggered: boolean;
  /** Contribution to total when triggered, 0..100. */
  weight: number;
  confidence: SignalConfidence;
  /** One-line human-readable explanation. */
  reason: string;
  /** Optional supporting detail (date, salary range, headline excerpt). */
  evidence?: string;
}

export type GhostBucket = 'green' | 'amber' | 'red';

export type GhostRecommendation =
  | 'apply_normally' // <30
  | 'apply_with_referral_only' // 30..60
  | 'skip_likely_ghost'; // >60

export interface GhostScore {
  /** 0..100, capped. */
  total: number;
  bucket: GhostBucket;
  recommendation: GhostRecommendation;
  /** Every signal, triggered or not, in canonical order. */
  signals: GhostSignal[];
  /** ISO datetime the scoring ran. */
  computedAt: string;
  /** Bumped when weights.json changes; lets caches invalidate. */
  scoreVersion: number;
  /** Did we run the cheap or full pipeline? */
  phase: 'cheap' | 'full';
}

/**
 * Layoff news item shape returned by the layoff fetcher. Subset of the
 * Google News RSS feed; only the fields the scorer reads. The fetcher
 * sanitizes title/snippet via DOMPurify before this leaves the background.
 */
export interface LayoffNewsItem {
  /** Sanitized headline text (no HTML). */
  title: string;
  /** Outlet name, e.g. "TechCrunch". */
  source?: string;
  /** ISO publication date. */
  publishedAt: string;
  /** Sanitized snippet (no HTML), bounded length. */
  snippet?: string;
  /** Original article URL (https only). */
  url?: string;
}

/**
 * Vagueness signal output from the AI batch call. Falls back to a
 * deterministic regex heuristic when no AI provider is available.
 */
export interface VaguenessResult {
  /** 0..1, higher means more vague. */
  score: number;
  /** Phrases the model judged vague, in original order. */
  vaguePhrases: string[];
  /** Source: 'ai' if Nano/cloud, 'heuristic' if deterministic fallback. */
  source: 'ai' | 'heuristic';
}

export interface GhostWeights {
  /** Schema version of the weights file. Bumped when shape changes. */
  version: number;
  /** Buckets: a triggered signal contributes its weight; total is capped at 100. */
  posting_age: { gt30: number; gt60: number; gt90: number };
  salary_spread: number;
  salary_missing: number;
  reposting: { onePrior: number; twoPlus: number };
  title_vagueness: number;
  applicant_volume: number;
  layoff_news: number;
  jd_vagueness: number;
  /** Bucket thresholds, inclusive lower bound. */
  buckets: { green: number; amber: number; red: number };
  /** Cheap-phase score above which the handler auto-escalates to full phase. */
  auto_escalate_threshold: number;
}

export interface ScoreInput {
  job: ExtractedJob;
  jdText: string;
  trackerHistory: Application[];
  layoffNews: LayoffNewsItem[] | null; // null = not yet fetched (cheap phase)
  vaguenessAnalysis: VaguenessResult | null; // null = not yet computed (cheap phase)
  weights: GhostWeights;
  /** Optional applicant count when popup-extracted from LinkedIn. */
  applicantCount?: number;
  phase: 'cheap' | 'full';
}
