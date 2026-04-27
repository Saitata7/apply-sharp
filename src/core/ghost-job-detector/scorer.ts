/**
 * Ghost Job Scorer (Workstream 8).
 *
 * PURE FUNCTION. No IDB calls, no fetches, no chrome.* references. Inputs
 * passed by value. Orchestration (data fetching, AI calls, caching) lives in
 * src/background/handlers/ghost-job-handlers.ts.
 *
 * Scoring model: weighted sum of triggered signals, capped at 100. Bucket
 * thresholds and per-signal weights load from weights.json (the policy file)
 * so tuning does not need a code review.
 *
 * The scorer NEVER throws on malformed input - it returns a neutral score
 * and logs a warning. The UI never has to defend against partial failures.
 *
 * Distinct from src/core/jobs/ghost-detector.ts (Workstream 4 - application
 * ghosting). Naming is intentional: this module scores ghost JOBS, the other
 * scores ghosted APPLICATIONS.
 */

import type {
  GhostBucket,
  GhostRecommendation,
  GhostScore,
  GhostSignal,
  GhostWeights,
  ScoreInput,
} from './types';
import baseWeights from './weights.json';
import { scorePostingAge } from './signals/posting-age';
import { scoreSalarySpread } from './signals/salary-spread';
import { scoreReposting } from './signals/reposting';
import { scoreTitleVagueness } from './signals/title-vagueness';
import { scoreApplicantVolume } from './signals/applicant-volume';
import { scoreLayoffNews } from './signals/layoff-news';
import { scoreJDVagueness } from './signals/jd-vagueness';

const SCORE_VERSION = 1;

/**
 * Default weights bundled at build time. The handler can override these by
 * passing a runtime-loaded GhostWeights into ScoreInput. For tests we
 * always pass them explicitly so the scorer is fully deterministic.
 */
export const DEFAULT_WEIGHTS: GhostWeights = baseWeights as GhostWeights;

/**
 * Map a 0..100 total to a bucket using the policy thresholds. Buckets are
 * inclusive lower bounds: green is [0..amber), amber is [amber..red),
 * red is [red..100].
 */
function bucketFor(total: number, weights: GhostWeights): GhostBucket {
  if (total >= weights.buckets.red) return 'red';
  if (total >= weights.buckets.amber) return 'amber';
  return 'green';
}

function recommendationFor(bucket: GhostBucket): GhostRecommendation {
  if (bucket === 'red') return 'skip_likely_ghost';
  if (bucket === 'amber') return 'apply_with_referral_only';
  return 'apply_normally';
}

function neutralScore(phase: 'cheap' | 'full', reason: string): GhostScore {
  return {
    total: 0,
    bucket: 'green',
    recommendation: 'apply_normally',
    signals: [
      {
        kind: 'posting_age',
        triggered: false,
        weight: 0,
        confidence: 'low',
        reason,
      },
    ],
    computedAt: new Date().toISOString(),
    scoreVersion: SCORE_VERSION,
    phase,
  };
}

/**
 * Score a job posting for ghost likelihood.
 *
 * The scorer is deliberately tolerant: any signal that throws is replaced
 * by a neutral untriggered signal of its kind so a single bad input does
 * not invalidate the rest of the analysis.
 */
export function scoreGhostJob(input: ScoreInput): GhostScore {
  if (!input || !input.job || !input.weights) {
    console.warn('[GhostScorer] missing input; returning neutral score');
    return neutralScore(input?.phase ?? 'cheap', 'Could not score this job (missing input)');
  }

  const signals: GhostSignal[] = [];

  function safeRun(fn: () => GhostSignal | GhostSignal[], kind: GhostSignal['kind']): void {
    try {
      const result = fn();
      if (Array.isArray(result)) {
        signals.push(...result);
      } else {
        signals.push(result);
      }
    } catch (err) {
      console.warn(`[GhostScorer] signal ${kind} threw, skipping:`, err);
      signals.push({
        kind,
        triggered: false,
        weight: 0,
        confidence: 'low',
        reason: 'Could not evaluate this signal',
      });
    }
  }

  safeRun(() => scorePostingAge(input), 'posting_age');
  safeRun(() => scoreSalarySpread(input), 'salary_spread');
  safeRun(() => scoreReposting(input), 'reposting');
  safeRun(() => scoreTitleVagueness(input), 'title_vagueness');
  safeRun(() => scoreApplicantVolume(input), 'applicant_volume');
  safeRun(() => scoreLayoffNews(input), 'layoff_news');
  safeRun(() => scoreJDVagueness(input), 'jd_vagueness');

  // Sum and cap.
  const rawTotal = signals.filter((s) => s.triggered).reduce((acc, s) => acc + s.weight, 0);
  const total = Math.max(0, Math.min(100, Math.round(rawTotal)));
  const bucket = bucketFor(total, input.weights);
  const recommendation = recommendationFor(bucket);

  return {
    total,
    bucket,
    recommendation,
    signals,
    computedAt: new Date().toISOString(),
    scoreVersion: SCORE_VERSION,
    phase: input.phase,
  };
}
